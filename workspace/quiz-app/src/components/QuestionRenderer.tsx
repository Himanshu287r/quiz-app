import { useEffect, useRef, useState } from 'react';
import type { Question } from '../data';

interface Props {
  question: Question;
  onSubmit: (value: unknown, timeTakenSec?: number) => void;
  disabled?: boolean;
}

export default function QuestionRenderer({ question, onSubmit, disabled }: Props) {
  const [value, setValue] = useState<any>(question.type === 'mcq' ? -1 : '');
  const [dragMapping, setDragMapping] = useState<Record<string, string>>({});
  const [seconds, setSeconds] = useState(0);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    setValue(question.type === 'mcq' ? -1 : '');
    setDragMapping({});
    setSeconds(0);
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    intervalRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, [question.id]);

  const timeLeft = question.timeLimitSec ? Math.max(0, question.timeLimitSec - seconds) : undefined;

  useEffect(() => {
    if (timeLeft === 0) {
      handleSubmit();
    }
  }, [timeLeft]);

  function handleSubmit() {
    if (question.type === 'mcq') onSubmit(value, seconds);
    else if (question.type === 'fill') onSubmit(value, seconds);
    else onSubmit(dragMapping, seconds);
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>{question.prompt}</h3>
        {timeLeft != null && <span>⏱ {timeLeft}s</span>}
      </div>
      {question.type === 'mcq' && 'options' in question && (
        <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
          {question.options.map((opt, idx) => (
            <label key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="radio"
                name={`mcq-${question.id}`}
                checked={value === idx}
                onChange={() => setValue(idx)}
                disabled={disabled}
              />
              {opt}
            </label>
          ))}
        </div>
      )}

      {question.type === 'fill' && 'expectedAnswer' in question && (
        <div style={{ marginTop: 12 }}>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={disabled}
            placeholder="Type your answer"
            style={{ width: '100%' }}
          />
        </div>
      )}

      {question.type === 'drag' && (
        <div style={{ marginTop: 12 }}>
          <p>Drag-and-drop is simplified here: select mapping via dropdowns.</p>
          {/* Simplified UI to avoid DnD complexity in first version */}
          <div style={{ display: 'grid', gap: 8 }}>
            {(question.items || []).map((item) => (
              <div key={item.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ minWidth: 160 }}>{item.label}</span>
                <select
                  value={dragMapping[item.id] || ''}
                  onChange={(e) => setDragMapping((m) => ({ ...m, [item.id]: e.target.value }))}
                  disabled={disabled}
                >
                  <option value="">Select target</option>
                  {(question as any).targets?.map((t: any) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <button onClick={handleSubmit} disabled={disabled}>
          Submit
        </button>
      </div>
    </div>
  );
}

