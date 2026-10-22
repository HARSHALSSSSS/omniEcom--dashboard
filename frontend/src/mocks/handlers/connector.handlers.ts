import { http, HttpResponse, delay } from "msw";
import { ENDPOINTS } from "@/api/endpoints";
import {
  initialConnections,
  connectorMarketplaceCatalog,
} from "@/mocks/data/connectors.data";
import { ChannelConnection } from "@/types/connection";

let connections: ChannelConnection[] = [...initialConnections];

export const connectorHandlers = [
  // List active connections
  http.get(ENDPOINTS.CONNECTIONS, async () => {
    await delay(150);
    return HttpResponse.json({
      data: connections,
      meta: {
        total: connections.length,
        healthy: connections.filter((c) => c.status === "healthy").length,
        warning: connections.filter((c) => c.status === "warning").length,
        error: connections.filter((c) => c.status === "error").length,
      },
    });
  }),

  // Get specific connection
  http.get(`${ENDPOINTS.CONNECTIONS}/:id`, async ({ params }) => {
    await delay(100);
    const conn = connections.find((c) => c.id === params.id);
    if (!conn) {
      return new HttpResponse(null, { status: 404 });
    }
    return HttpResponse.json({ data: conn });
  }),

  // List connectors directory / marketplace
  http.get(ENDPOINTS.CONNECTORS, async () => {
    await delay(150);
    return HttpResponse.json({
      data: connectorMarketplaceCatalog,
      meta: { total: connectorMarketplaceCatalog.length },
    });
  }),

  // Test connection credentials
  http.post(`${ENDPOINTS.CONNECTIONS}/:id/test`, async () => {
    await delay(450);
    return HttpResponse.json({
      data: {
        success: true,
        latencyMs: 142,
        serverTime: new Date().toISOString(),
        message: "Connection authenticated successfully.",
      },
    });
  }),

  // Trigger sync on a connection
  http.post(`${ENDPOINTS.CONNECTIONS}/:id/sync`, async ({ params }) => {
    await delay(300);
    connections = connections.map((c) => {
      if (c.id === params.id) {
        return {
          ...c,
          lastSyncAt: new Date().toISOString(),
          syncState: "idle",
        };
      }
      return c;
    });

    const updated = connections.find((c) => c.id === params.id);
    return HttpResponse.json({
      data: {
        success: true,
        connection: updated,
        syncedItemsCount: 427,
      },
    });
  }),

  // Authorize / Create new connection
  http.post(ENDPOINTS.CONNECTIONS, async ({ request }) => {
    await delay(400);
    const body = (await request.json()) as {
      connectorId: string;
      credentials?: Record<string, string>;
    };

    const dirItem = connectorMarketplaceCatalog.find(
      (c) => c.id === body.connectorId,
    );

    const newConn: ChannelConnection = {
      id: `conn-${body.connectorId}-${Date.now().toString().slice(-4)}`,
      connectorId: body.connectorId,
      name: dirItem?.name ?? body.connectorId,
      category: dirItem?.category ?? "marketplace",
      status: "healthy",
      authType: dirItem?.authType ?? "oauth",
      accountIdentifier:
        body.credentials?.storeDomain ||
        body.credentials?.sellerId ||
        "Connected Account",
      connectedAt: new Date().toISOString(),
      lastSyncAt: new Date().toISOString(),
      syncState: "idle",
      stats: {
        activeListings: 0,
        pendingOrders: 0,
        syncedInventoryItems: 0,
        errorCount: 0,
      },
      health: {
        pulseScore: 100,
        riskLevel: "low",
        frictionPoints: [],
        rateLimitRemainingPct: 100,
      },
      capabilities: dirItem?.capabilities ?? ["product_import", "orders"],
    };

    connections.push(newConn);
    return HttpResponse.json({ data: newConn });
  }),

  // Disconnect / Delete connection
  http.delete(`${ENDPOINTS.CONNECTIONS}/:id`, async ({ params }) => {
    await delay(250);
    connections = connections.filter((c) => c.id !== params.id);
    return HttpResponse.json({ success: true });
  }),

  // Connection Health DNA overview
  http.get(ENDPOINTS.CONNECTIONS_HEALTH, async () => {
    await delay(200);
    return HttpResponse.json({
      data: {
        overallPulseScore: 92,
        networkStatus: "optimal",
        connectionsCount: connections.length,
        totalActiveListings: connections.reduce(
          (acc, c) => acc + c.stats.activeListings,
          0,
        ),
        totalPendingOrders: connections.reduce(
          (acc, c) => acc + c.stats.pendingOrders,
          0,
        ),
        dataFlowLanes: [
          {
            lane: "Catalog & Product Publishing",
            status: "healthy",
            throughput: "42 items/min",
            successRate: "99.8%",
          },
          {
            lane: "Real-time Inventory Delta Sync",
            status: "warning",
            throughput: "140 updates/min",
            successRate: "97.2%",
          },
          {
            lane: "Order Ingestion & Tracking Signals",
            status: "healthy",
            throughput: "30 orders/min",
            successRate: "100%",
          },
        ],
        connections,
      },
    });
  }),
];
