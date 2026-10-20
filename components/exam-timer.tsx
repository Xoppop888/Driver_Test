"use client";

import { useEffect, useMemo, useState } from "react";
import { Timer } from "lucide-react";
import type { Copy } from "@/lib/i18n";

export function ExamTimer({ deadline, copy: t, onExpire }: { deadline: number; copy: Copy; onExpire: () => void }) {
  const [remaining, setRemaining] = useState(() => Math.max(0, deadline - Date.now()));

  useEffect(() => {
    const tick = () => {
      const next = Math.max(0, deadline - Date.now());
      setRemaining(next);
      if (next <= 0) onExpire();
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [deadline, onExpire]);

  const formatted = useMemo(() => {
    const totalSeconds = Math.floor(remaining / 1000);
    const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
    const seconds = (totalSeconds % 60).toString().padStart(2, "0");
    return `${minutes}:${seconds}`;
  }, [remaining]);

  return <div className={`flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-black ${remaining < 5 * 60 * 1000 ? "border-[#e7a298] bg-[#fff0ec] text-[var(--accent-dark)]" : "border-[var(--line)] bg-white text-[var(--ink)]"}`}><Timer size={16} /> <span className="hidden sm:inline">{t.timer}</span> {formatted}</div>;
}

export function ProgressBar({ current, total, label }: { current: number; total: number; label: string }) {
  const percentage = total ? Math.round((current / total) * 100) : 0;
  return <div className="mb-6"><div className="mb-2 flex items-center justify-between text-[11px] font-black uppercase tracking-[0.14em] text-[var(--muted)]"><span>{label}</span><span>{percentage}%</span></div><div className="h-2 overflow-hidden rounded-full bg-[#e7ebe7]"><div className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-500" style={{ width: `${percentage}%` }} /></div></div>;
}
