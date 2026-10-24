import type { Logger } from '@oms/logging';
import type { MailMessage, Mailer } from './index';

/** Development mailer: writes the message to the log. Links (which contain one-time tokens) are logged only when asked. */
export class LogMailer implements Mailer {
  constructor(private readonly logger: Logger, private readonly includeLinks: boolean) {}
  async send(m: MailMessage): Promise<void> {
    this.logger.info({ to: m.to, kind: m.kind, subject: m.subject, ...(this.includeLinks ? { link: m.data.link } : {}) }, 'mail (not delivered: log mailer)');
  }
}

/** Test mailer: keeps messages in memory so tests can read tokens out of them. */
export class MemoryMailer implements Mailer {
  readonly sent: MailMessage[] = [];
  async send(m: MailMessage): Promise<void> { this.sent.push(m); }
  last(kind?: MailMessage['kind'], to?: string): MailMessage | undefined {
    return [...this.sent].reverse().find((m) => (!kind || m.kind === kind) && (!to || m.to === to));
  }
  clear(): void { this.sent.length = 0; }
}

// ---------------------------------------------------------------------------------------------
// SMTP delivery. The transport is injected (nodemailer in production, a fake in tests), so this class is plain logic.
// ---------------------------------------------------------------------------------------------
export interface MailTransport {
  sendMail(message: { from: string; to: string; subject: string; text: string; html: string; headers?: Record<string, string> }): Promise<{ messageId?: string } | unknown>;
}
export interface SmtpMailerOptions {
  transport: MailTransport;
  /** `addr@domain` or `Name <addr@domain>` */
  from: string;
  logger: Logger;
  /** total attempts for transient failures (connection/timeouts/4xx). Permanent failures (5xx, auth) are not retried. */
  maxAttempts?: number;
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const LINK_KINDS: ReadonlySet<MailMessage['kind']> = new Set(['verify_email', 'reset_password', 'invitation']);
const BUTTON_LABEL: Partial<Record<MailMessage['kind'], string>> = { verify_email: 'Verify e-mail address', reset_password: 'Choose a new password', invitation: 'Accept invitation', notification: 'Open' };
const TRANSIENT_CODES = new Set(['ECONNECTION', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ESOCKET', 'EDNS', 'EAI_AGAIN', 'ETEMPFAIL']);

const escapeHtml = (v: string): string => v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const safeLink = (v: unknown): string | undefined => (typeof v === 'string' && /^https?:\/\/\S+$/i.test(v) ? v : undefined);
/** header values must never carry CR/LF (header injection) */
const oneLine = (v: string): string => v.replace(/[\r\n]+/g, ' ').trim();

/** Never let credentials from a connection URL or an auth response reach the logs. */
export function scrubMailError(err: unknown): { code?: string; responseCode?: number; message: string } {
  const e = (err ?? {}) as { code?: unknown; responseCode?: unknown; message?: unknown };
  const message = String(e.message ?? err ?? 'unknown error')
    .replace(/(smtps?|https?):\/\/[^\s/@]*@/gi, '$1://***@')
    .replace(/(pass(word)?|auth|token)=\S+/gi, '$1=***')
    .split('\n')[0]!.slice(0, 300);
  return { code: typeof e.code === 'string' ? e.code : undefined, responseCode: typeof e.responseCode === 'number' ? e.responseCode : undefined, message };
}

export function isTransientMailError(err: unknown): boolean {
  const e = (err ?? {}) as { code?: unknown; responseCode?: unknown };
  if (typeof e.responseCode === 'number') return e.responseCode >= 400 && e.responseCode < 500;
  if (e.code === 'EAUTH' || e.code === 'EENVELOPE' || e.code === 'EMESSAGE') return false;
  return typeof e.code !== 'string' || TRANSIENT_CODES.has(e.code);
}

export function renderMailHtml(m: MailMessage): string {
  const link = safeLink(m.data.link);
  const body = m.text.split(/\r?\n/).filter((l) => !link || l.trim() !== link).join('\n').trim();
  const paragraphs = body.split(/\n{2,}/).map((p) => `<p style="margin:0 0 16px">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('');
  const button = link
    ? `<p style="margin:24px 0"><a href="${escapeHtml(link)}" style="background:#2563eb;color:#ffffff;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block">${escapeHtml(BUTTON_LABEL[m.kind] ?? 'Open')}</a></p>`
      + `<p style="margin:0 0 16px;color:#6b7280;font-size:13px">If the button does not work, copy this address into your browser:<br><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>`
    : '';
  return `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#111827"><div style="max-width:560px;margin:0 auto;padding:24px">${paragraphs}${button}</div></body></html>`;
}

/** Real delivery over SMTP. Links are placed in the message body (text and html) and are never logged. */
export class SmtpMailer implements Mailer {
  private readonly maxAttempts: number;
  private readonly baseDelayMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  constructor(private readonly opts: SmtpMailerOptions) {
    this.maxAttempts = Math.max(1, opts.maxAttempts ?? 3);
    this.baseDelayMs = opts.baseDelayMs ?? 500;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  async send(m: MailMessage): Promise<void> {
    const link = safeLink(m.data.link);
    // the link is mandatory content for token mails: make sure it is in the plain-text part even if a caller forgot it
    const text = LINK_KINDS.has(m.kind) && link && !m.text.includes(link) ? `${m.text}\n\n${link}` : m.text;
    const message = { from: this.opts.from, to: oneLine(m.to), subject: oneLine(m.subject), text, html: renderMailHtml({ ...m, text }), headers: { 'X-OMS-Mail-Kind': m.kind } };
    for (let attempt = 1; ; attempt++) {
      try {
        const info = await this.opts.transport.sendMail(message);
        this.opts.logger.info({ kind: m.kind, to: m.to, attempt, messageId: (info as { messageId?: string } | undefined)?.messageId }, 'mail sent');
        return;
      } catch (err) {
        const final = attempt >= this.maxAttempts || !isTransientMailError(err);
        this.opts.logger[final ? 'error' : 'warn']({ kind: m.kind, to: m.to, attempt, maxAttempts: this.maxAttempts, ...scrubMailError(err) }, final ? 'mail delivery failed' : 'mail delivery failed, retrying');
        if (final) throw err;
        await this.sleep(this.baseDelayMs * 2 ** (attempt - 1));
      }
    }
  }
}
