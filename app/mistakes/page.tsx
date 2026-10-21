"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";
import { MistakeTracker } from "@/components/mistake-tracker";
import { getQuestionSet } from "@/lib/api";
import { copy } from "@/lib/i18n";
import type { Question } from "@/lib/questions";
import { useStudyStore } from "@/lib/store";

export default function MistakesPage() {
  const language = useStudyStore((state) => state.language);
  const mistakeIds = useStudyStore((state) => state.mistakes);
  const clearMistakes = useStudyStore((state) => state.clearMistakes);
  const [availableQuestions, setAvailableQuestions] = useState<Question[]>([]);
  const t = copy[language];
  useEffect(() => {
    let active = true;
    Promise.all([getQuestionSet(1), getQuestionSet(4)]).then((sets) => {
      if (active) setAvailableQuestions(sets.flatMap((set) => set.questions));
    }).catch(() => { if (active) setAvailableQuestions([]); });
    return () => { active = false; };
  }, []);
  const byId = new Map(availableQuestions.map((question) => [question.id, question]));
  const questions = mistakeIds.map((id) => byId.get(id)).filter((question): question is Question => Boolean(question));
  const subject = questions[0]?.subject ?? 1;

  return <div className="mx-auto max-w-[1060px] px-5 pb-14 pt-8 sm:px-8 sm:pt-12"><Link href="/" className="focus-ring inline-flex items-center gap-2 rounded-full text-xs font-black uppercase tracking-[0.14em] text-[var(--muted)] transition-colors hover:text-[var(--accent)]"><ArrowLeft size={15} /> {t.backHome}</Link><div className="mt-10 grid gap-8 lg:grid-cols-[0.75fr_1.25fr] lg:items-start"><div><p className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--accent)]">Mistake tracker</p><h1 className="mt-3 text-5xl font-black leading-[0.9] tracking-[-0.075em] sm:text-7xl">{t.mistakesTitle}</h1><p className="mt-6 max-w-sm text-base font-semibold leading-relaxed text-[var(--muted)]">{t.mistakesText}</p>{questions.length ? <Link href={`/practice/${subject}?mistakes=true`} className="focus-ring mt-8 inline-flex items-center gap-2 rounded-full bg-[var(--ink)] px-5 py-3.5 text-sm font-black text-white transition-transform hover:-translate-y-0.5">{t.repeat} <ArrowRight size={16} /></Link> : <div className="mt-8 flex items-center gap-2 text-sm font-black text-[#3a8960]"><CheckCircle2 size={18} /> {t.mistakesEmpty}</div>}</div><MistakeTracker questions={questions} language={language} copy={t} onClear={clearMistakes} /></div></div>;
}
