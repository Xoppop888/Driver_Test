"use client";

import { Bot, Copy, Download, KeyRound, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { ApiError, createTelegramPairingCode, generateAccessCodes, getApiBaseUrl, setupTelegramBot } from "@/lib/api";

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
  const [telegramBusy, setTelegramBusy] = useState(false);
  const [telegramError, setTelegramError] = useState("");
  const [pairingCode, setPairingCode] = useState("");
  const [pairingExpiresAt, setPairingExpiresAt] = useState<string | null>(null);
  const [botUsername, setBotUsername] = useState("");

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

  async function configureTelegram() {
    setTelegramError("");
    setPairingCode("");
    setPairingExpiresAt(null);
    if (!adminKey.trim()) {
      setTelegramError("Введите административный ключ выше, чтобы настроить бота.");
      return;
    }
    setTelegramBusy(true);
    try {
      const setup = await setupTelegramBot(adminKey.trim());
      const pairing = await createTelegramPairingCode(adminKey.trim());
      setBotUsername(setup.botUsername ? `@${setup.botUsername.replace(/^@/, "")}` : "");
      setPairingCode(pairing.code);
      setPairingExpiresAt(pairing.expiresAt ?? null);
    } catch (caught) {
      const apiError = caught instanceof ApiError ? caught : null;
      if (apiError?.status === 401 || apiError?.status === 403) {
        setTelegramError("Административный ключ не принят. Проверьте настройки доступа.");
      } else if (apiError?.code === "API_NOT_CONFIGURED") {
        setTelegramError("API не настроен. Сначала разверните Cloudflare Worker и укажите его URL для сайта.");
      } else if (["telegram_not_configured", "TELEGRAM_NOT_CONFIGURED", "TELEGRAM_BOT_TOKEN_MISSING", "BOT_TOKEN_MISSING"].includes(apiError?.code ?? "")) {
        setTelegramError("Бот не настроен: создайте его через @BotFather и добавьте токен только как секрет Worker TELEGRAM_BOT_TOKEN. В этот браузер токен вводить не нужно.");
      } else {
        setTelegramError("Не удалось настроить Telegram-бота. Проверьте секрет TELEGRAM_BOT_TOKEN и соединение с Worker.");
      }
    } finally {
      setTelegramBusy(false);
    }
  }

  async function copyPairInstruction() {
    if (!pairingCode || !navigator.clipboard) return;
    await navigator.clipboard.writeText(`/pair ${pairingCode}`);
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

      <section className="mt-10 border-t border-[var(--line)] pt-8">
        <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[var(--soft-accent)] text-[var(--accent)]"><Bot size={20} /></span><div><h2 className="text-2xl font-black tracking-[-0.05em]">Telegram: личный бот администратора</h2><p className="mt-2 text-sm font-semibold leading-relaxed text-[var(--muted)]">Только личные сообщения: без рассылок по расписанию, групп и каналов.</p></div></div>
        <div className="mt-5 rounded-2xl bg-[#fbfcfa] p-5 text-sm font-semibold leading-relaxed text-[var(--muted)]"><p><strong className="text-[var(--ink)]">1.</strong> Создайте бота через <a className="font-black text-[var(--accent)] underline" href="https://t.me/BotFather" target="_blank" rel="noreferrer">@BotFather</a>.</p><p className="mt-2"><strong className="text-[var(--ink)]">2.</strong> Добавьте его токен только как секрет Cloudflare Worker <code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs font-black text-[var(--ink)]">TELEGRAM_BOT_TOKEN</code>. Никогда не вводите токен в этом браузере.</p><p className="mt-2"><strong className="text-[var(--ink)]">3.</strong> Введите административный ключ выше и создайте код привязки.</p></div>
        {telegramError ? <p role="alert" className="mt-5 rounded-xl bg-[#fff5f2] p-3 text-sm font-bold text-[#8d3328]">{telegramError}</p> : null}
        <button type="button" onClick={configureTelegram} disabled={telegramBusy || !getApiBaseUrl()} className="focus-ring mt-5 inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[var(--ink)] px-5 py-3.5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50">{telegramBusy ? <LoaderCircle size={17} className="animate-spin" /> : <Bot size={17} />}Настроить и создать код привязки</button>
        {pairingCode ? <div aria-live="polite" className="mt-6 rounded-2xl border border-[#a8d0b5] bg-[#f0f8f2] p-5"><p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#2d6e4b]">Код привязки {botUsername ? `для ${botUsername}` : ""}</p><div className="mt-3 flex flex-wrap items-center gap-3"><code className="rounded-xl bg-white px-4 py-3 font-mono text-lg font-black tracking-[0.12em] text-[var(--ink)]">{pairingCode}</code><button type="button" onClick={() => void copyPairInstruction()} className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-black"><Copy size={15} />Скопировать команду</button></div><p className="mt-4 text-sm font-bold leading-relaxed text-[var(--ink)]">Откройте личный диалог с ботом в Telegram и отправьте ровно: <code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs font-black">/pair {pairingCode}</code></p>{pairingExpiresAt ? <p className="mt-2 text-xs font-semibold text-[var(--muted)]">Код действует до {new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Shanghai" }).format(new Date(pairingExpiresAt))} (Asia/Shanghai).</p> : null}</div> : null}
      </section>
    </div>
  </main>;
}
