"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2, Home, LoaderCircle, RotateCcw, Trophy, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ExamTimer, ProgressBar } from "@/components/exam-timer";
import { QuestionCard } from "@/components/question-card";
import { getQuestionSet } from "@/lib/api";
import { copy } from "@/lib/i18n";
import { getExamQuestions, type Question, type Subject } from "@/lib/questions";
import { useStudyStore } from "@/lib/store";

function sameAnswer(selected: number[], correct: number[]) { return selected.length === correct.length && selected.every((index) => correct.includes(index)); }

export function ExamClient({ subject }: { subject: Subject }) {
  const language = useStudyStore((state) => state.language);
  const recordAnswer = useStudyStore((state) => state.recordAnswer);
  const unlocked = useStudyStore((state) => state.unlocked);
  const lock = useStudyStore((state) => state.lock);
  const t = copy[language];
  const [questions, setQuestions] = useState<Question[]>([]);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [resetAt, setResetAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [position, setPosition] = useState(0);
  const [selected, setSelected] = useState<number[]>([]);
  const [answers, setAnswers] = useState<Record<number, number[]>>({});
  const [deadline, setDeadline] = useState<number | null>(null);
  const [finished, setFinished] = useState(false);
  const [finalScore, setFinalScore] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    getQuestionSet(subject).then((result) => {
      if (!active) return;
      const selectedQuestions = getExamQuestions(result.questions, result.premium ? 100 : 50);
      setQuestions(selectedQuestions);
      setRemaining(result.remaining);
      setResetAt(result.resetAt);
      setDeadline(Date.now() + 45 * 60 * 1000);
    }).catch((caught: unknown) => {
      if (!active) return;
      if (caught && typeof caught === "object" && "status" in caught && caught.status === 401) lock();
      setError(t.apiUnavailable);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [subject, unlocked, lock, t.apiUnavailable]);

  const finishExam = useCallback(() => setFinished(true), []);
  const question = questions[position];
  const score = questions.reduce((total, item, index) => total + (sameAnswer(answers[index] ?? [], item.correct_indices) ? 1 : 0), 0);
  const resetTime = resetAt ? new Intl.DateTimeFormat(language === "ru" ? "ru-RU" : "en-US", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Shanghai" }).format(new Date(resetAt)) : null;

  const choose = (index: number) => {
    if (!question) return;
    setSelected((current) => question.type === "multiple_choice" ? (current.includes(index) ? current.filter((item) => item !== index) : [...current, index].sort()) : [index]);
  };
  const next = () => {
    if (!question) return;
    setAnswers((current) => ({ ...current, [position]: selected }));
    if (position >= questions.length - 1) {
      const completedAnswers = { ...answers, [position]: selected };
      questions.forEach((item, index) => recordAnswer(item.id, sameAnswer(completedAnswers[index] ?? [], item.correct_indices)));
      setFinalScore(questions.reduce((total, item, index) => total + (sameAnswer(completedAnswers[index] ?? [], item.correct_indices) ? 1 : 0), 0));
      setFinished(true);
    } else { setPosition((current) => current + 1); setSelected(answers[position + 1] ?? []); }
  };

  if (loading) return <div className="mx-auto flex min-h-[55vh] max-w-[760px] items-center justify-center px-5"><div className="flex items-center gap-3 text-sm font-bold text-[var(--muted)]"><LoaderCircle className="animate-spin" size={18} />{language === "ru" ? "Загружаем вопросы…" : "Loading questions…"}</div></div>;
  if (error) return <div className="mx-auto max-w-[760px] px-5 pb-16 pt-14 sm:px-8"><div role="alert" className="rounded-[30px] border border-[#efc0b5] bg-white p-8 text-center"><h1 className="text-2xl font-black">{t.apiUnavailable}</h1><p className="mt-3 text-sm font-semibold text-[var(--muted)]">{error}</p><Link href="/" className="focus-ring mt-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--ink)] px-5 py-3 text-sm font-black text-white"><Home size={16} />{t.backHome}</Link></div></div>;

  if (!questions.length) return <div className="mx-auto max-w-[760px] px-5 pb-16 pt-14 sm:px-8"><div className="rounded-[30px] border border-[var(--line)] bg-white p-8 text-center"><h1 className="text-2xl font-black">{t.dailyLimitTitle}</h1><p className="mt-3 text-sm font-semibold text-[var(--muted)]">{t.dailyLimitText}{resetTime ? ` ${t.dailyResetLabel} ${resetTime} (Asia/Shanghai).` : ""}</p><div className="mt-6 flex flex-wrap justify-center gap-3"><Link href={`/practice/${subject}`} className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--accent)] px-5 py-3.5 text-sm font-black text-white">{t.practice}<ArrowRight size={16} /></Link>{!unlocked ? <Link href="/" className="focus-ring inline-flex min-h-11 items-center rounded-full border border-[var(--line)] px-5 py-3.5 text-sm font-black">{t.unlock}</Link> : null}</div></div></div>;

  if (finished) {
    const displayScore = finalScore ?? score;
    const passed = displayScore >= Math.ceil(questions.length * 0.9);
    return <div className="mx-auto max-w-[760px] px-5 pb-[calc(4rem+env(safe-area-inset-bottom))] pt-12 sm:px-8"><div className="overflow-hidden rounded-[32px] border border-[var(--line)] bg-white shadow-[0_18px_60px_rgba(19,35,43,0.08)]"><div className={`p-8 text-white sm:p-12 ${passed ? "bg-[#2d6e4b]" : "bg-[var(--ink)]"}`}><div className="flex items-center justify-between"><span className="rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em]">{t.results}</span>{passed ? <Trophy className="text-[var(--gold)]" /> : <XCircle className="text-[#f2aaa0]" />}</div><h1 className="mt-12 text-5xl font-black tracking-[-0.08em] sm:text-7xl">{displayScore}<span className="text-white/45">/{questions.length}</span></h1><p className="mt-4 text-lg font-bold text-white/75">{passed ? t.passed : t.failed}</p></div><div className="grid gap-3 p-6 sm:grid-cols-2 sm:p-8"><div className="rounded-2xl bg-[#f6f7f3] p-5"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--muted)]">{t.score}</p><p className="mt-2 text-2xl font-black">{questions.length ? Math.round((displayScore / questions.length) * 100) : 0}%</p></div><div className="rounded-2xl bg-[#f6f7f3] p-5"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--muted)]">{t.mistakesTitle}</p><p className="mt-2 text-2xl font-black">{questions.length - displayScore}</p></div></div><div className="flex flex-wrap gap-3 px-6 pb-7 sm:px-8"><Link href={`/exam/${subject}`} className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--accent)] px-5 py-3.5 text-sm font-black text-white"><RotateCcw size={16} /> {t.start}</Link><Link href="/mistakes" className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--line)] px-5 py-3.5 text-sm font-black">{t.navMistakes} <ArrowRight size={16} /></Link><Link href="/" className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--line)] px-5 py-3.5 text-sm font-black"><Home size={16} /> {t.backHome}</Link></div></div></div>;
  }

  if (!question || !deadline) return null;
  return <div className="mx-auto max-w-[900px] px-5 pb-[calc(3rem+env(safe-area-inset-bottom))] pt-8 sm:px-8 sm:pt-10"><div className="flex flex-wrap items-center justify-between gap-3"><Link href="/" className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-full text-xs font-black uppercase tracking-[0.14em] text-[var(--muted)] transition-colors hover:text-[var(--accent)]"><ArrowLeft size={15} /> {t.backHome}</Link><div className="flex flex-wrap items-center gap-2"><ExamTimer deadline={deadline} copy={t} onExpire={finishExam} /><span className="rounded-full bg-[var(--ink)] px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white">{unlocked ? t.fullExam : t.freeExam} · 0{subject}</span></div></div><div className="mt-7 rounded-2xl bg-white/75 px-4 py-3 text-xs font-bold text-[var(--muted)]">{unlocked ? t.unlocked : `${t.dailyPack}: ${questions.length}`} {!unlocked && resetTime ? ` · ${t.dailyResetLabel} ${resetTime} (Asia/Shanghai)` : ""}</div><div className="mt-5"><ProgressBar current={position + 1} total={questions.length} label={`${t.question} ${position + 1} / ${questions.length}`} /><QuestionCard question={question} language={language} copy={t} selected={selected} onSelect={choose} /><div className="mt-5 flex flex-wrap items-center justify-between gap-3"><span className="text-xs font-bold text-[var(--muted)]">{selected.length ? `${selected.length} ${language === "ru" ? "выбрано" : "selected"}` : t.noAnswer}</span><button type="button" onClick={next} className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--ink)] px-5 py-3.5 text-sm font-black text-white transition-transform hover:-translate-y-0.5">{position === questions.length - 1 ? t.finish : t.next} <ArrowRight size={16} /></button></div></div></div>;
}
