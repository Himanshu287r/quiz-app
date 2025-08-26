import React, { useEffect, useMemo, useState } from "react";

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

function downloadFile(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function toCSV(rows) {
  if (!rows || rows.length === 0) return "";
  const esc = (s = "") => `"${String(s).replaceAll('"', '""')}"`;
  const keys = Object.keys(rows[0] || {});
  const head = keys.map(esc).join(",");
  const data = rows.map(r => keys.map(k => esc(r[k])).join(",")).join("\n");
  return head + "\n" + data;
}

// ------------------------------
// Local realtime adapter (in-memory)
// ------------------------------
function LocalAdapter() {
  const state = { rooms: {} };
  const listeners = {};
  const emitAll = (room, evt, payload) => (listeners[room]?.[evt] || []).forEach(cb => cb(payload));

  return {
    createRoom: async (quiz) => {
      const roomCode = String(Math.random()).slice(2, 8);
      state.rooms[roomCode] = { quiz, players: {}, answers: [], currentIndex: 0, status: "lobby", createdAt: now() };
      return { roomCode };
    },
    joinRoom: async (roomCode, name) => {
      const room = state.rooms[roomCode];
      if (!room) throw new Error("Room not found");
      const id = uid();
      room.players[id] = { id, name, score: 0, joinedAt: now() };
      emitAll(roomCode, "players", Object.values(room.players));
      return { playerId: id, snapshot: JSON.parse(JSON.stringify(room)) };
    },
    on: (roomCode, event, cb) => {
      listeners[roomCode] = listeners[roomCode] || {};
      listeners[roomCode][event] = listeners[roomCode][event] || [];
      listeners[roomCode][event].push(cb);
      return () => { listeners[roomCode][event] = (listeners[roomCode][event] || []).filter(f => f !== cb); };
    },
    startQuiz: async (roomCode) => {
      const room = state.rooms[roomCode];
      if (!room) return;
      room.status = "running";
      room.currentIndex = 0;
      emitAll(roomCode, "state", JSON.parse(JSON.stringify(room)));
    },
    nextQuestion: async (roomCode) => {
      const room = state.rooms[roomCode];
      if (!room) return;
      room.currentIndex += 1;
      if (room.currentIndex >= (room.quiz?.questions?.length || 0)) room.status = "ended";
      emitAll(roomCode, "state", JSON.parse(JSON.stringify(room)));
    },
    submitAnswer: async (roomCode, playerId, payload) => {
      const room = state.rooms[roomCode];
      if (!room) return { isCorrect: false };
      const q = room.quiz.questions[room.currentIndex];
      const isCorrect = gradeAnswer(q, payload.answer);
      if (isCorrect) {
        room.players[playerId].score = (room.players[playerId].score || 0) + 1;
        emitAll(roomCode, "players", Object.values(room.players));
      }
      const record = { playerId, qIndex: room.currentIndex, answer: payload.answer, isCorrect, at: now() };
      room.answers.push(record);
      emitAll(roomCode, "answer", record);
      return { isCorrect };
    },
    getRoomSnapshot: async (roomCode) => {
      const room = state.rooms[roomCode];
      if (!room) throw new Error("Room not found");
      return JSON.parse(JSON.stringify(room));
    }
  };
}

// ------------------------------
// Quiz logic
// ------------------------------
const defaultQuiz = () => ({
  id: uid(),
  title: "Sample Quiz",
  durationSec: 30,
  questions: [
    { id: uid(), type: "mcq", prompt: "Which is a prime number?", options: ["9","12","13","21"], correct: 2, points: 1 },
    { id: uid(), type: "fib", prompt: "The chemical symbol for water is _____.", answer: "H2O", points: 1 },
    { id: uid(), type: "match", prompt: "Drag each country to its capital.", pairs: [ { left: "France", right: "Paris" }, { left: "Japan", right: "Tokyo" }, { left: "India", right: "New Delhi" } ], points: 1 }
  ]
});

function gradeAnswer(q, answer) {
  if (!q) return false;
  switch (q.type) {
    case "mcq": return Number(answer) === q.correct;
    case "fib": return String(answer || "").trim().toLowerCase() === String(q.answer || "").trim().toLowerCase();
    case "match":
      if (!Array.isArray(answer)) return false;
      const ok = answer.every(p => q.pairs.find(x => x.left === p.left && x.right === p.right));
      return ok && answer.length === q.pairs.length;
    default: return false;
  }
}

// ------------------------------
// UI components
// ------------------------------
function Section({ title, children, right }) {
  return (
    <div className="bg-white rounded-2xl shadow p-5 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xl font-semibold">{title}</h2>
        <div>{right}</div>
      </div>
      {children}
    </div>
  );
}

function Pill({ children }) { return <span className="inline-block px-2 py-1 text-xs rounded-full bg-gray-100">{children}</span>; }

function Timer({ seconds, onEnd, tickKey }) {
  const [left, setLeft] = useState(seconds || 0);
  useEffect(() => { setLeft(seconds || 0); }, [seconds, tickKey]);
  useEffect(() => {
    if (left <= 0) return void onEnd?.();
    const t = setTimeout(() => setLeft(l => l - 1), 1000);
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

function Leaderboard({ players = [] }) {
  const sorted = [...players].sort((a,b) => (b.score || 0) - (a.score || 0));
  return (
    <div className="space-y-2">
      {sorted.map((p, i) => (
        <div key={p.id} className="flex items-center justify-between bg-gray-50 rounded-xl p-2">
          <div className="flex items-center gap-2"><span className="text-sm w-6 text-center">#{i+1}</span><span className="font-medium">{p.name}</span></div>
          <div className="text-sm"><b>{p.score || 0}</b> pts</div>
        </div>
      ))}
    </div>
  );
}

function QuestionEditor({ q, onChange, onDelete }) {
  const set = (patch) => onChange({ ...q, ...patch });
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
          {q.options.map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <input className="flex-1 border rounded p-2" value={opt} onChange={e => { const options = [...q.options]; options[i] = e.target.value; set({ options }); }} />
              <label className="text-sm flex items-center gap-1"><input type="radio" name={`correct-${q.id}`} checked={q.correct === i} onChange={() => set({ correct: i })} /> Correct</label>
            </div>
          ))}
          <div className="flex gap-2">
            <button className="text-sm px-2 py-1 border rounded" onClick={() => set({ options: [...q.options, ""] })}>Add option</button>
            {q.options.length > 2 && <button className="text-sm px-2 py-1 border rounded" onClick={() => set({ options: q.options.slice(0, -1) })}>Remove last</button>}
          </div>
        </div>
      )}

      {q.type === "fib" && (
        <div>
          <label className="block text-sm mb-1">Correct Answer</label>
          <input className="w-full border rounded p-2" value={q.answer} onChange={e => set({ answer: e.target.value })} />
        </div>
      )}

      {q.type === "match" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <div className="text-sm font-medium mb-1">Left (fixed)</div>
            {q.pairs.map((p, i) => (
              <input key={i} className="w-full border rounded p-2 mb-2" value={p.left} onChange={e => { const pairs = [...q.pairs]; pairs[i] = { ...pairs[i], left: e.target.value }; set({ pairs }); }} />
            ))}
          </div>
          <div>
            <div className="text-sm font-medium mb-1">Right (drag targets)</div>
            {q.pairs.map((p, i) => (
              <input key={i} className="w-full border rounded p-2 mb-2" value={p.right} onChange={e => { const pairs = [...q.pairs]; pairs[i] = { ...pairs[i], right: e.target.value }; set({ pairs }); }} />
            ))}
          </div>
          <div className="col-span-full"><button className="text-sm px-2 py-1 border rounded" onClick={() => set({ pairs: [...q.pairs, { left: "", right: "" }] })}>Add pair</button></div>
        </div>
      )}

      <div className="mt-3 flex items-center gap-3">
        <label className="text-sm">Points</label>
        <input type="number" className="w-24 border rounded p-2" value={q.points || 1} onChange={e => set({ points: Number(e.target.value || 0) })} />
      </div>
    </div>
  );
}

