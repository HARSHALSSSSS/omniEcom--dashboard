import { eq, schema, type Tx } from '@oms/database';
import { resolveSettings } from '@oms/mod-vendors';

export interface ListingGates { hsnCode: boolean; countryOfOrigin: boolean; gstRateSlab: boolean }

/** the mandatory listing gates the business turned ON in Settings > Products & Listings (all off by default) */
export async function listingGates(tx: Tx, vendorId: string): Promise<ListingGates> {
  const [v] = await tx.select({ settings: schema.vendors.settings }).from(schema.vendors).where(eq(schema.vendors.id, vendorId));
  return resolveSettings(v?.settings).catalog.gates;
}

const GST_SLABS_BPS = [0, 500, 1200, 1800, 2800];

/** extra publish blockers for the gates that are on; a gate that is off adds nothing */
export function gateIssues(product: { hsnCode: string | null; countryOfOrigin: string | null; gstRateBps: number | null }, gates: ListingGates): Array<{ code: string; message: string; attribute: string }> {
  const out: Array<{ code: string; message: string; attribute: string }> = [];
  if (gates.hsnCode && !(product.hsnCode ?? '').trim()) out.push({ code: 'hsn_missing', message: 'The product needs an HSN code (your listing gate requires it)', attribute: 'hsnCode' });
  if (gates.countryOfOrigin && !(product.countryOfOrigin ?? '').trim()) out.push({ code: 'country_of_origin_missing', message: 'The product needs a country of origin (your listing gate requires it)', attribute: 'countryOfOrigin' });
  if (gates.gstRateSlab) {
    if (product.gstRateBps === null || product.gstRateBps === undefined) out.push({ code: 'gst_rate_missing', message: 'The product needs a GST rate (your listing gate requires it)', attribute: 'gstRateBps' });
    else if (!GST_SLABS_BPS.includes(product.gstRateBps)) out.push({ code: 'gst_rate_not_slab', message: 'The GST rate must be one of 0, 5, 12, 18 or 28 percent (your listing gate requires a standard slab)', attribute: 'gstRateBps' });
  }
  return out;
}
