"use client";

import { ArrowUpRight, Heart, Sparkles } from "lucide-react";
import { copy } from "@/lib/i18n";
import { useStudyStore } from "@/lib/store";

const githubUrl = "https://github.com/Xoppop888/Driver_Test";
const sponsorUrl = "https://binhaiauto.ru";

export function SponsorBadge() {
  const language = useStudyStore((state) => state.language);
  const t = copy[language];

  return (
    <a
      href={sponsorUrl}
      target="_blank"
      rel="sponsored noreferrer"
      aria-label={`${t.adLabel}: ${t.adTitle}`}
      className="focus-ring flex shrink-0 items-center gap-2 rounded-2xl border border-[#d4c18a] bg-[#f8edc7] px-3 py-2.5 text-[var(--ink)] shadow-[0_4px_14px_rgba(75,63,31,0.08)] transition-colors hover:bg-[#f4e3ad] sm:gap-3 sm:px-4 sm:py-3"
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white/65 sm:h-10 sm:w-10">
        <Sparkles size={18} className="sm:h-5 sm:w-5" />
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block text-[8px] font-black uppercase tracking-[0.14em] text-[var(--ink)]/55 sm:text-[9px]">{t.adLabel}</span>
        <span className="block text-xs font-black sm:text-sm">{t.adTitle}</span>
        <span className="mt-1 hidden max-w-[190px] text-[10px] font-semibold leading-snug text-[var(--ink)]/65 lg:block">{t.adText}</span>
      </span>
      <span className="hidden items-center gap-1 rounded-full bg-[var(--ink)] px-3 py-2 text-[10px] font-black text-white xl:flex">
        {t.visitSite} <ArrowUpRight size={13} />
      </span>
      <ArrowUpRight size={14} className="shrink-0 text-[var(--ink)]/60 xl:hidden" />
    </a>
  );
}

export function ProjectPromo() {
  const language = useStudyStore((state) => state.language);
  const t = copy[language];

  return (
    <section className="mt-16">
      <article className="rounded-[26px] border border-[var(--line)] bg-white p-6 shadow-[0_18px_40px_rgba(19,35,43,0.06)] sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#fff0eb] text-[var(--accent)]">
            <Heart size={21} />
          </span>
          <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--muted)]">Open source</span>
        </div>
        <h2 className="mt-7 text-2xl font-black tracking-[-0.06em]">{t.supportTitle}</h2>
        <p className="mt-3 max-w-lg text-sm font-semibold leading-relaxed text-[var(--muted)]">{t.supportText}</p>
        <a
          href={githubUrl}
          target="_blank"
          rel="noreferrer"
          className="focus-ring mt-6 inline-flex items-center gap-2 rounded-full bg-[var(--ink)] px-5 py-3.5 text-sm font-black text-white transition-transform hover:-translate-y-0.5"
        >
          {t.supportButton} <ArrowUpRight size={16} />
        </a>
      </article>
    </section>
  );
}
