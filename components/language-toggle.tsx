"use client";

import { Languages } from "lucide-react";
import { useStudyStore } from "@/lib/store";

export function LanguageToggle() {
  const language = useStudyStore((state) => state.language);
  const toggleLanguage = useStudyStore((state) => state.toggleLanguage);

  return (
    <button
      type="button"
      onClick={toggleLanguage}
      className="focus-ring group flex items-center gap-2 rounded-full border border-[var(--line)] bg-white px-3 py-2 text-[11px] font-black uppercase tracking-[0.1em] shadow-sm transition-all hover:-translate-y-0.5 hover:border-[var(--accent)] hover:shadow-md"
      aria-label={language === "ru" ? "Switch to English" : "Переключить на русский"}
    >
      <Languages size={15} className="text-[var(--accent)] transition-transform group-hover:rotate-12" />
      <span className={language === "ru" ? "text-[var(--accent)]" : "text-[var(--muted)]"}>RU</span>
      <span className="text-[var(--line)]">/</span>
      <span className={language === "en" ? "text-[var(--accent)]" : "text-[var(--muted)]"}>EN</span>
    </button>
  );
}
