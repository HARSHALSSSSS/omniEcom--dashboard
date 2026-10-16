import { http, HttpResponse, delay } from "msw";
import { ENDPOINTS } from "@/api/endpoints";
import {
  initialOrdersSummary,
  initialOrders,
  initialBatches,
  initialReturns,
} from "@/mocks/data/orders.data";
import { Order, OrderStatus } from "@/types/orders";

let orders: Order[] = [...initialOrders];

export const orderHandlers = [
  // Orders summary KPIs
  http.get(ENDPOINTS.ORDERS_SUMMARY, async () => {
    await delay(120);
    return HttpResponse.json({
      data: initialOrdersSummary,
    });
  }),

  // Orders list with filters
  http.get(ENDPOINTS.ORDERS, async ({ request }) => {
    await delay(150);
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const channel = url.searchParams.get("channel");
    const search = url.searchParams.get("search");

    let filtered = [...orders];
    if (status && status !== "all") {
      filtered = filtered.filter((o) => o.status === status);
    }
    if (channel && channel !== "all") {
      filtered = filtered.filter((o) => o.channel === channel);
    }
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (o) =>
          o.orderNumber.toLowerCase().includes(q) ||
          o.channelOrderId.toLowerCase().includes(q) ||
          o.customer.name.toLowerCase().includes(q) ||
          o.items.some((i) => i.sku.toLowerCase().includes(q)),
      );
    }

    return HttpResponse.json({
      data: filtered,
      meta: {
        total: filtered.length,
        new: filtered.filter((o) => o.status === OrderStatus.New).length,
        confirmed: filtered.filter((o) => o.status === OrderStatus.Confirmed).length,
        picking: filtered.filter((o) => o.status === OrderStatus.Picking).length,
        packing: filtered.filter((o) => o.status === OrderStatus.Packing).length,
        dispatched: filtered.filter((o) => o.status === OrderStatus.Dispatched).length,
      },
    });
  }),

  // Single order detail
  http.get(`${ENDPOINTS.ORDERS}/:id`, async ({ params }) => {
    await delay(100);
    const order = orders.find((o) => o.id === params.id) ?? orders[0];
    return HttpResponse.json({ data: order });
  }),

  // Transition Order Action (e.g. confirm, pick, pack, dispatch)
  http.post(`${ENDPOINTS.ORDERS}/:id/action`, async ({ params, request }) => {
    await delay(300);
    const body = (await request.json()) as { nextStatus: OrderStatus };
    orders = orders.map((o) => {
      if (o.id === params.id) {
        return {
          ...o,
          status: body.nextStatus,
          timeline: [
            ...o.timeline,
            {
              status: body.nextStatus,
              timestamp: new Date().toISOString(),
              description: `Status transitioned to ${body.nextStatus}.`,
            },
          ],
        };
      }
      return o;
    });

    const updated = orders.find((o) => o.id === params.id);
    return HttpResponse.json({ data: updated });
  }),

  // Fulfillment queue / batches
  http.get(ENDPOINTS.FULFILLMENT_QUEUE, async () => {
    await delay(150);
    return HttpResponse.json({
      data: {
        batches: initialBatches,
        unbatchedOrders: orders.filter((o) => o.status === OrderStatus.New || o.status === OrderStatus.Confirmed),
      },
    });
  }),

  // Returns list
  http.get(ENDPOINTS.RETURNS, async () => {
    await delay(150);
    return HttpResponse.json({
      data: initialReturns,
      meta: { total: initialReturns.length },
    });
  }),
];
