import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Language, Subject } from "./questions";

type Progress = Record<string, number>;
type PracticePositions = Record<string, number>;

export type ExamAttemptAnswer = {
  questionId: string;
  selectedIndices: number[];
  correct: boolean;
};

export type ExamAttempt = {
  id: string;
  subject: Subject;
  completedAt: number;
  score: number;
  total: number;
  answers: ExamAttemptAnswer[];
};

type StudyState = {
  language: Language;
  mistakes: string[];
  progress: Progress;
  practicePositions: PracticePositions;
  examHistory: ExamAttempt[];
  setLanguage: (language: Language) => void;
  toggleLanguage: () => void;
  recordAnswer: (questionId: string, correct: boolean) => void;
  clearMistakes: () => void;
  savePracticePosition: (subject: Subject, position: number) => void;
  clearPracticePosition: (subject: Subject) => void;
  saveExamAttempt: (attempt: ExamAttempt) => void;
  getSubjectProgress: (subject: Subject, ids: string[]) => number;
};

export const useStudyStore = create<StudyState>()(
  persist(
    (set, get) => ({
      language: "ru",
      mistakes: [],
      progress: {},
      practicePositions: {},
      examHistory: [],
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
      saveExamAttempt: (attempt) =>
        set((state) => ({
          examHistory: [attempt, ...state.examHistory.filter((saved) => saved.id !== attempt.id)].slice(0, 50),
        })),
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
        examHistory: state.examHistory,
      }),
    },
  ),
);
