import { and, eq, schema, withVendor } from '@oms/database';
import type { Container } from '@oms/module-kit';
import { notifyVendor } from '@oms/mod-notifications';
import type { ReportDef } from './catalog';
import { splitParams } from './run-meta';

type Run = typeof schema.reportRuns.$inferSelect;

const webLink = (c: Container, runId: string): string => `${c.config.APP_WEB_URL.replace(/\/$/, '')}/reports?run=${runId}`;

/**
 * Tells people a scheduled report is ready. Always an in-app notification for the team (entity `report_run`, the download path in
 * the text). Each recipient of the schedule also gets an e-mail through the platform mailer port with a link to the report page
 * (never the file itself). With the default log mailer nothing leaves the server: the notification is the delivery that works.
 */
export async function deliverRun(c: Container, vendorId: string, run: Run, def: ReportDef, scheduleName: string): Promise<{ inApp: number; emailed: number; failed: number }> {
  const { meta } = splitParams(run.params);
  const period = meta.period?.label ?? '';
  const path = `/api/v1/reports/runs/${run.id}/download`;
  const inApp = await notifyVendor(c, vendorId, {
    type: 'report.ready', severity: 'info', title: `${scheduleName} is ready`, body: `${def.title}${period ? `, ${period}` : ''}. Download (${run.format.toUpperCase()}) from the Reports page or ${path} until ${run.expiresAt?.toISOString().slice(0, 10) ?? 'it expires'}.`,
    dedupeKey: `report-run:${run.id}`, entityType: 'report_run', entityId: run.id,
  });
  const recipients = await withVendor(c.database.db, vendorId, async (tx) => {
    if (!run.scheduleId) return [] as string[];
    const [s] = await tx.select({ recipients: schema.reportSchedules.recipients }).from(schema.reportSchedules).where(and(eq(schema.reportSchedules.id, run.scheduleId), eq(schema.reportSchedules.vendorId, vendorId)));
    return s?.recipients ?? [];
  });
  let emailed = 0;
  let failed = 0;
  for (const to of recipients) {
    try {
      await c.mailer.send({
        kind: 'notification', to, subject: `${scheduleName}: ${def.title}${period ? ` (${period})` : ''}`.replace(/[\r\n]+/g, ' ').slice(0, 200),
        text: `Your scheduled report "${scheduleName}" is ready.\n\n${def.title}${period ? `\nPeriod: ${period}` : ''}\nFormat: ${run.format.toUpperCase()}\n\nOpen it here (sign in required): ${webLink(c, run.id)}\nThe file is kept until ${run.expiresAt?.toISOString().slice(0, 10) ?? 'it expires'}.`,
        data: { token: run.id, link: webLink(c, run.id), runId: run.id },
      });
      emailed++;
    } catch (e) { failed++; c.logger.warn({ runId: run.id, err: (e as Error).message }, 'report e-mail failed'); }
  }
  return { inApp, emailed, failed };
}

export async function notifyFailure(c: Container, vendorId: string, run: Run, scheduleName: string): Promise<void> {
  await notifyVendor(c, vendorId, { type: 'report.failed', severity: 'warning', title: `${scheduleName} could not be generated`, body: run.error ?? 'The scheduled report failed.', dedupeKey: `report-run:${run.id}`, entityType: 'report_run', entityId: run.id });
}
