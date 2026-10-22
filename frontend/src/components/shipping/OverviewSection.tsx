import { useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, ChevronRight, ShieldCheck } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils/cn";
import { formatDateTime, formatNumber } from "@/utils/format";
import type { ExceptionCategory, ExceptionsReport, ShippingOverview } from "@/types/shipping";
import { BTN_PRIMARY } from "./ShippingDrawer";
import { sinceText } from "./shippingFormat";

type Query<T> = { data: T | undefined; isLoading: boolean; isError: boolean; error: unknown; refetch: () => unknown };

const OUTLINE_SM = "inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#EAEAEA] bg-white px-3 text-[12px] font-normal text-black transition-colors hover:bg-neutral-50";

export function SectionError({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-[#EAEAEA] bg-[#FAF9F7] px-4 py-3 text-[11px]">
      <span className="text-[#666666]">
        <span className="font-semibold text-black">{title}</span> {message}
      </span>
      <button type="button" onClick={onRetry} className="h-7 rounded-lg border border-[#EAEAEA] bg-white px-3 text-[11px] font-medium text-black hover:bg-neutral-50">
        Retry
      </button>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ pulse
function Stage({ count, label, since, comparison, note, noteTone, last }: { count: number; label: string; since: number; comparison?: ShippingOverview["comparison"]; note?: string | null; noteTone?: "warn"; last?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between pr-2", !last && "border-r border-[#EAEAEA]")}>
      <div className="space-y-0.5">
        <div className="flex items-baseline gap-2">
          <span className="text-[20px] font-semibold text-black">{formatNumber(count)}</span>
          <span className="text-[12px] font-semibold text-black">{label}</span>
        </div>
        <div className="text-[10px] text-[#666666]">{sinceText(since, comparison)}</div>
        {note && <div className={cn("text-[10px]", noteTone === "warn" ? "font-medium text-[#D97706]" : "text-[#666666]")}>{note}</div>}
      </div>
      {!last && <ArrowRight className="mr-1 hidden h-3.5 w-3.5 text-[#BDBDBD] sm:block" />}
    </div>
  );
}

export function PulseRail({ overview }: { overview: Query<ShippingOverview> }) {
  const o = overview.data;
  const p = o?.pulse;
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[16px] font-semibold text-[#000000]">Shipping Pulse</h2>
          <p className="text-[11px] text-[#666666]">Order → Shipping Decision → Carrier / Method → Label → Dispatch → Tracking</p>
        </div>
        {o && <span className="text-[10px] text-[#666666]">Updated {formatDateTime(o.generatedAt)}</span>}
      </div>
      {overview.isLoading ? (
        <div role="status" aria-label="Loading shipping pulse" className="grid grid-cols-1 gap-3 border-y border-[#EAEAEA] py-3.5 sm:grid-cols-5">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-[58px] rounded-lg" />
          ))}
        </div>
      ) : overview.isError || !p ? (
        <SectionError title="Shipping pulse could not be loaded." message={messageOf(overview.error)} onRetry={() => void overview.refetch()} />
      ) : (
        <div className="grid grid-cols-1 gap-3 border-y border-[#EAEAEA] py-3.5 sm:grid-cols-5">
          <Stage
            count={p.readyToShip.count}
            label="Ready to Ship"
            since={p.readyToShip.sinceLastSync}
            comparison={o?.comparison}
            note={p.readyToShip.needDecision > 0 ? `${p.readyToShip.needDecision} need a decision` : "No decision pending"}
            noteTone={p.readyToShip.needDecision > 0 ? "warn" : undefined}
          />
          <Stage count={p.shippingSelected.count} label="Shipping Selected" since={p.shippingSelected.sinceLastSync} comparison={o?.comparison} note={p.shippingSelected.note === "preference_confirmed" ? "Preference confirmed" : null} />
          <Stage
            count={p.labelReady.count}
            label="Label Ready"
            since={p.labelReady.sinceLastSync}
            comparison={o?.comparison}
            note={p.labelReady.labelUnavailable > 0 ? `${p.labelReady.labelUnavailable} label unavailable` : null}
            noteTone="warn"
          />
          <Stage count={p.dispatched.count} label="Dispatched" since={p.dispatched.sinceLastSync} comparison={o?.comparison} note={p.dispatched.count > 0 ? "Dispatch recorded" : null} />
          <Stage
            count={p.inTransit.count}
            label="In Transit"
            since={p.inTransit.sinceLastSync}
            comparison={o?.comparison}
            note={p.inTransit.trackingIssues > 0 ? `${p.inTransit.trackingIssues} tracking ${p.inTransit.trackingIssues === 1 ? "issue" : "issues"}` : null}
            noteTone="warn"
            last
          />
        </div>
      )}
    </div>
  );
}

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : "Please try again.");

