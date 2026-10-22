import { type CheckStatus, type Readiness, type ReadinessCheck, type ReadinessGroupKey, type ScreenStatus } from './workspace-domain';

/**
 * Pure rules of the catalogue-level listing screens: Publishing preparation, Readiness audit and the Listing sync telemetry.
 * Everything is computed from facts the other listing code already produces (stored readiness, screen status, sync jobs): nothing is invented.
 */

/** lifecycle statuses that can still go through the publish flow (validate -> approve -> publish) */
export const PUBLISHABLE_STATUSES = ['draft', 'ready', 'approved', 'rejected', 'correction_required'] as const;
export const isPublishable = (status: string): boolean => (PUBLISHABLE_STATUSES as readonly string[]).includes(status);

/** the audit lines of one listing: what the evaluation needs to know */
export interface AuditListing {
  id: string; productId: string; variantId: string; sku: string; productTitle: string;
  marketplace: string; marketplaceName: string; accountName: string; accountId: string;
  status: string; screenStatus: ScreenStatus; marketplaceCategoryId: string | null; marketplaceCategoryName: string | null;
  attributeValues: Record<string, string | number | boolean>;
  /** attribute names the stored validation reported as missing */
  missingAttributes: string[];
  readiness: Readiness;
  /** effective channel price and MRP (listing override, else the variant's) */
  priceMinor?: number | null; mrpMinor?: number | null;
}

// ------------------------------------------------------------------------------------------------
// spectrogram: four states
// ------------------------------------------------------------------------------------------------
export const SPECTRUM = ['ready', 'needs_review', 'blocked', 'not_listed'] as const;
export type SpectrumState = (typeof SPECTRUM)[number];

/** ready = nothing to do (live, ready to publish, or being synced); needs_review = a person must look; blocked = blocking errors or rejected */
export function spectrumOf(screen: ScreenStatus): Exclude<SpectrumState, 'not_listed'> {
  if (screen === 'needs_review') return 'needs_review';
  if (screen === 'blocked' || screen === 'failed') return 'blocked';
  return 'ready';
}

// ------------------------------------------------------------------------------------------------
// health: share of passed checks per readiness group over all evaluated listings
// ------------------------------------------------------------------------------------------------
export type HealthKey = ReadinessGroupKey | 'variants' | 'compliance';
export interface HealthItem { key: HealthKey; label: string; scorePct: number; listings: number; checks: number; unchecked: number }

/** the design's five bars first (Content, Attributes, Media, Variants, Compliance), then the other readiness groups */
const HEALTH_ORDER: readonly HealthKey[] = ['content', 'attributes', 'media', 'variants', 'compliance', 'price', 'stock', 'category', 'marketplace'];
export const orderHealth = (items: HealthItem[]): HealthItem[] => [...items].sort((a, b) => HEALTH_ORDER.indexOf(a.key) - HEALTH_ORDER.indexOf(b.key));

const GROUP_ORDER: readonly ReadinessGroupKey[] = ['content', 'attributes', 'media', 'price', 'stock', 'category', 'marketplace'];
const HEALTH_LABELS: Record<ReadinessGroupKey, string> = { content: 'Content', attributes: 'Attributes', media: 'Media', price: 'Pricing', stock: 'Stock', category: 'Category mapping', marketplace: 'Marketplace feedback' };

/** pass counts 1, warn 0.5, fail 0 (the same weights as a listing's readiness percent). "Not validated yet" is not scored: it is counted as `unchecked`. */
export function healthOf(readinesses: Readiness[]): HealthItem[] {
  const out: HealthItem[] = [];
  for (const key of GROUP_ORDER) {
    let score = 0; let checks = 0; let unchecked = 0; let listings = 0;
    for (const r of readinesses) {
      const items = r.groups.find((g) => g.key === key)?.items ?? [];
      const scored = items.filter((i) => i.key !== 'attributes_unchecked');
      if (items.length > scored.length) unchecked += 1;
      if (!scored.length) continue;
      listings += 1;
      for (const i of scored) { checks += 1; score += i.status === 'pass' ? 1 : i.status === 'warn' ? 0.5 : 0; }
    }
    if (checks === 0 && unchecked === 0) continue;
    if (checks === 0 && key !== 'attributes') continue;
    out.push({ key, label: HEALTH_LABELS[key], scorePct: checks ? Math.round((100 * score) / checks) : 0, listings, checks, unchecked });
  }
  return out;
}

