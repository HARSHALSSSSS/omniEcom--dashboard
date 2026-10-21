import { http, HttpResponse, delay } from "msw";
import { ENDPOINTS } from "@/api/endpoints";
import {
  initialListings,
  sampleStudioData,
  initialMatrixRows,
  initialReachKPIs,
  initialIssueSummary,
  initialPublishingPreparationData,
  initialReadinessAuditData,
  initialBlockerDetail,
  initialSyncTelemetryDetail,
  initialUnlistedDetail,
} from "@/mocks/data/listings.data";
import {
  ChannelListingItem,
  CreateListingInput,
  ListingMatrixRow,
  ListingReadinessAuditData,
  ListingBlockerDetail,
  ListingSyncTelemetryDetail,
  ListingUnlistedDetail,
} from "@/types/listing";

let listings: ChannelListingItem[] = [...initialListings];
let matrixRows: ListingMatrixRow[] = [...initialMatrixRows];
let reachKPIs = { ...initialReachKPIs };
let issueSummary = { ...initialIssueSummary };
let readinessAuditData: ListingReadinessAuditData = JSON.parse(JSON.stringify(initialReadinessAuditData));
let blockerDetail: ListingBlockerDetail = JSON.parse(JSON.stringify(initialBlockerDetail));
let syncTelemetryDetail: ListingSyncTelemetryDetail = JSON.parse(JSON.stringify(initialSyncTelemetryDetail));
let unlistedDetail: ListingUnlistedDetail = JSON.parse(JSON.stringify(initialUnlistedDetail));

