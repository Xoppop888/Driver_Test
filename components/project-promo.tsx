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
      className="focus-ring flex shrink-0 items-center gap-2 rounded-xl border border-[#d4c18a] bg-[#f8edc7] px-2.5 py-2 text-[var(--ink)] transition-colors hover:bg-[#f4e3ad] sm:px-3"
    >
      <Sparkles size={15} className="shrink-0" />
      <span className="leading-tight">
        <span className="block text-[8px] font-black uppercase tracking-[0.14em] text-[var(--ink)]/55">{t.adLabel}</span>
        <span className="block text-[10px] font-black sm:text-xs">{t.adTitle}</span>
      </span>
      <ArrowUpRight size={13} className="hidden text-[var(--ink)]/60 sm:block" />
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
