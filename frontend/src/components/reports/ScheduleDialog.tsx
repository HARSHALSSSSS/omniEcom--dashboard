import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Field, FIELD_SELECT, InlineError } from "@/components/procurement/procurementUi";
import { fieldError, isVersionConflict } from "@/components/procurement/procurementErrors";
import { VersionConflictDialog } from "@/components/procurement/VersionConflictDialog";
import { reportsApi } from "@/api/reports.api";
import { isApiError } from "@/api/errors";
import { toast } from "@/hooks/useToast";
import { useCreateSchedule, useUpdateSchedule } from "@/hooks/useReports";
import { FREQUENCIES, SCHEDULE_STATUSES, type Catalog, type CatalogEntry, type Frequency, type ReportFormat, type ReportSchedule, type ReportType, type ScheduleStatus, type ScheduleWrite } from "@/types/reports";
import { ParamFields } from "./ParamFields";
import { buildParams, valuesOf, type ParamValues } from "./reportParamsForm";
import { FORMAT_LABEL, FREQUENCY_LABEL, reportErrorMessage, SCHEDULE_STATUS_LABEL, WEEKDAYS } from "./reportsFormat";
import { useSubmitLock } from "@/hooks/useSubmitGuard";

export type ScheduleFormTarget = { kind: "create"; entry?: CatalogEntry } | { kind: "edit"; schedule: ReportSchedule };

interface FormState {
  name: string;
  reportType: ReportType;
  format: ReportFormat;
  frequency: Frequency;
  dayOfWeek: string;
  dayOfMonth: string;
  timeOfDay: string;
  timezone: string;
  recipients: string;
  status: ScheduleStatus;
  values: ParamValues;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_RECIPIENTS = 20;

const parseRecipients = (text: string): string[] => text.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean);

function fromSchedule(s: ReportSchedule): FormState {
  return {
    name: s.name,
    reportType: s.reportType as ReportType,
    format: s.format,
    frequency: s.frequency,
    dayOfWeek: s.dayOfWeek === null ? "1" : String(s.dayOfWeek),
    dayOfMonth: s.dayOfMonth === null ? "1" : String(s.dayOfMonth),
    timeOfDay: s.timeOfDay,
    timezone: s.timezone,
    recipients: s.recipients.join("\n"),
    status: s.status,
    values: valuesOf(s.params),
  };
}

interface Props {
  target: ScheduleFormTarget | null;
  catalog: Catalog;
  /** the business time zone, the default of a new schedule */
  timezone: string;
  onClose: () => void;
  onSaved: (schedule: ReportSchedule, mode: "create" | "edit") => void;
}

