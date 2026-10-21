import { sql } from '@oms/database';
import { mulDivRound } from '../money';
import { localDay } from '../tz';
import type { Cell, Sheet } from '../tabular';
import { MAX_SOURCE_ROWS, n, nul, rows, str, tooLarge, ts, type BuildCtx, type BuildResult } from './types';

export const DEFAULT_TOLERANCE_MINOR = 100;

export interface SettleOrder {
  grossMinor: number;
  /** fee entered for the order (marketplace statement); null = not recorded */
  actualFeeMinor: number | null;
  /** fee the account's commission terms predict; null = no fee profile */
  expectedFeeMinor: number | null;
  penaltyMinor: number | null;
  otherMinor: number | null;
  refundMinor: number;
}

export type SettleStatus = 'matched' | 'variance' | 'unverified' | 'fee_unknown';

/** Pure: what one delivered order should have paid out and how its recorded fee compares with the commission terms. */
export function settleOrder(o: SettleOrder, toleranceMinor: number) {
  const feeUsed = o.actualFeeMinor ?? o.expectedFeeMinor;
  const expectedPayout = feeUsed === null ? null : o.grossMinor - feeUsed - (o.penaltyMinor ?? 0) - (o.otherMinor ?? 0) - o.refundMinor;
  const variance = o.actualFeeMinor !== null && o.expectedFeeMinor !== null ? o.actualFeeMinor - o.expectedFeeMinor : null;
  const status: SettleStatus = o.actualFeeMinor === null ? (o.expectedFeeMinor === null ? 'fee_unknown' : 'unverified') : variance !== null && Math.abs(variance) > toleranceMinor ? 'variance' : 'matched';
  return { feeUsed, expectedPayout, variance, status };
}

const STATUS_TEXT: Record<SettleStatus, string> = {
  matched: 'Fee matches commission terms', variance: 'Fee differs from commission terms', unverified: 'Fee not recorded: expected fee used', fee_unknown: 'No fee data: payout cannot be estimated',
};

