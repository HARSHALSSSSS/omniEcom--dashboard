import { SectionCard, TextField, ToggleRow } from "./fields";
import type { TabProps } from "./tabProps";

/** the alert matrix: one switch per alert family, plus the dispatch window of the SLA alert */
export function NotificationsTab({ s, v, ctl }: TabProps) {
  const ro = !ctl.canWrite;
  return (
    <SectionCard title="Dispatch and alert routing" description="Choose which operational events create alerts in your notifications. Switching one off stops new alerts of that kind; existing ones stay.">
      <div className="space-y-3">
        {s.alertMatrix.map((row) => {
          const isSla = row.key === "dispatchSlaBreach";
          return (
            <ToggleRow
              key={row.key}
              name={`alert:${row.key}`}
              label={row.label}
              description={isSla ? `Alert when an order must be dispatched within ${v.slaMinutes.trim() || "…"} minutes.` : row.description}
              checked={v.alerts[row.key]}
              disabled={ro}
              onChange={(x) => ctl.setAlert(row.key, x)}
            >
              {isSla && (
                <div className="mt-3 max-w-xs">
                  <TextField
                    name="slaMinutes"
                    label="Alert window (minutes)"
                    type="number"
                    min={5}
                    max={1440}
                    inputMode="numeric"
                    value={v.slaMinutes}
                    error={ctl.fieldErrors.slaMinutes}
                    readOnly={ro}
                    onChange={(x) => ctl.setField("slaMinutes", x)}
                    hint="5 to 1,440 minutes (24 hours)."
                  />
                </div>
              )}
            </ToggleRow>
          );
        })}
      </div>
    </SectionCard>
  );
}
