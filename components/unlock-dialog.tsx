"use client";

import { Check, KeyRound, X } from "lucide-react";
import { useState } from "react";
import { copy } from "@/lib/i18n";
import { useStudyStore } from "@/lib/store";

export function UnlockButton({ compact = false }: { compact?: boolean }) {
  const language = useStudyStore((state) => state.language);
  const unlocked = useStudyStore((state) => state.unlocked);
  const [open, setOpen] = useState(false);
  const t = copy[language];

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`focus-ring inline-flex items-center gap-2 rounded-full border px-3 py-2 text-[11px] font-black transition-colors ${unlocked ? "border-[#b9d9c3] bg-[#e8f4eb] text-[#2f7650]" : "border-[var(--line)] bg-white text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"}`}>
        {unlocked ? <Check size={14} /> : <KeyRound size={14} />}
        <span>{compact ? (unlocked ? t.unlockedShort : t.unlockShort) : unlocked ? t.unlocked : t.unlock}</span>
      </button>
      <UnlockDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function UnlockDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const language = useStudyStore((state) => state.language);
  const unlockWithCode = useStudyStore((state) => state.unlockWithCode);
  const [code, setCode] = useState("");
  const [invalid, setInvalid] = useState(false);
  const t = copy[language];

  if (!open) return null;

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (unlockWithCode(code)) {
      setInvalid(false);
      setCode("");
      onClose();
    } else {
      setInvalid(true);
    }
  };

  return <div className="fixed inset-0 z-50 grid place-items-center bg-[rgba(19,35,43,0.42)] px-5 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div role="dialog" aria-modal="true" aria-labelledby="unlock-title" className="w-full max-w-md rounded-[28px] border border-[var(--line)] bg-[var(--paper)] p-6 shadow-[0_24px_80px_rgba(19,35,43,0.24)] sm:p-8">
      <div className="flex items-start justify-between gap-4"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--ink)] text-[var(--gold)]"><KeyRound size={23} /></div><button type="button" onClick={onClose} className="focus-ring rounded-full p-2 text-[var(--muted)] hover:bg-white" aria-label={t.close}><X size={18} /></button></div>
      <h2 id="unlock-title" className="mt-7 text-3xl font-black tracking-[-0.07em]">{t.unlockTitle}</h2>
      <p className="mt-3 text-sm font-semibold leading-relaxed text-[var(--muted)]">{t.unlockText}</p>
      <form onSubmit={submit} className="mt-6"><label className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--muted)]" htmlFor="access-code">{t.accessCode}</label><input id="access-code" autoFocus value={code} onChange={(event) => { setCode(event.target.value); setInvalid(false); }} placeholder={t.accessCodePlaceholder} className="focus-ring mt-2 w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3.5 text-base font-bold outline-none" aria-invalid={invalid} />{invalid ? <p className="mt-2 text-sm font-bold text-[#c45145]">{t.invalidCode}</p> : null}<button type="submit" className="focus-ring mt-5 w-full rounded-full bg-[var(--ink)] px-5 py-3.5 text-sm font-black text-white transition-transform hover:-translate-y-0.5">{t.unlockButton}</button></form>
      <p className="mt-5 text-[11px] font-semibold leading-relaxed text-[var(--muted)]">{t.unlockDisclaimer}</p>
    </div>
  </div>;
}
