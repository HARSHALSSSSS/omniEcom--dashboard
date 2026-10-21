import { useFieldArray, type UseFormReturn } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OP_LABELS } from "./autoFormat";
import { SELECT } from "./FormBits";
import { EMPTY_CONDITION, needsValue, type RuleFormValues } from "./ruleForm";

interface Props {
  form: UseFormReturn<RuleFormValues>;
  /** the facts the chosen trigger offers (offered as suggestions, any field name is accepted) */
  facts: string[];
  operators: string[];
}

const HINTS: Record<string, string> = {
  in: "Comma separated, e.g. amazon_in, flipkart",
  nin: "Comma separated, e.g. amazon_in, flipkart",
  between: "Two numbers, e.g. 10, 50",
};

/** "all of / any of" plus one row per condition: fact, operator, value */
export function ConditionsEditor({ form, facts, operators }: Props) {
  const { control, register, watch, formState } = form;
  const { fields, append, remove } = useFieldArray({ control, name: "conditions" });
  const rows = watch("conditions");
  const errs = formState.errors.conditions;
  const listId = "automation-facts";

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs">
          <h3 className="font-semibold text-foreground">Only when</h3>
          <select aria-label="Match all or any condition" className="h-8 rounded-md border border-input bg-transparent px-2 text-xs" {...register("combinator")}>
            <option value="all">all of these are true</option>
            <option value="any">any of these is true</option>
          </select>
        </div>
        <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => append(EMPTY_CONDITION)} disabled={fields.length >= 20}>
          <Plus className="mr-1 h-3 w-3" aria-hidden />
          Add condition
        </Button>
      </div>

      <datalist id={listId}>
        {facts.map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>

      {fields.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-3 text-[11px] text-muted-foreground">No conditions: the rule matches every event of this trigger.</p>
      ) : (
        <ul className="space-y-2">
          {fields.map((f, i) => {
            const op = rows?.[i]?.op ?? "eq";
            const e = errs?.[i];
            return (
              <li key={f.id} className="grid gap-2 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto] sm:items-start">
                <div>
                  <Input aria-label={`Condition ${i + 1} fact`} list={listId} placeholder="Fact, e.g. available" className="text-xs" error={Boolean(e?.field)} {...register(`conditions.${i}.field` as const)} />
                  {e?.field?.message && (
                    <p role="alert" className="mt-1 text-[11px] text-destructive">
                      {e.field.message}
                    </p>
                  )}
                </div>
                <select aria-label={`Condition ${i + 1} operator`} className={SELECT} {...register(`conditions.${i}.op` as const)}>
                  {operators.map((o) => (
                    <option key={o} value={o}>
                      {OP_LABELS[o] ?? o}
                    </option>
                  ))}
                </select>
                <div>
                  {needsValue(op) ? (
                    <Input aria-label={`Condition ${i + 1} value`} placeholder={HINTS[op] ?? "Value"} className="text-xs" error={Boolean(e?.value)} {...register(`conditions.${i}.value` as const)} />
                  ) : (
                    <select aria-label={`Condition ${i + 1} value`} className={SELECT} {...register(`conditions.${i}.value` as const)}>
                      <option value="true">has a value</option>
                      <option value="false">has no value</option>
                    </select>
                  )}
                  {e?.value?.message && (
                    <p role="alert" className="mt-1 text-[11px] text-destructive">
                      {e.value.message}
                    </p>
                  )}
                </div>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove condition ${i + 1}`} onClick={() => remove(i)}>
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