/** schedule a report (POST /reports/schedules) or change one (PATCH, with the version it was read at) */
export function ScheduleDialog({ target, catalog, timezone, onClose, onSaved }: Props) {
  const [dirty, setDirty] = useState(false);
  const [askDiscard, setAskDiscard] = useState(false);

  useEffect(() => {
    if (!dirty || !target) return;
    const guard = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty, target]);

  const finish = () => {
    setDirty(false);
    setAskDiscard(false);
    onClose();
  };
  const requestClose = () => (dirty ? setAskDiscard(true) : finish());

  return (
    <>
      <Dialog open={target !== null} onOpenChange={(o) => !o && requestClose()}>
        <DialogContent className="max-h-[92vh] max-w-xl overflow-y-auto" onInteractOutside={(e) => dirty && e.preventDefault()}>
          {target && (
            <ScheduleForm
              key={target.kind === "edit" ? target.schedule.id : "new"}
              target={target}
              catalog={catalog}
              timezone={timezone}
              onDirty={setDirty}
              onCancel={requestClose}
              onSaved={(s, mode) => {
                setDirty(false);
                onSaved(s, mode);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={askDiscard} onOpenChange={setAskDiscard} title="Discard your changes?" description="This schedule has changes that are not saved yet. Closing now throws them away." confirmText="Discard changes" cancelText="Keep editing" variant="destructive" onConfirm={finish} />
    </>
  );
}

function ScheduleForm({ target, catalog, timezone, onDirty, onCancel, onSaved }: Omit<Props, "onClose" | "target"> & { target: ScheduleFormTarget; onDirty: (d: boolean) => void; onCancel: () => void }) {
  const schedule = target.kind === "edit" ? target.schedule : null;
  const schedulable = catalog.types.filter((t) => t.schedulable);
  const create = useCreateSchedule();
  const update = useUpdateSchedule();

  const blank = (): FormState => {
    const entry = (target.kind === "create" ? target.entry : undefined) ?? schedulable[0];
    return { name: "", reportType: entry?.type ?? "sales", format: entry?.defaultFormat ?? "xlsx", frequency: "monthly", dayOfWeek: "1", dayOfMonth: "1", timeOfDay: "06:00", timezone, recipients: "", status: "active", values: {} };
  };
  const initial = useRef<FormState>(schedule ? fromSchedule(schedule) : blank());
  const [form, setForm] = useState<FormState>(initial.current);
  const version = useRef(schedule?.version ?? 0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverFields, setServerFields] = useState<Record<string, string> | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [reloading, setReloading] = useState(false);
  const busy = create.isPending || update.isPending;
  const dirty = JSON.stringify(form) !== JSON.stringify(initial.current);
  useEffect(() => onDirty(dirty), [dirty, onDirty]);

  const entry = catalog.types.find((t) => t.type === form.reportType);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: "" } : e));
    setServerFields((f) => (f && f[key] ? { ...f, [key]: "" } : f));
  };

  const changeType = (type: ReportType) => {
    const next = catalog.types.find((t) => t.type === type);
    setForm((f) => ({ ...f, reportType: type, format: next && next.formats.includes(f.format) ? f.format : (next?.defaultFormat ?? f.format), values: {} }));
    setErrors({});
  };

  const validate = (): { ok: boolean; params: Record<string, unknown> } => {
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = "Give the schedule a name";
    if (form.name.trim().length > 120) next.name = "At most 120 characters";
    if (!TIME.test(form.timeOfDay)) next.timeOfDay = "Choose a time";
    if (!form.timezone.trim()) next.timezone = "Enter a time zone, for example Asia/Kolkata";
    if (form.frequency === "monthly") {
      const d = Number(form.dayOfMonth);
      if (!/^\d{1,2}$/.test(form.dayOfMonth) || d < 1 || d > 31) next.dayOfMonth = "A day from 1 to 31";
    }
    const recipients = parseRecipients(form.recipients);
    if (recipients.length > MAX_RECIPIENTS) next.recipients = `At most ${MAX_RECIPIENTS} recipients`;
    else {
      const bad = recipients.find((r) => !EMAIL.test(r));
      if (bad) next.recipients = `${bad} is not a valid e-mail address`;
    }
    const built = entry ? buildParams(entry, form.values, { forSchedule: true }) : { params: {}, errors: {} };
    Object.assign(next, built.errors);
    setErrors(next);
    return { ok: Object.keys(next).length === 0, params: built.params };
  };

  const acquire = useSubmitLock();
  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setServerError(null);
    setServerFields(null);
    const v = validate();
    if (!v.ok) return;
    const body: ScheduleWrite = {
      name: form.name.trim(),
      reportType: form.reportType,
      format: form.format,
      frequency: form.frequency,
      ...(form.frequency === "weekly" ? { dayOfWeek: Number(form.dayOfWeek) } : {}),
      ...(form.frequency === "monthly" ? { dayOfMonth: Number(form.dayOfMonth) } : {}),
      timeOfDay: form.timeOfDay,
      timezone: form.timezone.trim(),
      params: v.params,
      recipients: parseRecipients(form.recipients),
      status: form.status,
    };
    const release = acquire();
    if (!release) return;
    try {
      if (schedule) {
        const saved = await update.mutateAsync({ id: schedule.id, body: { ...body, version: version.current } });
        toast({ title: "Schedule saved", description: `${saved.name} was updated.`, variant: "success" });
        onSaved(saved, "edit");
      } else {
        const saved = await create.mutateAsync(body);
        toast({ title: "Report scheduled", description: `${saved.name}: ${saved.cadence}.`, variant: "success" });
        onSaved(saved, "create");
      }
    } catch (e) {
      if (isVersionConflict(e)) {
        setConflict(true);
        return;
      }
      const fields = isApiError(e) ? e.fields : null;
      setServerFields(fields);
      const named = fields !== null && Object.keys(fields).some((k) => k in form || k.startsWith("params."));
      setServerError(named ? null : reportErrorMessage(e, "Could not save the schedule."));
    } finally {
      release();
    }
  };

  const reload = async (keepMine: boolean) => {
    if (!schedule) return;
    setReloading(true);
    try {
      const latest = await reportsApi.getSchedule(schedule.id);
      version.current = latest.version;
      if (!keepMine) {
        const next = fromSchedule(latest);
        initial.current = next;
        setForm(next);
      }
      setConflict(false);
    } catch (e) {
      setConflict(false);
      setServerError(reportErrorMessage(e, "Could not load the latest version."));
    } finally {
      setReloading(false);
    }
  };

  const err = (name: string, ...paths: string[]) => errors[name] || fieldError(serverFields, name, ...paths);
  const paramErrors: Record<string, string | null> = {};
  for (const spec of entry?.params ?? []) paramErrors[spec.key] = err(spec.key, `params.${spec.key}`);

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{schedule ? `Edit ${schedule.name}` : "Schedule a report"}</DialogTitle>
        <DialogDescription>The report is generated for its own period at every run. Recipients get an e-mail with a link to the file, and your team gets an in-app notification.</DialogDescription>
      </DialogHeader>
      {serverError && <InlineError message={serverError} />}

      <Field id="sch-name" label="Name" required error={err("name")}>
        <Input id="sch-name" value={form.name} maxLength={120} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set("name", e.target.value)} error={Boolean(err("name"))} placeholder="e.g. Monthly GST register for the CA" className="text-xs" autoComplete="off" />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="sch-type" label="Report" error={err("reportType")}>
          <select id="sch-type" className={FIELD_SELECT} disabled={busy} value={form.reportType} onChange={(e) => changeType(e.target.value as ReportType)}>
            {schedulable.map((t) => (
              <option key={t.type} value={t.type}>
                {t.title}
              </option>
            ))}
          </select>
        </Field>
        <Field id="sch-format" label="File format" error={err("format")}>
          <select id="sch-format" className={FIELD_SELECT} disabled={busy} value={form.format} onChange={(e) => set("format", e.target.value as ReportFormat)}>
            {(entry?.formats ?? []).map((f) => (
              <option key={f} value={f}>
                {FORMAT_LABEL[f]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {entry && <ParamFields idPrefix="sch" entry={entry} periods={catalog.periods} values={form.values} onChange={(v) => set("values", v)} errors={paramErrors} forSchedule disabled={busy} />}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="sch-freq" label="Repeats" error={err("frequency")}>
          <select id="sch-freq" className={FIELD_SELECT} disabled={busy} value={form.frequency} onChange={(e) => set("frequency", e.target.value as Frequency)}>
            {FREQUENCIES.map((f) => (
              <option key={f} value={f}>
                {FREQUENCY_LABEL[f]}
              </option>
            ))}
          </select>
        </Field>
        {form.frequency === "weekly" && (
          <Field id="sch-dow" label="On" error={err("dayOfWeek")}>
            <select id="sch-dow" className={FIELD_SELECT} disabled={busy} value={form.dayOfWeek} onChange={(e) => set("dayOfWeek", e.target.value)}>
              {WEEKDAYS.map((d, i) => (
                <option key={d} value={String(i)}>
                  {d}
                </option>
              ))}
            </select>
          </Field>
        )}
        {form.frequency === "monthly" && (
          <Field id="sch-dom" label="On day of the month" hint="Shorter months run on their last day." error={err("dayOfMonth")}>
            <Input id="sch-dom" inputMode="numeric" value={form.dayOfMonth} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set("dayOfMonth", e.target.value)} error={Boolean(err("dayOfMonth"))} className="text-xs" autoComplete="off" />
          </Field>
        )}
        <Field id="sch-time" label="At" error={err("timeOfDay")}>
          <Input id="sch-time" type="time" value={form.timeOfDay} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set("timeOfDay", e.target.value)} error={Boolean(err("timeOfDay"))} className="text-xs" />
        </Field>
        <Field id="sch-tz" label="Time zone" error={err("timezone")}>
          <Input id="sch-tz" value={form.timezone} maxLength={60} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set("timezone", e.target.value)} error={Boolean(err("timezone"))} className="text-xs" autoComplete="off" />
        </Field>
      </div>

      <Field id="sch-recipients" label="Recipients" hint="E-mail addresses separated by commas, spaces or new lines. Leave empty to notify your team in the app only." error={err("recipients")}>
        <Textarea id="sch-recipients" rows={3} value={form.recipients} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => set("recipients", e.target.value)} className="text-xs" aria-invalid={Boolean(err("recipients")) || undefined} />
      </Field>

      <Field id="sch-status" label="Status">
        <select id="sch-status" className={FIELD_SELECT} disabled={busy} value={form.status} onChange={(e) => set("status", e.target.value as ScheduleStatus)}>
          {SCHEDULE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {SCHEDULE_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </Field>

      <DialogFooter className="gap-2 sm:gap-0">
        <Button type="button" variant="outline" size="sm" className="h-10 sm:h-9" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" className="h-10 sm:h-9" loading={busy}>
          {schedule ? "Save changes" : "Schedule report"}
        </Button>
      </DialogFooter>
      <VersionConflictDialog open={conflict} noun="schedule" hasMyEdits={dirty} busy={reloading} onReload={(keep) => void reload(keep)} onClose={() => setConflict(false)} />
    </form>
  );
}
