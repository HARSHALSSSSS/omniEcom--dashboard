import { useState } from "react";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { errorMessage, isApiError } from "@/api/errors";
import { toast } from "@/hooks/useToast";
import { useCreateSupplier } from "@/hooks/useProcurement";
import type { Supplier, SupplierWrite } from "@/types/procurement";
import { Field, FIELD_SELECT, InlineError } from "./procurementUi";

interface AddSupplierSheetProps {
  open: boolean;
  onClose: () => void;
  onSaved: (supplier: Supplier) => void;
}

const CATEGORIES = [
  "Apparel",
  "Home & kitchen",
  "Footwear",
  "Leather goods",
  "Accessories",
  "Décor",
  "Electronics",
  "Packaging",
  "General merchandise",
];

const PAYMENT_TERMS_OPTIONS = [
  { value: "Net 30", label: "Net 30", hint: "Payment due in 30 days." },
  { value: "Net 15", label: "Net 15", hint: "Payment due in 15 days." },
  { value: "Net 60", label: "Net 60", hint: "Payment due in 60 days." },
  { value: "Due on receipt", label: "Due on receipt", hint: "Immediate payment upon delivery." },
  { value: "50% advance", label: "50% advance", hint: "50% upfront, balance on delivery." },
  { value: "100% advance", label: "100% advance", hint: "Full payment with purchase order." },
];

