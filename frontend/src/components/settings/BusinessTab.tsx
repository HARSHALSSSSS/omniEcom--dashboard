import { Field, SectionCard, TextField } from "./fields";
import type { TabProps } from "./tabProps";

const BUSINESS_TYPE_LABEL: Record<string, string> = {
  d2c_brand: "Direct-to-consumer brand",
  marketplace_seller: "Marketplace seller",
  retail: "Retail store",
  wholesaler: "Wholesaler",
  social_commerce: "Social commerce",
  other: "Other",
};

/** legal identity, support contacts and registered address (printed on invoices and shipping labels) */
export function BusinessTab({ s, v, ctl }: TabProps) {
  const ro = !ctl.canWrite;
  const err = ctl.fieldErrors;
  const bind = (key: "legalName" | "displayName" | "cin" | "pan" | "supportEmail" | "supportPhone" | "line1" | "line2" | "city" | "state" | "pincode" | "operatingLocation") => ({
    name: key,
    value: v[key],
    error: err[key],
    readOnly: ro,
    onChange: (x: string) => ctl.setField(key, x),
  });
  const type = s.business.businessType;
  return (
    <div className="space-y-6">
      <SectionCard title="Legal entity" description="How your business is identified on commercial invoices, shipping labels and marketplace registrations.">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <TextField {...bind("legalName")} label="Legal entity name" maxLength={200} hint="As registered with the authorities." />
          <TextField {...bind("displayName")} label="Brand name" maxLength={120} hint="Shown in the app and to your team." />
          <TextField {...bind("cin")} label="CIN (Corporate Identification Number)" mono upper maxLength={21} hint="21 characters. Leave empty if you are not a company." />
          <TextField {...bind("pan")} label="PAN" mono upper maxLength={10} hint="10 characters. It must match the PAN inside your GSTINs." />
          <Field id="settings-businessType" label="Business type" hint="Chosen when the account was created. Contact support to change it.">
            <input id="settings-businessType" type="text" readOnly value={type ? (BUSINESS_TYPE_LABEL[type] ?? type) : "Not set"} className="flex h-9 w-full rounded-md border border-input bg-muted/40 px-3 py-1 text-sm shadow-sm" />
          </Field>
          <Field id="settings-primaryGstin" label="Primary GSTIN" hint="Managed in the GSTIN tab.">
            <input id="settings-primaryGstin" type="text" readOnly value={s.business.gstin ?? "Not registered"} className="flex h-9 w-full rounded-md border border-input bg-muted/40 px-3 py-1 font-mono text-sm shadow-sm" />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Customer support" description="Where customers and marketplaces can reach your business.">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <TextField {...bind("supportEmail")} label="Support email" type="email" inputMode="email" maxLength={254} />
          <TextField {...bind("supportPhone")} label="Support phone" type="tel" inputMode="tel" maxLength={20} hint="7 to 20 characters, with the country code if you serve other countries." />
        </div>
      </SectionCard>

      <SectionCard title="Registered address" description="Printed on invoices. Warehouses and pickup addresses are managed in Inventory.">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <TextField {...bind("line1")} label="Address line 1" maxLength={200} className="md:col-span-2" />
          <TextField {...bind("line2")} label="Address line 2" maxLength={200} className="md:col-span-2" />
          <TextField {...bind("city")} label="City" maxLength={100} />
          <TextField {...bind("state")} label="State" maxLength={100} />
          <TextField {...bind("pincode")} label="PIN code" inputMode="numeric" maxLength={6} mono />
          <TextField {...bind("operatingLocation")} label="Operating location" maxLength={160} hint="The city or region you operate from." />
        </div>
      </SectionCard>
    </div>
  );
}
