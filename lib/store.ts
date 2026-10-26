import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Language, Subject } from "./questions";

type Progress = Record<string, number>;
type PracticePositions = Record<string, number>;

type StudyState = {
  language: Language;
  mistakes: string[];
  progress: Progress;
  practicePositions: PracticePositions;
  setLanguage: (language: Language) => void;
  toggleLanguage: () => void;
  recordAnswer: (questionId: string, correct: boolean) => void;
  clearMistakes: () => void;
  savePracticePosition: (subject: Subject, position: number) => void;
  clearPracticePosition: (subject: Subject) => void;
  getSubjectProgress: (subject: Subject, ids: string[]) => number;
};

export const useStudyStore = create<StudyState>()(
  persist(
    (set, get) => ({
      language: "ru",
      mistakes: [],
      progress: {},
      practicePositions: {},
      setLanguage: (language) => set({ language }),
      toggleLanguage: () => set((state) => ({ language: state.language === "ru" ? "en" : "ru" })),
      recordAnswer: (questionId, correct) =>
        set((state) => ({
          mistakes: correct ? state.mistakes.filter((id) => id !== questionId) : Array.from(new Set([...state.mistakes, questionId])),
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
      }),
    },
  ),
);
