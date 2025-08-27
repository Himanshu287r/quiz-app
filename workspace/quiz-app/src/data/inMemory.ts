import type {
  DataSource,
  DragDropQuestion,
  FillBlankQuestion,
  JoinRoomResult,
  MCQQuestion,
  Question,
  Quiz,
  Room,
  RoomSnapshot,
  SubmittedAnswer,
} from './types';
import { generateId, generateRoomCode } from './types';

type Listener = (snap: RoomSnapshot) => void;

interface InMemoryDb {
  quizzes: Record<string, Quiz>;
  rooms: Record<string, Room>;
  listeners: Record<string, Set<Listener>>; // roomId -> listeners
}

const db: InMemoryDb = {
  quizzes: {},
  rooms: {},
  listeners: {},
};

function notify(roomId: string) {
  const room = db.rooms[roomId];
  if (!room) return;
  const quiz = db.quizzes[room.quizId]!;
  const snap: RoomSnapshot = { room, quiz };
  const listeners = db.listeners[roomId];
  if (listeners) {
    listeners.forEach((cb) => cb(structuredClone(snap)));
  }
}

function normalizeString(value: string): string {
  return value.trim().toLowerCase();
}

function isAnswerCorrect(question: Question, value: unknown): boolean {
  if (question.type === 'mcq') {
    const mcq = question as MCQQuestion;
    return value === mcq.correctIndex;
  }
  if (question.type === 'fill') {
    const fill = question as FillBlankQuestion;
    if (typeof value !== 'string') return false;
    return normalizeString(value) === normalizeString(fill.expectedAnswer);
  }
  if (question.type === 'drag') {
    const drag = question as DragDropQuestion;
    if (!value || typeof value !== 'object') return false;
    const mapping = value as Record<string, string>;
    const expected = drag.correctMapping;
    const keys = Object.keys(expected);
    return keys.every((k) => mapping[k] === expected[k]);
  }
  return false;
}

function calculatePoints(question: Question, isCorrect: boolean, timeTakenSec?: number): number {
  if (!isCorrect) return 0;
  const base = question.points ?? 10;
  if (!question.timeLimitSec || timeTakenSec == null) return base;
  // Simple decay: faster gets more, minimum 50% of base
  const fraction = Math.max(0.5, 1 - Math.max(0, timeTakenSec) / question.timeLimitSec);
  return Math.round(base * fraction);
}

export const inMemoryDataSource: DataSource = {
  async createQuiz(payload) {
    const id = generateId('quiz');
    const quiz: Quiz = {
      id,
      title: payload.title,
      questions: payload.questions,
      createdAt: Date.now(),
    };
    db.quizzes[id] = structuredClone(quiz);
    return quiz;
  },

  async createRoom(quizId: string) {
    const quiz = db.quizzes[quizId];
    if (!quiz) throw new Error('Quiz not found');
    const id = generateId('room');
    const room: Room = {
      id,
      code: generateRoomCode(),
      quizId,
      status: 'lobby',
      currentQuestionIndex: -1,
      participants: [],
      answers: {},
      createdAt: Date.now(),
    };
    db.rooms[id] = structuredClone(room);
    db.listeners[id] = new Set();
    notify(id);
    return room;
  },

  async getRoomByCode(code: string) {
    const room = Object.values(db.rooms).find((r) => r.code === code);
    if (!room) return null;
    const quiz = db.quizzes[room.quizId]!;
    return { room: structuredClone(room), quiz: structuredClone(quiz) };
  },

  async getRoom(roomId: string) {
    const room = db.rooms[roomId];
    if (!room) return null;
    const quiz = db.quizzes[room.quizId]!;
    return { room: structuredClone(room), quiz: structuredClone(quiz) };
  },

  async joinRoom(code: string, name: string): Promise<JoinRoomResult> {
    const snap = await this.getRoomByCode(code);
    if (!snap) throw new Error('Room not found');
    const participantId = generateId('p');
    const participant = {
      id: participantId,
      name,
      score: 0,
      answeredQuestionIds: [],
    };
    const room = db.rooms[snap.room.id]!;
    room.participants.push(participant);
    notify(room.id);
    return { room: structuredClone(room), quiz: structuredClone(snap.quiz), participant };
  },

  async startQuiz(roomId: string) {
    const room = db.rooms[roomId];
    if (!room) throw new Error('Room not found');
    room.status = 'running';
    room.currentQuestionIndex = 0;
    notify(roomId);
  },

  async goToNextQuestion(roomId: string) {
    const room = db.rooms[roomId];
    if (!room) throw new Error('Room not found');
    const quiz = db.quizzes[room.quizId]!;
    if (room.currentQuestionIndex < quiz.questions.length - 1) {
      room.currentQuestionIndex += 1;
    } else {
      room.status = 'finished';
    }
    notify(roomId);
  },

  async finishQuiz(roomId: string) {
    const room = db.rooms[roomId];
    if (!room) throw new Error('Room not found');
    room.status = 'finished';
    notify(roomId);
  },

  async submitAnswer(
    roomId: string,
    participantId: string,
    questionId: string,
    value: unknown,
    timeTakenSec?: number,
  ): Promise<SubmittedAnswer> {
    const room = db.rooms[roomId];
    if (!room) throw new Error('Room not found');
    const quiz = db.quizzes[room.quizId]!;
    const question = quiz.questions.find((q) => q.id === questionId);
    if (!question) throw new Error('Question not found');

    const isCorrect = isAnswerCorrect(question, value);
    const points = calculatePoints(question, isCorrect, timeTakenSec);

    const answer: SubmittedAnswer = {
      questionId,
      participantId,
      value,
      isCorrect,
      timeTakenSec,
      submittedAt: Date.now(),
      pointsAwarded: points,
    };
    room.answers[questionId] = room.answers[questionId] || [];
    room.answers[questionId]!.push(answer);

    const participant = room.participants.find((p) => p.id === participantId);
    if (participant) {
      participant.score += points;
      if (!participant.answeredQuestionIds.includes(questionId)) {
        participant.answeredQuestionIds.push(questionId);
      }
    }
    notify(roomId);
    return structuredClone(answer);
  },

  onRoomUpdate(roomId: string, cb: (snap: RoomSnapshot) => void): () => void {
    if (!db.listeners[roomId]) db.listeners[roomId] = new Set();
    const set = db.listeners[roomId]!;
    set.add(cb);
    // Emit current state immediately if exists
    const room = db.rooms[roomId];
    if (room) {
      const quiz = db.quizzes[room.quizId]!;
      cb(structuredClone({ room, quiz }));
    }
    return () => set.delete(cb);
  },
};

export default inMemoryDataSource;

