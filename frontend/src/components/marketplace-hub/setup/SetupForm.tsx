import { useMemo, useState } from "react";
import { useForm, type FieldPath } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, ExternalLink, Lock } from "lucide-react";
import { ApiError } from "@/api/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FieldError,
  InlineError,
  Spinner,
} from "@/components/onboarding/wizard";
import { cn } from "@/utils/cn";
import type {
  AuthField,
  ConnectInput,
  ConnectorReadiness,
  DirectoryItem,
} from "@/types/directory";
import { VerifyEmailNotice } from "./VerifyEmailNotice";
import {
  buildSetupSchema,
  defaultValues,
  serverFieldErrors,
  toConnectInput,
  type ConnectMethod,
  type SetupValues,
} from "./setupUtils";

interface Props {
  item: DirectoryItem;
  readiness: ConnectorReadiness;
  canWrite: boolean;
  pending: boolean;
  /** the rejection of the last attempt, if any */
  error: unknown;
  onSubmit: (input: ConnectInput, method: ConnectMethod) => void;
}

const SYNC_CHOICES: Array<{
  key: "syncCatalog" | "syncOrders" | "syncInventory";
  label: string;
}> = [
  { key: "syncCatalog", label: "Products and listings" },
  { key: "syncOrders", label: "Orders" },
  { key: "syncInventory", label: "Inventory" },
];

const inputClass = "text-xs";