// ------------------------------------------------------------------------------------------------
// the listing journey of one listing
// ------------------------------------------------------------------------------------------------
export type JourneyState = 'complete' | 'warning' | 'current' | 'pending';
export interface JourneyStep { key: 'master' | 'mapped' | 'content' | 'review' | 'live'; title: string; statusText: string; state: JourneyState }

const worst = (r: Readiness, groups: ReadinessGroupKey[]): CheckStatus => {
  const items = r.groups.filter((g) => groups.includes(g.key)).flatMap((g) => g.items).filter((i) => i.key !== 'attributes_unchecked');
  return items.some((i) => i.status === 'fail') ? 'fail' : items.some((i) => i.status === 'warn') ? 'warn' : 'pass';
};

/** short words for the blocker of a step: "Material missing" for an attribute, else "<label> needs attention" */
export const shortBlocker = (c: Pick<ReadinessCheck, 'key' | 'label' | 'fix'>): string => (c.fix?.action === 'fill_attribute' ? `${c.label} missing` : `${c.label} needs attention`);

export function journeyOf(l: Pick<AuditListing, 'status' | 'readiness' | 'marketplaceCategoryId'>): JourneyStep[] {
  const steps: JourneyStep[] = [{ key: 'master', title: 'Master', statusText: 'Complete', state: 'complete' }];
  const category = l.readiness.groups.find((g) => g.key === 'category');
  steps.push(category?.status === 'fail'
    ? { key: 'mapped', title: 'Mapped', statusText: 'Category missing', state: 'warning' }
    : { key: 'mapped', title: 'Mapped', statusText: l.marketplaceCategoryId ? 'Category mapped' : 'No category needed', state: 'complete' });

  const content = worst(l.readiness, ['content', 'attributes', 'media', 'price']);
  const blocker = l.readiness.groups.filter((g) => ['content', 'attributes', 'media', 'price'].includes(g.key)).flatMap((g) => g.items).find((i) => i.status === 'fail');
  const warns = l.readiness.groups.filter((g) => ['content', 'attributes', 'media', 'price'].includes(g.key)).flatMap((g) => g.items).filter((i) => i.status === 'warn' && i.key !== 'attributes_unchecked').length;
  steps.push(content === 'fail' && blocker ? { key: 'content', title: 'Content ready', statusText: shortBlocker(blocker), state: 'warning' }
    : content === 'warn' ? { key: 'content', title: 'Content ready', statusText: `${warns} warning${warns === 1 ? '' : 's'}`, state: 'warning' }
      : { key: 'content', title: 'Content ready', statusText: 'Complete', state: 'complete' });

  const review: JourneyStep = l.status === 'active' ? { key: 'review', title: 'Marketplace review', statusText: 'Approved', state: 'complete' }
    : l.status === 'pending' ? { key: 'review', title: 'Marketplace review', statusText: 'In review', state: 'current' }
      : l.status === 'rejected' ? { key: 'review', title: 'Marketplace review', statusText: 'Rejected', state: 'warning' }
        : l.status === 'correction_required' ? { key: 'review', title: 'Marketplace review', statusText: 'Correction required', state: 'warning' }
          : { key: 'review', title: 'Marketplace review', statusText: 'Not submitted', state: 'pending' };
  steps.push(review);
  steps.push(l.status === 'active' ? { key: 'live', title: 'Live', statusText: 'Live', state: 'complete' } : { key: 'live', title: 'Live', statusText: 'Pending', state: 'pending' });

  // the first step that is not done and not already flagged is the current stage
  if (!steps.some((s) => s.state === 'current')) {
    const firstOpen = steps.find((s) => s.state !== 'complete');
    if (firstOpen && firstOpen.state === 'pending') firstOpen.state = 'current';
  }
  return steps;
}

