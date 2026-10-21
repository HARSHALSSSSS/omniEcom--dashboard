import { and, asc, desc, eq, schema, sql, type Tx } from '@oms/database';
import { AppError, Errors } from '@oms/shared';
import { GSTIN_PROBLEM_MESSAGE, checkGstin, stateNameForCode } from './gst';

type GstinRow = typeof schema.vendorGstins.$inferSelect;

/** 400 with the business rule in `details.rule` and the offending field in `details.issues`. */
export function invalid(message: string, rule: string, path: string, extra: Record<string, unknown> = {}): AppError {
  return new AppError('VALIDATION_FAILED', message, { details: { rule, issues: [{ path, message }], ...extra } });
}

export interface GstRegistration {
  id: string;
  gstin: string;
  stateCode: string;
  stateName: string;
  isPrimary: boolean;
  status: string;
  legalName: string | null;
  tradeName: string | null;
}

/** One line for tables: the free text entered, else the address parts joined. */
function addressLine(a: Record<string, unknown>): string | null {
  if (typeof a.text === 'string' && a.text) return a.text;
  const parts = ['line1', 'line2', 'city', 'state', 'pincode'].map((k) => a[k]).filter((x): x is string => typeof x === 'string' && x.length > 0);
  return parts.length ? parts.join(', ') : null;
}

/** New address document from the structured parts and/or the free text; absent input keeps the current one. */
function buildAddress(current: Record<string, unknown>, input: { address?: Record<string, unknown>; registeredAddress?: string }): Record<string, unknown> | undefined {
  if (input.address === undefined && input.registeredAddress === undefined) return undefined;
  const base = input.address ?? { ...current };
  if (input.registeredAddress !== undefined) return { ...base, text: input.registeredAddress };
  return input.address !== undefined && typeof current.text === 'string' ? { ...base, text: current.text } : base;
}

