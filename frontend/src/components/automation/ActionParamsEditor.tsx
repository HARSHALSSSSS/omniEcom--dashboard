import type { UseFormReturn } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useActiveSuppliers, useProcurementWarehouses } from "@/hooks/useProcurement";
import { Field, SELECT } from "./FormBits";
import { PARAM_SPECS, type ParamSpec, type RuleFormValues } from "./ruleForm";

interface Props {
  form: UseFormReturn<RuleFormValues>;
  actionType: string;
}

function ParamInput({ form, spec }: { form: UseFormReturn<RuleFormValues>; spec: ParamSpec }) {
  const { register, formState } = form;
  const name = `params.${spec.key}` as const;
  const message = formState.errors.params?.[spec.key]?.message;
  const id = `auto-param-${spec.key}`;
  const error = Boolean(message);
  const money = spec.kind === "money";
  return (
    <Field label={spec.label} htmlFor={id} error={message} hint={spec.hint}>
      {spec.kind === "textarea" ? (
        <Textarea id={id} rows={2} error={error} {...register(name)} />
      ) : spec.kind === "select" ? (
        <select id={id} className={SELECT} {...register(name)}>
          {spec.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : spec.kind === "supplier" ? (
        <SupplierSelect id={id} form={form} name={name} />
      ) : spec.kind === "warehouse" ? (
        <WarehouseSelect id={id} form={form} name={name} />
      ) : (
        <Input id={id} inputMode={spec.kind === "int" || money ? "decimal" : undefined} placeholder={spec.placeholder} error={error} {...register(name)} />
      )}
    </Field>
  );
}

function SupplierSelect({ id, form, name }: { id: string; form: UseFormReturn<RuleFormValues>; name: `params.${string}` }) {
  const suppliers = useActiveSuppliers();
  const current = form.watch(name);
  const list = suppliers.data ?? [];
  return (
    <select id={id} className={SELECT} disabled={suppliers.isLoading} {...form.register(name)}>
      <option value="">Preferred supplier of the product</option>
      {current && !list.some((s) => s.id === current) && <option value={current}>Selected supplier</option>}
      {list.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
}

function WarehouseSelect({ id, form, name }: { id: string; form: UseFormReturn<RuleFormValues>; name: `params.${string}` }) {
  const warehouses = useProcurementWarehouses();
  const current = form.watch(name);
  const list = warehouses.data ?? [];
  return (
    <select id={id} className={SELECT} disabled={warehouses.isLoading} {...form.register(name)}>
      <option value="">Warehouse of the event</option>
      {current && !list.some((w) => w.id === current) && <option value={current}>Selected warehouse</option>}
      {list.map((w) => (
        <option key={w.id} value={w.id}>
          {w.name} ({w.code})
        </option>
      ))}
    </select>
  );
}

/** the parameters of the chosen action, one field per parameter the backend accepts */
export function ActionParamsEditor({ form, actionType }: Props) {
  const specs = PARAM_SPECS[actionType];
  if (!actionType) return null;
  if (!specs) {
    const message = form.formState.errors.params?.json?.message;
    return (
      <Field label="Action parameters (JSON)" htmlFor="auto-param-json" error={message} hint="This action has no form yet: give its parameters as a JSON object.">
        <Textarea id="auto-param-json" rows={4} className="font-mono text-xs" error={Boolean(message)} {...form.register("params.json")} />
      </Field>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {specs.map((spec) => (
        <div key={spec.key} className={spec.kind === "textarea" || spec.key === "title" ? "sm:col-span-2" : undefined}>
          <ParamInput form={form} spec={spec} />
        </div>
      ))}
    </div>
  );
}
