import { describe, expect, it, vi } from 'vitest';
import { LogMailer, SmtpMailer, renderMailHtml, type MailMessage, type MailTransport } from '@oms/module-kit';
import { createMailer } from '../../packages/runtime/src/mailer';

const LINK = 'https://app.example.com/verify-email?token=SECRET-TOKEN-123';
const mail = (over: Partial<MailMessage> = {}): MailMessage => ({ kind: 'verify_email', to: 'owner@shop.in', subject: 'Verify your e-mail address', text: `Confirm your address.\n\n${LINK}`, data: { token: 'SECRET-TOKEN-123', link: LINK }, ...over });

function capture() {
  const lines: any[] = [];
  const rec = (level: string) => (obj: unknown, msg?: string) => void lines.push({ level, ...(obj as object), msg });
  const logger = { debug: rec('debug'), info: rec('info'), warn: rec('warn'), error: rec('error') } as any;
  return { lines, logger };
}
const fast = { baseDelayMs: 0, sleep: async () => undefined };

describe('SmtpMailer', () => {
  it('sends text + html with the link in both bodies, and never logs the link or token', async () => {
    const sendMail = vi.fn(async () => ({ messageId: '<1@x>' }));
    const { logger, lines } = capture();
    await new SmtpMailer({ transport: { sendMail }, from: 'Omni <no-reply@shop.in>', logger, ...fast }).send(mail());
    const sent = (sendMail.mock.calls[0] as any)[0];
    expect(sent).toMatchObject({ from: 'Omni <no-reply@shop.in>', to: 'owner@shop.in', subject: 'Verify your e-mail address' });
    expect(sent.text).toContain(LINK);
    expect(sent.html).toContain(`href="${LINK}"`);
    expect(JSON.stringify(lines)).not.toContain('SECRET-TOKEN-123');
  });

  it('appends the link to the text body of token mails when a caller omitted it', async () => {
    const sendMail = vi.fn(async () => ({}));
    await new SmtpMailer({ transport: { sendMail }, from: 'a@shop.in', logger: capture().logger, ...fast }).send(mail({ kind: 'invitation', text: 'You were invited.' }));
    expect((sendMail.mock.calls[0] as any)[0].text).toContain(LINK);
  });

  it('escapes html and strips CR/LF from headers', async () => {
    const sendMail = vi.fn(async () => ({}));
    await new SmtpMailer({ transport: { sendMail }, from: 'a@shop.in', logger: capture().logger, ...fast }).send(mail({ subject: 'Hi\r\nBcc: evil@x.com', text: '<script>alert(1)</script>' }));
    const sent = (sendMail.mock.calls[0] as any)[0];
    expect(sent.subject).not.toMatch(/[\r\n]/);
    expect(sent.html).not.toContain('<script>');
    expect(sent.html).toContain('&lt;script&gt;');
    expect(renderMailHtml(mail({ data: { token: 't', link: 'javascript:alert(1)' } }))).not.toContain('href="javascript');
  });

  it('retries transient failures with backoff, then succeeds', async () => {
    const sendMail = vi.fn<MailTransport['sendMail']>().mockRejectedValueOnce(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })).mockRejectedValueOnce(Object.assign(new Error('try later'), { responseCode: 451 })).mockResolvedValue({});
    const sleeps: number[] = [];
    await new SmtpMailer({ transport: { sendMail }, from: 'a@shop.in', logger: capture().logger, baseDelayMs: 100, sleep: async (ms) => void sleeps.push(ms) }).send(mail());
    expect(sendMail).toHaveBeenCalledTimes(3);
    expect(sleeps).toEqual([100, 200]);
  });

  it('does not retry permanent failures, rethrows, and logs without secrets', async () => {
    const sendMail = vi.fn(async () => { throw Object.assign(new Error('Invalid login for smtps://mailer:hunter2@smtp.x.com password=hunter2'), { code: 'EAUTH', responseCode: 535 }); });
    const { logger, lines } = capture();
    await expect(new SmtpMailer({ transport: { sendMail }, from: 'a@shop.in', logger, ...fast }).send(mail())).rejects.toThrow(/Invalid login/);
    expect(sendMail).toHaveBeenCalledTimes(1);
    const s = JSON.stringify(lines);
    expect(s).toContain('mail delivery failed');
    expect(s).not.toContain('hunter2');
    expect(s).not.toContain('SECRET-TOKEN-123');
  });

  it('gives up after maxAttempts on a persistent transient failure', async () => {
    const sendMail = vi.fn(async () => { throw Object.assign(new Error('down'), { code: 'ECONNECTION' }); });
    await expect(new SmtpMailer({ transport: { sendMail }, from: 'a@shop.in', logger: capture().logger, maxAttempts: 3, ...fast }).send(mail())).rejects.toThrow('down');
    expect(sendMail).toHaveBeenCalledTimes(3);
  });
});

describe('createMailer', () => {
  it('uses the log mailer without SMTP_URL and the SMTP mailer with it', async () => {
    const { logger } = capture();
    expect(await createMailer({ SMTP_URL: undefined, EMAIL_FROM: undefined, isProd: false }, logger)).toBeInstanceOf(LogMailer);
    const sendMail = vi.fn(async () => ({}));
    const urls: string[] = [];
    const m = await createMailer({ SMTP_URL: 'smtps://u:p@smtp.shop.in:465', EMAIL_FROM: 'Omni <no-reply@shop.in>', isProd: true }, logger, (u) => { urls.push(u); return { sendMail }; });
    expect(m).toBeInstanceOf(SmtpMailer);
    await m.send(mail());
    expect(urls).toEqual(['smtps://u:p@smtp.shop.in:465']);
    expect((sendMail.mock.calls[0] as any)[0].from).toBe('Omni <no-reply@shop.in>');
  });
  it('the log mailer never logs links in production and does outside it', async () => {
    const prod = capture(); await new LogMailer(prod.logger, false).send(mail());
    const dev = capture(); await new LogMailer(dev.logger, true).send(mail());
    expect(JSON.stringify(prod.lines)).not.toContain('SECRET-TOKEN-123');
    expect(JSON.stringify(dev.lines)).toContain('SECRET-TOKEN-123');
  });
});
