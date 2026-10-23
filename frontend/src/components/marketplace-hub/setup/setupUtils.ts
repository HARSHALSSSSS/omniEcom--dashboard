import { z } from "zod";
import { ApiError } from "@/api/errors";
import { TAG_LABEL } from "@/components/marketplace-hub/accounts/hubFormat";
import { ROUTES } from "@/constants/routes";
import type {
  AuthField,
  ConnectInput,
  ConnectStepName,
  DirectoryItem,
  PendingOauth,
  SyncOptions,
} from "@/types/directory";

export type ConnectMethod = "credentials" | "redirect";

export interface SetupValues {
  displayName: string;
  region: string;
  mode: "live" | "sandbox";
  credentials: Record<string, string>;
  config: Record<string, string>;
  runFirstSync: boolean;
  syncCatalog: boolean;
  syncOrders: boolean;
  syncInventory: boolean;
}

export const STEP_LABEL: Record<ConnectStepName, string> = {
  create_account: "Create account",
  authorize: "Authorize with the marketplace",
  test: "Test the connection",
  first_sync: "Queue the first sync",
};

/** the page the marketplace sends the seller back to after approving access */
export const oauthCallbackUrl = () =>
  `${window.location.origin}${ROUTES.MARKETPLACE_HUB_OAUTH_CALLBACK}`;

/** a seam for tests: leaving the app for the marketplace's consent page */
export const redirectBrowser = (url: string) => {
  window.location.assign(url);
};

const fieldRule = (f: AuthField) => {
  let re: RegExp | null = null;
  if (f.pattern) {
    try {
      re = new RegExp(f.pattern);
    } catch {
      // a pattern the browser cannot read is the server's job to enforce
    }
  }
  return z
    .string()
    .trim()
    .superRefine((value, ctx) => {
      if (!value) {
        if (f.required)
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${f.label} is required.`,
          });
        return;
      }
      if (re && !re.test(value))
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${f.label} does not look right.`,
        });
    });
};

const shape = (fields: AuthField[]) =>
  Object.fromEntries(fields.map((f) => [f.key, fieldRule(f)]));

/** the form's rules, built from what the connector itself asks for; only the fields of the chosen way to connect are checked */
export function buildSetupSchema(
  method: ConnectMethod,
  fields: AuthField[],
  redirectFields: AuthField[],
) {
  return z.object({
    displayName: z
      .string()
      .trim()
      .min(2, "Enter a name of at least 2 characters.")
      .max(120, "Use at most 120 characters."),
    region: z.string(),
    mode: z.enum(["live", "sandbox"]),
    credentials: z.object(shape(method === "credentials" ? fields : [])),
    config: z.object(shape(method === "redirect" ? redirectFields : [])),
    runFirstSync: z.boolean(),
    syncCatalog: z.boolean(),
    syncOrders: z.boolean(),
    syncInventory: z.boolean(),
  });
}

export function defaultValues(
  fields: AuthField[],
  redirectFields: AuthField[],
  region: string,
  mode: "live" | "sandbox",
): SetupValues {
  return {
    displayName: "",
    region,
    mode,
    credentials: Object.fromEntries(fields.map((f) => [f.key, ""])),
    config: Object.fromEntries(redirectFields.map((f) => [f.key, ""])),
    runFirstSync: true,
    syncCatalog: true,
    syncOrders: true,
    syncInventory: true,
  };
}

const nonEmpty = (record: Record<string, string>) =>
  Object.fromEntries(
    Object.entries(record)
      .map(([k, v]) => [k, v.trim()])
      .filter(([, v]) => v !== ""),
  );

export const syncOptionsOf = (v: SetupValues): SyncOptions => ({
  runFirstSync: v.runFirstSync,
  syncCatalog: v.syncCatalog,
  syncOrders: v.syncOrders,
  syncInventory: v.syncInventory,
});

export function toConnectInput(
  code: string,
  method: ConnectMethod,
  v: SetupValues,
): ConnectInput {
  const base = {
    marketplace: code,
    displayName: v.displayName.trim(),
    region: v.region,
    mode: v.mode,
    syncOptions: syncOptionsOf(v),
  };
  return method === "credentials"
    ? { ...base, credentials: nonEmpty(v.credentials) }
    : { ...base, config: nonEmpty(v.config), redirectUri: oauthCallbackUrl() };
}

/** the API's per-field problems, keyed the way the form names its inputs (credentials.x, config.x, displayName) */
export const serverFieldErrors = (
  error: unknown,
): Record<string, string> | null =>
  error instanceof ApiError ? error.fields : null;

// ------------------------------------------------------------------------------------------------ pending redirect
const PENDING_KEY = "hub.pendingOauth";

/** what the callback page needs to finish a redirect connection: ids and options, never credentials */
export function savePending(p: PendingOauth): void {
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(p));
  } catch {
    // without storage the callback page cannot confirm the state, and says so
  }
}

export function loadPending(): PendingOauth | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as PendingOauth) : null;
  } catch {
    return null;
  }
}

export function clearPending(): void {
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // nothing to clear
  }
}

export const newIdempotencyKey = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/**
 * One Idempotency-Key per connect attempt. The same input sent again after the request itself failed (network, 5xx) reuses the key, so the
 * server returns the first result instead of connecting twice; a changed form, or a finished attempt (the server answered), starts a new one.
 */
export function createAttemptKeys() {
  let last: { fingerprint: string; key: string; settled: boolean } | null = null;
  return {
    keyFor(input: unknown): string {
      const fingerprint = JSON.stringify(input);
      if (last && last.fingerprint === fingerprint && !last.settled) return last.key;
      last = { fingerprint, key: newIdempotencyKey(), settled: false };
      return last.key;
    },
    /** the server answered (success, failed result or a definite error): a retry is a new attempt */
    settle() {
      if (last) last.settled = true;
    },
  };
}

/** what the connector offers, as the labels the screens use ("Product import · Listings · ...") */
export const capabilityLabels = (item: Pick<DirectoryItem, "capabilityTags">): string[] => item.capabilityTags.map((t) => TAG_LABEL[t] ?? t);
export const accessLabels = (item: Pick<DirectoryItem, "capabilityTags">): string => capabilityLabels(item).join(" · ") || "No capabilities enabled yet";

/** which sync scopes the seller chose in the connect form */
export function scopesOf(o: SyncOptions | undefined): Array<"catalog" | "inventory" | "orders"> {
  const pick = o ?? { syncCatalog: true, syncOrders: true, syncInventory: true, runFirstSync: true };
  const scopes: Array<"catalog" | "inventory" | "orders"> = [];
  if (pick.syncCatalog) scopes.push("catalog");
  if (pick.syncInventory) scopes.push("inventory");
  if (pick.syncOrders) scopes.push("orders");
  return scopes;
}
