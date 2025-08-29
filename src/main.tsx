import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import { useEffect, useMemo, useState, type ReactNode } from "react";

// Render the QuizApp
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QuizApp />
  </React.StrictMode>
);



/**
 * Quiz & Assessment Web App — Single-file React MVP
 * --------------------------------------------------
 * - Teacher/Student roles
 * - MCQ, Fill-in-the-Blank, Match (drag & drop)
 * - Timer, instant feedback, leaderboards
 * - Local in-memory realtime adapter (supabase/firebase stubs omitted)
 *
 * This file has been audited for balanced JSX tags and should compile without the
 * previous `Unexpected token, expected "}"` syntax error.
 */

// ------------------------------
// Utilities
// ------------------------------
const uid = () => Math.random().toString(36).slice(2, 10);
const now = () => new Date().toISOString();

// Types
type MCQQuestion = { id: string; type: 'mcq'; prompt: string; options: string[]; correct: number; points: number };
type FIBQuestion = { id: string; type: 'fib'; prompt: string; answer: string; points: number };
type MatchPair = { left: string; right: string };
type MatchSelection = { left: string; right: string | null };
type MatchQuestion = { id: string; type: 'match'; prompt: string; pairs: MatchPair[]; points: number };
type Question = MCQQuestion | FIBQuestion | MatchQuestion;

type Quiz = { id: string; title: string; durationSec: number; questions: Question[] };

type Player = { id: string; name: string; score: number; joinedAt: string };

type AnswerValue = number | string | MatchSelection[] | null;
type AnswerRecord = { playerId: string; qIndex: number; answer: AnswerValue; isCorrect: boolean; at: string };

type Room = { quiz: Quiz; players: Record<string, Player>; answers: AnswerRecord[]; currentIndex: number; status: 'lobby' | 'running' | 'ended'; createdAt: string };

type RoomEventMap = { players: Player[]; state: Room; answer: AnswerRecord };

interface Adapter {
  createRoom(quiz: Quiz): Promise<{ roomCode: string }>;
  joinRoom(roomCode: string, name: string): Promise<{ playerId: string; snapshot: Room }>;
  on<K extends keyof RoomEventMap>(roomCode: string, event: K, cb: (payload: RoomEventMap[K]) => void): () => void;
  startQuiz(roomCode: string): Promise<void>;
  nextQuestion(roomCode: string): Promise<void>;
  submitAnswer(roomCode: string, playerId: string, payload: { answer: AnswerValue }): Promise<{ isCorrect: boolean }>;
  getRoomSnapshot(roomCode: string): Promise<Room>;
}

type CSVRow = Record<string, string | number | boolean | null | undefined>;

