"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2, Home, RotateCcw, Trophy, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ExamTimer, ProgressBar } from "@/components/exam-timer";
import { QuestionCard } from "@/components/question-card";
import { copy } from "@/lib/i18n";
import { getExamQuestions, getQuestions, type Question, type Subject } from "@/lib/questions";
import { useStudyStore } from "@/lib/store";

function sameAnswer(selected: number[], correct: number[]) { return selected.length === correct.length && selected.every((index) => correct.includes(index)); }

export function ExamClient({ subject }: { subject: Subject }) {
  const language = useStudyStore((state) => state.language);
  const recordAnswer = useStudyStore((state) => state.recordAnswer);
  const t = copy[language];
  const [questions, setQuestions] = useState<Question[]>(() => getQuestions(subject).slice(0, 100));
  const [position, setPosition] = useState(0);
  const [selected, setSelected] = useState<number[]>([]);
  const [answers, setAnswers] = useState<Record<number, number[]>>({});
  const [deadline] = useState(() => Date.now() + 45 * 60 * 1000);
  const [finished, setFinished] = useState(false);
  const [finalScore, setFinalScore] = useState<number | null>(null);

  useEffect(() => {
    setQuestions(getExamQuestions(subject, 100));
  }, [subject]);

  const finishExam = useCallback(() => setFinished(true), []);
  const question = questions[position];
  const score = questions.reduce((total, item, index) => total + (sameAnswer(answers[index] ?? [], item.correct_indices) ? 1 : 0), 0);

  const choose = (index: number) => {
    if (!question) return;
    setSelected((current) => question.type === "multiple_choice" ? (current.includes(index) ? current.filter((item) => item !== index) : [...current, index].sort()) : [index]);
  };
  const next = () => {
    setAnswers((current) => ({ ...current, [position]: selected }));
    if (position >= questions.length - 1) {
      const completedAnswers = { ...answers, [position]: selected };
      questions.forEach((item, index) => recordAnswer(item.id, sameAnswer(completedAnswers[index] ?? [], item.correct_indices)));
      setFinalScore(questions.reduce((total, item, index) => total + (sameAnswer(completedAnswers[index] ?? [], item.correct_indices) ? 1 : 0), 0));
      setFinished(true);
    } else { setPosition((current) => current + 1); setSelected(answers[position + 1] ?? []); }
  };

  if (finished) {
    const displayScore = finalScore ?? score;
    const passed = displayScore >= Math.ceil(questions.length * 0.9);
    return <div className="mx-auto max-w-[760px] px-5 pb-16 pt-12 sm:px-8"><div className="overflow-hidden rounded-[32px] border border-[var(--line)] bg-white shadow-[0_18px_60px_rgba(19,35,43,0.08)]"><div className={`p-8 text-white sm:p-12 ${passed ? "bg-[#2d6e4b]" : "bg-[var(--ink)]"}`}><div className="flex items-center justify-between"><span className="rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em]">{t.results}</span>{passed ? <Trophy className="text-[var(--gold)]" /> : <XCircle className="text-[#f2aaa0]" />}</div><h1 className="mt-12 text-5xl font-black tracking-[-0.08em] sm:text-7xl">{displayScore}<span className="text-white/45">/{questions.length}</span></h1><p className="mt-4 text-lg font-bold text-white/75">{passed ? t.passed : t.failed}</p></div><div className="grid gap-3 p-6 sm:grid-cols-2 sm:p-8"><div className="rounded-2xl bg-[#f6f7f3] p-5"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--muted)]">{t.score}</p><p className="mt-2 text-2xl font-black">{questions.length ? Math.round((displayScore / questions.length) * 100) : 0}%</p></div><div className="rounded-2xl bg-[#f6f7f3] p-5"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--muted)]">{t.mistakesTitle}</p><p className="mt-2 text-2xl font-black">{questions.length - displayScore}</p></div></div><div className="flex flex-wrap gap-3 px-6 pb-7 sm:px-8"><Link href={`/exam/${subject}`} className="focus-ring inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-5 py-3.5 text-sm font-black text-white"><RotateCcw size={16} /> {t.start}</Link><Link href="/mistakes" className="focus-ring inline-flex items-center gap-2 rounded-full border border-[var(--line)] px-5 py-3.5 text-sm font-black">{t.navMistakes} <ArrowRight size={16} /></Link><Link href="/" className="focus-ring inline-flex items-center gap-2 rounded-full border border-[var(--line)] px-5 py-3.5 text-sm font-black"><Home size={16} /> {t.backHome}</Link></div></div></div>;
  }

  if (!question) return null;
  return <div className="mx-auto max-w-[900px] px-5 pb-14 pt-8 sm:px-8 sm:pt-10"><div className="flex items-center justify-between gap-4"><Link href="/" className="focus-ring inline-flex items-center gap-2 rounded-full text-xs font-black uppercase tracking-[0.14em] text-[var(--muted)] transition-colors hover:text-[var(--accent)]"><ArrowLeft size={15} /> {t.backHome}</Link><div className="flex items-center gap-2"><ExamTimer deadline={deadline} copy={t} onExpire={finishExam} /><span className="hidden rounded-full bg-[var(--ink)] px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white sm:inline">{t.examMode} · 0{subject}</span></div></div><div className="mt-9"><ProgressBar current={position + 1} total={questions.length} label={`${t.question} ${position + 1} / ${questions.length}`} /><QuestionCard question={question} language={language} copy={t} selected={selected} onSelect={choose} /><div className="mt-5 flex items-center justify-between gap-3"><span className="text-xs font-bold text-[var(--muted)]">{selected.length ? `${selected.length} ${language === "ru" ? "выбрано" : "selected"}` : t.noAnswer}</span><button type="button" onClick={next} className="focus-ring inline-flex items-center gap-2 rounded-full bg-[var(--ink)] px-5 py-3.5 text-sm font-black text-white transition-transform hover:-translate-y-0.5">{position === questions.length - 1 ? t.finish : t.next} <ArrowRight size={16} /></button></div></div></div>;
}