const PAYMENT_METHODS = ["Bank transfer", "UPI / Instant bank transfer", "Cheque", "Credit card / Corporate card", "Cash on delivery"];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GSTIN_SHAPE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function AddSupplierSheet({ open, onClose, onSaved }: AddSupplierSheetProps) {
  const create = useCreateSupplier();

  const [name, setName] = useState("");
  const [gstin, setGstin] = useState("");
  const [category, setCategory] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("India");

  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const [paymentTerms, setPaymentTerms] = useState("Net 30");
  const [leadTimeDays, setLeadTimeDays] = useState("14");
  const [paymentMethod, setPaymentMethod] = useState("Bank transfer");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const reset = () => {
    setName("");
    setGstin("");
    setCategory("");
    setCity("");
    setCountry("India");
    setContactName("");
    setEmail("");
    setPhone("");
    setPaymentTerms("Net 30");
    setLeadTimeDays("14");
    setPaymentMethod("Bank transfer");
    setErrors({});
    setServerError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    const n = name.trim();
    if (!n || n.length < 2) {
      next.name = "Enter the supplier's name (at least 2 characters)";
    }
    const gst = gstin.trim().toUpperCase();
    if (gst && !GSTIN_SHAPE.test(gst)) {
      next.gstin = "A GSTIN has 15 characters, for example 27AABCT3521Q1Z8";
    }
    if (email.trim() && !EMAIL_REGEX.test(email.trim())) {
      next.email = "Enter a valid email address";
    }
    if (leadTimeDays.trim() && (!/^\d{1,3}$/.test(leadTimeDays.trim()) || Number(leadTimeDays) > 365)) {
      next.leadTimeDays = "Whole days, 0 to 365";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);
    if (!validate()) return;

    const extraNotes = [
      category ? `Category: ${category}` : null,
      paymentMethod ? `Payment: ${paymentMethod}` : null,
      country && country !== "India" ? `Country: ${country}` : null,
    ]
      .filter(Boolean)
      .join(" · ");

    const payload: SupplierWrite = {
      name: name.trim(),
      gstin: gstin.trim() ? gstin.trim().toUpperCase() : null,
      contactPerson: contactName.trim() || null,
      email: email.trim() || null,
      phone: phone.trim() || null,
      city: city.trim() || null,
      paymentTerms: paymentTerms || null,
      leadTimeDays: leadTimeDays.trim() ? Number(leadTimeDays) : 14,
      status: "active",
      notes: extraNotes || null,
    };

    try {
      const saved = await create.mutateAsync(payload);
      toast({
        title: "Supplier added",
        description: `${saved.name} has been added to your procurement network.`,
        variant: "success",
      });
      reset();
      onSaved(saved);
    } catch (err) {
      if (isApiError(err) && err.fields) {
        setErrors((prev) => ({ ...prev, ...err.fields }));
      }
      setServerError(errorMessage(err, "Could not save the supplier."));
    }
  };

  const selectedTerms = PAYMENT_TERMS_OPTIONS.find((t) => t.value === paymentTerms);

  return (
    <Sheet open={open} onOpenChange={(o) => (!o ? handleClose() : null)}>
      <SheetContent side="right" aria-label="Add supplier" className="flex w-full flex-col p-0 sm:max-w-[480px]">
        <SheetHeader className="border-b border-border px-6 py-5 text-left">
          <SheetTitle className="text-base font-semibold text-foreground capitalize">Add supplier</SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">
            Add a supplier to your procurement network.
          </SheetDescription>
          <div className="pt-1 text-[11px] text-muted-foreground">* Required fields</div>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5 text-xs">
            {serverError && <InlineError message={serverError} />}

            {/* Section 1: Supplier details */}
            <div className="space-y-3">
              <div>
                <h4 className="text-xs font-semibold text-foreground">Supplier details</h4>
                <p className="text-[11px] text-muted-foreground">Identify the business you purchase from.</p>
              </div>

              <Field
                id="sheet-sup-name"
                label="Supplier / company name"
                required
                error={errors.name}
              >
                <Input
                  id="sheet-sup-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter supplier or business name"
                  className="text-xs"
                  error={Boolean(errors.name)}
                />
                <span className="text-[11px] text-muted-foreground">Use the name shown on purchase orders.</span>
              </Field>

              <Field id="sheet-sup-cat" label="Category (optional)">
                <select
                  id="sheet-sup-cat"
                  className={FIELD_SELECT}
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="">Select category</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field id="sheet-sup-city" label="City (optional)">
                  <Input
                    id="sheet-sup-city"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Enter city"
                    className="text-xs"
                  />
                </Field>
                <Field id="sheet-sup-country" label="Country">
                  <select
                    id="sheet-sup-country"
                    className={FIELD_SELECT}
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                  >
                    <option value="India">India</option>
                    <option value="China">China</option>
                    <option value="Vietnam">Vietnam</option>
                    <option value="Bangladesh">Bangladesh</option>
                    <option value="United States">United States</option>
                    <option value="Other">Other</option>
                  </select>
                </Field>
              </div>

              <Field id="sheet-sup-gstin" label="GSTIN" error={errors.gstin}>
                <Input
                  id="sheet-sup-gstin"
                  value={gstin}
                  maxLength={15}
                  onChange={(e) => setGstin(e.target.value.toUpperCase())}
                  placeholder="27AABCT3521Q1Z8"
                  className="font-mono text-xs uppercase"
                  error={Boolean(errors.gstin)}
                />
              </Field>
            </div>

            {/* Section 2: Primary contact */}
            <div className="space-y-3 border-t border-border pt-4">
              <div>
                <h4 className="text-xs font-semibold text-foreground">Primary contact</h4>
                <p className="text-[11px] text-muted-foreground">Your point of contact for orders and delivery updates.</p>
              </div>

              <Field id="sheet-sup-contact-name" label="Contact name" required error={errors.contactName}>
                <Input
                  id="sheet-sup-contact-name"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Enter full name"
                  className="text-xs"
                  error={Boolean(errors.contactName)}
                />
              </Field>

              <Field id="sheet-sup-email" label="Email address" required error={errors.email}>
                <Input
                  id="sheet-sup-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="text-xs"
                  error={Boolean(errors.email)}
                />
              </Field>

              <Field id="sheet-sup-phone" label="Phone number (optional)">
                <Input
                  id="sheet-sup-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 Enter phone number"
                  className="text-xs"
                />
              </Field>
            </div>

            {/* Section 3: Purchasing defaults */}
            <div className="space-y-3 border-t border-border pt-4">
              <div>
                <h4 className="text-xs font-semibold text-foreground">Purchasing defaults</h4>
                <p className="text-[11px] text-muted-foreground">Defaults for new purchase orders. You can change them later.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field id="sheet-sup-terms" label="Payment terms">
                  <select
                    id="sheet-sup-terms"
                    className={FIELD_SELECT}
                    value={paymentTerms}
                    onChange={(e) => setPaymentTerms(e.target.value)}
                  >
                    {PAYMENT_TERMS_OPTIONS.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  {selectedTerms?.hint && <span className="text-[11px] text-muted-foreground">{selectedTerms.hint}</span>}
                </Field>

                <Field id="sheet-sup-lead" label="Standard lead time" error={errors.leadTimeDays}>
                  <div className="relative">
                    <Input
                      id="sheet-sup-lead"
                      value={leadTimeDays}
                      onChange={(e) => setLeadTimeDays(e.target.value)}
                      placeholder="e.g. 14"
                      className="pr-12 text-xs"
                      error={Boolean(errors.leadTimeDays)}
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[11px] text-muted-foreground">
                      days
                    </span>
                  </div>
                  <span className="text-[11px] text-muted-foreground">From order to delivery.</span>
                </Field>
              </div>

              <Field id="sheet-sup-method" label="Payment method">
                <select
                  id="sheet-sup-method"
                  className={FIELD_SELECT}
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {/* Advisory banner */}
            <div className="flex items-start gap-2.5 rounded-lg border border-border/80 bg-muted/40 p-3 text-[11px] text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <p>Confirm terms and lead time with your supplier before approving a purchase order.</p>
            </div>

          </div>

          <div className="flex items-center justify-between border-t border-border bg-background px-6 py-4">
            <span className="text-[11px] text-muted-foreground">Saving a supplier does not send a purchase order.</span>
            <div className="flex items-center gap-3">
              <Button type="button" variant="outline" size="sm" onClick={handleClose} disabled={create.isPending}>
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                loading={create.isPending}
                aria-label="Add supplier"
                className="bg-slate-900 px-4 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
              >
                Save Supplier
              </Button>
            </div>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