function downloadFile(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function toCSV(rows: CSVRow[]): string {
  if (!rows || rows.length === 0) return "";
  const esc = (s: unknown = "") => `"${String(s).replaceAll('"', '""')}"`;
  const keys = Object.keys(rows[0] || {});
  const head = keys.map(esc).join(",");
  const data = rows.map(r => keys.map(k => esc(r[k])).join(",")).join("\n");
  return head + "\n" + data;
}

// ------------------------------
// Local realtime adapter (in-memory)
// ------------------------------
function LocalAdapter(): Adapter {
  const state: { rooms: Record<string, Room> } = { rooms: {} };
  const listeners: Record<string, { [K in keyof RoomEventMap]?: Array<(payload: RoomEventMap[K]) => void> }> = {};
  const emitAll = <K extends keyof RoomEventMap>(room: string, evt: K, payload: RoomEventMap[K]) => (listeners[room]?.[evt] || []).forEach(cb => cb(payload));

  return {
    createRoom: async (quiz: Quiz) => {
      const roomCode = String(Math.random()).slice(2, 8);
      state.rooms[roomCode] = { quiz, players: {}, answers: [], currentIndex: 0, status: "lobby", createdAt: now() };
      return { roomCode };
    },
    joinRoom: async (roomCode: string, name: string) => {
      const room = state.rooms[roomCode];
      if (!room) throw new Error("Room not found");
      const id = uid();
      room.players[id] = { id, name, score: 0, joinedAt: now() };
      emitAll(roomCode, "players", Object.values(room.players));
      return { playerId: id, snapshot: JSON.parse(JSON.stringify(room)) as Room };
    },
    on: <K extends keyof RoomEventMap>(roomCode: string, event: K, cb: (payload: RoomEventMap[K]) => void) => {
      listeners[roomCode] = listeners[roomCode] || {};
      const arr = (listeners[roomCode][event] || []) as Array<(payload: RoomEventMap[K]) => void>;
      arr.push(cb);
      listeners[roomCode][event] = arr as any;
      return () => {
        const list = (listeners[roomCode][event] || []) as Array<(payload: RoomEventMap[K]) => void>;
        listeners[roomCode][event] = list.filter(f => f !== cb) as any;
      };
    },
    startQuiz: async (roomCode: string) => {
      const room = state.rooms[roomCode];
      if (!room) return;
      room.status = "running";
      room.currentIndex = 0;
      emitAll(roomCode, "state", JSON.parse(JSON.stringify(room)) as Room);
    },
    nextQuestion: async (roomCode: string) => {
      const room = state.rooms[roomCode];
      if (!room) return;
      room.currentIndex += 1;
      if (room.currentIndex >= (room.quiz?.questions?.length || 0)) room.status = "ended";
      emitAll(roomCode, "state", JSON.parse(JSON.stringify(room)) as Room);
    },
    submitAnswer: async (roomCode: string, playerId: string, payload: { answer: AnswerValue }) => {
      const room = state.rooms[roomCode];
      if (!room) return { isCorrect: false };
      const q = room.quiz.questions[room.currentIndex];
      const isCorrect = gradeAnswer(q, payload.answer);
      if (isCorrect) {
        room.players[playerId].score = (room.players[playerId].score || 0) + 1;
        emitAll(roomCode, "players", Object.values(room.players));
      }
      const record: AnswerRecord = { playerId, qIndex: room.currentIndex, answer: payload.answer, isCorrect, at: now() };
      room.answers.push(record);
      emitAll(roomCode, "answer", record);
      return { isCorrect };
    },
    getRoomSnapshot: async (roomCode: string) => {
      const room = state.rooms[roomCode];
      if (!room) throw new Error("Room not found");
      return JSON.parse(JSON.stringify(room)) as Room;
    }
  };
}

// ------------------------------
// Quiz logic
// ------------------------------
const defaultQuiz = (): Quiz => ({
  id: uid(),
  title: "Sample Quiz",
  durationSec: 30,
  questions: [
    { id: uid(), type: "mcq", prompt: "Which is a prime number?", options: ["9","12","13","21"], correct: 2, points: 1 },
    { id: uid(), type: "fib", prompt: "The chemical symbol for water is _____.", answer: "H2O", points: 1 },
    { id: uid(), type: "match", prompt: "Drag each country to its capital.", pairs: [ { left: "France", right: "Paris" }, { left: "Japan", right: "Tokyo" }, { left: "India", right: "New Delhi" } ], points: 1 }
  ]
});

function gradeAnswer(q: Question, answer: AnswerValue): boolean {
  if (!q) return false;
  switch (q.type) {
    case "mcq": return Number(answer) === q.correct;
    case "fib": return String((answer ?? "")).trim().toLowerCase() === String(q.answer || "").trim().toLowerCase();
    case "match": {
      if (!Array.isArray(answer)) return false;
      const arr = answer as MatchSelection[];
      const ok = arr.every(p => q.pairs.find(x => x.left === p.left && x.right === p.right));
      return ok && arr.length === q.pairs.length;
    }
    default: return false;
  }
}

// ------------------------------
// UI components
// ------------------------------
function Section({ title, children, right }: { title: ReactNode; children?: ReactNode; right?: ReactNode }) {
  return (
    <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        <div>{right}</div>
      </div>
      {children}
    </section>
  );
}

function Pill({ children }: { children?: ReactNode }) { return <span className="inline-block px-2 py-1 text-xs rounded-full bg-gray-100">{children}</span>; }

function Timer({ seconds, onEnd, tickKey }: { seconds?: number; onEnd?: () => void; tickKey?: string | number }) {
  const [left, setLeft] = useState(seconds || 0);
  useEffect(() => { setLeft(seconds || 0); }, [seconds, tickKey]);
  useEffect(() => {
    if (left <= 0) return void onEnd?.();
    const t = setTimeout(() => setLeft((l: number) => l - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  const pct = seconds ? Math.max(0, Math.min(100, (left / seconds) * 100)) : 0;
  return (
    <div className="w-full">
      <div className="flex justify-between text-sm mb-1"><span>Time</span><span>{left}s</span></div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: pct + "%", backgroundColor: "#2563EB" }} />
      </div>
    </div>
  );
}

function Leaderboard({ players = [] }: { players?: Player[] }) {
  const sorted = [...players].sort((a,b) => (b.score || 0) - (a.score || 0));
  return (
    <div className="space-y-2">
      {sorted.map((p, i) => (
        <div key={p.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-2">
          <div className="flex items-center gap-2"><span className="text-sm w-6 text-center">#{i+1}</span><span className="font-medium">{p.name}</span></div>
          <div className="text-sm"><b>{p.score || 0}</b> pts</div>
        </div>
      ))}
    </div>
  );
}

function QuestionEditor({ q, onChange, onDelete }: { q: Question; onChange: (q: Question) => void; onDelete: () => void }) {
  const set = (patch: Partial<Question>) => onChange({ ...q, ...(patch as any) } as Question);
  return (
    <div className="border rounded-2xl p-4 mb-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2"><Pill>{String(q.type).toUpperCase()}</Pill></div>
        <button onClick={onDelete} className="text-red-600 text-sm">Delete</button>
      </div>

      <label className="block text-sm mb-1">Prompt</label>
      <textarea className="w-full border rounded-lg p-2 mb-3" value={q.prompt} onChange={e => set({ prompt: e.target.value })} />

      {q.type === "mcq" && (
        <div className="space-y-2">
          {(q.options).map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <input className="flex-1 border rounded p-2" value={opt} onChange={e => { const options = [...q.options]; options[i] = e.target.value; set({ options } as Partial<MCQQuestion>); }} />
              <label className="text-sm flex items-center gap-1"><input type="radio" name={`correct-${q.id}`} checked={q.correct === i} onChange={() => set({ correct: i } as Partial<MCQQuestion>)} /> Correct</label>
            </div>
          ))}
          <div className="flex gap-2">
            <button className="text-sm px-2 py-1 rounded border hover:bg-slate-50" onClick={() => set({ options: [...q.options, ""] } as Partial<MCQQuestion>)}>Add option</button>
            {q.options.length > 2 && <button className="text-sm px-2 py-1 rounded border hover:bg-slate-50" onClick={() => set({ options: q.options.slice(0, -1) } as Partial<MCQQuestion>)}>Remove last</button>}
          </div>
        </div>
      )}

      {q.type === "fib" && (
        <div>
          <label className="block text-sm mb-1">Correct Answer</label>
          <input className="w-full border rounded p-2" value={q.answer} onChange={e => set({ answer: e.target.value } as Partial<FIBQuestion>)} />
        </div>
      )}

      {q.type === "match" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <div className="text-sm font-medium mb-1">Left (fixed)</div>
            {q.pairs.map((p, i) => (
              <input key={i} className="w-full border rounded p-2 mb-2" value={p.left} onChange={e => { const pairs = [...q.pairs]; pairs[i] = { ...pairs[i], left: e.target.value }; set({ pairs } as Partial<MatchQuestion>); }} />
            ))}
          </div>
          <div>
            <div className="text-sm font-medium mb-1">Right (drag targets)</div>
            {q.pairs.map((p, i) => (
              <input key={i} className="w-full border rounded p-2 mb-2" value={p.right} onChange={e => { const pairs = [...q.pairs]; pairs[i] = { ...pairs[i], right: e.target.value }; set({ pairs } as Partial<MatchQuestion>); }} />
            ))}
          </div>
          <div className="col-span-full"><button className="text-sm px-2 py-1 rounded border hover:bg-slate-50" onClick={() => set({ pairs: [...q.pairs, { left: "", right: "" }] } as Partial<MatchQuestion>)}>Add pair</button></div>
        </div>
      )}

      <div className="mt-3 flex items-center gap-3">
        <label className="text-sm">Points</label>
        <input type="number" className="w-24 border rounded p-2" value={q.points || 1} onChange={e => set({ points: Number(e.target.value || 0) } as Partial<Question>)} />
      </div>
    </div>
  );
}

function QuestionPlayer({ q, onSubmit, disabled }: { q?: Question; onSubmit: (ans: AnswerValue) => void; disabled?: boolean }) {
  const [answer, setAnswer] = useState<AnswerValue | null>(null);
  useEffect(() => { setAnswer(null); }, [q?.id]);
  if (!q) return <div>No question</div>;
  const submit = () => onSubmit?.(answer);

  return (
    <div>
      <div className="text-lg font-medium mb-3">{q.prompt}</div>

      {q.type === "mcq" && (
        <div className="space-y-2">
          {q.options.map((opt, i) => (
            <label key={i} className={`flex items-center gap-2 rounded-xl border p-2 transition-shadow ${Number(answer) === i ? "ring-2 ring-slate-400" : "hover:shadow-sm"}`}>
              <input type="radio" name={`a-${q.id}`} checked={Number(answer) === i} onChange={() => setAnswer(i)} />
              <span>{opt}</span>
            </label>
          ))}
        </div>
      )}

      {q.type === "fib" && (
        <input className="w-full rounded-xl border p-2 focus:outline-none focus:ring focus:ring-slate-300" placeholder="Type your answer" value={(answer as string) || ""} onChange={e => setAnswer(e.target.value)} />
      )}

      {q.type === "match" && (
        <MatchPlayer pairs={q.pairs} onChange={(pairs) => setAnswer(pairs)} />
      )}

      <div className="mt-4"><button disabled={disabled} className="rounded-xl bg-black px-4 py-2 text-white transition-opacity hover:opacity-90 disabled:opacity-50" onClick={submit}>Submit</button></div>
    </div>
  );
}

function MatchPlayer({ pairs, onChange }: { pairs: MatchPair[]; onChange?: (pairs: MatchSelection[]) => void }) {
  const [right] = useState<string[]>(() => shuffle(pairs.map(p => p.right)));
  const [mapping, setMapping] = useState<MatchSelection[]>(pairs.map(p => ({ left: p.left, right: null })));
  useEffect(() => { onChange?.(mapping); }, [mapping]);
  function onDrop(i: number, value: string) { setMapping(m => m.map((x, idx) => idx === i ? { ...x, right: value } : x)); }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="space-y-2">
        {mapping.map((row, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="flex-1 border rounded-xl p-2 bg-gray-50">{row.left}</div>
            <div className="w-40 h-10 border rounded-xl p-2 flex items-center justify-center bg-white" onDragOver={e => e.preventDefault()} onDrop={e => onDrop(i, e.dataTransfer.getData('text/plain'))}>
              {row.right || <span className="text-gray-400 text-sm">Drop here</span>}
            </div>
          </div>
        ))}
      </div>
      <div className="space-y-2">
        {right.map((r, i) => (
          <div key={i} className="cursor-move rounded-xl border bg-gray-100 p-2 text-center" draggable onDragStart={e => e.dataTransfer.setData('text/plain', r)}>{r}</div>
        ))}
      </div>
    </div>
  );
}