export function toGstinDto(r: GstinRow) {
  return {
    id: r.id,
    gstin: r.gstin,
    stateCode: r.stateCode.trim(),
    stateName: r.stateName,
    legalName: r.legalName,
    tradeName: r.tradeName,
    registeredAddress: addressLine(r.address),
    address: r.address as Record<string, unknown>,
    isPrimary: r.isPrimary,
    status: r.status as 'active' | 'inactive' | 'cancelled',
    verifiedAt: r.verifiedAt ? r.verifiedAt.toISOString() : null,
    notes: r.notes,
    version: r.version,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/**
 * A GSTIN stored on the vendor before the registry existed (registration form) gets its registry row, as the primary one when
 * the business has none. Idempotent; legacy values are taken as they are (no checksum), the state comes from the first two digits.
 */
async function backfillLegacy(tx: Tx, vendorId: string): Promise<void> {
  const g = schema.vendorGstins;
  const [vendor] = await tx.select({ gstin: schema.vendors.gstin, legalName: schema.vendors.legalName }).from(schema.vendors).where(eq(schema.vendors.id, vendorId));
  if (!vendor?.gstin) return;
  const [known] = await tx.select({ id: g.id }).from(g).where(and(eq(g.vendorId, vendorId), eq(g.gstin, vendor.gstin)));
  if (known) return;
  const stateCode = vendor.gstin.slice(0, 2);
  const [primary] = await tx.select({ id: g.id }).from(g).where(and(eq(g.vendorId, vendorId), eq(g.isPrimary, true)));
  await tx
    .insert(g)
    .values({ vendorId, gstin: vendor.gstin, stateCode, stateName: stateNameForCode(stateCode) ?? 'Unknown', legalName: vendor.legalName, isPrimary: !primary, status: 'active' })
    .onConflictDoNothing();
}

/** Registrations of the business, active first and the primary one first. Used by reports for the place of supply. */
export async function vendorGstRegistrations(tx: Tx, vendorId: string): Promise<GstRegistration[]> {
  await backfillLegacy(tx, vendorId);
  const g = schema.vendorGstins;
  const rows = await tx
    .select()
    .from(g)
    .where(eq(g.vendorId, vendorId))
    .orderBy(sql`(${g.status} = 'active') DESC`, desc(g.isPrimary), asc(g.stateCode), asc(g.createdAt));
  return rows.map((r) => ({
    id: r.id,
    gstin: r.gstin,
    stateCode: r.stateCode.trim(),
    stateName: r.stateName,
    isPrimary: r.isPrimary,
    status: r.status,
    legalName: r.legalName,
    tradeName: r.tradeName,
  }));
}

export async function listGstins(tx: Tx, vendorId: string): Promise<GstinRow[]> {
  await backfillLegacy(tx, vendorId);
  const g = schema.vendorGstins;
  return tx.select().from(g).where(eq(g.vendorId, vendorId)).orderBy(sql`(${g.status} = 'active') DESC`, desc(g.isPrimary), asc(g.stateCode), asc(g.createdAt));
}

async function getGstin(tx: Tx, vendorId: string, id: string, forUpdate = false): Promise<GstinRow> {
  const g = schema.vendorGstins;
  const q = tx.select().from(g).where(and(eq(g.vendorId, vendorId), eq(g.id, id)));
  const [row] = await (forUpdate ? q.for('update') : q);
  if (!row) throw Errors.notFound('GSTIN', id);
  return row;
}

/** Validates a GSTIN against the business: format, state, checksum and the PAN embedded in it. */
export async function validateForVendor(tx: Tx, vendorId: string, raw: string, panOverride?: string | null) {
  const check = checkGstin(raw);
  if (!check.valid) {
    throw invalid(GSTIN_PROBLEM_MESSAGE[check.problem!], `gstin_${check.problem}`, 'gstin', check.expectedCheckChar ? { expectedCheckChar: check.expectedCheckChar } : {});
  }
  const [vendor] = await tx.select({ pan: schema.vendors.pan }).from(schema.vendors).where(eq(schema.vendors.id, vendorId));
  const businessPan = panOverride === undefined ? vendor?.pan : panOverride;
  if (businessPan && businessPan.toUpperCase() !== check.pan) {
    throw invalid('The PAN inside this GSTIN does not match the PAN of the business', 'gstin_pan_mismatch', 'gstin', { businessPan, gstinPan: check.pan });
  }
  return check;
}

/** The vendor's `gstin` column mirrors the primary registration (or null when none is left). */
async function syncVendorMirror(tx: Tx, vendorId: string): Promise<void> {
  const g = schema.vendorGstins;
  const [primary] = await tx.select({ gstin: g.gstin }).from(g).where(and(eq(g.vendorId, vendorId), eq(g.isPrimary, true)));
  await tx.update(schema.vendors).set({ gstin: primary?.gstin ?? null, version: sql`${schema.vendors.version} + 1` }).where(eq(schema.vendors.id, vendorId));
}

export interface GstinInput {
  gstin: string;
  legalName?: string | null;
  tradeName?: string | null;
  address?: Record<string, unknown>;
  registeredAddress?: string;
  status?: 'active' | 'inactive' | 'cancelled';
  notes?: string | null;
  makePrimary?: boolean;
}

export async function addGstin(tx: Tx, vendorId: string, input: GstinInput): Promise<GstinRow> {
  await backfillLegacy(tx, vendorId);
  const check = await validateForVendor(tx, vendorId, input.gstin);
  const g = schema.vendorGstins;
  const [dup] = await tx.select({ id: g.id }).from(g).where(and(eq(g.vendorId, vendorId), eq(g.gstin, check.gstin)));
  if (dup) throw Errors.conflict('This GSTIN is already registered for the business', { rule: 'gstin_duplicate' });
  const existing = await tx.select({ id: g.id, isPrimary: g.isPrimary, status: g.status }).from(g).where(eq(g.vendorId, vendorId));
  const status = input.status ?? 'active';
  // the first active registration becomes the primary one automatically
  const wantsPrimary = (input.makePrimary ?? false) || !existing.some((e) => e.isPrimary);
  if (wantsPrimary && status !== 'active') throw invalid('Only an active registration can be the primary GSTIN', 'gstin_primary_inactive', 'status');
  if (wantsPrimary) await tx.update(g).set({ isPrimary: false }).where(and(eq(g.vendorId, vendorId), eq(g.isPrimary, true)));
  const [row] = await tx
    .insert(g)
    .values({
      vendorId,
      gstin: check.gstin,
      stateCode: check.stateCode!,
      stateName: check.stateName!,
      legalName: input.legalName ?? null,
      tradeName: input.tradeName ?? null,
      address: buildAddress({}, input) ?? {},
      isPrimary: wantsPrimary,
      status,
      notes: input.notes ?? null,
    })
    .returning();
  if (wantsPrimary) await syncVendorMirror(tx, vendorId);
  return row!;
}

export type GstinPatch = Partial<Omit<GstinInput, 'makePrimary'>> & { version?: number };

export async function updateGstin(tx: Tx, vendorId: string, id: string, patch: GstinPatch): Promise<{ before: GstinRow; after: GstinRow }> {
  const before = await getGstin(tx, vendorId, id, true);
  if (patch.version !== undefined && patch.version !== before.version) throw new AppError('VERSION_CONFLICT', undefined, { details: { currentVersion: before.version } });
  const g = schema.vendorGstins;
  const set: Partial<typeof g.$inferInsert> = {};
  if (patch.gstin !== undefined) {
    const check = await validateForVendor(tx, vendorId, patch.gstin);
    if (check.gstin !== before.gstin) {
      const [dup] = await tx.select({ id: g.id }).from(g).where(and(eq(g.vendorId, vendorId), eq(g.gstin, check.gstin)));
      if (dup) throw Errors.conflict('This GSTIN is already registered for the business', { rule: 'gstin_duplicate' });
      set.gstin = check.gstin;
      set.stateCode = check.stateCode!;
      set.stateName = check.stateName!;
    }
  }
  if (patch.legalName !== undefined) set.legalName = patch.legalName;
  if (patch.tradeName !== undefined) set.tradeName = patch.tradeName;
  const address = buildAddress(before.address as Record<string, unknown>, patch);
  if (address !== undefined) set.address = address;
  if (patch.notes !== undefined) set.notes = patch.notes;
  if (patch.status !== undefined) {
    if (patch.status !== 'active' && before.isPrimary) {
      throw Errors.conflict('The primary GSTIN cannot be deactivated: choose another primary registration first', { rule: 'gstin_primary_required' });
    }
    set.status = patch.status;
  }
  const [after] = await tx
    .update(g)
    .set({ ...set, version: sql`${g.version} + 1` })
    .where(and(eq(g.vendorId, vendorId), eq(g.id, id)))
    .returning();
  if (before.isPrimary && set.gstin) await syncVendorMirror(tx, vendorId);
  return { before, after: after! };
}

export async function setPrimaryGstin(tx: Tx, vendorId: string, id: string): Promise<GstinRow> {
  const row = await getGstin(tx, vendorId, id, true);
  if (row.status !== 'active') throw Errors.conflict('Only an active registration can be the primary GSTIN', { rule: 'gstin_primary_inactive' });
  if (row.isPrimary) return row; // idempotent
  const g = schema.vendorGstins;
  await tx.update(g).set({ isPrimary: false, version: sql`${g.version} + 1` }).where(and(eq(g.vendorId, vendorId), eq(g.isPrimary, true)));
  const [after] = await tx.update(g).set({ isPrimary: true, version: sql`${g.version} + 1` }).where(and(eq(g.vendorId, vendorId), eq(g.id, id))).returning();
  await syncVendorMirror(tx, vendorId);
  return after!;
}

export async function removeGstin(tx: Tx, vendorId: string, id: string): Promise<GstinRow> {
  const row = await getGstin(tx, vendorId, id, true);
  const g = schema.vendorGstins;
  if (row.isPrimary) {
    const others = await tx.select({ id: g.id }).from(g).where(and(eq(g.vendorId, vendorId), sql`${g.id} <> ${id}`));
    if (others.length > 0) throw Errors.conflict('The primary GSTIN cannot be removed: choose another primary registration first', { rule: 'gstin_primary_required' });
  }
  await tx.delete(g).where(and(eq(g.vendorId, vendorId), eq(g.id, id)));
  if (row.isPrimary) await syncVendorMirror(tx, vendorId);
  return row;
}

/** A new business PAN must agree with every GSTIN already registered (the PAN is part of each GSTIN). */
export async function assertPanFitsRegistrations(tx: Tx, vendorId: string, pan: string): Promise<void> {
  const g = schema.vendorGstins;
  const rows = await tx.select({ gstin: g.gstin }).from(g).where(eq(g.vendorId, vendorId));
  const clash = rows.find((r) => r.gstin.slice(2, 12) !== pan.toUpperCase());
  if (clash) throw invalid(`The PAN does not match the registered GSTIN ${clash.gstin}`, 'pan_gstin_mismatch', 'pan', { gstin: clash.gstin });
}

/**
 * The vendor's `gstin` was changed through the profile: the registry follows (that GSTIN becomes the primary registration,
 * created when new; null clears the primary flag but keeps the registrations).
 */
export async function adoptProfileGstin(tx: Tx, vendorId: string, gstin: string | null): Promise<void> {
  const g = schema.vendorGstins;
  await tx.update(g).set({ isPrimary: false, version: sql`${g.version} + 1` }).where(and(eq(g.vendorId, vendorId), eq(g.isPrimary, true), gstin ? sql`${g.gstin} <> ${gstin}` : undefined));
  if (!gstin) return;
  const check = checkGstin(gstin);
  const [known] = await tx.select({ id: g.id, isPrimary: g.isPrimary }).from(g).where(and(eq(g.vendorId, vendorId), eq(g.gstin, gstin)));
  if (known) {
    if (!known.isPrimary) await tx.update(g).set({ isPrimary: true, status: 'active', version: sql`${g.version} + 1` }).where(eq(g.id, known.id));
    return;
  }
  await tx.insert(g).values({ vendorId, gstin, stateCode: check.stateCode!, stateName: check.stateName!, isPrimary: true, status: 'active' });
}
