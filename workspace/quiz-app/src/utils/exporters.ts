import Papa from 'papaparse';
import jsPDF from 'jspdf';
import type { RoomSnapshot } from '../data';

export function exportResultsToCSV(snap: RoomSnapshot): string {
  const rows: any[] = [];
  const { room, quiz } = snap;
  for (const q of quiz.questions) {
    const answers = room.answers[q.id] || [];
    for (const a of answers) {
      const participant = room.participants.find((p) => p.id === a.participantId);
      rows.push({
        roomCode: room.code,
        questionId: q.id,
        questionPrompt: q.prompt,
        participant: participant?.name || a.participantId,
        isCorrect: a.isCorrect,
        points: a.pointsAwarded,
        timeTakenSec: a.timeTakenSec ?? '',
        submittedAt: new Date(a.submittedAt).toISOString(),
      });
    }
  }
  return Papa.unparse(rows);
}

export function exportResultsToPDF(snap: RoomSnapshot): Uint8Array {
  const { room, quiz } = snap;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  let y = 40;
  doc.setFontSize(16);
  doc.text(`Results - Room ${room.code}`, 40, y);
  y += 24;
  doc.setFontSize(12);
  doc.text(`Quiz: ${quiz.title}`, 40, y);
  y += 24;

  const leaderboard = room.participants.slice().sort((a, b) => b.score - a.score);
  doc.text('Leaderboard:', 40, y);
  y += 18;
  leaderboard.forEach((p, idx) => {
    doc.text(`${idx + 1}. ${p.name} - ${p.score} pts`, 60, y);
    y += 16;
  });

  y += 16;
  doc.text('Answers:', 40, y);
  y += 18;
  for (const q of quiz.questions) {
    doc.text(`Q: ${q.prompt}`, 60, y);
    y += 16;
    const answers = room.answers[q.id] || [];
    for (const a of answers) {
      const participant = room.participants.find((p) => p.id === a.participantId);
      doc.text(
        `- ${participant?.name || a.participantId}: ${a.isCorrect ? 'Correct' : 'Incorrect'} (${a.pointsAwarded} pts)`,
        76,
        y,
      );
      y += 14;
      if (y > 760) {
        doc.addPage();
        y = 40;
      }
    }
    y += 8;
  }

  return doc.output('arraybuffer') as unknown as Uint8Array;
}

