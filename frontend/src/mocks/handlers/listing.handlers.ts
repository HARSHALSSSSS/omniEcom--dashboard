import { http, HttpResponse, delay } from "msw";
import { ENDPOINTS } from "@/api/endpoints";
import { initialListings, sampleStudioData } from "@/mocks/data/listings.data";
import { ChannelListingItem } from "@/types/listing";

let listings: ChannelListingItem[] = [...initialListings];

export const listingHandlers = [
  // List listings with filters
  http.get(ENDPOINTS.LISTINGS, async ({ request }) => {
    await delay(150);
    const url = new URL(request.url);
    const channel = url.searchParams.get("channel");
    const status = url.searchParams.get("status");
    const search = url.searchParams.get("search");

    let filtered = [...listings];
    if (channel && channel !== "all") {
      filtered = filtered.filter((l) => l.channel === channel);
    }
    if (status && status !== "all") {
      filtered = filtered.filter((l) => l.status === status);
    }
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (l) =>
          l.productTitle.toLowerCase().includes(q) ||
          l.sku.toLowerCase().includes(q) ||
          l.channelSku?.toLowerCase().includes(q),
      );
    }

    return HttpResponse.json({
      data: filtered,
      meta: {
        total: filtered.length,
        live: filtered.filter((l) => l.status === "live").length,
        syncing: filtered.filter((l) => l.status === "syncing").length,
        needsReview: filtered.filter((l) => l.status === "needs_review").length,
        failed: filtered.filter((l) => l.status === "failed").length,
        blocked: filtered.filter((l) => l.status === "blocked").length,
        notListed: filtered.filter((l) => l.status === "not_listed").length,
      },
    });
  }),

  // Get single listing studio data
  http.get(`${ENDPOINTS.LISTINGS}/:id`, async ({ params }) => {
    await delay(150);
    const listing = listings.find((l) => l.id === params.id) ?? listings[0];
    return HttpResponse.json({
      data: {
        ...sampleStudioData,
        listing,
      },
    });
  }),

  // Update listing in studio
  http.put(`${ENDPOINTS.LISTINGS}/:id`, async ({ params, request }) => {
    await delay(200);
    const body = (await request.json()) as Partial<ChannelListingItem>;
    listings = listings.map((l) => (l.id === params.id ? { ...l, ...body } : l));
    const updated = listings.find((l) => l.id === params.id);
    return HttpResponse.json({ data: updated });
  }),

  // Publish / Retry listing
  http.post(`${ENDPOINTS.LISTING_PUBLISH(":id")}`, async ({ params }) => {
    await delay(500);
    listings = listings.map((l) => {
      if (l.id === params.id) {
        return {
          ...l,
          status: "live",
          readinessScore: 100,
          syncErrors: [],
          blockers: [],
          lastSyncAt: new Date().toISOString(),
          publishedAt: new Date().toISOString(),
        };
      }
      return l;
    });

    const updated = listings.find((l) => l.id === params.id);
    return HttpResponse.json({
      data: {
        success: true,
        listing: updated,
        message: "Listing published to marketplace successfully.",
      },
    });
  }),

  // Bulk publish
  http.post(ENDPOINTS.LISTINGS_BULK_PUBLISH, async ({ request }) => {
    await delay(600);
    const body = (await request.json()) as { listingIds: string[] };
    const ids = body.listingIds || [];
    listings = listings.map((l) =>
      ids.includes(l.id)
        ? {
            ...l,
            status: "live",
            lastSyncAt: new Date().toISOString(),
            syncErrors: [],
          }
        : l,
    );
    return HttpResponse.json({
      data: {
        success: true,
        publishedCount: ids.length,
      },
    });
  }),
];