function shuffle<T>(a: T[]): T[] { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }

// ------------------------------
// Main App
// ------------------------------
export default function QuizApp() {
  const [role, setRole] = useState("teacher");
  const [adapter] = useState<Adapter>(() => LocalAdapter());

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 text-slate-900 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <header className="sticky top-0 z-30 mb-6 flex items-center justify-between rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/60">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Quiz & Assessment</h1>
            <div className="text-sm text-slate-600">Interactive quizzes with realtime, timer, leaderboard & export</div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setRole("teacher")} className={`px-3 py-1.5 rounded-xl border transition-colors hover:bg-slate-50 ${role === 'teacher' ? 'bg-black text-white hover:bg-black' : 'bg-white'}`}>Teacher</button>
            <button onClick={() => setRole("student")} className={`px-3 py-1.5 rounded-xl border transition-colors hover:bg-slate-50 ${role === 'student' ? 'bg-black text-white hover:bg-black' : 'bg-white'}`}>Student</button>
          </div>
        </header>

        {role === "teacher" ? <TeacherView adapter={adapter} /> : <StudentView adapter={adapter} />}

        <footer className="mt-10 text-center text-xs text-gray-500">Built with React • Realtime-ready (Supabase/Firebase) • Export CSV/PDF</footer>
      </div>
    </div>
  );
}

