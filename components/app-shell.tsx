"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, BookOpenCheck, CircleAlert, Languages } from "lucide-react";
import { useStudyStore } from "@/lib/store";
import { copy } from "@/lib/i18n";
import { LanguageToggle } from "./language-toggle";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const language = useStudyStore((state) => state.language);
  const t = copy[language];

  return (
    <div className="min-h-screen bg-[var(--paper)] text-[var(--ink)]">
      <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-[rgba(246,247,243,0.88)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1240px] items-center justify-between px-5 py-4 sm:px-8 lg:px-10">
          <Link href="/" className="focus-ring group flex items-center gap-3 rounded-2xl" aria-label={t.appName}>
            <span className="grid h-10 w-10 place-items-center rounded-[14px] bg-[var(--ink)] text-white shadow-[4px_4px_0_var(--accent)] transition-transform group-hover:-translate-y-0.5">
              <BookOpenCheck size={20} strokeWidth={2.3} />
            </span>
            <span>
              <span className="block text-[15px] font-black tracking-[-0.04em]">{t.appName}</span>
              <span className="hidden text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted)] sm:block">CN THEORY / 01</span>
            </span>
          </Link>

          <div className="flex items-center gap-2 sm:gap-5">
            <nav className="hidden items-center gap-1 text-sm font-bold sm:flex">
              <Link href="/" className={`rounded-full px-3 py-2 transition-colors hover:bg-white ${pathname === "/" ? "text-[var(--accent)]" : "text-[var(--muted)]"}`}>
                {t.navHome}
              </Link>
              <Link href="/mistakes" className={`flex items-center gap-1 rounded-full px-3 py-2 transition-colors hover:bg-white ${pathname === "/mistakes" ? "text-[var(--accent)]" : "text-[var(--muted)]"}`}>
                <CircleAlert size={15} /> {t.navMistakes}
              </Link>
            </nav>
            <LanguageToggle />
          </div>
        </div>
      </header>
      <main>{children}</main>
      <footer className="mx-auto flex max-w-[1240px] items-center justify-between px-5 pb-8 pt-3 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--muted)] sm:px-8 lg:px-10">
        <span>Built for the road ahead</span>
        <span className="flex items-center gap-1">{language === "ru" ? "Учитесь в своём ритме" : "Learn at your pace"} <ArrowUpRight size={13} /></span>
      </footer>
    </div>
  );
}