export const listingHandlers = [
  // List listings with pagination and filters
  http.get(ENDPOINTS.LISTINGS, async ({ request }) => {
    await delay(120);
    const url = new URL(request.url);
    const channel = url.searchParams.get("channel");
    const status = url.searchParams.get("status");
    const search = url.searchParams.get("search");
    const marketplace = url.searchParams.get("marketplace");
    const category = url.searchParams.get("category");
    const readiness = url.searchParams.get("readiness");
    const inventory = url.searchParams.get("inventory");
    const issue = url.searchParams.get("issue");
    const page = parseInt(url.searchParams.get("page") || "1", 10);
    const pageSize = parseInt(url.searchParams.get("pageSize") || "5", 10);

    let filtered = [...listings];

    if (channel && channel !== "all") {
      filtered = filtered.filter(
        (l) => l.channel.toLowerCase() === channel.toLowerCase(),
      );
    }
    if (status && status !== "all") {
      filtered = filtered.filter(
        (l) => l.status.toLowerCase() === status.toLowerCase(),
      );
    }
    if (marketplace && marketplace !== "all") {
      filtered = filtered.filter((l) =>
        l.channelName.toLowerCase().includes(marketplace.toLowerCase()),
      );
    }
    if (category && category !== "all") {
      filtered = filtered.filter((l) =>
        l.category.toLowerCase().includes(category.toLowerCase()),
      );
    }
    if (readiness) {
      if (readiness === "100") {
        filtered = filtered.filter((l) => l.readinessScore === 100);
      } else if (readiness === "high") {
        filtered = filtered.filter((l) => l.readinessScore >= 80);
      } else if (readiness === "medium") {
        filtered = filtered.filter(
          (l) => l.readinessScore >= 50 && l.readinessScore < 80,
        );
      } else if (readiness === "low") {
        filtered = filtered.filter((l) => l.readinessScore < 50);
      }
    }
    if (inventory) {
      if (inventory === "in_stock") {
        filtered = filtered.filter((l) => l.stock > 0);
      } else if (inventory === "out_of_stock") {
        filtered = filtered.filter((l) => l.stock === 0);
      }
    }
    if (issue) {
      filtered = filtered.filter((l) => l.issueType === issue);
    }
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (l) =>
          l.productTitle.toLowerCase().includes(q) ||
          l.sku.toLowerCase().includes(q) ||
          l.channelSku?.toLowerCase().includes(q) ||
          l.channelName.toLowerCase().includes(q),
      );
    }

    const totalCount = 1042; // Keep standard catalog reach scale when no specific filter is limiting
    const effectiveTotal =
      channel === "all" && !status && !search && !issue
        ? totalCount
        : filtered.length;

    const startIndex = (page - 1) * pageSize;
    const paginatedItems = filtered.slice(startIndex, startIndex + pageSize);

    return HttpResponse.json({
      data: paginatedItems,
      meta: {
        total: effectiveTotal,
        page,
        pageSize,
        totalPages: Math.ceil(effectiveTotal / pageSize),
        showingFrom: startIndex + 1,
        showingTo: Math.min(startIndex + pageSize, effectiveTotal),
        live: listings.filter((l) => l.status === "live").length,
        syncing: listings.filter((l) => l.status === "syncing").length,
        needsReview: listings.filter((l) => l.status === "needs_review").length,
        failed: listings.filter((l) => l.status === "failed").length,
        blocked: listings.filter((l) => l.status === "blocked").length,
        notListed: listings.filter((l) => l.status === "not_listed").length,
        ready: listings.filter((l) => l.status === "ready").length,
        draft: listings.filter((l) => l.status === "draft").length,
      },
    });
  }),

  // Get matrix rows
  http.get(ENDPOINTS.LISTINGS_MATRIX, async () => {
    await delay(80);
    return HttpResponse.json({ data: matrixRows });
  }),

  // Get reach KPIs
  http.get(ENDPOINTS.LISTINGS_REACH, async () => {
    await delay(80);
    return HttpResponse.json({ data: reachKPIs });
  }),

  // Get issue summary
  http.get(ENDPOINTS.LISTINGS_ISSUES, async () => {
    await delay(80);
    return HttpResponse.json({ data: issueSummary });
  }),

  // Get publishing preparation cohort data
  http.get(ENDPOINTS.LISTINGS_PUBLISHING_PREPARATION, async () => {
    await delay(100);
    return HttpResponse.json({ data: initialPublishingPreparationData });
  }),

  // Confirm publish cohort (step 3 final commit)
  http.post(ENDPOINTS.LISTINGS_CONFIRM_PUBLISH, async ({ request }) => {
    await delay(600);
    const body = (await request.json()) as { acknowledgement?: boolean };
    const isAcknowledged = Boolean(body?.acknowledgement);
    void isAcknowledged;
    
    // Convert ready listings to live
    listings = listings.map((l) =>
      l.status === "ready"
        ? {
            ...l,
            status: "live",
            readinessScore: 100,
            actionType: "manage",
            actionLabel: "Manage →",
            lastSyncAt: new Date().toISOString(),
            lastSyncText: "Just now",
          }
        : l,
    );
    
    reachKPIs.readyToPublish = 0;
    initialPublishingPreparationData.readyProductsCount = 0;

    return HttpResponse.json({
      data: {
        success: true,
        publishedCount: 186,
        message: "Successfully initiated high-volume publishing for 186 products (1,284 variants) across connected channels.",
      },
    });
  }),

  // Get listing readiness audit data (Screen 24 - Listing readiness)
  http.get(ENDPOINTS.LISTINGS_READINESS_AUDIT, async () => {
    await delay(120);
    return HttpResponse.json({ data: readinessAuditData });
  }),

  // Apply readiness AI suggestion
  http.post(ENDPOINTS.LISTINGS_APPLY_SUGGESTION, async ({ request }) => {
    await delay(300);
    const body = (await request.json()) as { suggestionId: string; action: "apply" | "dismiss" };
    
    if (body.action === "apply") {
      // Mark step as complete and remove suggestion box
      if (readinessAuditData.journey) {
        readinessAuditData.journey.steps = readinessAuditData.journey.steps.map((st) =>
          st.title === "Content ready" ? { ...st, statusText: "✓ Complete", state: "complete" } : st,
        );
        readinessAuditData.journey.statusText = "Ready for publishing";
        readinessAuditData.journey.suggestionBox = undefined;
      }
      // Increment readiness slightly
      readinessAuditData.overallReadinessPct = Math.min(100, readinessAuditData.overallReadinessPct + 2);
      readinessAuditData.readyProductsCount += 4;
      readinessAuditData.cohortDescription = `${readinessAuditData.readyProductsCount} products can be published without additional changes. ${readinessAuditData.overallReadinessPct}% readiness of preparation cohort.`;
    } else {
      // Dismissed
      if (readinessAuditData.journey) {
        readinessAuditData.journey.suggestionBox = undefined;
      }
    }

    return HttpResponse.json({
      data: {
        success: true,
        audit: readinessAuditData,
        message: body.action === "apply" ? "Suggestion applied successfully." : "Suggestion dismissed.",
      },
    });
  }),

  // Get single listing blocker detail
  http.get(`${ENDPOINTS.LISTINGS}/:id/blocker`, async ({ params }) => {
    await delay(120);
    const id = params.id as string;
    const targetListing = listings.find((l) => l.id === id);
    if (targetListing && targetListing.id !== blockerDetail.id) {
      return HttpResponse.json({
        data: {
          ...blockerDetail,
          id: targetListing.id,
          productTitle: targetListing.productTitle,
          sku: targetListing.sku,
          channel: targetListing.channel,
          channelName: targetListing.channelName,
          status: targetListing.status,
        },
      });
    }
    return HttpResponse.json({ data: blockerDetail });
  }),

  // Resolve listing blocker (e.g. entering missing attribute value)
  http.post(`${ENDPOINTS.LISTINGS}/:id/resolve-blocker`, async ({ request, params }) => {
    await delay(300);
    const body = (await request.json()) as { attributeKey?: string; value: string };
    const val = body.value || "100% Premium Cotton";

    blockerDetail = {
      ...blockerDetail,
      currentAttributeValue: val,
      status: "ready",
      blockedCount: 0,
      bannerMessage: "Listing unblocked and ready to publish",
      bannerSubtext: `Mandatory attribute ${blockerDetail.missingAttribute} (${val}) verified. You can now publish this listing.`,
      otherChannels: blockerDetail.otherChannels.map((ch) =>
        ch.channel === "amazon"
          ? { ...ch, status: "live", readinessPct: 100, accentColor: "#16A34A" }
          : ch,
      ),
    };

    // Also update main listings store
    listings = listings.map((l) =>
      l.id === params.id || l.sku === blockerDetail.sku
        ? {
            ...l,
            status: "ready",
            readinessScore: 100,
            actionType: "publish",
            actionLabel: "Publish →",
            issueType: undefined,
            issueDescription: undefined,
          }
        : l,
    );

    reachKPIs.needReview = Math.max(0, reachKPIs.needReview - 1);
    reachKPIs.readyToPublish += 1;

    return HttpResponse.json({
      data: {
        success: true,
        blocker: blockerDetail,
        message: `Successfully resolved blocker: Material attribute updated to "${val}".`,
      },
    });
  }),

  // Get listing sync telemetry (Screen: Sync in progress · Meesho)
  http.get(`${ENDPOINTS.LISTINGS}/:id/sync-telemetry`, async ({ params }) => {
    await delay(120);
    const id = params.id as string;
    const targetListing = listings.find((l) => l.id === id);
    if (targetListing) {
      return HttpResponse.json({
        data: {
          ...syncTelemetryDetail,
          id: targetListing.id,
          productTitle: targetListing.productTitle,
          sku: targetListing.sku,
          channel: targetListing.channel,
          channelName: targetListing.channelName,
          bannerTitle: `Sync in progress · ${targetListing.channelName}`,
        },
      });
    }
    return HttpResponse.json({ data: syncTelemetryDetail });
  }),

  // Get unlisted channel details (Screen: Classic Backpack · Meesho · Not listed)
  http.get(`${ENDPOINTS.LISTINGS}/:id/unlisted`, async ({ params }) => {
    await delay(120);
    const id = params.id as string;
    const targetListing = listings.find((l) => l.id === id);
    if (targetListing) {
      return HttpResponse.json({
        data: {
          ...unlistedDetail,
          id: targetListing.id,
          productId: targetListing.productId ?? unlistedDetail.productId,
          productTitle: targetListing.productTitle,
          sku: targetListing.sku,
          channel: targetListing.channel,
          channelName: targetListing.channelName,
        },
      });
    }
    return HttpResponse.json({ data: unlistedDetail });
  }),

  // Prepare listing (initiates marketplace mapping)
  http.post(`${ENDPOINTS.LISTINGS}/:id/prepare`, async ({ params, request }) => {
    await delay(300);
    const body = (await request.json().catch(() => ({}))) as { channel?: string };
    const ch = body.channel || "meesho";

    // Update listing status from not_listed to ready
    listings = listings.map((l) =>
      l.id === params.id || (l.sku === unlistedDetail.sku && l.channel === ch)
        ? {
            ...l,
            status: "ready",
            readinessScore: 95,
            actionType: "publish",
            actionLabel: "Publish →",
            lastSyncText: "Just mapped",
          }
        : l,
    );

    return HttpResponse.json({
      data: {
        success: true,
        listingId: params.id,
        message: `Successfully prepared listing for ${ch.toUpperCase()}. Ready for publishing.`,
      },
    });
  }),

  // Create new listing
  http.post(ENDPOINTS.LISTINGS, async ({ request }) => {
    await delay(200);
    const body = (await request.json()) as CreateListingInput;
    const newListing: ChannelListingItem = {
      id: `list-${Date.now()}`,
      productId: `prod-${Date.now()}`,
      productTitle: body.productTitle,
      sku: body.sku,
      channel: body.channel,
      channelName:
        body.channel.charAt(0).toUpperCase() + body.channel.slice(1),
      category: body.category || "General",
      status: "ready",
      sellingPrice: body.sellingPrice,
      mrp: body.mrp,
      stock: body.stock ?? 10,
      readinessScore: 100,
      lastSyncAt: new Date().toISOString(),
      lastSyncText: "Just now",
      actionType: "publish",
      actionLabel: "Publish →",
      qualityScore: 9.5,
    };
    listings.unshift(newListing);
    reachKPIs.activeListings += 1;
    reachKPIs.readyToPublish += 1;

    return HttpResponse.json({ data: newListing }, { status: 201 });
  }),

  // Get single listing studio data
  http.get(`${ENDPOINTS.LISTINGS}/:id`, async ({ params }) => {
    await delay(120);
    const listing = listings.find((l) => l.id === params.id) ?? listings[0];
    return HttpResponse.json({
      data: {
        ...sampleStudioData,
        listing,
      },
    });
  }),

  // Update listing
  http.put(`${ENDPOINTS.LISTINGS}/:id`, async ({ params, request }) => {
    await delay(150);
    const body = (await request.json()) as Partial<ChannelListingItem>;
    listings = listings.map((l) =>
      l.id === params.id ? { ...l, ...body } : l,
    );
    const updated = listings.find((l) => l.id === params.id);
    return HttpResponse.json({ data: updated });
  }),

  // Publish / Retry listing
  http.post(`${ENDPOINTS.LISTING_PUBLISH(":id")}`, async ({ params }) => {
    await delay(350);
    listings = listings.map((l) => {
      if (l.id === params.id) {
        return {
          ...l,
          status: "live",
          readinessScore: 100,
          actionType: "manage",
          actionLabel: "Manage →",
          syncErrors: [],
          blockers: [],
          lastSyncAt: new Date().toISOString(),
          lastSyncText: "Just now",
          publishedAt: new Date().toISOString(),
        };
      }
      return l;
    });

    reachKPIs.readyToPublish = Math.max(0, reachKPIs.readyToPublish - 1);
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
    await delay(450);
    const body = (await request.json()) as { listingIds: string[] };
    const ids = body.listingIds || [];
    listings = listings.map((l) =>
      ids.includes(l.id)
        ? {
            ...l,
            status: "live",
            readinessScore: 100,
            actionType: "manage",
            actionLabel: "Manage →",
            lastSyncAt: new Date().toISOString(),
            lastSyncText: "Just now",
            syncErrors: [],
          }
        : l,
    );
    reachKPIs.readyToPublish = Math.max(0, reachKPIs.readyToPublish - ids.length);

    return HttpResponse.json({
      data: {
        success: true,
        publishedCount: ids.length,
      },
    });
  }),
];
