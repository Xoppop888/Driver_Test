"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Home, LoaderCircle } from "lucide-react";
import { ProgressBar } from "@/components/exam-timer";
import { QuestionCard } from "@/components/question-card";
import { UnlockButton } from "@/components/unlock-dialog";
import { getQuestionSet, lookupQuestions } from "@/lib/api";
import { copy } from "@/lib/i18n";
import type { Question, Subject } from "@/lib/questions";
import { useStudyStore } from "@/lib/store";

function sameAnswer(selected: number[], correct: number[]) {
  return selected.length === correct.length && selected.every((index) => correct.includes(index));
}

export function PracticeClient({ subject }: { subject: Subject }) {
  const language = useStudyStore((state) => state.language);
  const recordAnswer = useStudyStore((state) => state.recordAnswer);
  const savePracticePosition = useStudyStore((state) => state.savePracticePosition);
  const clearPracticePosition = useStudyStore((state) => state.clearPracticePosition);
  const savedPosition = useStudyStore((state) => state.practicePositions[String(subject)] ?? 0);
  const savedPositionRef = useRef(savedPosition);
  savedPositionRef.current = savedPosition;
  const mistakeIds = useStudyStore((state) => state.mistakes);
  const mistakeIdsRef = useRef(mistakeIds);
  mistakeIdsRef.current = mistakeIds;
  const unlocked = useStudyStore((state) => state.unlocked);
  const lock = useStudyStore((state) => state.lock);
  const t = copy[language];
  const [questions, setQuestions] = useState<Question[]>([]);
  const [total, setTotal] = useState(0);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [resetAt, setResetAt] = useState<string | null>(null);
  const [position, setPosition] = useState(0);
  const [selected, setSelected] = useState<number[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const resumePosition = savedPositionRef.current;
    setLoading(true);
    setError("");
    const params = new URLSearchParams(window.location.search);
    const requestedQuestionId = params.get("question");
    const reviewingMistakes = params.get("mistakes") === "true";
    if (requestedQuestionId || reviewingMistakes) {
      const requestedIds = requestedQuestionId ? [requestedQuestionId] : mistakeIdsRef.current;
      lookupQuestions(requestedIds).then((found) => {
        if (!active) return;
        const reviewQuestions = found.filter((item) => item.subject === subject);
        setQuestions(reviewQuestions);
        setTotal(reviewQuestions.length);
        setNextOffset(null);
        setRemaining(null);
        setResetAt(null);
        setPosition(0);
        setSelected([]);
        setSubmitted(false);
        setFinished(reviewQuestions.length === 0);
      }).catch((caught: unknown) => {
        if (!active) return;
        if (caught && typeof caught === "object" && "status" in caught && caught.status === 401) lock();
        setError(t.apiUnavailable);
      }).finally(() => { if (active) setLoading(false); });
      return () => { active = false; };
    }
    getQuestionSet(subject, { mode: "practice", offset: 0, limit: 50 }).then(async (result) => {
      let page = result;
      let loadedQuestions = result.questions;
      while (resumePosition >= loadedQuestions.length && page.nextOffset !== null) {
        page = await getQuestionSet(subject, { mode: "practice", offset: page.nextOffset, limit: 50 });
        loadedQuestions = [...loadedQuestions, ...page.questions];
      }
      if (!active) return;
      setQuestions(loadedQuestions);
      setTotal(result.total);
      setNextOffset(page.nextOffset);
      setRemaining(result.remaining);
      setResetAt(result.resetAt);
      setPosition(Math.min(resumePosition, Math.max(loadedQuestions.length - 1, 0)));
      setSelected([]);
      setSubmitted(false);
      setFinished(false);
    }).catch((caught: unknown) => {
      if (!active) return;
      if (caught && typeof caught === "object" && "status" in caught && caught.status === 401) lock();
      setError(t.apiUnavailable);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [subject, unlocked, lock, t.apiUnavailable]);

  const question = questions[position];
  const formatReset = () => resetAt ? new Intl.DateTimeFormat(language === "ru" ? "ru-RU" : "en-US", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Shanghai" }).format(new Date(resetAt)) : null;
  const goNext = async () => {
    if (position >= questions.length - 1) {
      if (nextOffset !== null) {
        setLoadingMore(true);
        try {
          const result = await getQuestionSet(subject, { mode: "practice", offset: nextOffset, limit: 50 });
          setQuestions((current) => [...current, ...result.questions]);
          setNextOffset(result.nextOffset);
          setPosition((current) => current + 1);
          setSelected([]);
          setSubmitted(false);
        } catch {
          setError(t.apiUnavailable);
        } finally {
          setLoadingMore(false);
        }
        return;
      }
      clearPracticePosition(subject);
      setFinished(true);
    } else {
      savePracticePosition(subject, position + 1);
      setPosition((current) => current + 1);
      setSelected([]);
      setSubmitted(false);
    }
  };
  const select = (index: number) => {
    if (submitted || !question) return;
    if (question.type === "multiple_choice") setSelected((current) => current.includes(index) ? current.filter((item) => item !== index) : [...current, index].sort());
    else { const answer = [index]; setSelected(answer); setSubmitted(true); recordAnswer(question.id, sameAnswer(answer, question.correct_indices)); savePracticePosition(subject, position); }
  };
  const submitMultiple = () => {
    if (!question) return;
    setSubmitted(true);
    recordAnswer(question.id, sameAnswer(selected, question.correct_indices));
    savePracticePosition(subject, position);
  };

  if (loading) return <div className="mx-auto flex min-h-[55vh] max-w-[760px] items-center justify-center px-5"><div className="flex items-center gap-3 text-sm font-bold text-[var(--muted)]"><LoaderCircle className="animate-spin" size={18} />{language === "ru" ? "Загружаем вопросы…" : "Loading questions…"}</div></div>;

  if (error) return <div className="mx-auto max-w-[760px] px-5 pb-16 pt-14 sm:px-8"><div role="alert" className="rounded-[30px] border border-[#efc0b5] bg-white p-8 text-center"><h1 className="text-2xl font-black">{t.apiUnavailable}</h1><p className="mt-3 text-sm font-semibold text-[var(--muted)]">{error}</p><Link href="/" className="focus-ring mt-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--ink)] px-5 py-3 text-sm font-black text-white"><Home size={16} />{t.backHome}</Link></div></div>;

  if (finished || !question) {
    const quotaEnded = !unlocked && remaining === 0;
    return <div className="mx-auto max-w-[760px] px-5 pb-[calc(4rem+env(safe-area-inset-bottom))] pt-14 sm:px-8"><div className="rounded-[30px] border border-[var(--line)] bg-white p-8 text-center shadow-[0_18px_60px_rgba(19,35,43,0.07)] sm:p-12"><div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-[var(--mint)] text-3xl">✓</div><h1 className="mt-7 text-4xl font-black tracking-[-0.07em]">{quotaEnded ? t.dailyLimitTitle : t.practiceComplete}</h1><p className="mx-auto mt-4 max-w-md text-sm font-semibold leading-relaxed text-[var(--muted)]">{quotaEnded ? `${t.dailyLimitText}${formatReset() ? ` ${t.dailyResetLabel} ${formatReset()} (Asia/Shanghai).` : ""}` : unlocked ? t.practiceCompleteText : t.dailyPracticeComplete}</p><div className="mt-8 flex flex-wrap justify-center gap-3">{!unlocked ? <UnlockButton /> : null}<Link href="/mistakes" className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--ink)] px-5 py-3.5 text-sm font-black text-white">{t.navMistakes} <ArrowRight size={16} /></Link><Link href="/" className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--line)] px-5 py-3.5 text-sm font-black"><Home size={16} /> {t.backHome}</Link></div></div></div>;
  }

  return <div className="mx-auto max-w-[900px] px-5 pb-[calc(3rem+env(safe-area-inset-bottom))] pt-8 sm:px-8 sm:pt-10"><div className="flex flex-wrap items-center justify-between gap-3"><Link href="/" className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-full text-xs font-black uppercase tracking-[0.14em] text-[var(--muted)] transition-colors hover:text-[var(--accent)]"><ArrowLeft size={15} /> {t.backHome}</Link><span className="rounded-full bg-[var(--soft-accent)] px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-[var(--accent-dark)]">{t.practiceMode} · 0{subject}</span></div><div className="mt-7 rounded-2xl bg-white/75 px-4 py-3 text-xs font-bold text-[var(--muted)]">{unlocked ? `${t.unlocked} · ${questions.length}/${total}` : `${t.dailyPack}: ${questions.length}`} {!unlocked && formatReset() ? ` · ${t.dailyResetLabel} ${formatReset()} (Asia/Shanghai)` : ""}</div><div className="mt-5"><ProgressBar current={position + 1} total={unlocked ? total : questions.length} label={`${t.question} ${position + 1} / ${unlocked ? total : questions.length}`} /><QuestionCard question={question} language={language} copy={t} selected={selected} submitted={submitted} showFeedback={submitted} onSelect={select} onSubmitMulti={submitMultiple} />{submitted ? <div className="mt-5 flex justify-end"><button type="button" disabled={loadingMore} onClick={() => void goNext()} className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--accent)] px-5 py-3.5 text-sm font-black text-white transition-transform hover:-translate-y-0.5 disabled:opacity-60">{loadingMore ? <LoaderCircle size={16} className="animate-spin" /> : null}{position === total - 1 ? t.finish : t.next} <ArrowRight size={16} /></button></div> : null}</div></div>;
}