export function SetupForm({
  item,
  readiness,
  canWrite,
  pending,
  error,
  onSubmit,
}: Props) {
  const { authFlow } = item;
  const [method, setMethod] = useState<ConnectMethod>(
    authFlow.mode === "redirect" ? "redirect" : "credentials",
  );
  const region = item.supportedRegions.includes("IN")
    ? "IN"
    : (item.supportedRegions[0] ?? "IN");
  const schema = useMemo(
    () => buildSetupSchema(method, authFlow.fields, authFlow.redirectFields),
    [method, authFlow],
  );
  const form = useForm<SetupValues>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues(
      authFlow.fields,
      authFlow.redirectFields,
      region,
      readiness.defaultMode,
    ),
    mode: "onTouched",
  });
  const { register, handleSubmit, formState, watch } = form;

  const apiFields = serverFieldErrors(error);
  const fieldMessage = (path: string): string | undefined => {
    const [group, key] = path.split(".");
    const local = key
      ? (
          formState.errors[group as "credentials" | "config"] as
            Record<string, { message?: string }> | undefined
        )?.[key]?.message
      : (formState.errors as Record<string, { message?: string }>)[group]
          ?.message;
    return local ?? apiFields?.[path];
  };
  const emailNotVerified =
    error instanceof ApiError && error.code === "EMAIL_NOT_VERIFIED";
  const generalError =
    error && !emailNotVerified && !(apiFields && Object.keys(apiFields).length)
      ? error
      : null;

  const fields: AuthField[] =
    method === "credentials" ? authFlow.fields : authFlow.redirectFields;
  const group = method === "credentials" ? "credentials" : "config";
  const runFirstSync = watch("runFirstSync");
  const disabled = !canWrite || pending;

  const submit = handleSubmit((values) =>
    onSubmit(toConnectInput(item.id, method, values), method),
  );

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-busy={pending}
      aria-label={`Connect ${item.name}`}
      className="space-y-6"
    >
      {!canWrite && (
        <p
          role="note"
          className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
        >
          You have view-only access. Ask an owner or admin to connect{" "}
          {item.name}.
        </p>
      )}
      {authFlow.partnerGated && (
        <p
          role="note"
          className="flex items-start gap-2 rounded-lg bg-purple-50 px-3 py-2 text-xs text-purple-800"
        >
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {item.name} gives these keys only to approved partners. If you do not
          have them yet, you can connect later.
        </p>
      )}

      <div className="space-y-1.5">
        <label
          htmlFor="setup-displayName"
          className="text-xs font-semibold text-foreground"
        >
          Account name{" "}
          <span aria-hidden className="text-destructive">
            *
          </span>
        </label>
        <Input
          id="setup-displayName"
          {...register("displayName")}
          disabled={disabled}
          autoComplete="off"
          placeholder={`e.g. My ${item.name} store`}
          aria-invalid={!!fieldMessage("displayName")}
          aria-describedby="setup-displayName-err"
          className={inputClass}
        />
        <p className="text-[11px] text-muted-foreground">
          How this account appears in your Marketplace Hub.
        </p>
        <FieldError
          id="setup-displayName-err"
          message={fieldMessage("displayName")}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {item.supportedRegions.length > 1 && (
          <div className="space-y-1.5">
            <label
              htmlFor="setup-region"
              className="text-xs font-semibold text-foreground"
            >
              Region
            </label>
            <select
              id="setup-region"
              {...register("region")}
              disabled={disabled}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
            >
              {item.supportedRegions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="space-y-1.5">
          {readiness.live ? (
            <>
              <label
                htmlFor="setup-mode"
                className="text-xs font-semibold text-foreground"
              >
                Environment
              </label>
              <select
                id="setup-mode"
                {...register("mode")}
                disabled={disabled}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
              >
                <option value="live">Live</option>
                <option value="sandbox">Sandbox</option>
              </select>
            </>
          ) : (
            <>
              <p className="text-xs font-semibold text-foreground">
                Environment
              </p>
              <p className="flex h-9 items-center rounded-md border border-input bg-muted/30 px-3 text-xs">
                Sandbox
              </p>
              <p className="text-[11px] text-muted-foreground">
                {item.name} is not verified for live use yet, so this connection
                runs against its sandbox.
                {readiness.notes ? ` ${readiness.notes}` : ""}
              </p>
            </>
          )}
        </div>
      </div>

      {authFlow.mode === "both" && (
        <fieldset className="space-y-2" disabled={disabled}>
          <legend className="text-xs font-semibold text-foreground">
            How do you want to connect?
          </legend>
          {(["credentials", "redirect"] as const).map((m) => (
            <label
              key={m}
              className="flex cursor-pointer items-center gap-2 text-xs text-foreground"
            >
              <input
                type="radio"
                name="setup-method"
                checked={method === m}
                onChange={() => {
                  setMethod(m);
                  form.clearErrors();
                }}
              />
              {m === "credentials"
                ? "Enter my API credentials"
                : `Approve access on ${item.name}`}
            </label>
          ))}
        </fieldset>
      )}

      {method === "redirect" && (
        <p className="text-xs text-muted-foreground">
          You will be sent to {item.name} to approve access, then brought back
          here to finish. No keys are typed in this app.
        </p>
      )}

      {fields.length > 0 && (
        <div className="space-y-4">
          {fields.map((f) => {
            const id = `setup-${group}-${f.key}`;
            const path = `${group}.${f.key}` as FieldPath<SetupValues>;
            const message = fieldMessage(path);
            return (
              <div key={`${group}-${f.key}`} className="space-y-1.5">
                <label
                  htmlFor={id}
                  className="text-xs font-semibold text-foreground"
                >
                  {f.label}{" "}
                  {f.required && (
                    <span aria-hidden className="text-destructive">
                      *
                    </span>
                  )}
                </label>
                {f.type === "select" ? (
                  <select
                    id={id}
                    {...register(path)}
                    disabled={disabled}
                    aria-invalid={!!message}
                    aria-describedby={`${id}-err`}
                    className={cn(
                      "h-9 w-full rounded-md border bg-background px-3 text-xs",
                      message ? "border-destructive" : "border-input",
                    )}
                  >
                    <option value="">Select an option</option>
                    {(f.options ?? []).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    id={id}
                    {...register(path)}
                    type={
                      f.secret || f.type === "password" ? "password" : "text"
                    }
                    autoComplete="off"
                    spellCheck={false}
                    disabled={disabled}
                    error={!!message}
                    aria-invalid={!!message}
                    aria-describedby={`${id}-err${f.help ? ` ${id}-help` : ""}`}
                    className={inputClass}
                  />
                )}
                {f.help && (
                  <p
                    id={`${id}-help`}
                    className="text-[11px] text-muted-foreground"
                  >
                    {f.help}
                  </p>
                )}
                <FieldError id={`${id}-err`} message={message} />
              </div>
            );
          })}
        </div>
      )}

      <fieldset
        className="space-y-2 rounded-lg border border-border bg-muted/20 p-4"
        disabled={disabled}
      >
        <legend className="px-1 text-xs font-semibold text-foreground">
          After connecting
        </legend>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
          <input type="checkbox" {...register("runFirstSync")} /> Run a first
          sync right away
        </label>
        <div className={cn("ml-6 space-y-1.5", !runFirstSync && "opacity-50")}>
          {SYNC_CHOICES.map((c) => (
            <label
              key={c.key}
              className="flex cursor-pointer items-center gap-2 text-xs text-foreground"
            >
              <input
                type="checkbox"
                {...register(c.key)}
                disabled={!runFirstSync}
              />{" "}
              {c.label}
            </label>
          ))}
        </div>
      </fieldset>

      {emailNotVerified && (
        <VerifyEmailNotice
          message={error instanceof ApiError ? error.message : undefined}
        />
      )}
      <InlineError error={generalError} />

      <div className="flex justify-end">
        <Button
          type="submit"
          className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
          disabled={disabled}
        >
          {pending ? (
            <>
              <Spinner /> Connecting...
            </>
          ) : method === "redirect" ? (
            <>
              Continue to {item.name}{" "}
              <ExternalLink className="h-4 w-4" aria-hidden />
            </>
          ) : (
            <>
              Connect {item.name} <ArrowRight className="h-4 w-4" aria-hidden />
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
