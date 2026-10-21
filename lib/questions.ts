export type Language = "ru" | "en";
export type Subject = 1 | 4;
export type QuestionType = "true_false" | "single_choice" | "multiple_choice";

export type Question = {
  id: string;
  subject: Subject;
  type: QuestionType;
  question_ru: string;
  question_en: string;
  options_ru: string[];
  options_en: string[];
  correct_index: number | null;
  correct_indices: number[];
  explanation_ru: string | null;
  explanation_en: string | null;
  image_url: string | null;
};

export function getExamQuestions(questions: Question[], count = 100) {
  const pool = [...questions];
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
  }
  return pool.slice(0, Math.min(count, pool.length));
}
