"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, Home, RotateCcw } from "lucide-react";
import { QuestionCard } from "@/components/question-card";
import { ProgressBar } from "@/components/exam-timer";
import { copy } from "@/lib/i18n";
import { getQuestions, type Question, type Subject } from "@/lib/questions";
import { useStudyStore } from "@/lib/store";
import { useState } from "react";

function sameAnswer(selected: number[], correct: number[]) {
  return selected.length === correct.length && selected.every((index) => correct.includes(index));
}

export function PracticeClient({ subject }: { subject: Subject }) {
  const language = useStudyStore((state) => state.language);
  const recordAnswer = useStudyStore((state) => state.recordAnswer);
  const t = copy[language];
  const questions = getQuestions(subject);
  const [position, setPosition] = useState(0);
  const [selected, setSelected] = useState<number[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [finished, setFinished] = useState(false);
  const question = questions[position];

  if (finished || !question) {
    return <div className="mx-auto max-w-[760px] px-5 pb-16 pt-14 sm:px-8"><div className="rounded-[30px] border border-[var(--line)] bg-white p-8 text-center shadow-[0_18px_60px_rgba(19,35,43,0.07)] sm:p-12"><div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-[var(--mint)] text-3xl">✓</div><h1 className="mt-7 text-4xl font-black tracking-[-0.07em]">{language === "ru" ? "Практика завершена" : "Practice complete"}</h1><p className="mx-auto mt-4 max-w-md text-sm font-semibold leading-relaxed text-[var(--muted)]">{language === "ru" ? "Хорошая работа. Ошибки сохранены в отдельном разделе для повторения." : "Good work. Your mistakes are saved in a separate section for review."}</p><div className="mt-8 flex flex-wrap justify-center gap-3"><Link href="/mistakes" className="focus-ring inline-flex items-center gap-2 rounded-full bg-[var(--ink)] px-5 py-3.5 text-sm font-black text-white">{t.navMistakes} <ArrowRight size={16} /></Link><Link href="/" className="focus-ring inline-flex items-center gap-2 rounded-full border border-[var(--line)] px-5 py-3.5 text-sm font-black"><Home size={16} /> {t.backHome}</Link></div></div></div>;
  }

  const goNext = () => { if (position >= questions.length - 1) setFinished(true); else { setPosition((current) => current + 1); setSelected([]); setSubmitted(false); } };
  const select = (index: number) => {
    if (submitted) return;
    if (question.type === "multiple_choice") setSelected((current) => current.includes(index) ? current.filter((item) => item !== index) : [...current, index].sort());
    else { const answer = [index]; setSelected(answer); setSubmitted(true); recordAnswer(question.id, sameAnswer(answer, question.correct_indices)); }
  };
  const submitMultiple = () => { setSubmitted(true); recordAnswer(question.id, sameAnswer(selected, question.correct_indices)); };

  return <div className="mx-auto max-w-[900px] px-5 pb-14 pt-8 sm:px-8 sm:pt-10"><div className="flex items-center justify-between gap-4"><Link href="/" className="focus-ring inline-flex items-center gap-2 rounded-full text-xs font-black uppercase tracking-[0.14em] text-[var(--muted)] transition-colors hover:text-[var(--accent)]"><ArrowLeft size={15} /> {t.backHome}</Link><span className="rounded-full bg-[var(--soft-accent)] px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-[var(--accent-dark)]">{t.practiceMode} · 0{subject}</span></div><div className="mt-9"><ProgressBar current={position + 1} total={questions.length} label={`${t.question} ${position + 1} / ${questions.length}`} /><QuestionCard question={question} language={language} copy={t} selected={selected} submitted={submitted} showFeedback={submitted} onSelect={select} onSubmitMulti={submitMultiple} />{submitted ? <div className="mt-5 flex justify-end"><button type="button" onClick={goNext} className="focus-ring inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-5 py-3.5 text-sm font-black text-white transition-transform hover:-translate-y-0.5">{position === questions.length - 1 ? t.finish : t.next} <ArrowRight size={16} /></button></div> : null}</div></div>;
}
