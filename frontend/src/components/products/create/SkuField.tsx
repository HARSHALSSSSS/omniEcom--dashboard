import { useEffect, useState } from "react";
import { productCreationApi } from "@/api/productCreation.api";
import { errorMessage } from "@/api/errors";
import type { ReadinessState, SkuCheck } from "@/types/productCreation";
import { TextField } from "./fields";
import { hintClass, errorClass, linkButton } from "./fieldStyles";

interface Props {
  value: string;
  onChange: (code: string) => void;
  productId: string | null;
  /** the readiness state of the Master SKU item (done = verified for this product) */
  skuState: ReadinessState | undefined;
  disabled: boolean;
  /** server-side error for this field (duplicate on save / continue) */
  error?: string | null;
  codeMax: number;
  /** similar variant SKU warnings from the step check */
  warning?: string | null;
  /** saves the draft, then records the code as verified; resolves with an error message or null */
  onVerify: (code: string) => Promise<string | null>;
}

type CheckState = { status: "idle" } | { status: "checking" } | { status: "done"; result: SkuCheck } | { status: "failed"; message: string };

const DEBOUNCE_MS = 500;

/** the Master SKU input with the live availability check (GET /products/sku-check) and the Verify action */
export function SkuField({ value, onChange, productId, skuState, disabled, error, codeMax, warning, onVerify }: Props) {
  const [check, setCheck] = useState<CheckState>({ status: "idle" });
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const code = value.trim();

  useEffect(() => {
    setVerifyError(null);
    if (!code) {
      setCheck({ status: "idle" });
      return;
    }
    const ctl = new AbortController();
    setCheck({ status: "checking" });
    const t = setTimeout(async () => {
      try {
        const result = await productCreationApi.skuCheck(code, productId, ctl.signal);
        if (!ctl.signal.aborted) setCheck({ status: "done", result });
      } catch (e) {
        if (!ctl.signal.aborted) setCheck({ status: "failed", message: errorMessage(e, "Could not check this SKU right now.") });
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [code, productId]);

  const result = check.status === "done" ? check.result : null;
  const duplicate = !!result && !!result.conflict;
  const invalid = !!result && !result.valid;
  const available = !!result && result.valid && result.available;
  const verified = available && skuState === "done";
  const canVerify = available && !verified && !disabled;

  const verify = async () => {
    setVerifying(true);
    setVerifyError(null);
    try {
      setVerifyError(await onVerify(code));
    } finally {
      setVerifying(false);
    }
  };

  const fieldError = error ?? (invalid ? (result?.message ?? "This Master SKU is not valid.") : null) ?? null;

  return (
    <div className="flex flex-col gap-1.5 w-full">
      <TextField
        id="cp-productCode"
        label="Master SKU"
        mono
        value={value}
        maxLength={codeMax}
        disabled={disabled}
        placeholder="e.g. TRV-1042"
        error={fieldError ?? (duplicate ? "Master SKU already exists. Use a unique SKU to continue." : null)}
        hint="Used internally to identify this master product."
        onChange={(e) => onChange(e.target.value)}
        aside={
          canVerify ? (
            <button type="button" className={linkButton} onClick={() => void verify()} disabled={verifying} aria-label="Verify Master SKU">
              {verifying ? "Verifying..." : "Verify"}
            </button>
          ) : verified ? (
            <span className="text-[11px] text-[#666666]">Verified</span>
          ) : undefined
        }
      />
      <div aria-live="polite" className="flex flex-col gap-1">
        {check.status === "checking" ? <span className={hintClass}>Checking availability...</span> : null}
        {check.status === "failed" ? <span className={hintClass}>{check.message}</span> : null}
        {available && !verified ? <span className={hintClass}>This code is available. Verify it to confirm it is unique.</span> : null}
        {duplicate && result?.conflict ? (
          <span className={errorClass}>
            Already used by {result.conflict.title} ({result.conflict.code}).
            {result.suggestion ? (
              <>
                {" "}
                <button type="button" className={linkButton} disabled={disabled} onClick={() => onChange(result.suggestion as string)}>
                  Use {result.suggestion}
                </button>
              </>
            ) : null}
          </span>
        ) : null}
        {available && result && result.similar.length > 0 ? (
          <span className={hintClass}>A variant already uses the SKU {result.similar[0]?.sku}. A master code can match a variant SKU, but make sure that is intended.</span>
        ) : null}
        {warning ? <span className={hintClass}>{warning}</span> : null}
        {verifyError ? (
          <span role="alert" className={errorClass}>
            {verifyError}
          </span>
        ) : null}
      </div>
    </div>
  );
}