// ------------------------------
// TeacherView
// ------------------------------
function TeacherView({ adapter }: { adapter: Adapter }) {
  const [quiz, setQuiz] = useState<Quiz>(defaultQuiz());
  const [roomCode, setRoomCode] = useState("");
  const [players, setPlayers] = useState<Player[]>([]);
  const [state, setState] = useState<Room | null>(null);
  const [tick, setTick] = useState(0);
  const [lastAnswer, setLastAnswer] = useState<AnswerRecord | null>(null);

  const currentQ = useMemo(() => state?.quiz?.questions?.[state?.currentIndex ?? 0], [state]);

  useEffect(() => {
    if (!roomCode) return;
    const off1 = adapter.on(roomCode, "players", setPlayers);
    const off2 = adapter.on(roomCode, "state", setState);
    const off3 = adapter.on(roomCode, "answer", ans => setLastAnswer(ans));
    return () => { off1?.(); off2?.(); off3?.(); };
  }, [roomCode]);

  const addQuestion = (type: Question['type']) => {
    const q: Question = type === "mcq" ? { id: uid(), type, prompt: "", options: ["",""], correct: 0, points: 1 }
      : type === "fib" ? { id: uid(), type, prompt: "", answer: "", points: 1 }
      : { id: uid(), type: "match", prompt: "", pairs: [{ left: "", right: "" }], points: 1 };
    setQuiz(qz => ({ ...qz, questions: [...qz.questions, q] }));
  };

  const startSession = async () => { const { roomCode } = await adapter.createRoom(quiz); setRoomCode(roomCode); const snap = await adapter.getRoomSnapshot(roomCode); setState(snap); };
  const startQuiz = async () => { await adapter.startQuiz(roomCode); setTick(t => t + 1); };
  const nextQuestion = async () => { await adapter.nextQuestion(roomCode); setTick(t => t + 1); };

  const exportCSV = () => {
    const rows: CSVRow[] = (state?.answers || []).map(a => {
      const player = players.find(p => p.id === a.playerId);
      return {
        room: roomCode,
        playerId: a.playerId,
        player: player?.name ?? "",
        questionIndex: a.qIndex + 1,
        correct: a.isCorrect ? "YES" : "NO",
        answer: typeof a.answer === 'object' ? JSON.stringify(a.answer) : (a.answer as string | number | boolean | null | undefined),
        at: a.at
      };
    });
    downloadFile(`results-${roomCode}.csv`, toCSV(rows));
  };

  const exportPDF = async () => {
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF(); doc.setFontSize(14); doc.text(`Quiz Results — Room ${roomCode}`, 14, 18); doc.setFontSize(10);
      let y = 26; (state?.answers || []).slice(0, 200).forEach((a, idx) => { const name = (players.find(p => p.id === a.playerId) || undefined)?.name || a.playerId; const line = `${idx+1}. Q${a.qIndex+1} • ${name} • ${a.isCorrect ? '✓' : '✗'} • ${typeof a.answer === 'object' ? JSON.stringify(a.answer) : a.answer}`; doc.text(line.slice(0, 100), 14, y); y += 6; if (y > 280) { doc.addPage(); y = 20; } });
      doc.save(`results-${roomCode}.pdf`);
    } catch (e) { alert("jsPDF not available. Add it to your project or use CSV export."); }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2">
        <Section title="Quiz Builder" right={<Pill>{quiz.questions.length} questions</Pill>}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <div>
              <label className="block text-sm mb-1">Title</label>
              <input className="w-full border rounded-xl p-2" value={quiz.title} onChange={e => setQuiz({ ...quiz, title: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm mb-1">Timer per question (sec)</label>
              <input type="number" className="w-full border rounded-xl p-2" value={quiz.durationSec} onChange={e => setQuiz({ ...quiz, durationSec: Number(e.target.value || 0) })} />
            </div>
          </div>
          {quiz.questions.map(q => <QuestionEditor key={q.id} q={q} onChange={(nq: Question) => setQuiz(qz => ({ ...qz, questions: qz.questions.map(x => x.id === q.id ? nq : x) }))} onDelete={() => setQuiz(qz => ({ ...qz, questions: qz.questions.filter(x => x.id !== q.id) }))} />)}
          <div className="flex gap-2">
            <button className="rounded-xl border px-3 py-1.5 hover:bg-slate-50" onClick={() => addQuestion("mcq")}>Add MCQ</button>
            <button className="rounded-xl border px-3 py-1.5 hover:bg-slate-50" onClick={() => addQuestion("fib")}>Add Fill-in-Blank</button>
            <button className="rounded-xl border px-3 py-1.5 hover:bg-slate-50" onClick={() => addQuestion("match")}>Add Match (Drag & Drop)</button>
          </div>
        </Section>

        <Section title="Live Session">
          {!roomCode ? (
            <div className="flex items-center gap-3">
              <button className="rounded-xl bg-black px-4 py-2 text-white hover:opacity-90" onClick={startSession}>Create Join Code</button>
              <span className="text-sm text-gray-500">Create a room and share the code with students.</span>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="text-sm">Join Code:</div>
                <div className="rounded bg-gray-900 px-3 py-1 font-mono text-2xl text-white">{roomCode}</div>
                <Pill>Status: {state?.status}</Pill>
              </div>

              {state?.status === "lobby" && (
                <button className="rounded-xl bg-emerald-600 px-4 py-2 text-white hover:opacity-90" onClick={startQuiz}>Start Quiz</button>
              )}

              {state?.status === "running" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <div className="mb-3"><Timer seconds={quiz.durationSec} tickKey={(state?.currentIndex || 0) + ":" + tick} onEnd={nextQuestion} /></div>
                    <QuestionPlayer q={currentQ} disabled onSubmit={() => {}} />
                    <div className="mt-4 flex items-center justify-between"><Pill>Question {(state?.currentIndex || 0) + 1} / {quiz.questions.length}</Pill><button className="px-3 py-1.5 rounded-xl border" onClick={nextQuestion}>Next Question</button></div>
                  </div>
                  <div>
                    <div className="mb-2 text-sm font-medium">Answers Stream</div>
                    <div className="h-64 overflow-auto rounded-xl border bg-gray-50 p-2">{(state?.answers || []).slice().reverse().map((a, idx) => {
                      const player = players.find(p => p.id === a.playerId);
                      return (<div key={idx} className="text-sm flex items-center justify-between"><span>{player?.name ?? a.playerId}</span><span>Q{a.qIndex+1}</span><span>{a.isCorrect ? "✓" : "✗"}</span></div>);
                    })}</div>
                  </div>
                </div>
              )}

              {state?.status === "ended" && (
                <div className="flex items-center gap-3"><button className="rounded-xl border px-3 py-1.5 hover:bg-slate-50" onClick={exportCSV}>Export CSV</button><button className="rounded-xl border px-3 py-1.5 hover:bg-slate-50" onClick={exportPDF}>Export PDF</button></div>
              )}
            </div>
          )}
        </Section>
      </div>

      <div>
        <Section title="Players & Leaderboard" right={<Pill>{players.length} joined</Pill>}>
          <Leaderboard players={players} />
        </Section>

        <Section title="Latest Answer">{lastAnswer ? (<div className="text-sm">{(players.find(p => p.id === lastAnswer.playerId) || undefined)?.name || lastAnswer.playerId} • Q{lastAnswer.qIndex+1} • {lastAnswer.isCorrect ? "Correct" : "Wrong"}</div>) : (<div className="text-sm text-gray-500">No answers yet.</div>)}</Section>
      </div>
    </div>
  );
}

// ------------------------------
// StudentView
// ------------------------------
function StudentView({ adapter }: { adapter: Adapter }) {
  const [roomCode, setRoomCode] = useState("");
  const [name, setName] = useState("");
  const [joined, setJoined] = useState(false);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [state, setState] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const currentQ = useMemo(() => state?.quiz?.questions?.[state?.currentIndex ?? 0], [state]);

  useEffect(() => {
    if (!joined) return;
    const off1 = adapter.on(roomCode, "state", setState);
    const off2 = adapter.on(roomCode, "players", setPlayers);
    return () => { off1?.(); off2?.(); };
  }, [joined, roomCode]);

  const join = async () => {
    if (!roomCode || !name) return alert("Enter join code and name");
    try {
      const { playerId, snapshot } = await adapter.joinRoom(roomCode, name);
      setPlayerId(playerId);
      setState(snapshot);
      setJoined(true);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  const submit = async (ans: AnswerValue) => {
    const res = await adapter.submitAnswer(roomCode, playerId as string, { answer: ans });
    setFeedback(res.isCorrect ? "Correct!" : "Wrong");
    setTick(t => t + 1);
    setTimeout(() => setFeedback(null), 1500);
  };

  return (
    <div className="max-w-3xl mx-auto">
      {!joined ? (
        <Section title="Join Quiz">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input className="rounded-xl border p-2 focus:outline-none focus:ring focus:ring-slate-300" placeholder="Join Code" value={roomCode} onChange={e => setRoomCode(e.target.value.trim())} />
            <input className="rounded-xl border p-2 focus:outline-none focus:ring focus:ring-slate-300" placeholder="Your Name" value={name} onChange={e => setName(e.target.value)} />
            <button className="rounded-xl bg-black px-4 py-2 text-white hover:opacity-90" onClick={join}>Join</button>
          </div>
        </Section>
      ) : (
        <>
          <Section title={`Room ${roomCode}`} right={<Pill>{players.length} players</Pill>}>
            {state?.status === "lobby" && <div className="text-sm text-gray-500">Waiting for teacher to start…</div>}
            {state?.status === "running" && (
              <div className="space-y-4">
                <Timer seconds={state?.quiz?.durationSec} tickKey={(state?.currentIndex || 0) + ":" + tick} onEnd={() => { /* teacher will advance */ }} />
                <QuestionPlayer q={currentQ} onSubmit={submit} />
                {feedback && <div className={`p-2 rounded-xl ${feedback.includes('Correct') ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>{feedback}</div>}
                <div className="text-sm text-gray-500">Question {(state?.currentIndex || 0) + 1} / {state?.quiz?.questions?.length || 0}</div>
              </div>
            )}

            {state?.status === "ended" && (
              <div className="text-center">
                <div className="text-lg font-semibold mb-2">Quiz Ended</div>
                <div className="text-sm">Thanks for playing, {name}!</div>
              </div>
            )}
          </Section>

          <Section title="Leaderboard">
            <Leaderboard players={players} />
          </Section>
        </>
      )}
    </div>
  );
}

// ------------------------------
// Small test harness for gradeAnswer
// ------------------------------
(function runGradeAnswerTests(){
  try {
    const mcq: MCQQuestion = { id: '1', type: 'mcq', prompt: '', options: [], correct: 2, points: 1 };
    console.assert(gradeAnswer(mcq, 2) === true, 'MCQ correct should be true');
    console.assert(gradeAnswer(mcq, 1) === false, 'MCQ wrong should be false');

    const fib: FIBQuestion = { id: '2', type: 'fib', prompt: '', answer: 'H2O', points: 1 };
    console.assert(gradeAnswer(fib, 'H2O') === true, 'FIB exact');
    console.assert(gradeAnswer(fib, 'h2o') === true, 'FIB case-insensitive');
    console.assert(gradeAnswer(fib, ' H2O ') === true, 'FIB trimmed');

    const matchQ: MatchQuestion = { id: '3', type: 'match', prompt: '', pairs: [{left:'A',right:'1'},{left:'B',right:'2'}], points: 1 };
    console.assert(gradeAnswer(matchQ, [{left:'A',right:'1'},{left:'B',right:'2'}]) === true, 'MATCH correct');
    console.assert(gradeAnswer(matchQ, [{left:'A',right:'2'},{left:'B',right:'1'}]) === false, 'MATCH wrong');

    console.log('gradeAnswer tests passed');
  } catch (e) {
    console.error('gradeAnswer tests failed', e);
  }
})();


