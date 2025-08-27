import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { CreateQuizPayload, JoinRoomResult, RoomSnapshot } from '../data';
import { getDataSource } from '../data';

interface AppState {
  role: 'teacher' | 'student' | null;
  setRole: (role: AppState['role']) => void;

  currentRoom?: RoomSnapshot['room'];
  currentQuiz?: RoomSnapshot['quiz'];
  participantId?: string;
  loading: boolean;
  error?: string;

  createQuizAndRoom: (payload: CreateQuizPayload) => Promise<void>;
  joinRoom: (code: string, name: string) => Promise<void>;
  startQuiz: () => Promise<void>;
  goToNextQuestion: () => Promise<void>;
  finishQuiz: () => Promise<void>;
  submitAnswer: (questionId: string, value: unknown, timeTakenSec?: number) => Promise<void>;

  subscribeRoom: (roomId: string) => void;
}

export const useAppStore = create<AppState>()(
  devtools((set, get) => ({
    role: null,
    setRole: (role) => set({ role }),
    loading: false,

    async createQuizAndRoom(payload) {
      const api = getDataSource();
      set({ loading: true, error: undefined });
      try {
        const quiz = await api.createQuiz(payload);
        const room = await api.createRoom(quiz.id);
        set({ currentQuiz: quiz, currentRoom: room });
        get().subscribeRoom(room.id);
      } catch (e: any) {
        set({ error: String(e?.message ?? e) });
      } finally {
        set({ loading: false });
      }
    },

    async joinRoom(code, name) {
      const api = getDataSource();
      set({ loading: true, error: undefined });
      try {
        const result: JoinRoomResult = await api.joinRoom(code, name);
        set({ currentRoom: result.room, currentQuiz: result.quiz, participantId: result.participant.id });
        get().subscribeRoom(result.room.id);
      } catch (e: any) {
        set({ error: String(e?.message ?? e) });
      } finally {
        set({ loading: false });
      }
    },

    async startQuiz() {
      const api = getDataSource();
      const roomId = get().currentRoom?.id;
      if (!roomId) return;
      await api.startQuiz(roomId);
    },

    async goToNextQuestion() {
      const api = getDataSource();
      const roomId = get().currentRoom?.id;
      if (!roomId) return;
      await api.goToNextQuestion(roomId);
    },

    async finishQuiz() {
      const api = getDataSource();
      const roomId = get().currentRoom?.id;
      if (!roomId) return;
      await api.finishQuiz(roomId);
    },

    async submitAnswer(questionId, value, timeTakenSec) {
      const api = getDataSource();
      const state = get();
      const roomId = state.currentRoom?.id;
      const participantId = state.participantId;
      if (!roomId || !participantId) return;
      await api.submitAnswer(roomId, participantId, questionId, value, timeTakenSec);
    },

    subscribeRoom(roomId: string) {
      const api = getDataSource();
      api.onRoomUpdate(roomId, (snap) => {
        set({ currentRoom: snap.room, currentQuiz: snap.quiz });
      });
    },
  }))
);

export default useAppStore;

