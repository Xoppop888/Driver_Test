import { Check, CheckCircle2, Circle, CircleX, ImageOff } from "lucide-react";
import type { Language } from "@/lib/questions";
import type { Copy } from "@/lib/i18n";
import type { Question } from "@/lib/questions";
import { assetPath } from "@/lib/assets";

type Props = {
  question: Question;
  language: Language;
  copy: Copy;
  selected: number[];
  submitted?: boolean;
  showFeedback?: boolean;
  onSelect: (index: number) => void;
  onSubmitMulti?: () => void;
};

export function QuestionCard({ question, language, copy: t, selected, submitted = false, showFeedback = false, onSelect, onSubmitMulti }: Props) {
  const options = language === "ru" ? question.options_ru : question.options_en;
  const correct = question.correct_indices;
  const isMultiple = question.type === "multiple_choice";
  const isAnswered = submitted || showFeedback;
  const imageSrc = assetPath(question.image_url);

  return (
    <section className="overflow-hidden rounded-[28px] border border-[var(--line)] bg-white shadow-[0_18px_60px_rgba(19,35,43,0.07)]">
      {imageSrc ? (
        <div className="relative flex max-h-[280px] min-h-[170px] items-center justify-center overflow-hidden bg-[#edf1ed] p-5 sm:max-h-[340px]">
          <img src={imageSrc} alt="" className="max-h-[300px] w-full rounded-2xl object-contain" />
        </div>
      ) : null}
      <div className="p-5 sm:p-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <span className="rounded-full bg-[var(--soft-accent)] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-[var(--accent-dark)]">
            {question.type === "multiple_choice" ? "Multiple choice" : question.type === "true_false" ? "True / False" : "Single choice"}
          </span>
          {question.image_url ? <span className="flex items-center gap-1 text-[11px] font-bold text-[var(--muted)]"><Check size={13} /> Image ready</span> : <span className="flex items-center gap-1 text-[11px] font-bold text-[var(--muted)]"><ImageOff size={13} /> Text question</span>}
        </div>
        <h2 className="max-w-3xl text-[clamp(1.45rem,3vw,2.3rem)] font-black leading-[1.1] tracking-[-0.05em] text-[var(--ink)]">{language === "ru" ? question.question_ru : question.question_en}</h2>
        {isMultiple && !isAnswered ? <p className="mt-3 text-sm font-semibold text-[var(--muted)]">{t.selectAll}</p> : null}

        <div className="mt-7 grid gap-3">
          {options.map((option, index) => {
            const isSelected = selected.includes(index);
            const isCorrect = correct.includes(index);
            const isWrongSelection = isAnswered && isSelected && !isCorrect;
            const optionClass = isAnswered && isCorrect
              ? "border-[#86b89d] bg-[#e6f1ea] text-[#285c43]"
              : isWrongSelection
                ? "border-[#e49d91] bg-[#fae7e2] text-[#8d3328]"
                : isSelected
                  ? "border-[var(--accent)] bg-[var(--soft-accent)] text-[var(--ink)]"
                  : "border-[var(--line)] bg-[#fbfcfa] text-[var(--ink)] hover:-translate-y-0.5 hover:border-[var(--accent)] hover:bg-white";

            return (
              <button
                type="button"
                key={`${question.id}-${index}`}
                disabled={isAnswered}
                onClick={() => onSelect(index)}
                className={`focus-ring group flex min-h-[64px] items-center gap-4 rounded-2xl border px-4 text-left transition-all sm:px-5 ${optionClass} ${isAnswered ? "cursor-default" : "cursor-pointer"}`}
                aria-pressed={isSelected}
              >
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border text-sm font-black ${isSelected || (isAnswered && isCorrect) ? "border-transparent bg-white/75" : "border-[var(--line)] bg-white"}`}>
                  {isAnswered && isCorrect ? <CheckCircle2 size={19} /> : isWrongSelection ? <CircleX size={19} /> : isSelected ? <Check size={18} /> : <Circle size={18} className="text-[var(--muted)]" />}
                </span>
                <span className="text-[15px] font-bold leading-snug sm:text-base">{option}</span>
              </button>
            );
          })}
        </div>

        {isMultiple && !isAnswered && onSubmitMulti ? (
          <button type="button" onClick={onSubmitMulti} disabled={!selected.length} className="focus-ring mt-5 w-full rounded-2xl bg-[var(--ink)] px-5 py-4 text-sm font-black text-white transition-all hover:-translate-y-0.5 hover:bg-[#203943] disabled:cursor-not-allowed disabled:opacity-35">
            {t.submitAnswer}
          </button>
        ) : null}

        {showFeedback ? (
          <div className={`mt-6 rounded-2xl border p-5 ${selected.length && selected.every((index) => correct.includes(index)) && selected.length === correct.length ? "border-[#a8d0b5] bg-[#f0f8f2]" : "border-[#efc0b5] bg-[#fff5f2]"}`}>
            <div className="flex items-center gap-2 text-sm font-black">
              {selected.length && selected.every((index) => correct.includes(index)) && selected.length === correct.length ? <CheckCircle2 size={18} className="text-[#2d8556]" /> : <CircleX size={18} className="text-[var(--accent)]" />}
              {selected.length && selected.every((index) => correct.includes(index)) && selected.length === correct.length ? t.correct : t.incorrect}
            </div>
            {(language === "ru" ? question.explanation_ru : question.explanation_en) ? <div className="mt-3 border-t border-black/5 pt-3"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--muted)]">{t.explanation}</p><p className="mt-2 text-sm font-semibold leading-relaxed text-[var(--ink)]">{language === "ru" ? question.explanation_ru : question.explanation_en}</p></div> : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
