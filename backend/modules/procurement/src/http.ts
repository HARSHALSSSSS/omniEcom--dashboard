import type { FastifyRequest } from 'fastify';
import { audit, emit, ok } from '@oms/module-kit';
import type { Tx } from '@oms/database';
import type { Actor, Fx } from './common';

/** audit + outbox pre-filled from the request (actor, ip, request id) */
export const fxFor = (tx: Tx, req: FastifyRequest): Fx => ({
  audit: (e) => audit(tx, req, e),
  event: async (e) => void (await emit(tx, req, e)),
});

export const actorOf = (req: FastifyRequest): Actor => ({ type: req.ctx.principal?.actorType ?? 'system', id: req.ctx.principal?.actorId ?? null });

/** numbered page + extra fields (tab counts) in one `data` object */
export const pagedWith = <T, X extends Record<string, unknown>>(req: FastifyRequest, items: T[], q: { page: number; pageSize: number }, total: number, extra: X) =>
  ok(req, { items, page: q.page, pageSize: q.pageSize, total, pages: Math.max(1, Math.ceil(total / q.pageSize)), ...extra });
