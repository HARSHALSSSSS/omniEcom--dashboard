import { Sparkles } from "lucide-react";
import { AI_CHOICES, type useProductCreationAi } from "@/hooks/useProductCreationAi";
import { errorClass, ghostButton, outlineButton, solidButton } from "./fieldStyles";

type Ai = ReturnType<typeof useProductCreationAi>;

/** the "Improve with AI" button of the description header */
export function AiImproveButton({ ai, disabled, reason }: { ai: Ai; disabled: boolean; reason?: string }) {
  return (
    <button
      type="button"
      onClick={() => (ai.open ? ai.closePanel() : ai.openPanel())}
      disabled={disabled}
      title={disabled ? reason : undefined}
      aria-expanded={ai.open}
      aria-controls="cp-ai-panel"
      className="flex flex-row items-center gap-2 h-9 px-4 rounded-[8px] bg-white hover:bg-neutral-50 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <Sparkles className="w-3.5 h-3.5" style={{ stroke: "url(#ai-gradient)" }} aria-hidden />
      <svg width="0" height="0" aria-hidden>
        <linearGradient id="ai-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop stopColor="#C739FF" offset="0%" />
          <stop stopColor="#0050FF" offset="100%" />
        </linearGradient>
      </svg>
      <span
        className="text-[12px] font-semibold leading-[145%]"
        style={{ background: "linear-gradient(107.52deg, #C739FF 0.96%, #0050FF 121.91%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
      >
        Improve with AI
      </span>
    </button>
  );
}

/** suggestion choices, the preview (never applied automatically), Apply / Dismiss */
export function AiImprovePanel({ ai }: { ai: Ai }) {
  if (!ai.open) return null;
  const s = ai.current;
  return (
    <section id="cp-ai-panel" aria-label="Improve with AI" className="flex flex-col gap-3 pt-4 border-t border-[#EAEAEA] w-full animate-in fade-in duration-200">
      <div className="flex flex-row justify-between items-center w-full">
        <span className="text-[13px] font-semibold text-[#000000] leading-[145%]">Improve with AI</span>
        <span className="text-[11px] text-[#666666] leading-[145%]">AI recommends → Merchant approves</span>
      </div>

      <div role="radiogroup" aria-label="What should AI do?" className="flex flex-col gap-1 w-full">
        {AI_CHOICES.map((c) => {
          const selected = ai.choice === c.key;
          return (
            <label key={c.key} className="flex flex-row items-center gap-2.5 h-[30px] w-full cursor-pointer group">
              <input
                type="radio"
                name="cp-ai-choice"
                value={c.key}
                checked={selected}
                disabled={ai.disabled || ai.deciding}
                onChange={() => ai.select(c.key)}
                className="peer sr-only"
              />
              <span className="w-[14px] flex items-center justify-center shrink-0 peer-focus-visible:ring-2 peer-focus-visible:ring-black rounded-full" aria-hidden>
                {selected ? (
                  <span className="w-3.5 h-3.5 rounded-full bg-[#000000] flex items-center justify-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-white" />
                  </span>
                ) : (
                  <span className="w-3.5 h-3.5 rounded-full border border-[#666666]" />
                )}
              </span>
              <span className={`text-[12px] leading-[145%] ${selected ? "font-semibold text-[#000000]" : "font-normal text-[#666666] group-hover:text-[#000000]"}`}>{c.label}</span>
            </label>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 p-4 bg-[#F5F5F5] rounded-[8px] w-full" aria-busy={ai.loading}>
        <div className="text-[12px] font-semibold text-[#000000] leading-[145%]">Preview · Not applied</div>
        {ai.loading ? (
          <p role="status" className="text-[13px] text-[#666666] leading-[145%]">
            Writing a suggestion from your product facts...
          </p>
        ) : s ? (
          <>
            <p className="text-[13px] font-normal text-[#000000] leading-[145%] whitespace-pre-wrap">{s.text}</p>
            {s.unchanged ? <p className="text-[11px] text-[#666666] leading-[145%]">Nothing to improve: your text is already clear.</p> : null}
            <p className="text-[11px] font-normal text-[#666666] leading-[145%]">{s.note}</p>
            {s.explanation ? <p className="text-[11px] font-normal text-[#666666] leading-[145%]">{s.explanation}</p> : null}
          </>
        ) : !ai.problem ? (
          <p className="text-[13px] text-[#666666] leading-[145%]">Choose what AI should do.</p>
        ) : null}

        {ai.problem ? (
          <div role="alert" className="flex flex-col gap-2">
            <span className={errorClass}>{ai.problem.message}</span>
            {ai.problem.kind === "rate_limited" || ai.problem.kind === "generic" || ai.problem.kind === "expired" ? (
              <div>
                <button type="button" className={outlineButton} onClick={ai.regenerate} disabled={ai.loading}>
                  Try again
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-row items-center gap-2 pt-1">
          <button type="button" className={solidButton} onClick={() => void ai.apply()} disabled={!s || ai.loading || ai.deciding || ai.problem?.kind === "conflict"}>
            {ai.deciding ? "Applying..." : "Apply suggestion"}
          </button>
          <button type="button" className={ghostButton} onClick={() => void ai.dismiss()} disabled={ai.deciding}>
            Dismiss
          </button>
          {s && !ai.loading ? (
            <button type="button" className={ghostButton} onClick={ai.regenerate} disabled={ai.deciding}>
              Regenerate
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
