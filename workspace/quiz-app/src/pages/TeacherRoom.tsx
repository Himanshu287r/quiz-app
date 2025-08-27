import { useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import useAppStore from '../store/useAppStore';
import { exportResultsToCSV, exportResultsToPDF } from '../utils/exporters';

export default function TeacherRoom() {
  const { roomId } = useParams();
  const { currentRoom, currentQuiz, startQuiz, goToNextQuestion, finishQuiz, subscribeRoom } = useAppStore();

  useEffect(() => {
    if (roomId) subscribeRoom(roomId);
  }, [roomId]);

  const leaderboard = useMemo(() => {
    return (currentRoom?.participants || [])
      .slice()
      .sort((a, b) => b.score - a.score);
  }, [currentRoom]);

  if (!currentRoom || !currentQuiz) return <div>Loading room...</div>;

  const isLobby = currentRoom.status === 'lobby';
  const isRunning = currentRoom.status === 'running';
  const isFinished = currentRoom.status === 'finished';

  return (
    <div>
      <h2>Room {currentRoom.code}</h2>
      <p>Quiz: {currentQuiz.title}</p>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 320 }}>
          {isLobby && (
            <div>
              <p>Waiting for students to join...</p>
              <button onClick={() => startQuiz()}>Start Quiz</button>
            </div>
          )}

          {isRunning && (
            <div>
              <p>
                Question {currentRoom.currentQuestionIndex + 1} / {currentQuiz.questions.length}
              </p>
              <button onClick={() => goToNextQuestion()}>Next Question</button>
              <button onClick={() => finishQuiz()} style={{ marginLeft: 8 }}>
                Finish
              </button>
            </div>
          )}

          {isFinished && <p>Quiz finished.</p>}
        </div>

        <div style={{ flex: 1, minWidth: 320 }}>
          <h3>Leaderboard</h3>
          <ol>
            {leaderboard.map((p) => (
              <li key={p.id}>
                {p.name}: {p.score} pts
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <h3>Participants</h3>
        <ul>
          {currentRoom.participants.map((p) => (
            <li key={p.id}>{p.name}</li>
          ))}
        </ul>

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button
            onClick={() => {
              const csv = exportResultsToCSV({ room: currentRoom, quiz: currentQuiz });
              const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `results_${currentRoom.code}.csv`;
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            Export CSV
          </button>

          <button
            onClick={() => {
              const bytes = exportResultsToPDF({ room: currentRoom, quiz: currentQuiz });
              const blob = new Blob([bytes], { type: 'application/pdf' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `results_${currentRoom.code}.pdf`;
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            Export PDF
          </button>
        </div>
      </div>
    </div>
  );
}

