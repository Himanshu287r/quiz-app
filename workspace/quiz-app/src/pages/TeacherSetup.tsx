import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import type { Question } from '../data';
import { generateId } from '../data';

function createEmptyMcq(): Question {
  return {
    id: generateId('q'),
    type: 'mcq',
    prompt: 'New multiple choice question',
    options: ['Option A', 'Option B', 'Option C', 'Option D'],
    correctIndex: 0,
    points: 10,
    timeLimitSec: 30,
  } as Question;
}

function createEmptyFill(): Question {
  return {
    id: generateId('q'),
    type: 'fill',
    prompt: 'Type the correct answer',
    expectedAnswer: 'answer',
    points: 10,
    timeLimitSec: 30,
  } as Question;
}

export default function TeacherSetup() {
  const navigate = useNavigate();
  const { createQuizAndRoom, loading } = useAppStore();
  const [title, setTitle] = useState('Sample Quiz');
  const [questions, setQuestions] = useState<Question[]>(() => [createEmptyMcq(), createEmptyFill()]);

  async function handleCreate() {
    await createQuizAndRoom({ title, questions });
    // state will update; navigate to teacher room when available
    const roomId = useAppStore.getState().currentRoom?.id;
    if (roomId) navigate(`/teacher/room/${roomId}`);
  }

  return (
    <div>
      <h2>Create Quiz</h2>
      <div style={{ display: 'grid', gap: 12, maxWidth: 720 }}>
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: '100%' }} />
        </label>

        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <button onClick={() => setQuestions((qs) => [...qs, createEmptyMcq()])}>+ MCQ</button>
            <button onClick={() => setQuestions((qs) => [...qs, createEmptyFill()])}>+ Fill</button>
          </div>
          {questions.map((q, idx) => (
            <div key={q.id} style={{ border: '1px solid #ccc', padding: 12, marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong>Q{idx + 1} ({q.type})</strong>
                <button onClick={() => setQuestions((qs) => qs.filter((x) => x.id !== q.id))}>Delete</button>
              </div>
              <label>
                Prompt
                <input
                  value={q.prompt}
                  onChange={(e) =>
                    setQuestions((qs) => qs.map((x) => (x.id === q.id ? { ...x, prompt: e.target.value } : x)))
                  }
                  style={{ width: '100%' }}
                />
              </label>

              {q.type === 'mcq' && 'options' in q && (
                <div>
                  {(q.options || []).map((opt, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                      <input
                        value={opt}
                        onChange={(e) =>
                          setQuestions((qs) =>
                            qs.map((x) =>
                              x.id === q.id
                                ? { ...x, options: (q as any).options.map((o: string, oi: number) => (oi === i ? e.target.value : o)) }
                                : x,
                            ),
                          )
                        }
                        style={{ flex: 1 }}
                      />
                      <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <input
                          type="radio"
                          name={`correct-${q.id}`}
                          checked={(q as any).correctIndex === i}
                          onChange={() =>
                            setQuestions((qs) => qs.map((x) => (x.id === q.id ? { ...(x as any), correctIndex: i } : x)))
                          }
                        />
                        Correct
                      </label>
                    </div>
                  ))}
                </div>
              )}

              {q.type === 'fill' && 'expectedAnswer' in q && (
                <label>
                  Expected answer
                  <input
                    value={(q as any).expectedAnswer}
                    onChange={(e) =>
                      setQuestions((qs) =>
                        qs.map((x) => (x.id === q.id ? { ...(x as any), expectedAnswer: e.target.value } : x)),
                      )
                    }
                    style={{ width: '100%' }}
                  />
                </label>
              )}

              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <label>
                  Points
                  <input
                    type="number"
                    value={q.points ?? 10}
                    onChange={(e) =>
                      setQuestions((qs) =>
                        qs.map((x) => (x.id === q.id ? { ...x, points: Number(e.target.value) } : x)),
                      )
                    }
                    style={{ width: 120 }}
                  />
                </label>
                <label>
                  Time limit (sec)
                  <input
                    type="number"
                    value={q.timeLimitSec ?? 30}
                    onChange={(e) =>
                      setQuestions((qs) =>
                        qs.map((x) => (x.id === q.id ? { ...x, timeLimitSec: Number(e.target.value) } : x)),
                      )
                    }
                    style={{ width: 160 }}
                  />
                </label>
              </div>
            </div>
          ))}
        </div>

        <div>
          <button disabled={loading} onClick={handleCreate}>
            {loading ? 'Creating...' : 'Create Room & Start Lobby'}
          </button>
        </div>
      </div>
    </div>
  );
}

