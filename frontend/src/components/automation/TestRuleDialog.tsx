import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/api/errors";
import { useTestRule } from "@/hooks/useAutomation";
import { ACTION_LABELS, actionLabel, conditionLines, triggerLabel } from "./autoFormat";
import { KeyValues, Line } from "./AutoUi";
import { samplePayload } from "./ruleForm";
import type { AutomationCatalog, AutomationRule, DryRunResult } from "@/types/automation";

interface Props {
  rule: AutomationRule | null;
  catalog: AutomationCatalog | undefined;
  onClose: () => void;
}

/** dry run: paste an event payload and see whether the rule would fire and what it would do. Nothing changes. */
export function TestRuleDialog({ rule, catalog, onClose }: Props) {
  const test = useTestRule();
  const [text, setText] = useState("{}");
  const [problem, setProblem] = useState<string | null>(null);
  const [result, setResult] = useState<DryRunResult | null>(null);

  useEffect(() => {
    if (!rule) return;
    setText(JSON.stringify(samplePayload(catalog, rule.triggerEvent), null, 2));
    setProblem(null);
    setResult(null);
    test.reset();
    // only when another rule is opened
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rule?.id]);

  const run = () => {
    if (!rule) return;
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      return setProblem("The payload is not valid JSON.");
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return setProblem("The payload must be a JSON object, e.g. { \"available\": 3 }.");
    setProblem(null);
    test.mutate(
      { id: rule.id, payload: payload as Record<string, unknown> },
      { onSuccess: setResult, onError: (e) => setProblem(errorMessage(e)) },
    );
  };

  const lines = rule ? conditionLines(rule) : [];
  return (
    <Dialog open={rule !== null} onOpenChange={(o) => !o && !test.isPending && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto w-[95vw] sm:w-full p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Test rule{rule ? `: ${rule.name}` : ""}</DialogTitle>
          <DialogDescription>A dry run. Enter what the event would carry and see whether the rule would fire. Nothing is created or changed.</DialogDescription>
        </DialogHeader>
        {rule && (
          <div className="space-y-4 text-xs">
            <div className="space-y-2">
              <Line label="Trigger">{triggerLabel(rule.triggerEvent, catalog)}</Line>
              <Line label="Conditions">{lines.length === 0 ? "None (matches every event)" : <span>{lines.join(rule.conditions.combinator === "any" ? "; or " : "; and ")}</span>}</Line>
              <Line label="Action">{ACTION_LABELS[rule.action.type] ?? actionLabel(rule.action.type)}</Line>
            </div>

            <div className="space-y-1">
              <label htmlFor="test-payload" className="block text-[11px] font-medium text-muted-foreground">
                Event payload (JSON)
              </label>
              <Textarea id="test-payload" rows={8} className="font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
              <p className="text-[11px] text-muted-foreground">Top-level values, and one level of nested ones as a.b, become the facts the conditions see.</p>
            </div>

            {problem && (
              <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-destructive">
                {problem}
              </p>
            )}

            {result && (
              <div role="status" className="space-y-3 rounded-xl border border-border bg-muted/30 p-3">
                <p className={`text-sm font-semibold ${result.matched ? "text-emerald-700" : "text-foreground"}`}>{result.matched ? "The rule would fire." : "The rule would not fire for this event."}</p>
                {result.wouldDo && (
                  <div className="space-y-1">
                    <p className="font-medium text-foreground">
                      It would: {actionLabel(result.wouldDo.action)} {result.wouldDo.needsApproval ? "(after a person approves)" : "(automatically)"}
                    </p>
                    <KeyValues values={result.wouldDo.params} empty="No parameters" />
                  </div>
                )}
                <div className="space-y-1">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Facts the conditions saw</p>
                  <KeyValues values={result.facts} />
                </div>
              </div>
            )}
          </div>
        )}
        <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button type="button" variant="outline" className="h-10 sm:h-9 cursor-pointer" disabled={test.isPending} onClick={onClose}>
            Close
          </Button>
          <Button type="button" className="h-10 sm:h-9 cursor-pointer" loading={test.isPending} onClick={run}>
            Run test
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
