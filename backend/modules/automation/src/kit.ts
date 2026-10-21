import type { z } from 'zod';
import type { Tx } from '@oms/database';
import type { Container } from '@oms/module-kit';
import type { Work } from '@oms/mod-fulfillment';
import type { Facts } from '@oms/mod-rules';

/** payload -> facts the conditions can test: top-level scalars, one nested level as `a.b`, plus eventType */
export function factsOf(e: { type: string; payload: unknown; aggregateId?: string }): Facts {
  const out: Facts = { eventType: e.type, aggregateId: e.aggregateId };
  const walk = (o: unknown, prefix: string, depth: number) => {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return;
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (v === null || ['string', 'number', 'boolean'].includes(typeof v)) out[key] = v as string | number | boolean | null;
      else if (Array.isArray(v) && v.every((x) => typeof x === 'string')) out[key] = v as string[];
      else if (depth < 1) walk(v, key, depth + 1);
    }
  };
  walk(e.payload, '', 0);
  return out;
}

/** `{{field}}` in a template is replaced by the fact (unknown facts become empty); output is length-bounded and single-line */
export const render = (tpl: string, facts: Facts): string => tpl.replace(/\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g, (_m, k: string) => String(facts[k] ?? '')).replace(/[\r\n]+/g, ' ').slice(0, 300);

/** what an action sees while it runs (inside the execution transaction) */
export interface RunCtx { c: Container; tx: Tx; vendorId: string; facts: Facts; event: { id: string; type: string; aggregateId: string }; work: Work; ruleId: string; /** side effects that must run AFTER this transaction commits (they open their own transactions) */ after: Array<() => Promise<unknown>> }

export interface ActionDef {
  description: string;
  triggers: string[] | '*';
  schema: z.ZodType<Record<string, unknown>>;
  run(x: RunCtx, params: Record<string, unknown>): Promise<{ result: Record<string, unknown>; rollback?: Record<string, unknown> }>;
  undo?(x: Pick<RunCtx, 'c' | 'tx' | 'vendorId'>, rollback: Record<string, unknown>, work: Work): Promise<void>;
}
