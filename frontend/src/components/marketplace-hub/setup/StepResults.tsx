import { CheckCircle2, MinusCircle, XCircle } from "lucide-react";
import { cn } from "@/utils/cn";
import type { ConnectStep } from "@/types/directory";
import { STEP_LABEL } from "./setupUtils";

/** what the connect call really did, step by step, with the messages and timings the API reported */
export function StepResults({ steps }: { steps: ConnectStep[] }) {
  return (
    <ol aria-label="Connection steps" className="space-y-2">
      {steps.map((s) => {
        const state = !s.ok ? "failed" : s.skipped ? "skipped" : "done";
        return (
          <li
            key={s.name}
            data-state={state}
            className={cn(
              "flex items-start gap-3 rounded-lg border px-3 py-2.5",
              state === "failed"
                ? "border-[#F3C7C7] bg-[#FDF3F3]"
                : "border-border bg-muted/20",
            )}
          >
            {state === "failed" ? (
              <XCircle
                className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
                aria-hidden
              />
            ) : state === "skipped" ? (
              <MinusCircle
                className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
            ) : (
              <CheckCircle2
                className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"
                aria-hidden
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-foreground">
                {STEP_LABEL[s.name]}{" "}
                <span className="font-normal text-muted-foreground">
                  {state === "failed"
                    ? "Failed"
                    : state === "skipped"
                      ? "Skipped"
                      : "Done"}
                </span>
              </p>
              {s.message && (
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {s.message}
                </p>
              )}
            </div>
            {!s.skipped && (
              <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                {s.durationMs} ms
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