export async function buildSettlementAudit(ctx: BuildCtx): Promise<BuildResult> {
  const { tx, vendorId, window: w, timezone: tz } = ctx;
  const tolerance = typeof ctx.params.toleranceMinor === 'number' ? ctx.params.toleranceMinor : DEFAULT_TOLERANCE_MINOR;
  const accountFilter = typeof ctx.params.accountId === 'string' ? sql`and o.marketplace_account_id = ${ctx.params.accountId}::uuid` : sql``;
  const data = await rows(tx, sql`select o.id, o.order_number, o.marketplace, o.marketplace_account_id account_id, a.display_name account_name, o.delivered_at, o.payment_method, o.total_minor,
      f.marketplace_fee_minor fee, f.penalty_minor penalty, f.other_cost_minor other, fp.fee_percent_bps bps, fp.fixed_fee_minor fixed,
      (select coalesce(sum(i.unit_price_minor * i.quantity - i.discount_minor), 0) from order_items i where i.order_id = o.id and i.vendor_id = o.vendor_id and i.status <> 'cancelled') basis,
      (select coalesce(sum(rr.refund_amount_minor), 0) from return_orders rr where rr.order_id = o.id and rr.vendor_id = o.vendor_id and rr.refund_status = 'processed') refunds
    from orders o left join marketplace_accounts a on a.id = o.marketplace_account_id and a.vendor_id = o.vendor_id
      left join order_financials f on f.order_id = o.id and f.vendor_id = o.vendor_id left join fee_profiles fp on fp.marketplace_account_id = o.marketplace_account_id and fp.vendor_id = o.vendor_id
    where o.vendor_id = ${vendorId} and o.delivered_at >= ${w.from} and o.delivered_at < ${w.to} and o.status <> 'cancelled' ${accountFilter}
    order by a.display_name, o.delivered_at, o.order_number limit ${MAX_SOURCE_ROWS + 1}`);
  if (data.length > MAX_SOURCE_ROWS) throw tooLarge('delivered orders');

  type Acc = { name: string; marketplace: string; orders: number; gross: number; actualFee: number; expectedFee: number; variance: number; penalty: number; other: number; refunds: number; payout: number; noFee: number; variances: number; unverified: number };
  const accounts = new Map<string, Acc>();
  const detail: Cell[][] = [];
  for (const r of data) {
    const expectedFee = r.bps === null ? null : mulDivRound(n(r.basis), n(r.bps), 10_000) + n(r.fixed);
    const o: SettleOrder = { grossMinor: n(r.total_minor), actualFeeMinor: nul(r.fee), expectedFeeMinor: expectedFee, penaltyMinor: nul(r.penalty), otherMinor: nul(r.other), refundMinor: n(r.refunds) };
    const s = settleOrder(o, tolerance);
    const key = String(r.account_id);
    const a = accounts.get(key) ?? { name: str(r.account_name) ?? String(r.marketplace), marketplace: String(r.marketplace), orders: 0, gross: 0, actualFee: 0, expectedFee: 0, variance: 0, penalty: 0, other: 0, refunds: 0, payout: 0, noFee: 0, variances: 0, unverified: 0 };
    a.orders++; a.gross += o.grossMinor; a.penalty += o.penaltyMinor ?? 0; a.other += o.otherMinor ?? 0; a.refunds += o.refundMinor;
    if (o.actualFeeMinor !== null) a.actualFee += o.actualFeeMinor;
    if (expectedFee !== null) a.expectedFee += expectedFee;
    if (s.variance !== null) a.variance += s.variance;
    if (s.expectedPayout !== null) a.payout += s.expectedPayout; else a.noFee++;
    if (s.status === 'variance') a.variances++;
    if (s.status === 'unverified') a.unverified++;
    accounts.set(key, a);
    detail.push([String(r.order_number), a.name, String(r.marketplace), localDay(ts(r.delivered_at), tz), String(r.payment_method), o.grossMinor, o.actualFeeMinor, expectedFee, s.variance, o.penaltyMinor, o.otherMinor, o.refundMinor, s.expectedPayout, null, null, STATUS_TEXT[s.status], 'No settlement record']);
  }

  const list = [...accounts.values()];
  const totalOf = (k: keyof Acc) => list.reduce((s, a) => s + (a[k] as number), 0);
  const summary: Sheet = {
    name: 'Summary by account', title: 'Settlement and deduction audit by marketplace account',
    columns: [{ header: 'Account', type: 'text', width: 24 }, { header: 'Marketplace', type: 'text', width: 14 }, { header: 'Delivered orders', type: 'int', width: 11 }, { header: 'Order value', type: 'money', width: 15 },
      { header: 'Fees recorded', type: 'money', width: 14 }, { header: 'Fees per commission terms', type: 'money', width: 14 }, { header: 'Fee variance', type: 'money', width: 14 }, { header: 'Penalties', type: 'money', width: 12 },
      { header: 'Other deductions', type: 'money', width: 12 }, { header: 'Refunds', type: 'money', width: 12 }, { header: 'Expected payout', type: 'money', width: 15 }, { header: 'Recorded payout', type: 'money', width: 14 },
      { header: 'Difference', type: 'money', width: 12 }, { header: 'Orders without fee data', type: 'int', width: 11 }, { header: 'Orders with fee variance', type: 'int', width: 11 }, { header: 'Orders with fee not recorded', type: 'int', width: 11 }],
    rows: list.map((a) => [a.name, a.marketplace, a.orders, a.gross, a.actualFee, a.expectedFee, a.variance, a.penalty, a.other, a.refunds, a.payout, null, null, a.noFee, a.variances, a.unverified]),
    totals: ['Total', null, totalOf('orders'), totalOf('gross'), totalOf('actualFee'), totalOf('expectedFee'), totalOf('variance'), totalOf('penalty'), totalOf('other'), totalOf('refunds'), totalOf('payout'), null, null, totalOf('noFee'), totalOf('variances'), totalOf('unverified')],
    notes: [
      'Expected payout = order value - fee (recorded, else per the account commission terms) - penalties - other deductions - processed refunds. Orders with no fee data are left out of it.',
      'Fee variance compares the fee recorded for an order with the commission terms (fee % and fixed fee) of its account, only where both exist.',
      'Recorded payout and difference are blank: the platform holds no marketplace remittance or settlement records yet, so a bank or statement reconciliation is not possible here.',
      `Period: ${w.label} (orders delivered in it). Variance tolerance: ${tolerance} paise per order.`,
    ],
  };
  const detailSheet: Sheet = {
    name: 'Order detail', title: 'Settlement audit, delivered orders',
    columns: [{ header: 'Order no', type: 'text', width: 16 }, { header: 'Account', type: 'text', width: 22 }, { header: 'Marketplace', type: 'text', width: 13 }, { header: 'Delivered', type: 'date', width: 13 }, { header: 'Payment', type: 'text', width: 9 },
      { header: 'Order value', type: 'money', width: 14 }, { header: 'Fee recorded', type: 'money', width: 13 }, { header: 'Fee per terms', type: 'money', width: 13 }, { header: 'Fee variance', type: 'money', width: 13 }, { header: 'Penalty', type: 'money', width: 11 },
      { header: 'Other deductions', type: 'money', width: 12 }, { header: 'Refunds', type: 'money', width: 11 }, { header: 'Expected payout', type: 'money', width: 14 }, { header: 'Recorded payout', type: 'money', width: 14 },
      { header: 'Difference', type: 'money', width: 12 }, { header: 'Audit result', type: 'text', width: 36 }, { header: 'Settlement data', type: 'text', width: 20 }],
    rows: detail,
  };
  const missing = totalOf('noFee');
  return {
    document: { type: 'settlement_audit', title: 'Marketplace settlement and deduction audit', businessName: ctx.businessName, subtitle: w.label, generatedAt: ctx.now, timezone: tz, sheets: [summary, detailSheet], primarySheet: 1 },
    meta: { warnings: totalOf('variances') + totalOf('unverified') + missing, notes: ['No marketplace payout records exist: recorded payout and difference are blank.'], settlementDataAvailable: false },
  };
}
