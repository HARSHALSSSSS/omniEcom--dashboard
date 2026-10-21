import { Field, SectionCard, TextField, ToggleRow, selectClass } from "./fields";
import { FULFILLMENT_OPTIONS, fieldId } from "./form";
import type { TabProps } from "./tabProps";
import type { FulfillmentMethod } from "@/types/settings";

/** inventory buffers, order handling, defaults and the advisory AI switch */
export function OperationsTab({ s, v, ctl }: TabProps) {
  const ro = !ctl.canWrite;
  const err = ctl.fieldErrors;
  const effective = s.warehouses.find((w) => w.id === s.operations.effectiveWarehouseId);
  const aiDisabled = ro || !!ctl.aiLockReason;
  const fulfillment = FULFILLMENT_OPTIONS.find((o) => o.value === v.fulfillmentMethod);

  return (
    <div className="space-y-6">
      <SectionCard title="Inventory safety" description="Automatic rules that protect you from overselling during sudden sales surges.">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <TextField
            name="bufferPercent"
            label="Marketplace stock reserve (%)"
            type="number"
            min={0}
            max={100}
            inputMode="numeric"
            value={v.bufferPercent}
            error={err.bufferPercent}
            readOnly={ro}
            onChange={(x) => ctl.setField("bufferPercent", x)}
            hint="Share of your stock held back from marketplace feeds. 0 to 100."
          />
          <TextField
            name="lowStockThreshold"
            label="Low stock threshold (units)"
            type="number"
            min={0}
            max={1000000}
            inputMode="numeric"
            value={v.lowStockThreshold}
            error={err.lowStockThreshold}
            readOnly={ro}
            onChange={(x) => ctl.setField("lowStockThreshold", x)}
            hint="A product at or below this many units appears in Needs Attention."
          />
        </div>
      </SectionCard>

      <SectionCard title="Orders and pricing" description="Defaults applied to new orders and to prices you push to marketplaces.">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <ToggleRow
            name="autoAcknowledgeOrders"
            label="Acknowledge new orders automatically"
            description="Confirm an order with the marketplace as soon as it arrives."
            checked={v.autoAcknowledgeOrders}
            disabled={ro}
            onChange={(x) => ctl.setField("autoAcknowledgeOrders", x)}
          />
          <ToggleRow
            name="roundPriceToNine"
            label="Round prices to 9"
            description="Calculated prices end in 9 (for example 1,247 becomes 1,249)."
            checked={v.roundPriceToNine}
            disabled={ro}
            onChange={(x) => ctl.setField("roundPriceToNine", x)}
          />
          <Field id={fieldId("fulfillmentMethod")} label="Default fulfilment method" error={err.fulfillmentMethod} hint={fulfillment?.hint ?? "Used when a product has no fulfilment method of its own."}>
            <select
              id={fieldId("fulfillmentMethod")}
              className={selectClass}
              value={v.fulfillmentMethod}
              disabled={ro}
              onChange={(e) => ctl.setField("fulfillmentMethod", e.target.value as "" | FulfillmentMethod)}
            >
              <option value="">No default</option>
              {FULFILLMENT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field
            id={fieldId("warehouseId")}
            label="Default warehouse"
            error={err.warehouseId}
            hint={s.warehouses.length === 0 ? "You have no warehouses yet. Add one in Inventory." : "New stock and orders use this warehouse unless another is chosen."}
          >
            <select id={fieldId("warehouseId")} className={selectClass} value={v.warehouseId} disabled={ro || s.warehouses.length === 0} onChange={(e) => ctl.setField("warehouseId", e.target.value)}>
              <option value="">{effective ? `Automatic (${effective.name})` : "Automatic"}</option>
              {s.warehouses.map((w) => (
                <option key={w.id} value={w.id} disabled={w.status !== "active"}>
                  {w.name}
                  {w.city ? `, ${w.city}` : ""}
                  {w.status !== "active" ? ` (${w.status})` : ""}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Assistant" description="Prescriptive suggestions across your catalogue, pricing and inventory.">
        <ToggleRow
          name="aiEnabled"
          label="Advisory AI features"
          description="Show AI recommendations. Nothing is ever changed without a person approving it."
          checked={v.aiEnabled}
          disabled={aiDisabled}
          reason={ro ? null : ctl.aiLockReason}
          onChange={(x) => ctl.setField("aiEnabled", x)}
        />
      </SectionCard>
    </div>
  );
}
