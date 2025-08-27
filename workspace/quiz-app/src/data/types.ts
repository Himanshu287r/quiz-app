export type QuestionType = 'mcq' | 'drag' | 'fill';

export interface BaseQuestion {
  id: string;
  type: QuestionType;
  prompt: string;
  points?: number;
  timeLimitSec?: number;
}

export interface MCQQuestion extends BaseQuestion {
  type: 'mcq';
  options: string[];
  correctIndex: number;
}

export interface DragItem {
  id: string;
  label: string;
}

export interface DragDropQuestion extends BaseQuestion {
  type: 'drag';
  items: DragItem[];
  targets: DragItem[];
  /** mapping itemId -> targetId */
  correctMapping: Record<string, string>;
}

export interface FillBlankQuestion extends BaseQuestion {
  type: 'fill';
  /** Single short text answer for simplicity */
  expectedAnswer: string;
}

export type Question = MCQQuestion | DragDropQuestion | FillBlankQuestion;

export interface Quiz {
  id: string;
  title: string;
  questions: Question[];
  createdAt: number;
}

export interface Participant {
  id: string;
  name: string;
  score: number;
  answeredQuestionIds: string[];
}

export type RoomStatus = 'lobby' | 'running' | 'finished';

export interface Room {
  id: string;
  code: string;
  quizId: string;
  status: RoomStatus;
  currentQuestionIndex: number; // -1 while lobby
  participants: Participant[];
  /** map questionId -> array of answers */
  answers: Record<string, SubmittedAnswer[]>;
  createdAt: number;
}

export interface SubmittedAnswer {
  questionId: string;
  participantId: string;
  value: unknown;
  isCorrect: boolean;
  timeTakenSec?: number;
  submittedAt: number;
  pointsAwarded: number;
}

export interface RoomSnapshot {
  room: Room;
  quiz: Quiz;
}

export interface CreateQuizPayload {
  title: string;
  questions: Question[];
}

export interface JoinRoomResult {
  room: Room;
  participant: Participant;
  quiz: Quiz;
}

export interface DataSource {
  createQuiz(payload: CreateQuizPayload): Promise<Quiz>;
  createRoom(quizId: string): Promise<Room>;
  getRoomByCode(code: string): Promise<RoomSnapshot | null>;
  getRoom(roomId: string): Promise<RoomSnapshot | null>;
  joinRoom(code: string, name: string): Promise<JoinRoomResult>;
  startQuiz(roomId: string): Promise<void>;
  goToNextQuestion(roomId: string): Promise<void>;
  finishQuiz(roomId: string): Promise<void>;
  submitAnswer(
    roomId: string,
    participantId: string,
    questionId: string,
    value: unknown,
    timeTakenSec?: number,
  ): Promise<SubmittedAnswer>;
  onRoomUpdate(roomId: string, cb: (snap: RoomSnapshot) => void): () => void;
}

export function generateId(prefix: string = 'id'): string {
  const random = Math.random().toString(36).slice(2, 10);
  const now = Date.now().toString(36);
  return `${prefix}_${now}_${random}`;
}

export function generateRoomCode(): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += letters[Math.floor(Math.random() * letters.length)];
  return code;
}
