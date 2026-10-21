import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { client } from "@/api/client";
import { cn } from "@/utils/cn";
import { HEALTH_LABEL, TONE_OF_HEALTH } from "./inventoryLabels";
import type { StockHealth, StockStatus, Tone } from "@/types/inventory";

const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-neutral-100 text-neutral-700",
  good: "bg-green-50 text-green-700",
  warn: "bg-amber-50 text-amber-700",
  bad: "bg-red-50 text-red-700",
  info: "bg-blue-50 text-blue-700",
};
const DOT_CLASS: Record<Tone, string> = { neutral: "bg-neutral-400", good: "bg-green-500", warn: "bg-amber-500", bad: "bg-red-500", info: "bg-blue-500" };

export function Pill({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium", TONE_CLASS[tone], className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", DOT_CLASS[tone])} aria-hidden />
      {children}
    </span>
  );
}

export function HealthBadge({ health, stockStatus }: { health: StockHealth; stockStatus?: StockStatus }) {
  return (
    <div className="flex flex-col items-start gap-1">
      <Pill tone={TONE_OF_HEALTH[health]}>{HEALTH_LABEL[health]}</Pill>
      {stockStatus === "excess" && <Pill tone="info">Excess</Pill>}
    </div>
  );
}

const initialsOf = (title: string) =>
  title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

/**
 * Product images are served through the API with a bearer token, so a plain <img src> cannot load them. Same approach as
 * the Products list (and the same cache entry): fetched through the API client, shown from an object URL.
 */
export function InventoryThumb({ url, title, size = 40 }: { url: string | null; title: string; size?: number }) {
  const { data: blob, isError } = useQuery({
    queryKey: ["products", "thumbnail", url],
    queryFn: async () => (await client.get<Blob>((url ?? "").replace(/^\/api\/v1/, ""), { responseType: "blob" })).data,
    enabled: Boolean(url),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      setSrc(null);
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    setSrc(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);

  const style = { width: size, height: size };
  if (src) return <img src={src} alt={title} style={style} className="shrink-0 rounded-md border border-border bg-muted object-cover" />;
  const loading = Boolean(url) && !isError;
  return (
    <div
      style={style}
      role="img"
      aria-label={loading ? "Loading image" : "No image"}
      className={cn("flex shrink-0 items-center justify-center rounded-md border border-border bg-muted text-[11px] font-medium text-muted-foreground", loading && "animate-pulse")}
    >
      {!loading && initialsOf(title)}
    </div>
  );
}

export function InlineError({ message, id }: { message: string; id?: string }) {
  return (
    <p id={id} role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
      {message}
    </p>
  );
}