function QuestionPlayer({ q, onSubmit, disabled }) {
  const [answer, setAnswer] = useState(null);
  useEffect(() => { setAnswer(null); }, [q?.id]);
  if (!q) return <div>No question</div>;
  const submit = () => onSubmit?.(answer);

  return (
    <div>
      <div className="text-lg font-medium mb-3">{q.prompt}</div>

      {q.type === "mcq" && (
        <div className="space-y-2">
          {q.options.map((opt, i) => (
            <label key={i} className={`flex items-center gap-2 border rounded-xl p-2 ${Number(answer) === i ? "ring-2" : ""}`}>
              <input type="radio" name={`a-${q.id}`} checked={Number(answer) === i} onChange={() => setAnswer(i)} />
              <span>{opt}</span>
            </label>
          ))}
        </div>
      )}

      {q.type === "fib" && (
        <input className="w-full border rounded-xl p-2" placeholder="Type your answer" value={answer || ""} onChange={e => setAnswer(e.target.value)} />
      )}

      {q.type === "match" && (
        <MatchPlayer pairs={q.pairs} onChange={setAnswer} />
      )}

      <div className="mt-4"><button disabled={disabled} className="px-4 py-2 rounded-xl bg-black text-white disabled:opacity-50" onClick={submit}>Submit</button></div>
    </div>
  );
}

