"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, ChevronDown, ChevronUp, History, Trophy, XCircle } from "lucide-react";
import { useState } from "react";
import { QuestionCard } from "@/components/question-card";
import { copy } from "@/lib/i18n";
import { getQuestion } from "@/lib/questions";
import { useStudyStore } from "@/lib/store";

export function ExamHistoryClient() {
  const language = useStudyStore((state) => state.language);
  const attempts = useStudyStore((state) => state.examHistory);
  const [expandedAttempt, setExpandedAttempt] = useState<string | null>(null);
  const t = copy[language];
  const locale = language === "ru" ? "ru-RU" : "en-US";

  return (
    <div className="mx-auto max-w-[960px] px-5 pb-14 pt-8 sm:px-8 sm:pt-12">
      <Link href="/" className="focus-ring inline-flex items-center gap-2 rounded-full text-xs font-black uppercase tracking-[0.14em] text-[var(--muted)] transition-colors hover:text-[var(--accent)]">
        <ArrowLeft size={15} /> {t.backHome}
      </Link>
      <div className="mt-8 flex items-end justify-between gap-5">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--accent)]">{t.attemptLabel}</p>
          <h1 className="mt-3 text-4xl font-black leading-[0.95] tracking-[-0.075em] sm:text-6xl">{t.examHistory}</h1>
          <p className="mt-4 max-w-xl text-sm font-semibold leading-relaxed text-[var(--muted)] sm:text-base">{t.examHistoryDescription}</p>
        </div>
        <History size={28} className="mb-1 hidden shrink-0 text-[var(--accent)] sm:block" />
      </div>

      {attempts.length ? (
        <div className="mt-8 grid gap-4">
          {attempts.map((attempt, index) => {
            const wrongAnswers = attempt.answers.filter((answer) => !answer.correct);
            const expanded = expandedAttempt === attempt.id;
            const passed = attempt.score >= Math.ceil(attempt.total * 0.9);
            const completedAt = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(attempt.completedAt));

            return (
              <article key={attempt.id} className="overflow-hidden rounded-[26px] border border-[var(--line)] bg-white shadow-[0_12px_36px_rgba(19,35,43,0.05)]">
                <div className="grid gap-5 p-5 sm:grid-cols-[1fr_auto] sm:items-center sm:p-6">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-[var(--soft-accent)] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-[var(--accent-dark)]">{attempt.subject === 1 ? t.subject1 : t.subject4}</span>
                      <span className="text-xs font-bold text-[var(--muted)]">{t.attemptLabel} {attempts.length - index} · {completedAt}</span>
                    </div>
                    <div className="mt-4 flex items-center gap-3">
                      {passed ? <Trophy size={20} className="shrink-0 text-[#3a8960]" /> : <XCircle size={20} className="shrink-0 text-[var(--accent)]" />}
                      <p className="text-2xl font-black tracking-[-0.05em]">{attempt.score}<span className="text-[var(--muted)]"> / {attempt.total}</span></p>
                      <span className="rounded-full bg-[#f6f7f3] px-3 py-1.5 text-xs font-black">{attempt.total ? Math.round(attempt.score / attempt.total * 100) : 0}%</span>
                      <span className={`text-xs font-black ${passed ? "text-[#2d6e4b]" : "text-[var(--accent)]"}`}>{passed ? t.passed : t.failed}</span>
                    </div>
                    <p className="mt-2 text-xs font-bold text-[var(--muted)]">{t.wrongQuestions}: {wrongAnswers.length}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setExpandedAttempt(expanded ? null : attempt.id)}
                    className="focus-ring inline-flex items-center justify-center gap-2 rounded-full border border-[var(--line)] px-4 py-3 text-xs font-black transition-colors hover:bg-[#f6f7f3]"
                    aria-expanded={expanded}
                  >
                    {expanded ? t.hideAnswers : t.reviewAnswers}
                    {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  </button>
                </div>

                {expanded ? (
                  <div className="border-t border-[var(--line)] bg-[#fbfcfa] p-4 sm:p-6">
                    {wrongAnswers.length ? (
                      <div className="grid gap-5">
                        {wrongAnswers.map((answer) => {
                          const question = getQuestion(answer.questionId);
                          if (!question) return null;
                          const options = language === "ru" ? question.options_ru : question.options_en;
                          const selected = answer.selectedIndices.map((optionIndex) => options[optionIndex]).filter(Boolean);
                          const correct = question.correct_indices.map((optionIndex) => options[optionIndex]).filter(Boolean);

                          return (
                            <section key={answer.questionId} className="rounded-2xl border border-[var(--line)] bg-white p-4 sm:p-5">
                              <QuestionCard
                                question={question}
                                language={language}
                                copy={t}
                                selected={answer.selectedIndices}
                                submitted
                                showFeedback
                                onSelect={() => undefined}
                              />
                              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                <div className="rounded-xl bg-[#fff5f2] p-3">
                                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--muted)]">{t.yourAnswer}</p>
                                  <p className="mt-1 text-sm font-bold">{selected.length ? selected.join(" · ") : t.unanswered}</p>
                                </div>
                                <div className="rounded-xl bg-[#f0f8f2] p-3">
                                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--muted)]">{t.correctAnswer}</p>
                                  <p className="mt-1 text-sm font-bold">{correct.join(" · ") || t.unanswered}</p>
                                </div>
                              </div>
                            </section>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-[var(--line)] p-6 text-center text-sm font-bold text-[var(--muted)]">{t.mistakesEmpty}</div>
                    )}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="mt-8 rounded-[26px] border border-dashed border-[var(--line)] bg-white p-8 text-center sm:p-12">
          <History size={28} className="mx-auto text-[var(--muted)]" />
          <p className="mt-4 text-lg font-black">{t.examHistoryEmpty}</p>
          <Link href="/exam/1" className="focus-ring mt-6 inline-flex items-center gap-2 rounded-full bg-[var(--ink)] px-5 py-3.5 text-sm font-black text-white">
            {t.start} <ArrowRight size={16} />
          </Link>
        </div>
      )}
    </div>
  );
}
