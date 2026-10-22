import { useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, Plus } from "lucide-react";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/api/errors";
import { useDeleteRule, useReorderRules, useRuleAction, useShippingRules } from "@/hooks/useShipping";
import { toast } from "@/hooks/useToast";
import { cn } from "@/utils/cn";
import { formatCurrency, formatNumber } from "@/utils/format";
import type { RuleCondition, ShippingRule } from "@/types/shipping";
import { NO_CONFIGURE_REASON, dateOrDash, ruleFieldLabel, ruleOpSymbol } from "./shippingFormat";
import { Notice } from "./shippingUi";

function valueText(c: RuleCondition): string {
  const v = c.value;
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "number") return c.field === "orderValueMinor" ? formatCurrency(v) : c.field === "weightGrams" ? `${(v / 1000).toFixed(2)} kg` : String(v);
  return v === null || v === undefined ? "—" : String(v);
}

interface RulesSectionProps {
  canRead: boolean;
  canConfigure: boolean;
  embedded: boolean;
  onCreate: () => void;
  onEdit: (rule: ShippingRule) => void;
}

/** IF / AND / THEN rules that say which shipping method is preferred; the first matching rule by priority decides */
export function RulesSection({ canRead, canConfigure, embedded, onCreate, onEdit }: RulesSectionProps) {
  const rules = useShippingRules(canRead);
  const action = useRuleAction();
  const remove = useDeleteRule();
  const reorder = useReorderRules();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ShippingRule | null>(null);

  const items = rules.data?.items ?? [];
  const selected = items.find((r) => r.id === selectedId) ?? items[0];
  const off = !canConfigure;
  const busy = action.isPending || remove.isPending || reorder.isPending;
  const link = "hover:underline disabled:cursor-not-allowed disabled:opacity-40";

  const toggle = (r: ShippingRule) =>
    action.mutate(
      { id: r.id, action: r.status === "enabled" ? "disable" : "enable" },
      {
        onSuccess: () => toast({ title: r.status === "enabled" ? "Rule disabled" : "Rule enabled", variant: "success" }),
        onError: (e) => toast({ title: "The rule could not be changed", description: errorMessage(e), variant: "destructive" }),
      },
    );
  const duplicate = (r: ShippingRule) =>
    action.mutate(
      { id: r.id, action: "duplicate" },
      {
        onSuccess: (copy) => {
          setSelectedId(copy.id);
          toast({ title: "Rule duplicated", description: "The copy is disabled and evaluated last.", variant: "success" });
        },
        onError: (e) => toast({ title: "The rule could not be duplicated", description: errorMessage(e), variant: "destructive" }),
      },
    );
  const move = (r: ShippingRule, by: -1 | 1) => {
    const ids = items.map((x) => x.id);
    const i = ids.indexOf(r.id);
    const j = i + by;
    if (i < 0 || j < 0 || j >= ids.length) return;
    const other = ids[j];
    if (other === undefined) return;
    ids[j] = r.id;
    ids[i] = other;
    reorder.mutate(ids, { onError: (e) => toast({ title: "The order could not be changed", description: errorMessage(e), variant: "destructive" }) });
  };
  const onDelete = () => {
    if (!confirmDelete) return;
    remove.mutate(confirmDelete.id, {
      onSuccess: () => {
        setConfirmDelete(null);
        setSelectedId(null);
        toast({ title: "Rule deleted", variant: "success" });
      },
      onError: (e) => {
        setConfirmDelete(null);
        toast({ title: "The rule could not be deleted", description: errorMessage(e), variant: "destructive" });
      },
    });
  };

  return (
    <section className="space-y-4 border-t border-[#EAEAEA] pt-4" aria-label="Shipping rules">
      {embedded && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-[#666666]">ALTERNATE VIEW</span>
          <span className="h-2.5 w-[1px] bg-[#BDBDBD]" />
          <span className="text-[11px] font-semibold text-black">Rules</span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[16px] font-semibold text-black">Shipping Rules</h2>
          <p className="text-[11px] text-[#666666]">Control which shipping method is preferred for different operating conditions.</p>
        </div>
        <button
          type="button"
          onClick={onCreate}
          disabled={off}
          title={off ? NO_CONFIGURE_REASON : undefined}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-black bg-black px-3 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Plus className="h-3.5 w-3.5 stroke-[1.5] text-white" />
          <span>Create Shipping Rule</span>
        </button>
      </div>

      {!canRead ? (
        <Notice title="Your role cannot view shipping rules." />
      ) : rules.isLoading ? (
        <div role="status" aria-label="Loading shipping rules" className="space-y-2">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : rules.isError ? (
        <Notice role="alert" title="Shipping rules could not be loaded.">
          <p>{errorMessage(rules.error)}</p>
          <button type="button" onClick={() => void rules.refetch()} className="h-8 rounded-lg border border-[#EAEAEA] bg-white px-3 text-[12px] font-medium text-black hover:bg-neutral-50">
            Retry
          </button>
        </Notice>
      ) : !selected ? (
        <Notice title="No shipping rule yet.">
          <p>Without a rule, orders follow your default shipping preference. A rule prefers a method when its conditions match.</p>
        </Notice>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 border-y border-[#EAEAEA] py-4 text-[11px] md:grid-cols-12">
            <div className="space-y-2 md:col-span-7">
              <span className="text-[12px] font-semibold text-black">{selected.name}</span>
              <div className="space-y-1.5 pt-1">
                {selected.conditions.map((c, i) => (
                  <div key={`${c.field}-${i}`} className="flex items-center gap-3">
                    <span className="flex h-6 w-12 items-center justify-center rounded bg-[#F5F5F5] text-[10px] font-semibold uppercase text-[#666666]">{c.combinator}</span>
                    <span className="text-[12px] text-black">
                      {ruleFieldLabel(c.field)} {ruleOpSymbol(c.op)} {valueText(c)}
                    </span>
                  </div>
                ))}
                <div className="flex items-center gap-3">
                  <span className="flex h-6 w-12 items-center justify-center rounded bg-black text-[10px] font-semibold text-white">THEN</span>
                  <span className="text-[12px] font-semibold text-black">Prefer = {selected.then.prefer.label}</span>
                </div>
              </div>
            </div>

            <div className="space-y-2 md:col-span-5 md:border-l md:border-[#EAEAEA] md:pl-6">
              {selected.status === "enabled" ? (
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#16A34A]">
                  <CheckCircle2 className="h-3 w-3 stroke-[2]" aria-hidden />
                  <span>Enabled</span>
                </div>
              ) : (
                <div className="text-[11px] font-medium text-[#666666]">Disabled</div>
              )}
              <div className="text-[12px] font-semibold text-black">
                Priority {selected.priority} · {selected.ordersAffected === null ? "—" : formatNumber(selected.ordersAffected)} {selected.ordersAffected === 1 ? "order" : "orders"} affected
              </div>
              <div className="text-[11px] text-[#666666]">Last updated {dateOrDash(selected.lastUpdatedAt)}</div>
              <p className="text-[10px] leading-relaxed text-[#666666]">Orders affected counts the open orders that match this rule right now.</p>

              <div className="flex flex-wrap items-center gap-2 pt-2">
                {(
                  [
                    ["Edit", () => onEdit(selected)],
                    ["Duplicate", () => duplicate(selected)],
                    [selected.status === "enabled" ? "Disable" : "Enable", () => toggle(selected)],
                  ] as const
                ).map(([label, fn]) => (
                  <button key={label} type="button" disabled={off || busy} title={off ? NO_CONFIGURE_REASON : undefined} onClick={fn} className="h-8 rounded-lg border border-[#EAEAEA] bg-white px-3 text-[12px] text-black transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50">
                    {label}
                  </button>
                ))}
                <button type="button" disabled={off || busy} title={off ? NO_CONFIGURE_REASON : undefined} onClick={() => setConfirmDelete(selected)} className="h-8 rounded-lg border border-[#EAEAEA] bg-white px-3 text-[12px] text-[#DC2626] transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50">
                  Delete
                </button>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-[#EAEAEA] bg-white text-[11px]">
            <div className="grid grid-cols-12 border-b border-[#EAEAEA] bg-[#F5F5F5] px-3 py-2 text-[10px] font-normal text-[#666666]">
              <div className="col-span-4">Rule</div>
              <div className="col-span-1">Status</div>
              <div className="col-span-1">Priority</div>
              <div className="col-span-2">Last updated</div>
              <div className="col-span-2">Orders affected</div>
              <div className="col-span-2 text-right">Action</div>
            </div>
            {items.map((r) => (
              <div key={r.id} className={cn("grid grid-cols-12 items-center px-3 py-2.5 text-black hover:bg-neutral-50/50", r.id === selected.id && "bg-neutral-50")}>
                <div className="col-span-4">
                  <button type="button" aria-pressed={r.id === selected.id} onClick={() => setSelectedId(r.id)} className="text-left font-medium hover:underline">
                    {r.name}
                  </button>
                </div>
                <div className="col-span-1 text-[#666666]">{r.status === "enabled" ? "Enabled" : "Disabled"}</div>
                <div className="col-span-1 flex items-center gap-1">
                  <span>{r.priority}</span>
                  <button type="button" aria-label={`Move ${r.name} up`} disabled={off || busy || r.priority === 1} onClick={() => move(r, -1)} className="rounded p-0.5 text-[#666666] hover:bg-neutral-100 disabled:opacity-30">
                    <ChevronUp className="h-3 w-3" />
                  </button>
                  <button type="button" aria-label={`Move ${r.name} down`} disabled={off || busy || r.priority === items.length} onClick={() => move(r, 1)} className="rounded p-0.5 text-[#666666] hover:bg-neutral-100 disabled:opacity-30">
                    <ChevronDown className="h-3 w-3" />
                  </button>
                </div>
                <div className="col-span-2 text-[#666666]">{dateOrDash(r.lastUpdatedAt)}</div>
                <div className="col-span-2 text-[#666666]">{r.ordersAffected === null ? "—" : formatNumber(r.ordersAffected)}</div>
                <div className="col-span-2 space-x-2 text-right">
                  <button type="button" aria-label={`Edit ${r.name}`} disabled={off || busy} onClick={() => onEdit(r)} className={link}>
                    Edit
                  </button>
                  <span>·</span>
                  <button type="button" aria-label={`Duplicate ${r.name}`} disabled={off || busy} onClick={() => duplicate(r)} className={link}>
                    Duplicate
                  </button>
                  <span>·</span>
                  <button type="button" aria-label={`${r.status === "enabled" ? "Disable" : "Enable"} ${r.name}`} disabled={off || busy} onClick={() => toggle(r)} className={cn(link, r.status === "enabled" ? "text-black" : "font-medium text-emerald-700")}>
                    {r.status === "enabled" ? "Disable" : "Enable"}
                  </button>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-[#666666]">Priority 1 is evaluated first. {rules.data ? `${rules.data.total} of ${rules.data.max} rules used.` : ""}</p>
        </>
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title="Delete this rule?"
        description={`"${confirmDelete?.name ?? ""}" stops influencing shipping recommendations. Orders already confirmed keep their method.`}
        confirmText="Delete rule"
        cancelText="Keep rule"
        variant="destructive"
        loading={remove.isPending}
        onConfirm={onDelete}
      />
    </section>
  );
}
