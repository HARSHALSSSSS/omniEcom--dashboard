import type { ReactNode } from "react";
import { Layers, Store, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import type { HubAccountCard, HubCategory } from "@/types/hub";
import { displayStatus, type Tone } from "./hubFormat";

const TONE: Record<Tone, { pill: string; dot: string; bar: string }> = {
  good: { pill: "bg-green-50 text-green-700", dot: "bg-green-500", bar: "bg-emerald-500" },
  warn: { pill: "bg-amber-50 text-amber-700", dot: "bg-amber-500", bar: "bg-amber-500" },
  bad: { pill: "bg-red-50 text-red-700", dot: "bg-red-500", bar: "bg-red-500" },
  info: { pill: "bg-blue-50 text-blue-600", dot: "bg-blue-400", bar: "bg-blue-500" },
  neutral: { pill: "bg-neutral-100 text-neutral-600", dot: "bg-neutral-400", bar: "bg-neutral-400" },
};

export function Pill({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex select-none items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", TONE[tone].pill, className)}>
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", TONE[tone].dot)} aria-hidden />
      {children}
    </span>
  );
}

export function HubStatusPill({ account }: { account: Pick<HubAccountCard, "status" | "accountStatus" | "syncState"> }) {
  const s = displayStatus(account);
  return <Pill tone={s.tone}>{s.label}</Pill>;
}

/** a real bar: `value` is 0..100 */
export function Bar({ value, tone, label }: { value: number; tone: Tone; label: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div className={cn("h-full rounded-full transition-all", TONE[tone].bar)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function ChannelIcon({ category }: { category: HubCategory }) {
  const cls = "h-6 w-6";
  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/30" aria-hidden>
      {category === "storefront" ? <Layers className={cn(cls, "text-[#1D4ED8]")} /> : category === "shipping" ? <Truck className={cn(cls, "text-purple-600")} /> : <Store className={cn(cls, "text-amber-600")} />}
    </div>
  );
}

export function InlineError({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
      {message}
    </p>
  );
}

export function StateBox({ title, description, children, role }: { title: string; description: string; children?: ReactNode; role?: "alert" }) {
  return (
    <div role={role} className="flex min-h-[260px] flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card px-6 text-center">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <p className="max-w-[520px] text-xs text-muted-foreground">{description}</p>
      {children && <div className="flex items-center gap-2 pt-2">{children}</div>}
    </div>
  );
}

export function LoadError({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) {
  return (
    <StateBox role="alert" title={title} description={message}>
      <Button variant="outline" size="sm" className="text-xs" onClick={onRetry}>
        Retry
      </Button>
    </StateBox>
  );
}
