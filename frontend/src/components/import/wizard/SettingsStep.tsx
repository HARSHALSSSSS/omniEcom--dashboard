import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, SlidersHorizontal } from "lucide-react";
import type { UseQueryResult } from "@tanstack/react-query";
import { errorMessage } from "@/api/errors";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/constants/routes";
import { useAccountChoices, useUpdateSettings, useValidateImport, useWarehouseChoices } from "@/hooks/useImport";
import { useCategoryOptions } from "@/hooks/useProducts";
import type { DuplicateStrategy, CurrencyUnit, ImportOptions, ImportSession, ImportSettings } from "@/types/import";
import { Alert, LoadError, PanelSkeleton } from "../ImportStates";
import { canReview, importErrorMessage, isBusy, num } from "../importFormat";

const same = (a: ImportSettings, b: ImportSettings): boolean =>
  a.duplicateStrategy === b.duplicateStrategy &&
  a.assignAllChannels === b.assignAllChannels &&
  a.autoPublish === b.autoPublish &&
  a.warehouseId === b.warehouseId &&
  a.defaultCategoryId === b.defaultCategoryId &&
  a.currencyUnit === b.currencyUnit &&
  a.accountIds.length === b.accountIds.length &&
  a.accountIds.every((id) => b.accountIds.includes(id));

function Card({ selected, disabled, title, text, onSelect, name }: { selected: boolean; disabled: boolean; title: string; text: string; onSelect: () => void; name: string }) {
  return (
    <label className={`flex cursor-pointer gap-3 rounded-xl border p-4 transition-all ${selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border bg-card hover:bg-muted/30"} ${disabled ? "cursor-not-allowed opacity-60" : ""}`}>
      <input type="radio" name={name} className="mt-0.5 h-4 w-4 shrink-0" checked={selected} disabled={disabled} onChange={onSelect} />
      <span>
        <span className="block text-xs font-semibold text-foreground">{title}</span>
        <span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">{text}</span>
      </span>
    </label>
  );
}

const SELECT = "h-9 w-full max-w-md rounded-md border border-input bg-background px-3 text-xs disabled:opacity-60";

interface Props {
  session: ImportSession;
  options: UseQueryResult<ImportOptions>;
  canWrite: boolean;
  onBack: () => void;
  /** settings are saved (when changed) and the validation has started, or the current results were kept */
  onContinue: () => void;
}

