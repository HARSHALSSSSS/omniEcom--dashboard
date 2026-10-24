// nodemailer ships no types: this ambient declaration must be referenced explicitly so every app that bundles the runtime sees it
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./nodemailer.d.ts" />
import type { AppConfig } from '@oms/config';
import type { Logger } from '@oms/logging';
import { LogMailer, SmtpMailer, type MailTransport, type Mailer } from '@oms/module-kit';

/**
 * SMTP_URL set  -> real delivery (SmtpMailer over nodemailer, pooled, with timeouts).
 * SMTP_URL unset -> LogMailer (development / test only; production refuses to boot without SMTP_URL, see @oms/config).
 * Links are logged by the log mailer only outside production, and never by the SMTP mailer.
 */
export async function createMailer(config: Pick<AppConfig, 'SMTP_URL' | 'EMAIL_FROM' | 'isProd'>, logger: Logger, createTransport?: (url: string) => MailTransport & { verify?: () => Promise<unknown> }): Promise<Mailer> {
  if (!config.SMTP_URL) return new LogMailer(logger, !config.isProd);
  const transport = createTransport ? createTransport(config.SMTP_URL) : await nodemailerTransport(config.SMTP_URL);
  // fail loudly in the logs (not at boot: a mail outage must not take the API down) if the relay is unreachable or rejects the credentials
  void transport.verify?.().then(() => logger.info('smtp transport verified'), (err: { code?: string; message?: string }) => logger.warn({ code: err.code, message: String(err.message ?? '').replace(/\/\/[^@\s]*@/g, '//***@').slice(0, 200) }, 'smtp transport verification failed'));
  return new SmtpMailer({ transport, from: config.EMAIL_FROM ?? 'Omni Ecom <no-reply@localhost>', logger });
}

async function nodemailerTransport(url: string): Promise<MailTransport & { verify: () => Promise<unknown> }> {
  const nodemailer = (await import('nodemailer')).default;
  return nodemailer.createTransport(url, { pool: true, maxConnections: 3, connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000 });
}
