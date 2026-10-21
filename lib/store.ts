import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Language, Subject } from "./questions";

type Progress = Record<string, number>;
type PracticePositions = Record<string, number>;

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export function getInstallationId() {
  if (typeof window === "undefined") return "";
  const key = "driveprep-installation-id";
  let value = window.localStorage.getItem(key);
  if (!value) {
    value = createId();
    window.localStorage.setItem(key, value);
  }
  return value;
}

type StudyState = {
  language: Language;
  mistakes: string[];
  progress: Progress;
  practicePositions: PracticePositions;
  accessToken: string | null;
  unlocked: boolean;
  setLanguage: (language: Language) => void;
  toggleLanguage: () => void;
  recordAnswer: (questionId: string, correct: boolean) => void;
  clearMistakes: () => void;
  savePracticePosition: (subject: Subject, position: number) => void;
  clearPracticePosition: (subject: Subject) => void;
  setAccessToken: (token: string) => void;
  lock: () => void;
  getSubjectProgress: (subject: Subject, ids: string[]) => number;
};

export const useStudyStore = create<StudyState>()(
  persist(
    (set, get) => ({
      language: "ru",
      mistakes: [],
      progress: {},
      practicePositions: {},
      accessToken: null,
      unlocked: false,
      setLanguage: (language) => set({ language }),
      toggleLanguage: () => set((state) => ({ language: state.language === "ru" ? "en" : "ru" })),
      recordAnswer: (questionId, correct) =>
        set((state) => ({
          mistakes: correct ? state.mistakes : Array.from(new Set([...state.mistakes, questionId])),
          progress: { ...state.progress, [questionId]: correct ? 1 : 0 },
        })),
      clearMistakes: () => set({ mistakes: [] }),
      savePracticePosition: (subject, position) =>
        set((state) => ({ practicePositions: { ...state.practicePositions, [subject]: Math.max(0, position) } })),
      clearPracticePosition: (subject) =>
        set((state) => {
          const next = { ...state.practicePositions };
          delete next[subject];
          return { practicePositions: next };
        }),
      setAccessToken: (token) => set({ accessToken: token, unlocked: true }),
      lock: () => set({ accessToken: null, unlocked: false }),
      getSubjectProgress: (_subject, ids) => {
        const progress = get().progress;
        const answered = ids.filter((id) => Object.prototype.hasOwnProperty.call(progress, id)).length;
        return ids.length ? Math.round((answered / ids.length) * 100) : 0;
      },
    }),
    {
      name: "driveprep-study-state",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        language: state.language,
        mistakes: state.mistakes,
        progress: state.progress,
        practicePositions: state.practicePositions,
        accessToken: state.accessToken,
        unlocked: state.unlocked,
      }),
      migrate: (persistedState) => {
        const state = persistedState as Partial<StudyState> & { unlocked?: boolean };
        return { ...state, accessToken: null, unlocked: false } as StudyState;
      },
      version: 2,
    },
  ),
);
