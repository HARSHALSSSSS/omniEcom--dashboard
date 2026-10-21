import { FetchTransport, type ConnectorContext, type HttpTransport } from '@oms/marketplace-core';

/** Meesho does not publish endpoints. PLACEHOLDERS: set the real supplier-API hosts from your Meesho onboarding contract. */
export const MEESHO_HOSTS = { live: 'https://supplier-api.meesho.example', sandbox: 'https://supplier-sandbox.meesho.example' } as const;

export type SandboxTarget = 'simulator' | 'vendor-sandbox';
export const sandboxTarget = (config?: Record<string, unknown>): SandboxTarget =>
  (config?.sandbox as { target?: SandboxTarget } | undefined)?.target === 'vendor-sandbox' ? 'vendor-sandbox' : 'simulator';

export interface Target { transport: HttpTransport; baseUrl: string; simulated: boolean }

export function selectTarget(opts: { mode?: 'live' | 'sandbox'; config?: Record<string, unknown> }, simulator: HttpTransport): Target {
  const mode = opts.mode ?? 'sandbox';
  if (mode === 'sandbox' && sandboxTarget(opts.config) === 'simulator') return { transport: simulator, baseUrl: MEESHO_HOSTS.live, simulated: true };
  const override = opts.config?.baseUrl as string | undefined;
  return { transport: new FetchTransport(), baseUrl: override ?? (mode === 'live' ? MEESHO_HOSTS.live : MEESHO_HOSTS.sandbox), simulated: false };
}
export const targetOf = (ctx: ConnectorContext, simulator: HttpTransport): Target => selectTarget({ mode: ctx.mode, config: ctx.config }, simulator);
