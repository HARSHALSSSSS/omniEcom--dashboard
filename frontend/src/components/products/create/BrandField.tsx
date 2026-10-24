import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { productCreationApi } from "@/api/productCreation.api";
import { errorMessage, isApiError } from "@/api/errors";
import { toast } from "@/hooks/useToast";
import { CREATION_KEYS, useBrands } from "@/hooks/useProductCreation";
import type { Brand } from "@/types/productCreation";
import { SelectField } from "./fields";
import { FieldShell } from "./fields";
import { boxClass, errorClass, linkButton, outlineButton, ghostButton } from "./fieldStyles";
import { useSubmitLock } from "@/hooks/useSubmitGuard";

const NEW = "__new_brand__";
const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

interface Props {
  value: string;
  onChange: (name: string) => void;
  /** the brand record of the saved product (to confirm it by id) */
  brandRecord: { id: string; name: string; confirmed: boolean } | null;
  disabled: boolean;
  error?: string | null;
  maxLength: number;
  /** the readiness changed (a brand was created or confirmed) */
  onChanged: () => void;
}

export function BrandField({ value, onChange, brandRecord, disabled, error, maxLength, onChanged }: Props) {
  const qc = useQueryClient();
  const brands = useBrands();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const list: Brand[] = brands.data ?? [];
  const match = value ? list.find((b) => norm(b.name) === norm(value)) : undefined;
  const record = match ?? (brandRecord && norm(brandRecord.name) === norm(value) ? { ...brandRecord } : undefined);
  const known = !!match;
  const needsConfirm = !!value && !!record && !record.confirmed;

  const confirm = async () => {
    if (!record) return;
    setBusy(true);
    setProblem(null);
    try {
      await productCreationApi.confirmBrand(record.id);
      await qc.invalidateQueries({ queryKey: CREATION_KEYS.brands });
      onChanged();
      toast({ title: "Brand confirmed", description: `${record.name} is confirmed.`, variant: "success" });
    } catch (e) {
      setProblem(errorMessage(e, "Could not confirm the brand."));
    } finally {
      setBusy(false);
    }
  };

  const acquire = useSubmitLock();
  const create = async () => {
    const name = draft.trim().replace(/\s+/g, " ");
    if (!name) {
      setProblem("Enter a brand name.");
      return;
    }
    const release = acquire();
    if (!release) return;
    setBusy(true);
    setProblem(null);
    try {
      let created: Brand;
      try {
        created = await productCreationApi.createBrand(name);
      } catch (e) {
        // a brand with this name exists already (ignoring case): use it
        const existing = isApiError(e) && e.rule === "duplicate_brand" ? (e.details?.existing as Brand | undefined) : undefined;
        if (!existing) throw e;
        created = existing;
      }
      await qc.invalidateQueries({ queryKey: CREATION_KEYS.brands });
      onChange(created.name);
      setAdding(false);
      setDraft("");
      onChanged();
    } catch (e) {
      setProblem(errorMessage(e, "Could not add the brand."));
    } finally {
      setBusy(false);
      release();
    }
  };

  const aside = needsConfirm ? (
    <button type="button" className={linkButton} onClick={() => void confirm()} disabled={busy || disabled} aria-label={`Confirm brand ${record?.name ?? ""}`}>
      {busy ? "Confirming..." : "Confirm brand"}
    </button>
  ) : value && record?.confirmed ? (
    <span className="text-[11px] text-[#666666]">Confirmed</span>
  ) : null;

  return (
    <div className="flex flex-col gap-1.5 flex-1">
      <SelectField
        id="cp-brand"
        label="Brand"
        aside={aside}
        error={error}
        empty={!value}
        disabled={disabled}
        value={adding ? NEW : value}
        onChange={(e) => {
          if (e.target.value === NEW) {
            setAdding(true);
            setProblem(null);
          } else {
            setAdding(false);
            onChange(e.target.value);
          }
        }}
        hint={value && !known && !record ? "This brand will be added to your brand list. Confirm it once it is saved." : undefined}
      >
        <option value="">Select brand</option>
        {value && !known ? <option value={value}>{value}</option> : null}
        {list.map((b) => (
          <option key={b.id} value={b.name}>
            {b.confirmed ? b.name : `${b.name} (unconfirmed)`}
          </option>
        ))}
        {!disabled ? <option value={NEW}>+ Add new brand...</option> : null}
      </SelectField>
      {adding ? (
        <FieldShell id="cp-new-brand" label="New brand name">
          <div className="flex flex-row items-center gap-2">
            <div className={boxClass(null, "flex-1")}>
              <input
                id="cp-new-brand"
                type="text"
                value={draft}
                maxLength={maxLength}
                autoFocus
                placeholder="e.g. Urban Carry"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void create();
                  }
                }}
                className="w-full text-[13px] text-[#000000] outline-none bg-transparent placeholder:text-[#666666]"
              />
            </div>
            <button type="button" className={outlineButton} disabled={busy} onClick={() => void create()}>
              {busy ? "Adding..." : "Add brand"}
            </button>
            <button
              type="button"
              className={ghostButton}
              onClick={() => {
                setAdding(false);
                setProblem(null);
              }}
            >
              Cancel
            </button>
          </div>
        </FieldShell>
      ) : null}
      {problem ? (
        <span role="alert" className={errorClass}>
          {problem}
        </span>
      ) : null}
    </div>
  );
}
