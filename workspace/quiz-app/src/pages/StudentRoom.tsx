import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import useAppStore from '../store/useAppStore';
import QuestionRenderer from '../components/QuestionRenderer';

export default function StudentRoom() {
  const { roomId } = useParams();
  const { currentRoom, currentQuiz, submitAnswer, subscribeRoom, participantId } = useAppStore();
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (roomId) subscribeRoom(roomId);
  }, [roomId]);

  const activeQuestion = useMemo(() => {
    if (!currentRoom || !currentQuiz) return undefined;
    if (currentRoom.currentQuestionIndex < 0) return undefined;
    return currentQuiz.questions[currentRoom.currentQuestionIndex];
  }, [currentRoom, currentQuiz]);

  if (!currentRoom || !currentQuiz) return <div>Loading room...</div>;

  const hasSubmitted = activeQuestion
    ? (currentRoom.answers[activeQuestion.id] || []).some((a) => a.participantId === participantId)
    : false;

  async function handleSubmit(value: unknown, seconds?: number) {
    if (!activeQuestion) return;
    await submitAnswer(activeQuestion.id, value, seconds);
    // derive instant feedback from current snapshot
    const arr = (useAppStore.getState().currentRoom?.answers[activeQuestion.id] || []).filter(
      (a) => a.participantId === participantId,
    );
    const latest = arr[arr.length - 1];
    if (latest) setFeedback(latest.isCorrect ? 'Correct ✅' : 'Incorrect ❌');
  }

  return (
    <div>
      <h2>Room {currentRoom.code}</h2>
      {currentRoom.status === 'lobby' && <p>Waiting for the teacher to start…</p>}
      {currentRoom.status === 'finished' && <p>Quiz finished.</p>}

      {activeQuestion && (
        <div>
          <QuestionRenderer question={activeQuestion} onSubmit={handleSubmit} disabled={hasSubmitted} />
          {feedback && <p style={{ marginTop: 8 }}>{feedback}</p>}
        </div>
      )}
    </div>
  );
}