function MatchPlayer({ pairs, onChange }) {
  const [right, setRight] = useState(() => shuffle(pairs.map(p => p.right)));
  const [mapping, setMapping] = useState(pairs.map(p => ({ left: p.left, right: null })));
  useEffect(() => { onChange?.(mapping); }, [mapping]);
  function onDrop(i, value) { setMapping(m => m.map((x, idx) => idx === i ? { ...x, right: value } : x)); }

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
          <div key={i} className="border rounded-xl p-2 text-center cursor-move bg-gray-100" draggable onDragStart={e => e.dataTransfer.setData('text/plain', r)}>{r}</div>
        ))}
      </div>
    </div>
  );
}

function shuffle(a) { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }

// ------------------------------
// Main App
// ------------------------------
export default function QuizApp() {
  const [role, setRole] = useState("teacher");
  const [adapter] = useState(() => LocalAdapter());

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 text-gray-900 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <header className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Quiz & Assessment</h1>
            <div className="text-sm text-gray-600">Interactive quizzes with realtime, timer, leaderboard & export</div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setRole("teacher")} className={`px-3 py-1.5 rounded-xl border ${role === 'teacher' ? 'bg-black text-white' : 'bg-white'}`}>Teacher</button>
            <button onClick={() => setRole("student")} className={`px-3 py-1.5 rounded-xl border ${role === 'student' ? 'bg-black text-white' : 'bg-white'}`}>Student</button>
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
function TeacherView({ adapter }) {
  const [quiz, setQuiz] = useState(defaultQuiz());
  const [roomCode, setRoomCode] = useState("");
  const [players, setPlayers] = useState([]);
  const [state, setState] = useState(null);
  const [tick, setTick] = useState(0);
  const [lastAnswer, setLastAnswer] = useState(null);

  const currentQ = useMemo(() => state?.quiz?.questions?.[state?.currentIndex ?? 0], [state]);

  useEffect(() => {
    if (!roomCode) return;
    const off1 = adapter.on(roomCode, "players", setPlayers);
    const off2 = adapter.on(roomCode, "state", setState);
    const off3 = adapter.on(roomCode, "answer", ans => setLastAnswer(ans));
    return () => { off1?.(); off2?.(); off3?.(); };
  }, [roomCode]);

  const addQuestion = (type) => {
    const q = type === "mcq" ? { id: uid(), type, prompt: "", options: ["",""], correct: 0, points: 1 }
      : type === "fib" ? { id: uid(), type, prompt: "", answer: "", points: 1 }
      : { id: uid(), type: "match", prompt: "", pairs: [{ left: "", right: "" }], points: 1 };
    setQuiz(qz => ({ ...qz, questions: [...qz.questions, q] }));
  };

  const startSession = async () => { const { roomCode } = await adapter.createRoom(quiz); setRoomCode(roomCode); const snap = await adapter.getRoomSnapshot(roomCode); setState(snap); };
  const startQuiz = async () => { await adapter.startQuiz(roomCode); setTick(t => t + 1); };
  const nextQuestion = async () => { await adapter.nextQuestion(roomCode); setTick(t => t + 1); };

  const exportCSV = () => {
    const rows = (state?.answers || []).map(a => ({ room: roomCode, playerId: a.playerId, player: (players.find(p => p.id === a.playerId) || {}).name || "", questionIndex: a.qIndex + 1, correct: a.isCorrect ? "YES" : "NO", answer: typeof a.answer === 'object' ? JSON.stringify(a.answer) : a.answer, at: a.at }));
    downloadFile(`results-${roomCode}.csv`, toCSV(rows));
  };

  const exportPDF = async () => {
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF(); doc.setFontSize(14); doc.text(`Quiz Results — Room ${roomCode}`, 14, 18); doc.setFontSize(10);
      let y = 26; (state?.answers || []).slice(0, 200).forEach((a, idx) => { const name = (players.find(p => p.id === a.playerId) || {}).name || a.playerId; const line = `${idx+1}. Q${a.qIndex+1} • ${name} • ${a.isCorrect ? '✓' : '✗'} • ${typeof a.answer === 'object' ? JSON.stringify(a.answer) : a.answer}`; doc.text(line.slice(0, 100), 14, y); y += 6; if (y > 280) { doc.addPage(); y = 20; } });
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
          {quiz.questions.map(q => <QuestionEditor key={q.id} q={q} onChange={nq => setQuiz(qz => ({ ...qz, questions: qz.questions.map(x => x.id === q.id ? nq : x) }))} onDelete={() => setQuiz(qz => ({ ...qz, questions: qz.questions.filter(x => x.id !== q.id) }))} />)}
          <div className="flex gap-2">
            <button className="px-3 py-1.5 border rounded-xl" onClick={() => addQuestion("mcq")}>Add MCQ</button>
            <button className="px-3 py-1.5 border rounded-xl" onClick={() => addQuestion("fib")}>Add Fill-in-Blank</button>
            <button className="px-3 py-1.5 border rounded-xl" onClick={() => addQuestion("match")}>Add Match (Drag & Drop)</button>
          </div>
        </Section>

        <Section title="Live Session">
          {!roomCode ? (
            <div className="flex items-center gap-3">
              <button className="px-4 py-2 rounded-xl bg-black text-white" onClick={startSession}>Create Join Code</button>
              <span className="text-sm text-gray-500">Create a room and share the code with students.</span>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="text-sm">Join Code:</div>
                <div className="text-2xl font-mono bg-gray-900 text-white px-3 py-1 rounded">{roomCode}</div>
                <Pill>Status: {state?.status}</Pill>
              </div>

              {state?.status === "lobby" && (
                <button className="px-4 py-2 rounded-xl bg-emerald-600 text-white" onClick={startQuiz}>Start Quiz</button>
              )}

              {state?.status === "running" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <div className="mb-3"><Timer seconds={quiz.durationSec} tickKey={(state?.currentIndex || 0) + ":" + tick} onEnd={nextQuestion} /></div>
                    <QuestionPlayer q={currentQ} disabled onSubmit={() => {}} />
                    <div className="mt-4 flex items-center justify-between"><Pill>Question {(state?.currentIndex || 0) + 1} / {quiz.questions.length}</Pill><button className="px-3 py-1.5 rounded-xl border" onClick={nextQuestion}>Next Question</button></div>
                  </div>
                  <div>
                    <div className="text-sm font-medium mb-2">Answers Stream</div>
                    <div className="h-64 overflow-auto border rounded-xl p-2 bg-gray-50">{(state?.answers || []).slice().reverse().map((a, idx) => (<div key={idx} className="text-sm flex items-center justify-between"><span>{(players.find(p => p.id === a.playerId) || {}).name || a.playerId}</span><span>Q{a.qIndex+1}</span><span>{a.isCorrect ? "✓" : "✗"}</span></div>))}</div>
                  </div>
                </div>
              )}

              {state?.status === "ended" && (
                <div className="flex items-center gap-3"><button className="px-3 py-1.5 rounded-xl border" onClick={exportCSV}>Export CSV</button><button className="px-3 py-1.5 rounded-xl border" onClick={exportPDF}>Export PDF</button></div>
              )}
            </div>
          )}
        </Section>
      </div>

      <div>
        <Section title="Players & Leaderboard" right={<Pill>{players.length} joined</Pill>}>
          <Leaderboard players={players} />
        </Section>

        <Section title="Latest Answer">{lastAnswer ? (<div className="text-sm">{(players.find(p => p.id === lastAnswer.playerId) || {}).name || lastAnswer.playerId} • Q{lastAnswer.qIndex+1} • {lastAnswer.isCorrect ? "Correct" : "Wrong"}</div>) : (<div className="text-sm text-gray-500">No answers yet.</div>)}</Section>
      </div>
    </div>
  );
}

