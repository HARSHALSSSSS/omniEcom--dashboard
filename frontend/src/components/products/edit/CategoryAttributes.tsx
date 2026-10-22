import type { EditController } from "@/hooks/useProductEdit";
import type { CategoryAttributeDef, EditorView } from "@/types/productEdit";
import { cn } from "@/utils/cn";
import { DesignSelect } from "./DesignSelect";
import { FieldShell } from "./FieldShell";
import { INPUT_CLASS, boxClass } from "./fieldStyles";
import type { FormValues } from "./form";

const YES_NO = [
  { value: "", label: "Not supplied" },
  { value: "true", label: "Yes" },
  { value: "false", label: "No" },
];

const optionsOf = (def: CategoryAttributeDef) => [{ value: "", label: "Not supplied" }, ...def.options.map((o) => ({ value: o.value, label: o.label }))];

/** how a stored attribute value reads in "Previously: ..." */
function readable(def: CategoryAttributeDef, text: string): string {
  const t = text.trim();
  if (t === "") return "(empty)";
  if (def.dataType === "boolean") return t === "true" ? "Yes" : "No";
  if (def.dataType === "enum") return def.options.find((o) => o.value === t)?.label ?? t;
  return def.unit ? `${t} ${def.unit}` : t;
}

/** the attributes of the chosen category as inputs (the design's category-specific "Additional attributes" grid) */
export function CategoryAttributeFields({ ctl }: { ctl: EditController }) {
  const { values, base, attrDefs, canWrite } = ctl;
  if (!values || !base) return null;
  if (ctl.attrDefsLoading) {
    return (
      <p role="status" className="text-[11px] font-normal text-[#666666] leading-[145%]">
        Loading the attributes of this category...
      </p>
    );
  }
  if (attrDefs.length === 0) {
    return ctl.attrDefsError ? (
      <p className="text-[11px] font-normal text-[#666666] leading-[145%]">The attributes of this category could not be loaded.</p>
    ) : null;
  }
  const ro = !canWrite;
  const error = ctl.fieldErrors.categoryAttributes;
  return (
    <div className="flex flex-col gap-3 w-full" role="group" aria-label="Category attributes">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 w-full">
        {attrDefs.map((def) => {
          const id = `field-attr-${def.attributeId}`;
          const value = values.categoryAttrs[def.attributeId] ?? "";
          const was = base.categoryAttrs[def.attributeId] ?? "";
          const modified = value.trim() !== was.trim();
          const hint = def.isRequired && value.trim() === "" ? "Required for this category" : undefined;
          let control;
          if (def.dataType === "boolean" || def.dataType === "enum") {
            control = (
              <DesignSelect id={id} value={value} options={def.dataType === "boolean" ? YES_NO : optionsOf(def)} disabled={ro} modified={modified} error={!!error} onChange={(v) => ctl.setAttr(def.attributeId, v)} />
            );
          } else {
            control = (
              <div className={cn(boxClass({ modified, error: !!error, disabled: ro }), "gap-2")}>
                <input
                  id={id}
                  type={def.dataType === "date" ? "date" : "text"}
                  inputMode={def.dataType === "number" ? "decimal" : undefined}
                  value={value}
                  disabled={ro}
                  autoComplete="off"
                  placeholder="Not supplied"
                  maxLength={def.dataType === "text" ? 2000 : undefined}
                  className={INPUT_CLASS}
                  onChange={(e) => ctl.setAttr(def.attributeId, e.target.value)}
                />
                {def.unit && <span className="shrink-0 text-[11px] text-[#666666]">{def.unit}</span>}
              </div>
            );
          }
          return (
            <FieldShell key={def.attributeId} id={id} label={def.name} modified={modified} previous={readable(def, was)} onRevert={() => ctl.revertAttr(def.attributeId)} disabled={ro} hint={hint}>
              {control}
            </FieldShell>
          );
        })}
      </div>
      {error && (
        <span role="alert" className="text-[11px] font-medium text-[#B42318] leading-[145%]">
          {error}
        </span>
      )}
    </div>
  );
}

const filled = (s: string) => s.trim() !== "";

/** Supplied / Not supplied for the six core facts and the attributes of the category, live with the form */
export function AttributeStatus({ editor, values, defs }: { editor: EditorView; values: FormValues; defs: CategoryAttributeDef[] }) {
  const core: Record<string, boolean> = {
    material: filled(values.material),
    dimensions: filled(values.dimLength) && filled(values.dimWidth) && filled(values.dimHeight),
    weight: filled(values.weight),
    countryOfOrigin: filled(values.countryOfOrigin),
    hsnCode: filled(values.hsnCode),
    taxInformation: filled(values.gstPercent),
  };
  const rows = [
    ...editor.attributes.slots.map((s) => ({ key: s.key, label: s.label, supplied: core[s.key] ?? s.supplied, required: false })),
    ...defs.map((d) => ({ key: d.attributeId, label: d.name, supplied: filled(values.categoryAttrs[d.attributeId] ?? ""), required: d.isRequired })),
  ];
  return (
    <section aria-label="Attribute status" className="flex flex-col gap-2 w-full">
      <span className="text-[12px] font-semibold text-[#000000] leading-[145%]">Attribute status</span>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5">
        {rows.map((r) => (
          <li key={r.key} className="flex flex-row items-center justify-between gap-2 text-[12px] leading-[145%]" data-supplied={r.supplied}>
            <span className="text-[#000000]">
              {r.label}
              {r.required && <span className="text-[#666666]"> (required)</span>}
            </span>
            <span className={r.supplied ? "text-[#000000]" : "text-[#666666]"}>{r.supplied ? "Supplied" : "Not supplied"}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
