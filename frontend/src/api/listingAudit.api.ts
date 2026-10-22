import { client, unwrap, API_BASE } from "./client";
import { ENDPOINTS } from "./endpoints";
import type { BulkPublishSummary, ListingChannels, ListingSync, PublishingPreparation, ReadinessAudit } from "@/types/listingAudit";

/** the bulk endpoints take at most 100 ids per call */
export const BULK_CHUNK = 100;

interface BulkResult {
  summary: { total: number; succeeded: number; failed: number; skipped: number };
  results: Array<{ id: string; sku: string | null; status: "done" | "skipped" | "failed"; message: string }>;
}

/** Catalogue-level listing screens. Reads are new aggregate endpoints; every write goes through the existing listing endpoints. */
export const listingAuditApi = {
  getReadiness: async (): Promise<ReadinessAudit> => unwrap(await client.get(`${API_BASE}/listings/audit/readiness`)),
  getPublishing: async (): Promise<PublishingPreparation> => unwrap(await client.get(`${API_BASE}/listings/audit/publishing`)),
  getSync: async (id: string): Promise<ListingSync> => unwrap(await client.get(`${ENDPOINTS.LISTING(id)}/sync`)),
  getChannels: async (id: string): Promise<ListingChannels> => unwrap(await client.get(`${ENDPOINTS.LISTING(id)}/channels`)),

  /** PATCH /listings/{id}: one attribute override on one listing */
  setAttribute: async (id: string, attribute: string, value: string): Promise<void> => {
    await client.patch(ENDPOINTS.LISTING(id), { attributeOverrides: { [attribute]: value } });
  },

  /** POST /listings/bulk-publish in chunks of 100; one failure never stops the rest */
  bulkPublish: async (ids: string[]): Promise<BulkPublishSummary> => {
    const out: BulkPublishSummary = { total: 0, succeeded: 0, failed: 0, skipped: 0, failures: [] };
    for (let i = 0; i < ids.length; i += BULK_CHUNK) {
      const res = unwrap<BulkResult>(await client.post(ENDPOINTS.LISTINGS_BULK_PUBLISH, { ids: ids.slice(i, i + BULK_CHUNK) }));
      out.total += res.summary.total;
      out.succeeded += res.summary.succeeded;
      out.failed += res.summary.failed;
      out.skipped += res.summary.skipped;
      for (const r of res.results) if (r.status === "failed") out.failures.push({ id: r.id, sku: r.sku, message: r.message });
    }
    return out;
  },
};