/** the listing the sample journey shows: one that needs attention (a missing attribute first), else the first not-yet-live one, else the first */
export function pickJourneyListing<T extends Pick<AuditListing, 'screenStatus' | 'status' | 'readiness'>>(listings: T[]): T | null {
  const attention = listings.filter((l) => l.screenStatus === 'needs_review' || l.screenStatus === 'blocked' || l.screenStatus === 'failed');
  const withAttr = attention.find((l) => l.readiness.topBlocker?.fix?.action === 'fill_attribute');
  return withAttr ?? attention.find((l) => l.readiness.topBlocker) ?? listings.find((l) => l.status !== 'active') ?? listings[0] ?? null;
}

// ------------------------------------------------------------------------------------------------
// suggestions: a missing attribute that the same product already has elsewhere (or that the merchant has to type)
// ------------------------------------------------------------------------------------------------
export interface Suggestion {
  id: string; marketplace: string; marketplaceName: string; attribute: string; label: string;
  title: string; description: string; note: string;
  suggestedValue: string | null; valueSource: string | null;
  listingIds: string[]; listings: Array<{ id: string; sku: string; productTitle: string }>; total: number;
}

const humanise = (s: string): string => s.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^./, (c) => c.toUpperCase());
const MAX_SUGGESTION_LISTINGS = 50;
const MAX_SUGGESTIONS = 3;

export function suggestionsOf(all: AuditListing[], cohort: AuditListing[]): Suggestion[] {
  const groups = new Map<string, AuditListing[]>();
  for (const l of cohort) for (const a of l.missingAttributes) groups.set(`${l.marketplace}|${a}`, [...(groups.get(`${l.marketplace}|${a}`) ?? []), l]);
  const out: Suggestion[] = [];
  for (const [key, members] of [...groups.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])).slice(0, MAX_SUGGESTIONS)) {
    const [marketplace, attribute] = key.split('|') as [string, string];
    const productIds = new Set(members.map((m) => m.productId));
    // the value the same products already carry on another listing, most common first
    const seen = new Map<string, { n: number; from: AuditListing }>();
    for (const o of all) {
      if (!productIds.has(o.productId)) continue;
      const v = o.attributeValues[attribute];
      if (v === undefined || v === null || String(v).trim() === '') continue;
      const cur = seen.get(String(v));
      seen.set(String(v), { n: (cur?.n ?? 0) + 1, from: cur?.from ?? o });
    }
    const best = [...seen.entries()].sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]))[0];
    const name = members[0]!.marketplaceName;
    const label = humanise(attribute);
    const n = members.length;
    out.push({
      id: `attr:${marketplace}:${attribute}`, marketplace, marketplaceName: name, attribute, label,
      title: `${n} ${name} listing${n === 1 ? ' is' : 's are'} missing ${label.toLowerCase()} information`,
      description: `${label} is required for ${n === 1 ? 'this' : 'these'} marketplace categor${n === 1 ? 'y' : 'ies'}.`,
      note: 'Requires merchant confirmation before applying',
      suggestedValue: best ? best[0] : null,
      valueSource: best ? `Already set on ${best[1].from.sku} (${best[1].from.marketplaceName})` : null,
      listingIds: members.slice(0, MAX_SUGGESTION_LISTINGS).map((m) => m.id),
      listings: members.slice(0, MAX_SUGGESTION_LISTINGS).map((m) => ({ id: m.id, sku: m.sku, productTitle: m.productTitle })),
      total: n,
    });
  }
  return out;
}

// ------------------------------------------------------------------------------------------------
// publishing preparation: cohort + issues
// ------------------------------------------------------------------------------------------------
export interface PublishIssue { id: string; listingId: string; productId: string; productTitle: string; sku: string; marketplace: string; marketplaceName: string; issue: string; severity: 'blocker' | 'warning'; field: string | null; fixAction: string | null }
export interface ChannelPrep { marketplace: string; name: string; ready: number; blocked: number; warnings: number; categories: string[]; accounts: Array<{ id: string; name: string; status: string }> }