/** Step 3: duplicates, price unit, warehouse, default category and draft listings. Saved to the import, then the validation starts. */
export function SettingsStep({ session, options, canWrite, onBack, onContinue }: Props) {
  const [draft, setDraft] = useState<ImportSettings>(session.settings);
  const [error, setError] = useState<string | null>(null);
  const save = useUpdateSettings(session.id);
  const validate = useValidateImport(session.id);
  const warehouses = useWarehouseChoices();
  const accounts = useAccountChoices(draft.autoPublish);
  const categories = useCategoryOptions();

  const busy = isBusy(session.status);
  const readOnly = !canWrite || busy;
  const dirty = !same(draft, session.settings);
  const patch = (p: Partial<ImportSettings>) => setDraft((d) => ({ ...d, ...p }));

  if (options.isLoading) return <PanelSkeleton rows={6} />;
  if (options.isError || !options.data) return <LoadError title="Import options could not be loaded." message={errorMessage(options.error)} onRetry={() => void options.refetch()} />;
  const opts = options.data;

  const activeAccounts = (accounts.data ?? []).filter((a) => a.status === "active");
  const needsAccounts = draft.autoPublish && !draft.assignAllChannels && draft.accountIds.length === 0;
  const resultsCurrent = canReview(session.status) && !dirty;
  const working = save.isPending || validate.isPending;

  const submit = async () => {
    setError(null);
    if (resultsCurrent) {
      onContinue();
      return;
    }
    try {
      if (dirty) await save.mutateAsync({ ...draft, accountIds: draft.autoPublish && !draft.assignAllChannels ? draft.accountIds : [] });
      await validate.mutateAsync();
      onContinue();
    } catch (e) {
      setError(importErrorMessage(e, "The settings could not be saved."));
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-card p-6 shadow-sm" aria-labelledby="settings-title">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <SlidersHorizontal className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h2 id="settings-title" className="text-base font-semibold text-foreground">
              Import settings
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              How rows that already exist are handled, where stock goes and what is created next to the products. {num(session.counters.total)} rows from {session.fileName}.
            </p>
          </div>
        </div>
        {busy && (
          <div className="mt-4">
            <Alert tone="info">A validation is running. The settings can be changed once it has finished.</Alert>
          </div>
        )}

        <div className="mt-6 space-y-7">
          <fieldset>
            <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">When a SKU or product code already exists</legend>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
              {opts.duplicateStrategies.map((s) => (
                <Card key={s.value} name="duplicateStrategy" selected={draft.duplicateStrategy === s.value} disabled={readOnly} title={s.label} text={s.description} onSelect={() => patch({ duplicateStrategy: s.value as DuplicateStrategy })} />
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Prices in your file are in</legend>
            <div className="mt-3 flex flex-wrap gap-4">
              {opts.currencyUnits.map((u) => (
                <label key={u.value} className="flex items-center gap-2 text-xs text-foreground">
                  <input type="radio" name="currencyUnit" className="h-4 w-4" checked={draft.currencyUnit === u.value} disabled={readOnly} onChange={() => patch({ currencyUnit: u.value as CurrencyUnit })} />
                  {u.label}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label htmlFor="import-warehouse" className="text-xs font-semibold text-foreground">
                Warehouse for the stock column
              </label>
              <select id="import-warehouse" className={`mt-2 ${SELECT}`} value={draft.warehouseId ?? ""} disabled={readOnly || warehouses.isLoading} onChange={(e) => patch({ warehouseId: e.target.value || null })}>
                <option value="">Default warehouse</option>
                {(warehouses.data ?? []).map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.code}){w.isDefault ? " - default" : ""}
                  </option>
                ))}
              </select>
              {warehouses.isError && <p className="mt-1 text-[11px] text-muted-foreground">Warehouses could not be loaded; the default warehouse is used.</p>}
            </div>
            <div>
              <label htmlFor="import-category" className="text-xs font-semibold text-foreground">
                Category for rows without a recognised one
              </label>
              <select id="import-category" className={`mt-2 ${SELECT}`} value={draft.defaultCategoryId ?? ""} disabled={readOnly || categories.isLoading} onChange={(e) => patch({ defaultCategoryId: e.target.value || null })}>
                <option value="">None (such rows are flagged for review)</option>
                {(categories.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
              {categories.isError && <p className="mt-1 text-[11px] text-muted-foreground">Categories could not be loaded.</p>}
            </div>
          </div>

          <fieldset className="rounded-xl border border-border bg-muted/20 p-4">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Marketplaces</legend>
            <label className="flex items-start gap-3 text-xs">
              <input type="checkbox" className="mt-0.5 h-4 w-4" checked={draft.autoPublish} disabled={readOnly} onChange={(e) => patch({ autoPublish: e.target.checked })} />
              <span>
                <span className="block font-semibold text-foreground">Create draft listings for the imported products</span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">Nothing is published; the drafts wait in the listings workspace for your review.</span>
              </span>
            </label>

            {draft.autoPublish && (
              <div className="mt-4 space-y-3 pl-7">
                <label className="flex items-center gap-2 text-xs text-foreground">
                  <input type="radio" name="channels" className="h-4 w-4" checked={draft.assignAllChannels} disabled={readOnly} onChange={() => patch({ assignAllChannels: true })} />
                  All connected marketplace accounts
                </label>
                <label className="flex items-center gap-2 text-xs text-foreground">
                  <input type="radio" name="channels" className="h-4 w-4" checked={!draft.assignAllChannels} disabled={readOnly} onChange={() => patch({ assignAllChannels: false })} />
                  Only the accounts I pick
                </label>
                {!draft.assignAllChannels && (
                  <div className="space-y-2 pl-6">
                    {accounts.isLoading && <p className="text-[11px] text-muted-foreground">Loading accounts…</p>}
                    {accounts.isError && <Alert tone="warning">Marketplace accounts could not be loaded: {errorMessage(accounts.error)}</Alert>}
                    {accounts.data && activeAccounts.length === 0 && (
                      <p className="text-[11px] text-muted-foreground">
                        No marketplace account is connected.{" "}
                        <Link to={ROUTES.MARKETPLACE_HUB} className="font-semibold text-primary underline">
                          Connect one
                        </Link>
                        .
                      </p>
                    )}
                    {activeAccounts.map((a) => (
                      <label key={a.id} className="flex items-center gap-2 text-xs text-foreground">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={draft.accountIds.includes(a.id)}
                          disabled={readOnly}
                          onChange={(e) => patch({ accountIds: e.target.checked ? [...draft.accountIds, a.id] : draft.accountIds.filter((id) => id !== a.id) })}
                        />
                        {a.displayName} <span className="text-muted-foreground">({a.marketplace})</span>
                      </label>
                    ))}
                    {needsAccounts && accounts.data && activeAccounts.length > 0 && <p className="text-[11px] text-amber-800">Pick at least one account, or choose all accounts.</p>}
                  </div>
                )}
              </div>
            )}
          </fieldset>
        </div>

        {error && (
          <div className="mt-5">
            <Alert>{error}</Alert>
          </div>
        )}
      </section>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack} className="gap-2" disabled={working}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <Button className="gap-2" loading={working} disabled={!canWrite || busy || needsAccounts} onClick={() => void submit()}>
          {resultsCurrent ? "Continue" : "Save and validate"} <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