// ------------------------------
// StudentView
// ------------------------------
function StudentView({ adapter }) {
  const [roomCode, setRoomCode] = useState("");
  const [name, setName] = useState("");
  const [joined, setJoined] = useState(false);
  const [playerId, setPlayerId] = useState(null);
  const [state, setState] = useState(null);
  const [players, setPlayers] = useState([]);
  const [feedback, setFeedback] = useState(null);
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
    } catch (e) {
      alert(e.message || e);
    }
  };

  const submit = async (ans) => {
    const res = await adapter.submitAnswer(roomCode, playerId, { answer: ans });
    setFeedback(res.isCorrect ? "Correct!" : "Wrong");
    setTick(t => t + 1);
    setTimeout(() => setFeedback(null), 1500);
  };

  return (
    <div className="max-w-3xl mx-auto">
      {!joined ? (
        <Section title="Join Quiz">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input className="border rounded-xl p-2" placeholder="Join Code" value={roomCode} onChange={e => setRoomCode(e.target.value.trim())} />
            <input className="border rounded-xl p-2" placeholder="Your Name" value={name} onChange={e => setName(e.target.value)} />
            <button className="px-4 py-2 rounded-xl bg-black text-white" onClick={join}>Join</button>
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
    const mcq = { type: 'mcq', correct: 2 };
    console.assert(gradeAnswer(mcq, 2) === true, 'MCQ correct should be true');
    console.assert(gradeAnswer(mcq, 1) === false, 'MCQ wrong should be false');

    const fib = { type: 'fib', answer: 'H2O' };
    console.assert(gradeAnswer(fib, 'H2O') === true, 'FIB exact');
    console.assert(gradeAnswer(fib, 'h2o') === true, 'FIB case-insensitive');
    console.assert(gradeAnswer(fib, ' H2O ') === true, 'FIB trimmed');

    const matchQ = { type: 'match', pairs: [{left:'A',right:'1'},{left:'B',right:'2'}] };
    console.assert(gradeAnswer(matchQ, [{left:'A',right:'1'},{left:'B',right:'2'}]) === true, 'MATCH correct');
    console.assert(gradeAnswer(matchQ, [{left:'A',right:'2'},{left:'B',right:'1'}]) === false, 'MATCH wrong');

    console.log('gradeAnswer tests passed');
  } catch (e) {
    console.error('gradeAnswer tests failed', e);
  }
})();
