import { Link } from "react-router-dom";
import { errorMessage } from "@/api/errors";
import { ROUTES } from "@/constants/routes";
import { useAccountChoices, useWarehouseChoices } from "@/hooks/useImport";
import { useCategoryOptions } from "@/hooks/useProducts";
import type { CurrencyUnit, ImportOptions } from "@/types/import";
import { Alert } from "../ImportStates";
import type { SettingsDraft } from "./settingsDraft";

const SELECT =
  "h-9 w-full max-w-md rounded-[5px] border border-[#E3E3E3] dark:border-border bg-white dark:bg-card px-3 text-[13px] text-[#000000] dark:text-white disabled:opacity-60";
const LABEL = "text-[13px] leading-[20px] font-medium text-[#000000] dark:text-white";
const TEXT = "text-[13px] leading-[20px] font-normal text-[#000000] dark:text-white";

interface Props {
  draft: SettingsDraft;
  options: ImportOptions;
  disabled: boolean;
  onChange: (patch: Partial<SettingsDraft>) => void;
}

/** the settings the API has besides the design's switches: price unit, warehouse, default category and draft listings */
export function SettingsExtras({ draft, options, disabled, onChange }: Props) {
  const warehouses = useWarehouseChoices();
  const accounts = useAccountChoices(draft.autoPublish);
  const categories = useCategoryOptions();
  const activeAccounts = (accounts.data ?? []).filter((a) => a.status === "active");
  const needsAccounts = draft.autoPublish && !draft.assignAllChannels && draft.accountIds.length === 0;

  return (
    <div className="border-t border-[#E3E3E3] dark:border-border pt-5 space-y-5">
      <fieldset>
        <legend className="text-[14px] leading-[21px] font-semibold text-[#000000] dark:text-white mb-3">Prices in your file are in</legend>
        <div className="flex flex-wrap gap-4">
          {options.currencyUnits.map((u) => (
            <label key={u.value} className={`flex items-center gap-2 ${TEXT}`}>
              <input type="radio" name="currencyUnit" className="h-4 w-4" checked={draft.currencyUnit === u.value} disabled={disabled} onChange={() => onChange({ currencyUnit: u.value as CurrencyUnit })} />
              {u.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <label htmlFor="import-warehouse" className={LABEL}>
            Warehouse for the stock column
          </label>
          <select id="import-warehouse" className={`mt-2 ${SELECT}`} value={draft.warehouseId ?? ""} disabled={disabled || warehouses.isLoading} onChange={(e) => onChange({ warehouseId: e.target.value || null })}>
            <option value="">Default warehouse</option>
            {(warehouses.data ?? []).map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} ({w.code}){w.isDefault ? " - default" : ""}
              </option>
            ))}
          </select>
          {warehouses.isError && <p className="mt-1 text-[11px] text-[#666666]">Warehouses could not be loaded; the default warehouse is used.</p>}
        </div>
        <div>
          <label htmlFor="import-category" className={LABEL}>
            Category for rows without a recognised one
          </label>
          <select id="import-category" className={`mt-2 ${SELECT}`} value={draft.defaultCategoryId ?? ""} disabled={disabled || categories.isLoading} onChange={(e) => onChange({ defaultCategoryId: e.target.value || null })}>
            <option value="">None (such rows are flagged for review)</option>
            {(categories.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          {categories.isError && <p className="mt-1 text-[11px] text-[#666666]">Categories could not be loaded.</p>}
        </div>
      </div>

      <fieldset className="space-y-3">
        <legend className="text-[14px] leading-[21px] font-semibold text-[#000000] dark:text-white mb-3">Marketplaces</legend>
        <label className={`flex items-start gap-3 ${TEXT}`}>
          <input type="checkbox" className="mt-0.5 h-4 w-4" checked={draft.autoPublish} disabled={disabled} onChange={(e) => onChange({ autoPublish: e.target.checked })} />
          <span>
            <span className="block">Create draft listings for the imported products</span>
            <span className="block text-[11px] text-[#666666]">Nothing is published; the drafts wait in the listings workspace for your review.</span>
          </span>
        </label>

        {draft.autoPublish && (
          <div className="space-y-3 pl-7">
            <label className={`flex items-center gap-2 ${TEXT}`}>
              <input type="radio" name="channels" className="h-4 w-4" checked={draft.assignAllChannels} disabled={disabled} onChange={() => onChange({ assignAllChannels: true })} />
              All connected marketplace accounts
            </label>
            <label className={`flex items-center gap-2 ${TEXT}`}>
              <input type="radio" name="channels" className="h-4 w-4" checked={!draft.assignAllChannels} disabled={disabled} onChange={() => onChange({ assignAllChannels: false })} />
              Only the accounts I pick
            </label>
            {!draft.assignAllChannels && (
              <div className="space-y-2 pl-6">
                {accounts.isLoading && <p className="text-[11px] text-[#666666]">Loading accounts…</p>}
                {accounts.isError && <Alert tone="warning">Marketplace accounts could not be loaded: {errorMessage(accounts.error)}</Alert>}
                {accounts.data && activeAccounts.length === 0 && (
                  <p className="text-[11px] text-[#666666]">
                    No marketplace account is connected.{" "}
                    <Link to={ROUTES.MARKETPLACE_HUB} className="font-semibold underline">
                      Connect one
                    </Link>
                    .
                  </p>
                )}
                {activeAccounts.map((a) => (
                  <label key={a.id} className={`flex items-center gap-2 ${TEXT}`}>
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={draft.accountIds.includes(a.id)}
                      disabled={disabled}
                      onChange={(e) => onChange({ accountIds: e.target.checked ? [...draft.accountIds, a.id] : draft.accountIds.filter((id) => id !== a.id) })}
                    />
                    {a.displayName} <span className="text-[#666666]">({a.marketplace})</span>
                  </label>
                ))}
                {needsAccounts && accounts.data && activeAccounts.length > 0 && <p className="text-[11px] text-amber-800">Pick at least one account, or choose all accounts.</p>}
              </div>
            )}
          </div>
        )}
      </fieldset>
    </div>
  );
}
