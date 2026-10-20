import Link from "next/link";
import { ArrowRight, CircleAlert, RotateCcw, Trash2 } from "lucide-react";
import type { Language } from "@/lib/questions";
import type { Copy } from "@/lib/i18n";
import type { Question } from "@/lib/questions";

export function MistakeTracker({ questions, language, copy: t, onClear }: { questions: Question[]; language: Language; copy: Copy; onClear: () => void }) {
  return (
    <section className="rounded-[28px] border border-[var(--line)] bg-white p-5 shadow-[0_18px_60px_rgba(19,35,43,0.05)] sm:p-7">
      <div className="flex items-start justify-between gap-4">
        <div><div className="flex items-center gap-2"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#fff0ec] text-[var(--accent)]"><CircleAlert size={18} /></span><h2 className="text-xl font-black tracking-[-0.04em]">{t.mistakesTitle}</h2></div><p className="mt-3 max-w-xl text-sm font-semibold leading-relaxed text-[var(--muted)]">{t.mistakesText}</p></div>
        {questions.length ? <button type="button" onClick={onClear} className="focus-ring flex items-center gap-1 rounded-full px-3 py-2 text-xs font-black text-[var(--muted)] transition-colors hover:bg-[#fff0ec] hover:text-[var(--accent)]"><Trash2 size={14} /> <span className="hidden sm:inline">{t.clearMistakes}</span></button> : null}
      </div>
      {questions.length ? <div className="mt-6 grid gap-3">{questions.map((question, index) => <div key={question.id} className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--line)] bg-[#fbfcfa] p-4"><div className="flex min-w-0 items-center gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--mint)] text-xs font-black">{String(index + 1).padStart(2, "0")}</span><p className="line-clamp-2 text-sm font-bold leading-snug">{language === "ru" ? question.question_ru : question.question_en}</p></div><Link href={`/practice/${question.subject}?question=${question.id}`} className="focus-ring shrink-0 rounded-full p-2 text-[var(--accent)] transition-colors hover:bg-[var(--soft-accent)]" aria-label={t.review}><ArrowRight size={18} /></Link></div>)}</div> : <div className="mt-6 rounded-2xl border border-dashed border-[var(--line)] bg-[#fbfcfa] p-6 text-center"><RotateCcw className="mx-auto text-[var(--muted)]" size={24} /><p className="mt-3 text-sm font-black">{t.mistakesEmpty}</p></div>}
    </section>
  );
}