export interface Cohort {
  readyListings: AuditListing[]; blockedListings: AuditListing[];
  readyProducts: number; readyVariants: number; issueProducts: number; unvalidated: number;
  issues: PublishIssue[]; issuesTotal: number;
}
const MAX_ISSUES = 100;

export function cohortOf(candidates: AuditListing[]): Cohort {
  const readyListings = candidates.filter((l) => l.readiness.ready);
  const blockedListings = candidates.filter((l) => !l.readiness.ready);
  const all: PublishIssue[] = [];
  const productsWithIssue = new Set<string>();
  let unvalidated = 0;
  for (const l of candidates) {
    for (const g of l.readiness.groups) for (const c of g.items) {
      if (c.key === 'attributes_unchecked') { unvalidated += 1; continue; }
      if (c.status === 'pass') continue;
      productsWithIssue.add(l.productId);
      all.push({
        id: `${l.id}:${c.key}`, listingId: l.id, productId: l.productId, productTitle: l.productTitle, sku: l.sku, marketplace: l.marketplace, marketplaceName: l.marketplaceName,
        issue: c.message, severity: c.status === 'fail' ? 'blocker' : 'warning', field: c.field, fixAction: c.fix?.action ?? null,
      });
    }
  }
  all.sort((a, b) => Number(b.severity === 'blocker') - Number(a.severity === 'blocker') || a.productTitle.localeCompare(b.productTitle) || a.sku.localeCompare(b.sku));
  return {
    readyListings, blockedListings,
    readyProducts: new Set(readyListings.map((l) => l.productId)).size, readyVariants: new Set(readyListings.map((l) => l.variantId)).size,
    issueProducts: productsWithIssue.size, unvalidated, issues: all.slice(0, MAX_ISSUES), issuesTotal: all.length,
  };
}

export function channelsOf(candidates: AuditListing[], accounts: Array<{ id: string; name: string; marketplace: string; status: string }>, nameOf: (m: string) => string): ChannelPrep[] {
  const markets = [...new Set([...candidates.map((l) => l.marketplace), ...accounts.map((a) => a.marketplace)])].sort();
  return markets.map((m) => {
    const rows = candidates.filter((l) => l.marketplace === m);
    const cats = [...new Set(rows.map((l) => l.marketplaceCategoryName ?? l.marketplaceCategoryId).filter((x): x is string => Boolean(x)))].slice(0, 3);
    return {
      marketplace: m, name: nameOf(m), ready: rows.filter((l) => l.readiness.ready).length, blocked: rows.filter((l) => !l.readiness.ready).length,
      warnings: rows.filter((l) => l.readiness.ready && l.readiness.summary.warn > 0).length, categories: cats,
      accounts: accounts.filter((a) => a.marketplace === m).map(({ id, name, status }) => ({ id, name, status })),
    };
  });
}

// ------------------------------------------------------------------------------------------------
// sync telemetry
// ------------------------------------------------------------------------------------------------
export type StepStatus = 'complete' | 'in_progress' | 'pending' | 'failed' | 'attention';
export interface JobFacts { id: string; type: string; status: string; progress: { total: number; done: number; failed: number }; startedAt: Date | null; scheduledAt: Date; finishedAt: Date | null; error: { code: string; message: string } | null }
/** what the running job reports: `done` of `total` units (listings for content and stock, stages for a publish), `failed` of those did not go through */
export interface StepProgress { done: number; total: number; failed: number; unit: 'listings' | 'stages' }
export interface SyncStep { key: 'content' | 'stock' | 'listing'; label: string; status: StepStatus; progressPct: number | null; progress: StepProgress | null; detail: string; at: string | null; jobId: string | null }

const ACTIVE_JOB = ['queued', 'running', 'retrying'];
export const isActiveJob = (status: string): boolean => ACTIVE_JOB.includes(status);
const FAILED_JOB = ['failed', 'dead_lettered', 'partially_failed'];

