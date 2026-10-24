// Minimal typing for the part of nodemailer we use (the package ships no types; keeps us independent of @types version drift).
declare module 'nodemailer' {
  interface Transport {
    sendMail(message: { from: string; to: string; subject: string; text: string; html: string; headers?: Record<string, string> }): Promise<{ messageId?: string }>;
    verify(): Promise<unknown>;
  }
  const nodemailer: { createTransport(url: string, defaults?: Record<string, unknown>): Transport };
  export default nodemailer;
}
