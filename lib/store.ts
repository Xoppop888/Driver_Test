import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Language, Subject } from "./questions";

type Progress = Record<string, number>;
type PracticePositions = Record<string, number>;
type AnswerSource = "practice" | "exam";
type AnswerHistory = Record<string, {
  questionId: string;
  selectedIndices: number[];
  correct: boolean;
  answeredAt: number;
  source: AnswerSource;
}>;
type PracticeDrafts = Record<string, number[]>;

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
  answerHistory: AnswerHistory;
  practiceDrafts: PracticeDrafts;
  practicePositions: PracticePositions;
  mistakePracticePosition: number;
  examHistory: ExamAttempt[];
  setLanguage: (language: Language) => void;
  toggleLanguage: () => void;
  recordAnswer: (questionId: string, correct: boolean, selectedIndices?: number[], source?: AnswerSource) => void;
  savePracticeDraft: (questionId: string, selectedIndices: number[]) => void;
  clearMistakes: () => void;
  savePracticePosition: (subject: Subject, position: number) => void;
  clearPracticePosition: (subject: Subject) => void;
  saveMistakePracticePosition: (position: number) => void;
  clearMistakePracticePosition: () => void;
  saveExamAttempt: (attempt: ExamAttempt) => void;
  getSubjectProgress: (subject: Subject, ids: string[]) => number;
};

export const useStudyStore = create<StudyState>()(
  persist(
    (set, get) => ({
      language: "ru",
      mistakes: [],
      progress: {},
      answerHistory: {},
      practiceDrafts: {},
      practicePositions: {},
      mistakePracticePosition: 0,
      examHistory: [],
      setLanguage: (language) => set({ language }),
      toggleLanguage: () => set((state) => ({ language: state.language === "ru" ? "en" : "ru" })),
      recordAnswer: (questionId, correct, selectedIndices = [], source = "practice") =>
        set((state) => {
          const nextDrafts = { ...state.practiceDrafts };
          delete nextDrafts[questionId];
          return {
            mistakes: correct ? state.mistakes.filter((id) => id !== questionId) : Array.from(new Set([...state.mistakes, questionId])),
            progress: { ...state.progress, [questionId]: correct ? 1 : 0 },
            answerHistory: {
              ...state.answerHistory,
              [questionId]: { questionId, selectedIndices: [...selectedIndices], correct, answeredAt: Date.now(), source },
            },
            practiceDrafts: nextDrafts,
          };
        }),
      savePracticeDraft: (questionId, selectedIndices) =>
        set((state) => ({
          practiceDrafts: { ...state.practiceDrafts, [questionId]: [...selectedIndices] },
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
      saveMistakePracticePosition: (position) => set({ mistakePracticePosition: Math.max(0, position) }),
      clearMistakePracticePosition: () => set({ mistakePracticePosition: 0 }),
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
        answerHistory: state.answerHistory,
        practiceDrafts: state.practiceDrafts,
        practicePositions: state.practicePositions,
        mistakePracticePosition: state.mistakePracticePosition,
        examHistory: state.examHistory,
      }),
    },
  ),
);
