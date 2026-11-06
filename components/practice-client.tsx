"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, ChevronLeft, Home, RotateCcw } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { QuestionCard } from "@/components/question-card";
import { ProgressBar } from "@/components/exam-timer";
import { copy } from "@/lib/i18n";
import { getQuestion, getQuestions, questionBank, type Question, type Subject } from "@/lib/questions";
import { useStudyStore } from "@/lib/store";

function sameAnswer(selected: number[], correct: number[]) {
  return selected.length === correct.length && selected.every((index) => correct.includes(index));
}

export function PracticeClient({ subject }: { subject: Subject }) {
  const language = useStudyStore((state) => state.language);
  const recordAnswer = useStudyStore((state) => state.recordAnswer);
  const progress = useStudyStore((state) => state.progress);
  const savePracticePosition = useStudyStore((state) => state.savePracticePosition);
  const clearPracticePosition = useStudyStore((state) => state.clearPracticePosition);
  const savePracticeDraft = useStudyStore((state) => state.savePracticeDraft);
  const saveMistakePracticePosition = useStudyStore((state) => state.saveMistakePracticePosition);
  const clearMistakePracticePosition = useStudyStore((state) => state.clearMistakePracticePosition);
  const t = copy[language];
  const [questions, setQuestions] = useState<Question[]>(() => getQuestions(subject));
  const [position, setPosition] = useState(0);
  const [jumpNumber, setJumpNumber] = useState("1");
  const [selected, setSelected] = useState<number[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [mistakesOnly, setMistakesOnly] = useState(false);
  const subjectQuestions = getQuestions(subject);
  const trackedQuestions = mistakesOnly ? questionBank : subjectQuestions;
  const completedQuestionCount = trackedQuestions.filter((item) => Object.prototype.hasOwnProperty.call(progress, item.id)).length;

  useEffect(() => {
    const search = typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);
    const requestedId = search.get("question");
    const reviewMistakesOnly = search.get("mistakes") === "true";
    const allQuestions = getQuestions(subject);
    const { mistakes: currentMistakes, practicePositions, mistakePracticePosition } = useStudyStore.getState();
    const selectedQuestions: Question[] = reviewMistakesOnly
      ? currentMistakes.map(getQuestion).filter((question): question is Question => Boolean(question))
      : allQuestions;
    const requestedIndex = requestedId
      ? selectedQuestions.findIndex((question) => question.id === requestedId)
      : -1;

    const initialPosition =
      requestedIndex >= 0
        ? requestedIndex
        : reviewMistakesOnly
          ? Math.min(mistakePracticePosition, Math.max(selectedQuestions.length - 1, 0))
          : Math.min(practicePositions[String(subject)] ?? 0, Math.max(selectedQuestions.length - 1, 0));

    setQuestions(selectedQuestions);
    setMistakesOnly(reviewMistakesOnly);
    setPosition(initialPosition);
    setJumpNumber(String(initialPosition + 1));
    setSelected([]);
    setSubmitted(false);
    setFinished(false);
  }, [subject]);

  useEffect(() => {
    setJumpNumber(String(position + 1));
  }, [position]);

  const question = questions[position];
  const jumpPosition = Number(jumpNumber) - 1;
  const canJumpToQuestion = jumpNumber !== "" && Number.isInteger(jumpPosition) && jumpPosition >= 0 && jumpPosition < questions.length;

  useEffect(() => {
    if (!question) return;
    const { answerHistory, practiceDrafts } = useStudyStore.getState();
    const hasDraft = Object.prototype.hasOwnProperty.call(practiceDrafts, question.id);
    const savedAnswer = answerHistory[question.id];
    const restoredSelection = hasDraft
      ? practiceDrafts[question.id] ?? []
      : savedAnswer?.source === "practice"
        ? savedAnswer.selectedIndices
        : [];
    setSelected([...restoredSelection]);
    setSubmitted(false);
  }, [question?.id]);

  const quickNavigationStart = Math.max(0, Math.min(position - 2, questions.length - 5));
  const quickQuestionNumbers = Array.from(
    { length: Math.min(5, questions.length) },
    (_, index) => quickNavigationStart + index + 1,
  );

  if (finished || !question) {
    return (
      <div className="mx-auto max-w-[760px] px-5 pb-[calc(4rem+env(safe-area-inset-bottom))] pt-14 sm:px-8">
        <div className="rounded-[30px] border border-[var(--line)] bg-white p-8 text-center shadow-[0_18px_60px_rgba(19,35,43,0.07)] sm:p-12">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-[var(--mint)] text-3xl">✓</div>
          <h1 className="mt-7 text-4xl font-black tracking-[-0.07em]">{t.practiceComplete}</h1>
          <p className="mx-auto mt-4 max-w-md text-sm font-semibold leading-relaxed text-[var(--muted)]">
            {t.practiceCompleteText}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/mistakes"
              className="focus-ring inline-flex items-center gap-2 rounded-full bg-[var(--ink)] px-5 py-3.5 text-sm font-black text-white"
            >
              {t.navMistakes} <ArrowRight size={16} />
            </Link>
            <Link
              href="/"
              className="focus-ring inline-flex items-center gap-2 rounded-full border border-[var(--line)] px-5 py-3.5 text-sm font-black"
            >
              <Home size={16} /> {t.backHome}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const savePosition = (nextPosition: number) => {
    if (mistakesOnly) saveMistakePracticePosition(nextPosition);
    else savePracticePosition(subject, nextPosition);
  };

  const jumpToPosition = (nextPosition: number) => {
    if (!Number.isInteger(nextPosition) || nextPosition < 0 || nextPosition >= questions.length || nextPosition === position) return;
    setPosition(nextPosition);
    setJumpNumber(String(nextPosition + 1));
    savePosition(nextPosition);
    setSelected([]);
    setSubmitted(false);
  };

  const goNext = () => {
    if (position >= questions.length - 1) {
      if (mistakesOnly) clearMistakePracticePosition();
      else clearPracticePosition(subject);
      setFinished(true);
    } else {
      jumpToPosition(position + 1);
    }
  };

  const goPrevious = () => {
    jumpToPosition(Math.max(0, position - 1));
  };

  const jumpToQuestion = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const requestedNumber = Number(new FormData(event.currentTarget).get("questionNumber"));
    const requestedPosition = requestedNumber - 1;
    if (Number.isInteger(requestedNumber) && requestedPosition >= 0 && requestedPosition < questions.length) {
      jumpToPosition(requestedPosition);
    }
  };

  const restartPractice = () => {
    if (mistakesOnly) clearMistakePracticePosition();
    else clearPracticePosition(subject);
    setPosition(0);
    setJumpNumber("1");
    setSelected([]);
    setSubmitted(false);
    setFinished(false);
  };

  const select = (index: number) => {
    if (submitted) return;

    if (question.type === "multiple_choice") {
      const nextSelected = selected.includes(index)
        ? selected.filter((item) => item !== index)
        : [...selected, index].sort();
      setSelected(nextSelected);
      savePracticeDraft(question.id, nextSelected);
      savePosition(position);
    } else {
      const answer = [index];
      setSelected(answer);
      setSubmitted(true);
      recordAnswer(question.id, sameAnswer(answer, question.correct_indices), answer, "practice");
      savePosition(position);
    }
  };

  const submitMultiple = () => {
    setSubmitted(true);
    recordAnswer(question.id, sameAnswer(selected, question.correct_indices), selected, "practice");
    savePosition(position);
  };

  return (
    <div className="mx-auto max-w-[900px] overflow-x-hidden px-5 pb-[calc(4rem+env(safe-area-inset-bottom))] pt-8 sm:px-8 sm:pt-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/"
          className="focus-ring inline-flex items-center gap-2 rounded-full text-xs font-black uppercase tracking-[0.14em] text-[var(--muted)] transition-colors hover:text-[var(--accent)]"
        >
          <ArrowLeft size={15} /> {t.backHome}
        </Link>
        <span className="rounded-full bg-[var(--soft-accent)] px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-[var(--accent-dark)]">
          {t.practiceMode} · 0{question.subject}
        </span>
      </div>
      <div className="mt-6 sm:mt-9">
        <ProgressBar
          current={position + 1}
          total={questions.length}
          label={`${t.question} ${position + 1} / ${questions.length}`}
        />
        <QuestionCard
          question={question}
          language={language}
          copy={t}
          selected={selected}
          submitted={submitted}
          showFeedback={submitted}
          onSelect={select}
          onSubmitMulti={submitMultiple}
        />
        <div className="mt-5 flex flex-wrap justify-between gap-3">
            <button
              type="button"
              onClick={goPrevious}
              disabled={position === 0}
              className="focus-ring inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-white px-5 py-3.5 text-sm font-black transition-colors hover:bg-[#f3f5f1] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft size={16} /> {t.previous}
            </button>
            {submitted ? (
              <button
                type="button"
                onClick={goNext}
                className="focus-ring inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-5 py-3.5 text-sm font-black text-white transition-transform hover:-translate-y-0.5"
              >
                {position === questions.length - 1 ? t.finish : t.next} <ArrowRight size={16} />
              </button>
            ) : null}
        </div>
        <div className="mt-5 rounded-2xl border border-[var(--line)] bg-white p-4 shadow-[0_8px_24px_rgba(19,35,43,0.04)] sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={restartPractice}
              className="focus-ring inline-flex items-center gap-2 rounded-full border border-[var(--line)] px-4 py-3 text-sm font-black transition-colors hover:bg-[var(--soft-accent)]"
            >
              <RotateCcw size={16} /> {t.firstQuestion}
            </button>
            <form onSubmit={jumpToQuestion} className="flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-[#fbfcfa] p-2">
              <label htmlFor="practice-question-number" className="hidden pl-2 text-xs font-black uppercase tracking-[0.1em] text-[var(--muted)] sm:inline">{t.jumpQuestion}</label>
              <input
                id="practice-question-number"
                name="questionNumber"
                type="number"
                min={1}
                max={questions.length}
                value={jumpNumber}
                onChange={(event) => setJumpNumber(event.target.value)}
                aria-label={t.jumpQuestion}
                className="focus-ring h-12 w-24 rounded-xl border border-[var(--line)] bg-white px-3 text-center text-xl font-black text-[var(--ink)] sm:w-28 sm:text-2xl"
              />
              <span className="text-sm font-bold text-[var(--muted)]">/ {questions.length}</span>
              <button
                type="submit"
                disabled={!canJumpToQuestion}
                className="focus-ring rounded-xl bg-[var(--ink)] px-4 py-3 text-sm font-black text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t.jumpButton}
              </button>
            </form>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 border-t border-[var(--line)] pt-4" aria-label={t.jumpQuestion}>
            {quickQuestionNumbers.map((number) => (
              <button
                key={number}
                type="button"
                data-question-number={number}
                aria-label={`${t.question} ${number}`}
                aria-current={number === position + 1 ? "page" : undefined}
                onClick={() => jumpToPosition(number - 1)}
                className={`focus-ring grid h-10 min-w-10 place-items-center rounded-xl border px-2 text-sm font-black transition-colors ${number === position + 1 ? "border-[var(--ink)] bg-[var(--ink)] text-white" : "border-[var(--line)] bg-[#fbfcfa] hover:border-[var(--accent)] hover:bg-[var(--soft-accent)]"}`}
              >
                {number}
              </button>
            ))}
          </div>
          <div className="mt-4 flex justify-end border-t border-[var(--line)] pt-3">
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-black uppercase tracking-[0.1em] text-[var(--muted)]">{t.completedQuestionProgress}</span>
              <span className="text-sm font-black">{completedQuestionCount}<span className="ml-1 text-xs font-bold text-[var(--muted)]">/ {trackedQuestions.length}</span></span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
