// =====================================================================
// Zustand Store — Global UI ve session state
// =====================================================================

import { create } from 'zustand';
import type {
  Officer,
  Session,
  Message,
  Metrics,
  Phase,
  StrategicPlan,
} from './types';

interface AuthState {
  officer: Officer | null;
  jwt: string | null;
  hydrated: boolean;
  setAuth: (officer: Officer, jwt: string) => void;
  clearAuth: () => void;
  setHydrated: (v: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  officer: null,
  jwt: null,
  hydrated: false,
  setAuth: (officer, jwt) => set({ officer, jwt }),
  clearAuth: () => set({ officer: null, jwt: null }),
  setHydrated: (v) => set({ hydrated: v }),
}));

// ---------------------------------------------------------------------
// Sorgu sayfası state'i — geçici, seans bittiğinde temizlenir
// ---------------------------------------------------------------------

interface InterrogationState {
  session: Session | null;
  messages: Message[];

  // Kayıt akışı
  isRecording: boolean;
  isUploading: boolean;
  isProcessing: boolean;
  pendingAnswerText: string | null;
  pendingAnswerAudioUrl: string | null;

  // Aksiyonlar
  setSession: (s: Session) => void;
  patchSession: (patch: Partial<Session>) => void;
  setMessages: (m: Message[]) => void;
  appendMessage: (m: Message) => void;
  updateMessage: (id: string, patch: Partial<Message>) => void;

  setRecording: (v: boolean) => void;
  setUploading: (v: boolean) => void;
  setProcessing: (v: boolean) => void;
  setPendingAnswer: (text: string | null, audioUrl: string | null) => void;

  reset: () => void;
}

const initialInterrogation = {
  session: null,
  messages: [],
  isRecording: false,
  isUploading: false,
  isProcessing: false,
  pendingAnswerText: null,
  pendingAnswerAudioUrl: null,
};

export const useInterrogationStore = create<InterrogationState>((set, get) => ({
  ...initialInterrogation,

  setSession: (s) => set({ session: s }),
  patchSession: (patch) => {
    const cur = get().session;
    if (!cur) return;
    set({ session: { ...cur, ...patch } });
  },
  setMessages: (messages) => set({ messages }),
  appendMessage: (m) => set({ messages: [...get().messages, m] }),
  updateMessage: (id, patch) =>
    set({
      messages: get().messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    }),

  setRecording: (v) => set({ isRecording: v }),
  setUploading: (v) => set({ isUploading: v }),
  setProcessing: (v) => set({ isProcessing: v }),
  setPendingAnswer: (text, audioUrl) =>
    set({ pendingAnswerText: text, pendingAnswerAudioUrl: audioUrl }),

  reset: () => set(initialInterrogation),
}));

// Yardımcı: o anki metrikleri oku
export function getCurrentMetrics(session: Session | null): Metrics {
  if (!session) {
    return {
      contradiction_score: 0,
      avoidance_score: 0,
      stress_score: 0,
      inconsistency_score: 0,
    };
  }
  return {
    contradiction_score: session.contradiction_score,
    avoidance_score: session.avoidance_score,
    stress_score: session.stress_score,
    inconsistency_score: session.inconsistency_score,
  };
}
