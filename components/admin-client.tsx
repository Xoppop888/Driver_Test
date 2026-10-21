"use client";

import { Download, KeyRound, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { ApiError, generateAccessCodes, getApiBaseUrl } from "@/lib/api";

function downloadCsv(codes: string[]) {
  const csv = `code\r\n${codes.map((code) => `"${code.replaceAll('"', '""')}"`).join("\r\n")}\r\n`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `driveprep-access-codes-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function AdminClient() {
  const [count, setCount] = useState("10");
  const [expiresAt, setExpiresAt] = useState("");
  const [note, setNote] = useState("");
  const [adminKey, setAdminKey] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setCodes([]);
    setBusy(true);
    try {
      const result = await generateAccessCodes({
        count: Number(count),
        expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59+08:00`).toISOString() : null,
        note: note.trim(),
      }, adminKey.trim());
      setCodes(result.codes);
      setAdminKey("");
    } catch (caught) {
      const apiError = caught instanceof ApiError ? caught : null;
      setError(apiError?.status === 401 || apiError?.status === 403
        ? "Административный ключ не принят. Проверьте настройки доступа."
        : apiError?.code === "API_NOT_CONFIGURED"
          ? "API ещё не настроен. Разверните Cloudflare Worker и укажите его URL в GitHub Actions."
          : "Не удалось создать коды. Проверьте соединение и попробуйте снова.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="mx-auto max-w-[760px] px-5 pb-16 pt-10 sm:px-8 sm:pt-14">
    <div className="rounded-[30px] border border-[var(--line)] bg-white p-6 shadow-[0_18px_60px_rgba(19,35,43,0.07)] sm:p-10">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--ink)] text-[var(--gold)]"><KeyRound size={23} /></div>
      <p className="mt-7 text-[11px] font-black uppercase tracking-[0.2em] text-[var(--accent)]">DrivePrep / Admin</p>
      <h1 className="mt-2 text-4xl font-black tracking-[-0.07em]">Генерация кодов</h1>
      <p className="mt-3 text-sm font-semibold leading-relaxed text-[var(--muted)]">Коды доступа создаются сервером и показываются только один раз. Не передавайте их по открытым каналам.</p>
      {!getApiBaseUrl() ? <p className="mt-6 rounded-2xl border border-[#efc0b5] bg-[#fff5f2] p-4 text-sm font-bold text-[#8d3328]">API не настроен. Для активации панели нужен URL Cloudflare Worker.</p> : null}

      <form onSubmit={submit} className="mt-8 grid gap-5">
        <label className="grid gap-2 text-xs font-black uppercase tracking-[0.14em] text-[var(--muted)]">Количество кодов <input required min="1" max="100" type="number" value={count} onChange={(event) => setCount(event.target.value)} className="focus-ring rounded-2xl border border-[var(--line)] bg-[#fbfcfa] px-4 py-3 text-base font-bold normal-case tracking-normal text-[var(--ink)]" /></label>
        <label className="grid gap-2 text-xs font-black uppercase tracking-[0.14em] text-[var(--muted)]">Действуют до <input type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} className="focus-ring rounded-2xl border border-[var(--line)] bg-[#fbfcfa] px-4 py-3 text-base font-bold normal-case tracking-normal text-[var(--ink)]" /></label>
        <label className="grid gap-2 text-xs font-black uppercase tracking-[0.14em] text-[var(--muted)]">Комментарий к партии <input maxLength={180} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Например: запуск, июль" className="focus-ring rounded-2xl border border-[var(--line)] bg-[#fbfcfa] px-4 py-3 text-base font-bold normal-case tracking-normal text-[var(--ink)]" /></label>
        <label className="grid gap-2 text-xs font-black uppercase tracking-[0.14em] text-[var(--muted)]">Административный ключ <input required autoComplete="new-password" type="password" value={adminKey} onChange={(event) => setAdminKey(event.target.value)} className="focus-ring rounded-2xl border border-[var(--line)] bg-[#fbfcfa] px-4 py-3 text-base font-bold normal-case tracking-normal text-[var(--ink)]" /></label>
        {error ? <p role="alert" className="rounded-xl bg-[#fff5f2] p-3 text-sm font-bold text-[#8d3328]">{error}</p> : null}
        <button disabled={busy || !getApiBaseUrl()} className="focus-ring inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[var(--ink)] px-5 py-3.5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50">{busy ? <LoaderCircle size={17} className="animate-spin" /> : <KeyRound size={17} />}Создать коды</button>
      </form>

      {codes.length ? <section aria-live="polite" className="mt-8 rounded-2xl border border-[#a8d0b5] bg-[#f0f8f2] p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-black">Готово: {codes.length} кодов</h2><button type="button" onClick={() => downloadCsv(codes)} className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-black"><Download size={15} /> Скачать CSV</button></div><p className="mt-2 text-xs font-semibold text-[var(--muted)]">Сохраните коды сейчас: этот список больше не будет показан после ухода со страницы.</p><pre className="mt-4 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-white p-4 font-mono text-sm font-bold">{codes.join("\n")}</pre></section> : null}
    </div>
  </main>;
}
