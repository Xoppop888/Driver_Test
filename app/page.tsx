"use client";

import Link from "next/link";
import { ArrowRight, BookOpen, CheckCircle2, ChevronRight, Clock3, Flame, Gauge, Sparkles } from "lucide-react";
import { copy } from "@/lib/i18n";
import { getQuestions } from "@/lib/questions";
import { useStudyStore } from "@/lib/store";

export default function HomePage() {
  const language = useStudyStore((state) => state.language);
  const mistakes = useStudyStore((state) => state.mistakes);
  const progress = useStudyStore((state) => state.progress);
  const t = copy[language];
  const subject1 = getQuestions(1);
  const subject4 = getQuestions(4);
  const completed = Object.keys(progress).length;

  return (
    <div className="shell-grid">
      <div className="mx-auto max-w-[1240px] px-5 pb-14 pt-8 sm:px-8 sm:pt-12 lg:px-10 lg:pt-16">
        <section className="grid items-end gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:gap-16">
          <div className="animate-rise">
            <div className="mb-6 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-[var(--accent)]"><span className="h-2 w-2 rounded-full bg-[var(--accent)]" /> {t.eyebrow}</div>
            <h1 className="max-w-[780px] text-[clamp(3.15rem,8vw,7.6rem)] font-black leading-[0.88] tracking-[-0.085em] text-[var(--ink)]">{t.heroTitle}</h1>
            <p className="mt-7 max-w-xl text-base font-semibold leading-relaxed text-[var(--muted)] sm:text-lg">{t.heroText}</p>
            <div className="mt-8 flex flex-wrap items-center gap-3 text-xs font-black uppercase tracking-[0.12em] text-[var(--muted)]"><span className="rounded-full border border-[var(--line)] bg-white px-3 py-2">RU / EN</span><span className="rounded-full border border-[var(--line)] bg-white px-3 py-2">Local-first</span><span className="rounded-full border border-[var(--line)] bg-white px-3 py-2">C1 theory</span></div>
          </div>

          <div className="animate-rise delay-2 relative overflow-hidden rounded-[30px] bg-[var(--ink)] p-6 text-white shadow-[14px_14px_0_var(--soft-accent)] sm:p-8">
            <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full border-[18px] border-white/10" />
            <div className="absolute -bottom-16 -left-12 h-36 w-36 rounded-full border-[12px] border-[var(--accent)]/50" />
            <div className="relative">
              <div className="flex items-center justify-between"><span className="rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-[#d9e8dc]">{t.savedProgress}</span><Gauge size={22} className="text-[var(--gold)]" /></div>
              <div className="mt-10 flex items-end gap-2"><span className="text-6xl font-black leading-none tracking-[-0.08em]">{completed}</span><span className="pb-1 text-sm font-bold text-white/55">{t.questions}</span></div>
              <div className="mt-5 h-2 rounded-full bg-white/10"><div className="h-full rounded-full bg-[var(--gold)]" style={{ width: `${Math.min(completed / 8, 1) * 100}%` }} /></div>
              <p className="mt-4 max-w-xs text-sm font-semibold leading-relaxed text-white/65">{mistakes.length ? `${mistakes.length} ${language === "ru" ? "вопросов ждут повторения" : "questions waiting for a revisit"}` : t.mistakesEmpty}</p>
              <Link href="/mistakes" className="focus-ring mt-7 inline-flex items-center gap-2 rounded-full bg-white px-4 py-3 text-xs font-black uppercase tracking-[0.08em] text-[var(--ink)] transition-transform hover:-translate-y-0.5">{t.navMistakes} <ArrowRight size={15} /></Link>
            </div>
          </div>
        </section>

        <section className="mt-20">
          <div className="mb-5"><p className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--accent)]">01 / 03</p><h2 className="mt-2 text-2xl font-black tracking-[-0.05em] sm:text-3xl">{t.practice}</h2></div>
          <ModeCard href="/practice/1" icon={<BookOpen size={22} />} title={t.practice} description={t.practiceDesc} meta={language === "ru" ? "Мгновенная обратная связь · прогресс сохраняется" : "Instant feedback · progress is saved"} />
        </section>

        <section className="mt-16">
          <div className="mb-5"><p className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--accent)]">02 / 03</p><h2 className="mt-2 text-2xl font-black tracking-[-0.05em] sm:text-3xl">{t.mockExam}</h2></div>
          <ModeCard href="/exam/1" icon={<Clock3 size={22} />} title={t.mockExam} description={t.mockExamDesc} meta={language === "ru" ? "100 вопросов · 45 минут · код для доступа" : "100 questions · 45 minutes · access code"} dark />
        </section>

        <section className="mt-16">
          <div className="mb-5 flex items-end justify-between gap-4"><div><p className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--accent)]">03 / 03</p><h2 className="mt-2 text-2xl font-black tracking-[-0.05em] sm:text-3xl">{t.chooseExam}</h2></div><div className="hidden items-center gap-2 text-xs font-bold text-[var(--muted)] sm:flex"><CheckCircle2 size={15} className="text-[#3a8960]" /> {t.bankText}</div></div>
          <div className="grid gap-4 lg:grid-cols-2">
            <ExamChoice subject={1} count={subject1.length} title={t.subject1} description={t.subject1Desc} accent="coral" />
            <ExamChoice subject={4} count={subject4.length} title={t.subject4} description={t.subject4Desc} accent="mint" />
          </div>
        </section>
      </div>
    </div>
  );
}

