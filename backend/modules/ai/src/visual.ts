import type { Answer } from './brain';

/**
 * Presentation of an answer for the assistant screen: the structured card (`dataVisual`) and the follow-up buttons
 * (`suggestedActions`) are derived from the SAME evidence the answer text was written from, never from the language model.
 */
export interface DataVisual { type: 'kpi' | 'table' | 'warning'; title: string; details: Array<{ label: string; value: string }> }
export interface SuggestedAction { label: string; actionType: 'navigate' | 'apply_rule' | 'draft_po' | 'dismiss'; targetUrl?: string }
export interface Presented { content: string; dataVisual: DataVisual | null; suggestedActions: SuggestedAction[] }

const MAX_ROWS = 8;
const inr = (minor: number): string => `INR ${(minor / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (ratio: number): string => `${(ratio * 100).toFixed(1)}%`;
type Rec = Record<string, unknown>;
const arr = (v: unknown): Rec[] => (Array.isArray(v) ? (v as Rec[]) : []);
const nav = (label: string, targetUrl: string): SuggestedAction => ({ label, actionType: 'navigate', targetUrl });

const finding = (f: Rec): { label: string; value: string } => ({
  label: String(f.sku), value: `${f.available} left, ${f.unitsPerDay}/day${f.daysOfCover !== null && f.daysOfCover !== undefined ? `, ${f.daysOfCover} days of cover` : ''}`,
});

export function present(a: Answer): Presented {
  const d = (a.data ?? {}) as Rec;
  const content = a.answer;
  switch (a.intent) {
    case 'stockout_risk': {
      const rows = [...arr(d.outOfStock), ...arr(d.stockoutRisk)];
      return { content, dataVisual: rows.length ? { type: 'warning', title: 'Products at risk of running out', details: rows.slice(0, MAX_ROWS).map(finding) } : { type: 'kpi', title: 'Stock-out risk', details: [{ label: 'Products at risk', value: '0' }, { label: 'Horizon', value: `${d.horizonDays} days` }] }, suggestedActions: [nav('Open product intelligence', '/product-intelligence'), nav('Review inventory', '/inventory'), nav('Plan purchase orders', '/procurement')] };
    }
    case 'low_stock': {
      const rows = [...arr(d.outOfStock), ...arr(d.lowStock)];
      return { content, dataVisual: rows.length ? { type: 'warning', title: 'Below reorder level', details: rows.slice(0, MAX_ROWS).map(finding) } : null, suggestedActions: [nav('Review inventory', '/inventory'), nav('Plan purchase orders', '/procurement')] };
    }
    case 'excess_stock': {
      const rows = [...arr(d.excess), ...arr(d.aging)];
      return { content, dataVisual: rows.length ? { type: 'table', title: 'Excess and aging stock', details: rows.slice(0, MAX_ROWS).map((f) => ({ label: String(f.sku), value: `${f.available} units, ${f.unitsPerDay}/day${f.ageDays !== null && f.ageDays !== undefined ? `, last received ${f.ageDays} days ago` : ''}` })) } : null, suggestedActions: [nav('Open product intelligence', '/product-intelligence'), nav('Plan a promotion', '/promotions')] };
    }
    case 'top_products': {
      const rows = arr(d.products);
      return { content, dataVisual: rows.length ? { type: 'table', title: 'Top products by revenue', details: rows.slice(0, MAX_ROWS).map((p) => ({ label: String(p.sku), value: `${inr(Number(p.revenueMinor))}, ${p.units} units` })) } : null, suggestedActions: [nav('Open product intelligence', '/product-intelligence'), nav('See profitability', '/profitability')] };
    }
    case 'sales_summary': {
      const k = (d.kpis ?? {}) as Record<string, { value: number; changePercent: number | null }>;
      const rates = (d.rates ?? {}) as { cancellationRate?: number; returnRate?: number };
      const change = (x?: { changePercent: number | null }) => (x && x.changePercent !== null ? ` (${x.changePercent >= 0 ? '+' : ''}${x.changePercent}%)` : '');
      return { content, dataVisual: { type: 'kpi', title: 'Sales summary', details: [
        { label: 'Orders', value: `${k.orders?.value ?? 0}${change(k.orders)}` }, { label: 'Revenue', value: `${inr(k.revenueMinor?.value ?? 0)}${change(k.revenueMinor)}` },
        { label: 'Average order', value: inr(k.averageOrderValueMinor?.value ?? 0) }, { label: 'Cancellation rate', value: pct(rates.cancellationRate ?? 0) }, { label: 'Return rate', value: pct(rates.returnRate ?? 0) },
      ] }, suggestedActions: [nav('See profitability', '/profitability'), nav('Open orders', '/orders')] };
    }
    case 'returns': {
      const rates = (d.rates ?? {}) as { returnRate?: number };
      const worst = arr(d.mostReturned).filter((w) => Number(w.returnedUnits) > 0);
      return { content, dataVisual: { type: worst.length ? 'table' : 'kpi', title: 'Returns', details: [{ label: 'Return rate', value: pct(rates.returnRate ?? 0) }, { label: 'Refunds processed', value: inr(Number(d.refundsMinor ?? 0)) }, ...worst.map((w) => ({ label: String(w.sku), value: `${w.returnedUnits} returned (${pct(Number(w.returnRate))})` }))] }, suggestedActions: [nav('Open returns', '/returns')] };
    }
    case 'cancellations': {
      const rates = (d.rates ?? {}) as { cancellationRate?: number };
      return { content, dataVisual: { type: 'kpi', title: 'Cancellations', details: [{ label: 'Cancellation rate', value: pct(rates.cancellationRate ?? 0) }] }, suggestedActions: [nav('Open orders', '/orders')] };
    }
    case 'profitability': {
      const t = ((d.total ?? {}) as Rec);
      const rev = (t.revenue as { amountMinor: number | null } | undefined)?.amountMinor ?? 0;
      const missing = Array.isArray(t.missing) ? (t.missing as string[]) : [];
      return { content, dataVisual: t.contributionMinor !== null && t.contributionMinor !== undefined
        ? { type: 'kpi', title: 'Contribution', details: [{ label: 'Revenue', value: inr(rev) }, { label: 'Contribution (before advertising)', value: inr(Number(t.contributionMinor)) }, { label: 'Margin', value: `${t.marginPercent}%` }] }
        : { type: 'warning', title: 'Profit cannot be stated yet', details: [{ label: 'Revenue', value: inr(rev) }, { label: 'Known part (not a profit)', value: inr(Number(t.knownPartMinor ?? 0)) }, ...missing.map((m) => ({ label: 'Missing', value: m }))] },
      suggestedActions: [nav('Open profitability', '/profitability')] };
    }
    case 'anomalies': {
      const an = arr(d.anomalies);
      return { content, dataVisual: an.length ? { type: 'warning', title: 'Unusual activity', details: an.slice(0, MAX_ROWS).map((x) => ({ label: `${x.day} ${String(x.metric).replace('_', ' ')}`, value: `${x.direction === 'up' ? 'up' : 'down'}, ${x.zScore} standard deviations` })) } : null, suggestedActions: [nav('Open the dashboard', '/dashboard')] };
    }
    case 'product_quality': {
      const counts = Object.entries((d.issueCounts ?? {}) as Record<string, number>).filter(([, c]) => c > 0).sort((x, y) => y[1] - x[1]);
      return { content, dataVisual: { type: 'table', title: 'Catalogue gaps', details: [{ label: 'Products checked', value: String(d.products ?? 0) }, { label: 'Average completeness', value: d.averageScore === null || d.averageScore === undefined ? 'n/a' : `${d.averageScore}/100` }, ...counts.slice(0, MAX_ROWS).map(([k, c]) => ({ label: k.replace(/_/g, ' '), value: String(c) }))] }, suggestedActions: [nav('Open products', '/products'), nav('Open listings', '/listings')] };
    }
    case 'business_issues': {
      const issues = arr(d.issues);
      return { content, dataVisual: issues.length ? { type: 'warning', title: `Business health ${d.score}/100`, details: issues.slice(0, MAX_ROWS).map((i) => ({ label: String(i.message), value: String(i.count) })) } : { type: 'kpi', title: 'Business health', details: [{ label: 'Score', value: `${d.score}/100` }] }, suggestedActions: [nav('Open needs attention', '/needs-attention')] };
    }
    default:
      return { content, dataVisual: null, suggestedActions: [nav('Review stockout risks', '/inventory'), nav('Inspect profitability', '/profitability'), nav('Check pending price proposals', '/pricing')] };
  }
}