/** a job's own progress: done/total when it reports a total, else only what the status proves (succeeded 100, queued 0, running unknown = null) */
export function jobPercent(j: Pick<JobFacts, 'status' | 'progress'>): number | null {
  if (j.status === 'succeeded') return 100;
  if (j.progress.total > 0) return Math.min(100, Math.round((100 * (j.progress.done + j.progress.failed)) / j.progress.total));
  return j.status === 'queued' ? 0 : null;
}
const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

export interface SyncFacts {
  status: string; contentState: string; contentError: string | null; contentSyncedAt: Date | null;
  quantityDirty: boolean; sellableQuantity: number | null; pushedQuantity: number | null; quantityPushedAt: Date | null;
  publishedAt: Date | null; issueCount: number;
  /** newest job of each kind that concerns this listing */
  publishJob: JobFacts | null; contentJob: JobFacts | null; inventoryJob: JobFacts | null; statusJob: JobFacts | null;
}

export function syncStepsOf(f: SyncFacts): SyncStep[] {
  const live = f.status === 'active' || f.status === 'pending';
  const fromJob = (j: JobFacts | null): Pick<SyncStep, 'status' | 'progressPct' | 'jobId'> | null =>
    j && isActiveJob(j.status) ? { status: 'in_progress', progressPct: jobPercent(j), jobId: j.id } : null;

  // content (the master content propagation)
  let content: BaseStep;
  if (!live) content = { key: 'content', label: 'Content update', status: 'pending', progressPct: 0, detail: 'Sent to the marketplace when the listing is published', at: null, jobId: null };
  else if (f.contentState === 'sync_pending') {
    const j = fromJob(f.contentJob);
    content = { key: 'content', label: 'Content update', status: 'in_progress', progressPct: j?.progressPct ?? null, detail: 'The latest product content is on its way to the marketplace', at: iso(f.contentJob?.startedAt ?? f.contentJob?.scheduledAt), jobId: j?.jobId ?? f.contentJob?.id ?? null };
  } else if (f.contentState === 'failed') content = { key: 'content', label: 'Content update', status: 'failed', progressPct: 0, detail: f.contentError ?? 'The marketplace did not accept the update', at: iso(f.contentJob?.finishedAt), jobId: f.contentJob?.id ?? null };
  else if (f.contentState === 'needs_review') content = { key: 'content', label: 'Content update', status: 'attention', progressPct: 0, detail: 'The product category changed: choose the marketplace category', at: null, jobId: null };
  else if (f.contentState === 'needs_republish') content = { key: 'content', label: 'Content update', status: 'attention', progressPct: 0, detail: f.contentError ?? 'The marketplace cannot update a live listing: republish it', at: null, jobId: null };
  else content = { key: 'content', label: 'Content update', status: 'complete', progressPct: 100, detail: f.contentSyncedAt ? 'The marketplace shows the current content' : 'No content changes are waiting', at: iso(f.contentSyncedAt), jobId: null };

  // stock
  let stock: BaseStep;
  const invJob = fromJob(f.inventoryJob);
  if (f.status !== 'active') stock = { key: 'stock', label: 'Stock sync', status: 'pending', progressPct: 0, detail: f.status === 'pending' ? 'Stock is sent once the marketplace approves the listing' : 'Stock is sent once the listing is live', at: null, jobId: null };
  else if (invJob) stock = { key: 'stock', label: 'Stock sync', status: 'in_progress', progressPct: invJob.progressPct, detail: f.sellableQuantity !== null ? `Sending ${f.sellableQuantity} unit${f.sellableQuantity === 1 ? '' : 's'}` : 'Sending the channel quantity', at: iso(f.inventoryJob?.startedAt ?? f.inventoryJob?.scheduledAt), jobId: invJob.jobId };
  else if (f.inventoryJob && FAILED_JOB.includes(f.inventoryJob.status) && f.quantityDirty) stock = { key: 'stock', label: 'Stock sync', status: 'failed', progressPct: 0, detail: f.inventoryJob.error?.message ?? 'The last stock push failed', at: iso(f.inventoryJob.finishedAt), jobId: f.inventoryJob.id };
  else if (f.quantityDirty) stock = { key: 'stock', label: 'Stock sync', status: 'pending', progressPct: 0, detail: f.sellableQuantity !== null ? `A newer quantity (${f.sellableQuantity}) is waiting to be pushed` : 'A newer quantity is waiting to be pushed', at: null, jobId: null };
  else stock = { key: 'stock', label: 'Stock sync', status: 'complete', progressPct: 100, detail: f.pushedQuantity !== null ? `The marketplace confirmed ${f.pushedQuantity} unit${f.pushedQuantity === 1 ? '' : 's'}` : 'No stock change is waiting', at: iso(f.quantityPushedAt), jobId: null };

  // the listing itself
  let listing: BaseStep;
  const pubJob = fromJob(f.publishJob);
  const checkJob = fromJob(f.statusJob);
  if (f.status === 'pending') listing = { key: 'listing', label: 'Listing update', status: 'in_progress', progressPct: pubJob?.progressPct ?? checkJob?.progressPct ?? null, detail: 'Submitted: waiting for the marketplace review', at: iso(f.publishJob?.startedAt ?? f.publishJob?.scheduledAt), jobId: pubJob?.jobId ?? checkJob?.jobId ?? f.publishJob?.id ?? null };
  else if (pubJob) listing = { key: 'listing', label: 'Listing update', status: 'in_progress', progressPct: pubJob.progressPct, detail: 'Sending the listing to the marketplace', at: iso(f.publishJob?.startedAt ?? f.publishJob?.scheduledAt), jobId: pubJob.jobId };
  else if (f.status === 'active') listing = { key: 'listing', label: 'Listing update', status: 'complete', progressPct: 100, detail: 'The listing is live on the marketplace', at: iso(f.publishedAt), jobId: null };
  else if (f.status === 'rejected' || f.status === 'correction_required') listing = { key: 'listing', label: 'Listing update', status: 'failed', progressPct: 0, detail: `${f.status === 'rejected' ? 'Rejected' : 'Correction required'} by the marketplace${f.issueCount ? `: ${f.issueCount} issue${f.issueCount === 1 ? '' : 's'} reported` : ''}`, at: null, jobId: f.publishJob?.id ?? null };
  else if (f.publishJob && FAILED_JOB.includes(f.publishJob.status)) listing = { key: 'listing', label: 'Listing update', status: 'failed', progressPct: 0, detail: f.publishJob.error?.message ?? 'The last publish attempt failed', at: iso(f.publishJob.finishedAt), jobId: f.publishJob.id };
  else if (f.status === 'unpublished') listing = { key: 'listing', label: 'Listing update', status: 'pending', progressPct: 0, detail: 'The listing was taken down', at: null, jobId: null };
  else listing = { key: 'listing', label: 'Listing update', status: 'pending', progressPct: 0, detail: 'Not submitted to the marketplace yet', at: null, jobId: null };

  // the counts of the job behind a running step (only when the job reported a total: nothing is guessed)
  const jobs = [f.publishJob, f.contentJob, f.inventoryJob, f.statusJob];
  const UNIT = { content: 'listings', stock: 'listings', listing: 'stages' } as const;
  const withProgress = (s: BaseStep): SyncStep => {
    const j = s.status === 'in_progress' && s.jobId ? jobs.find((x) => x?.id === s.jobId) : null;
    return { ...s, progress: j && j.progress.total > 0 ? { done: Math.min(j.progress.done, j.progress.total), total: j.progress.total, failed: j.progress.failed, unit: UNIT[s.key] } : null };
  };
  return [content, listing, stock].map(withProgress).sort((a, b) => ORDER[a.key] - ORDER[b.key]);
}
type BaseStep = Omit<SyncStep, 'progress'>;
const ORDER = { content: 0, stock: 1, listing: 2 } as const;

export type SyncState = 'syncing' | 'synced' | 'attention' | 'idle';
export function syncStateOf(steps: SyncStep[], status: string): SyncState {
  if (steps.some((s) => s.status === 'in_progress')) return 'syncing';
  if (steps.some((s) => s.status === 'failed' || s.status === 'attention')) return 'attention';
  return status === 'active' ? 'synced' : 'idle';
}