function ExamChoice({ subject, count, title, description, accent }: { subject: 1 | 4; count: number; title: string; description: string; accent: "coral" | "mint" }) {
  const language = useStudyStore((state) => state.language);
  const t = copy[language];
  return <div className={`group relative overflow-hidden rounded-[26px] border border-[var(--line)] p-5 transition-all hover:-translate-y-1 hover:shadow-[0_18px_40px_rgba(19,35,43,0.08)] sm:p-7 ${accent === "coral" ? "bg-[#fff0eb]" : "bg-[#e8f1eb]"}`}><div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-lg font-black shadow-sm">0{subject}</span><div><h3 className="text-xl font-black tracking-[-0.05em]">{title}</h3><p className="mt-1 text-sm font-semibold text-[var(--muted)]">{description}</p></div></div></div><Sparkles size={20} className={accent === "coral" ? "text-[var(--accent)]" : "text-[#3a8960]"} /></div><div className="mt-8 flex items-center justify-between gap-3"><span className="text-xs font-black uppercase tracking-[0.14em] text-[var(--muted)]">{count} {t.questions}</span><div className="flex gap-2"><Link href={`/practice/${subject}`} className="focus-ring rounded-full bg-white px-4 py-2.5 text-xs font-black transition-colors hover:bg-[var(--ink)] hover:text-white">{t.practice}</Link><Link href={`/exam/${subject}`} className="focus-ring grid h-10 w-10 place-items-center rounded-full bg-[var(--ink)] text-white transition-transform group-hover:rotate-[-8deg]"><ChevronRight size={18} /></Link></div></div></div>;
}

function ModeCard({ href, icon, title, description, meta, dark = false }: { href: string; icon: React.ReactNode; title: string; description: string; meta: string; dark?: boolean }) {
  return <Link href={href} className={`focus-ring group relative block w-full overflow-hidden rounded-[26px] border p-6 transition-all hover:-translate-y-1 sm:p-8 ${dark ? "border-[var(--ink)] bg-[var(--ink)] text-white shadow-[8px_8px_0_var(--gold)]" : "border-[var(--line)] bg-white hover:shadow-[0_18px_40px_rgba(19,35,43,0.08)]"}`}><div className="flex items-center justify-between"><span className={`grid h-12 w-12 place-items-center rounded-2xl ${dark ? "bg-white/10 text-[var(--gold)]" : "bg-[var(--soft-accent)] text-[var(--accent)]"}`}>{icon}</span><ArrowRight size={20} className="transition-transform group-hover:translate-x-1" /></div><h3 className="mt-9 text-2xl font-black tracking-[-0.05em]">{title}</h3><p className={`mt-2 max-w-sm text-sm font-semibold leading-relaxed ${dark ? "text-white/60" : "text-[var(--muted)]"}`}>{description}</p><div className={`mt-8 text-[10px] font-black uppercase tracking-[0.16em] ${dark ? "text-[var(--gold)]" : "text-[var(--accent)]"}`}>{meta}</div></Link>;
}