// ------------------------------------------------------------------------------------------------ decision field
const PREFERENCE_WHY = (why: string, channel: string): string =>
  why === "default_for_channel" ? `Default for ${channel} orders` : why === "default" ? "Default shipping method" : why === "rule" ? "Matched a shipping rule" : "Fallback method";

export function DecisionField({ overview, onReview }: { overview: Query<ShippingOverview>; onReview: () => void }) {
  const rows = overview.data?.decisionField ?? [];
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[16px] font-semibold text-black">Shipping Decision Field</h2>
          <p className="text-[11px] text-[#666666]">Available methods are evaluated against your preference. A recommendation is not a confirmed selection.</p>
        </div>
        <button type="button" onClick={onReview} className={OUTLINE_SM}>
          Review decisions →
        </button>
      </div>

      <div className="overflow-hidden rounded-[10px] border border-[#EAEAEA] bg-white text-[11px]">
        <div className="grid grid-cols-12 items-center border-b border-[#EAEAEA] bg-[#FAF9F7] px-4 py-2.5 text-[10px] font-medium text-[#666666]">
          <div className="col-span-2">ORDER</div>
          <div className="col-span-2">MARKETPLACE</div>
          <div className="col-span-3">AVAILABLE METHODS</div>
          <div className="col-span-2">MERCHANT PREFERENCE</div>
          <div className="col-span-3">SELECTED SHIPPING</div>
        </div>
        {overview.isLoading ? (
          <div role="status" aria-label="Loading decision field" className="space-y-2 p-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : rows.length === 0 ? (
          <p className="px-4 py-6 text-center text-[11px] text-[#666666]">No packed orders are waiting for a shipping decision.</p>
        ) : (
          rows.map((r) => {
            const usable = r.availableMethods.filter((m) => m.available).map((m) => m.name);
            const blocked = r.availableMethods.filter((m) => !m.available);
            return (
              <div key={r.fulfillmentId} className="grid grid-cols-12 items-center border-b border-[#EAEAEA] px-4 py-3 transition-colors last:border-b-0 hover:bg-neutral-50/50">
                <div className="col-span-2 space-y-0.5">
                  <span className="text-[12px] font-semibold text-black">{r.order.number}</span>
                  <p className="text-[11px] text-[#666666]">
                    {r.itemCount} {r.itemCount === 1 ? "item" : "items"}
                    {r.weightGrams !== null ? ` · ${(r.weightGrams / 1000).toFixed(2)} kg` : ""}
                  </p>
                </div>
                <div className="col-span-2 space-y-0.5">
                  <span className="text-[12px] font-semibold text-black">{r.channel.name}</span>
                  <p className="text-[11px] text-[#666666]">{r.warehouse.name}</p>
                </div>
                <div className="col-span-3 space-y-0.5">
                  <span className="text-[11px] text-black">{usable.length ? usable.join(" / ") : "No method available"}</span>
                  {blocked.length > 0 && <p className="text-[10px] text-[#666666]">Not available: {blocked.map((m) => m.name).join(", ")}</p>}
                </div>
                <div className="col-span-2 space-y-0.5">
                  {r.merchantPreference ? (
                    <>
                      <span className="text-[12px] font-semibold text-black">{r.merchantPreference.name}</span>
                      <p className="text-[11px] text-[#666666]">{PREFERENCE_WHY(r.merchantPreference.why, r.channel.name)}</p>
                    </>
                  ) : (
                    <span className="text-[11px] text-[#666666]">No preference set</span>
                  )}
                </div>
                <div className="col-span-3">
                  {r.selected && r.selected.confirmed ? (
                    <div className="flex flex-col gap-0.5 rounded-lg border border-emerald-100 bg-[#F3FAF5] p-2">
                      <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#16A34A]">
                        <CheckCircle2 className="h-3 w-3 stroke-[2]" />
                        <span>{r.selected.name} ✓</span>
                      </div>
                      <span className="text-[11px] text-[#666666]">Selection confirmed</span>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-0.5 rounded-lg border border-amber-100 bg-[#FFFBF5] p-2">
                      <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#D97706]">
                        <AlertTriangle className="h-3 w-3 stroke-[2]" />
                        <span>{r.selected ? r.selected.name : "Needs shipping decision"}</span>
                      </div>
                      <span className="text-[11px] text-[#666666]">Awaiting confirmation</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="flex items-center gap-2 px-1 text-[11px] text-[#666666]">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0 stroke-[1.5] text-[#666666]" />
        <span>Preference → selection → confirmation is visible for every order. Manual override remains available where supported.</span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ availability comparison
const METHOD_NAME = { marketplace: "Marketplace Shipping", seller: "Seller Shipping", third_party: "Third-party shipping", label_generation: "Label generation" } as const;
const PROVIDER_NOTE = { marketplace: "Marketplace-managed", seller: "Merchant-managed", third_party: "", label_generation: "" } as const;
const AVAIL_TEXT = {
  ready: { text: "Capability verified", tone: "text-[#16A34A]" },
  requires_configuration: { text: "Requires configuration / capability verification", tone: "text-[#D97706]" },
  unavailable: { text: "No active method configured", tone: "text-black" },
  unsupported: { text: "Not supported by connector", tone: "text-black" },
} as const;
const DEFAULT_TEXT = { preferred: "Preferred", order_specific: "Order-specific", not_set: "Not set", unavailable: "Unavailable" } as const;
const OVERRIDE_TEXT = { where_supported: "Where supported", verify_capability: "Verify capability", unavailable: "Unavailable" } as const;

export function AvailabilityComparison({ overview }: { overview: Query<ShippingOverview> }) {
  const rows = overview.data?.availabilityComparison ?? [];
  return (
    <div className="space-y-2.5">
      <div>
        <h2 className="text-[16px] font-semibold text-black">Availability comparison</h2>
        <p className="text-[11px] text-[#666666]">Verify connector capabilities before enabling operational actions.</p>
      </div>
      <div className="overflow-hidden rounded-lg border border-[#EAEAEA] bg-white text-[11px]">
        <div className="grid grid-cols-12 items-center border-b border-[#EAEAEA] bg-[#F5F5F5] px-3 py-2 text-[10px] font-normal text-[#666666]">
          <div className="col-span-2">Marketplace</div>
          <div className="col-span-2">Method</div>
          <div className="col-span-3">Provider</div>
          <div className="col-span-3">Availability</div>
          <div className="col-span-1">Default</div>
          <div className="col-span-1">Override</div>
        </div>
        {overview.isLoading ? (
          <div role="status" aria-label="Loading availability" className="space-y-2 p-3">
            <Skeleton className="h-8 w-full" />
          </div>
        ) : rows.length === 0 ? (
          <p className="px-3 py-5 text-center text-[11px] text-[#666666]">Connect a marketplace to compare its shipping methods.</p>
        ) : (
          rows.map((row, idx) => (
            <div key={`${row.channel.code}-${row.method}-${row.methodId ?? idx}`} className="grid grid-cols-12 items-center border-b border-[#EAEAEA] px-3 py-2.5 last:border-b-0 hover:bg-neutral-50/50">
              <div className="col-span-2 text-black">{row.channel.name}</div>
              <div className="col-span-2 text-black">{METHOD_NAME[row.method]}</div>
              <div className="col-span-3 text-black">{PROVIDER_NOTE[row.method] || row.provider}</div>
              <div className={cn("col-span-3", AVAIL_TEXT[row.availability].tone)}>{AVAIL_TEXT[row.availability].text}</div>
              <div className="col-span-1 text-black">{DEFAULT_TEXT[row.default]}</div>
              <div className="col-span-1 text-black">{OVERRIDE_TEXT[row.override]}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ attention band + exception matrix
const PART_LABELS: Array<[keyof ShippingOverview["attention"]["parts"], string]> = [
  ["undecided", "undecided"],
  ["label", "label"],
  ["tracking", "tracking"],
  ["sync", "sync"],
  ["slaRisk", "SLA risk"],
  ["capability", "capability"],
];

export function AttentionBand({ overview, open, onToggle }: { overview: Query<ShippingOverview>; open: boolean; onToggle: () => void }) {
  const a = overview.data?.attention;
  if (!a) return null;
  const parts = PART_LABELS.filter(([k]) => a.parts[k] > 0).map(([k, l]) => `${a.parts[k]} ${l}`);
  const clear = a.total === 0;
  return (
    <div className={cn("flex flex-col justify-between gap-3 rounded-lg border-y border-[#EAEAEA] px-3.5 py-2.5 sm:flex-row sm:items-center", clear ? "bg-[#F9FEFA]" : "bg-[#FFFBF5]")}>
      <div className="flex items-center gap-2">
        <div className={cn("h-5 w-[3px] rounded-full", clear ? "bg-[#16A34A]" : "bg-[#D97706]")} />
        <span className="text-[12px] font-semibold text-black">{clear ? "No orders need shipping attention" : `${a.total} ${a.total === 1 ? "order needs" : "orders need"} shipping attention`}</span>
      </div>
      {!clear && <div className="text-[11px] text-[#666666]">{parts.join(" · ")}</div>}
      {!clear && (
        <button type="button" onClick={onToggle} className="flex cursor-pointer items-center gap-1 text-left text-[11px] font-semibold text-[#D97706] hover:underline sm:text-right">
          <span>{open ? "Hide exceptions" : "View exceptions"}</span>
          <span aria-hidden>{open ? "↑" : "→"}</span>
        </button>
      )}
    </div>
  );
}

const SEVERE: ExceptionCategory["key"][] = ["shipping_sync_failed", "connector_capability_limit"];

function Marker({ cat }: { cat: ExceptionCategory }) {
  return SEVERE.includes(cat.key) ? (
    <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-[#DC2626] text-[8px] font-bold text-[#DC2626]" aria-hidden>
      ✕
    </span>
  ) : (
    <AlertTriangle className="h-3.5 w-3.5 stroke-[2] text-[#D97706]" aria-hidden />
  );
}

interface ExceptionMatrixProps {
  attentionTotal: number;
  report: Query<ExceptionsReport>;
  exporting: boolean;
  onExport: () => void;
  onAction: (category: ExceptionCategory, orderIndex: number | null) => void;
}

/** the six exception categories with what / why / what to do; every number and order comes from the API */
export function ExceptionMatrix({ attentionTotal, report, exporting, onExport, onAction }: ExceptionMatrixProps) {
  const cats = (report.data?.categories ?? []).filter((c) => c.count > 0);
  const [expanded, setExpanded] = useState<string | null | undefined>(undefined);
  const open = expanded === undefined ? (cats[0]?.key ?? null) : expanded;
  return (
    <div id="exception-matrix-section" className="animate-in fade-in space-y-4 border-t border-[#EAEAEA] pt-4 duration-200">
      <div className="flex items-center gap-2 text-[10px]">
        <span className="font-semibold uppercase tracking-wider text-[#666666]">CONTEXTUAL STATE</span>
        <span className="h-2.5 w-[1px] bg-[#BDBDBD]" />
        <span className="text-[11px] font-semibold text-black">Shipping exception</span>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[16px] font-semibold text-black">
            {attentionTotal} {attentionTotal === 1 ? "order needs" : "orders need"} shipping attention
          </h2>
          <p className="mt-0.5 text-[11px] text-[#666666]">
            {report.data ? `${report.data.categoryCount} ${report.data.categoryCount === 1 ? "category" : "categories"}, ${report.data.totalOrders} distinct ${report.data.totalOrders === 1 ? "order" : "orders"}` : "Loading exceptions…"}
          </p>
        </div>
        <button
          type="button"
          onClick={onExport}
          disabled={exporting}
          className="inline-flex h-8 items-center rounded-lg border border-[#EAEAEA] bg-white px-3.5 text-[12px] font-medium text-black shadow-sm transition-colors hover:bg-neutral-50 disabled:opacity-60"
        >
          {exporting ? "Exporting..." : "Export exceptions"}
        </button>
      </div>

      {report.isLoading ? (
        <div role="status" aria-label="Loading exceptions" className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : report.isError ? (
        <SectionError title="Exceptions could not be loaded." message={messageOf(report.error)} onRetry={() => void report.refetch()} />
      ) : cats.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[#EAEAEA] px-4 py-6 text-center text-[11px] text-[#666666]">Nothing needs attention right now.</p>
      ) : (
        <div className="w-full text-[11px]">
          <div className="grid grid-cols-12 items-center bg-[#FAF9F7] px-4 py-2 text-[10px] font-medium text-[#666666]">
            <div className="col-span-4 pl-6 uppercase tracking-wider">EXCEPTION</div>
            <div className="col-span-1 text-center uppercase tracking-wider">COUNT</div>
            <div className="col-span-4 uppercase tracking-wider">AFFECTED ORDERS</div>
            <div className="col-span-3 text-right uppercase tracking-wider">NEXT ACTION</div>
          </div>
          {cats.map((c) => {
            const isOpen = open === c.key;
            const severe = SEVERE.includes(c.key);
            const first = c.orders[0];
            return (
              <div key={c.key} className="border-b border-[#EAEAEA]/80">
                <div
                  role="button"
                  tabIndex={0}
                  aria-expanded={isOpen}
                  onClick={() => setExpanded(isOpen ? null : c.key)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setExpanded(isOpen ? null : c.key);
                    }
                  }}
                  className="grid cursor-pointer select-none grid-cols-12 items-center px-4 py-3 hover:bg-neutral-50/50"
                >
                  <div className={cn("col-span-4 flex items-center gap-2 text-black", isOpen ? "font-semibold" : "font-normal")}>
                    {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-[#666666]" aria-hidden /> : <ChevronRight className="h-3.5 w-3.5 text-[#666666]" aria-hidden />}
                    <Marker cat={c} />
                    <span>{c.title}</span>
                  </div>
                  <div className={cn("col-span-1 text-center font-semibold", severe ? "text-[#DC2626]" : "text-[#D97706]")}>{c.count}</div>
                  <div className="col-span-4 text-[#666666]">
                    {c.orders.slice(0, 3).map((o) => o.number).join(" · ")}
                    {c.count > 3 ? ` · +${c.count - 3} more` : ""}
                  </div>
                  <div className="col-span-3 text-right">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAction(c, first ? 0 : null);
                      }}
                      className="font-medium text-black hover:underline"
                    >
                      {c.action.label} →
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <div className="space-y-3 bg-[#FAF9F7] px-10 py-5">
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
                      <div className="space-y-1 md:col-span-3">
                        <span className="text-[11px] font-semibold text-black">What happened?</span>
                        <p className="text-[11px] leading-relaxed text-[#666666]">{c.whatHappened}</p>
                        {first && <p className="mt-1 text-[11px] font-semibold text-black">Which order? {first.number}</p>}
                      </div>
                      <div className="space-y-1 md:col-span-4">
                        <span className="text-[11px] font-semibold text-black">Why?</span>
                        <p className="text-[11px] leading-relaxed text-[#666666]">{c.why}</p>
                      </div>
                      <div className="space-y-2 md:col-span-5">
                        <span className="text-[11px] font-semibold text-black">What can I do now?</span>
                        <p className="text-[11px] leading-relaxed text-[#666666]">{c.whatCanIDoNow}</p>
                        <div className="pt-1">
                          <button type="button" onClick={() => onAction(c, first ? 0 : null)} className={cn(BTN_PRIMARY, "h-8 px-4 text-[11px] font-medium")}>
                            {c.action.label}
                          </button>
                        </div>
                      </div>
                    </div>
                    {c.orders.length > 1 && (
                      <ul className="flex flex-wrap gap-x-4 gap-y-1 border-t border-[#EAEAEA] pt-3 text-[11px]">
                        {c.orders.map((o, i) => (
                          <li key={`${o.orderId}-${i}`} className="flex items-center gap-1.5">
                            <span className="font-semibold text-black">{o.number}</span>
                            <button type="button" aria-label={`${c.action.label} for ${o.number}`} onClick={() => onAction(c, i)} className="text-[#2563EB] hover:underline">
                              {c.action.label}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
