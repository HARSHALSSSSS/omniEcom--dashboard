import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { TEXT_MAX, TEXT_MIN } from "./assistantFormat";

interface ComposerProps {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  sending: boolean;
  /** why typing is off (archived, full): shown instead of the input hint */
  lockedReason?: string | null;
}

export function Composer({ value, onChange, onSend, sending, lockedReason }: ComposerProps) {
  const length = value.trim().length;
  const tooShort = length > 0 && length < TEXT_MIN;
  const tooLong = value.length > TEXT_MAX;
  const canSend = !lockedReason && !sending && length >= TEXT_MIN && !tooLong;
  return (
    <div className="border-t border-border bg-card p-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canSend) onSend();
        }}
        className="flex items-end gap-3"
      >
        <label htmlFor="assistant-input" className="sr-only">
          Ask the assistant
        </label>
        <Textarea
          id="assistant-input"
          value={value}
          rows={2}
          disabled={!!lockedReason || sending}
          error={tooLong}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (canSend) onSend();
            }
          }}
          placeholder="Ask about stock, sales, returns, profitability or what needs attention"
          className="min-h-[44px] resize-none text-[13px]"
        />
        <Button type="submit" size="icon" aria-label="Send message" disabled={!canSend} loading={sending}>
          {!sending && <Send className="h-4 w-4" aria-hidden />}
        </Button>
      </form>
      <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
        <span role={lockedReason ? "status" : undefined}>
          {lockedReason ?? "Answers come from your own data. The assistant never changes anything by itself."}
        </span>
        <span className={tooLong || tooShort ? "text-destructive" : undefined}>
          {tooShort ? `At least ${TEXT_MIN} characters` : `${value.length}/${TEXT_MAX}`}
        </span>
      </div>
    </div>
  );
}
