import { http, HttpResponse, delay } from "msw";
import { ENDPOINTS } from "@/api/endpoints";
import { initialReturns } from "@/mocks/data/orders.data";
import { ReturnStatus } from "@/constants/enums";
import {
  CreateReturnInput,
  SubmitInspectionInput,
  ConfirmDispositionInput,
} from "@/types/returns";

let returns = [...initialReturns];

export const returnsHandlers = [
  // 1. Get returns list with optional status/channel/search filters
  http.get(ENDPOINTS.RETURNS, async ({ request }) => {
    await delay(120);
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const channel = url.searchParams.get("channel");
    const search = url.searchParams.get("search");

    let filtered = [...returns];
    if (status && status !== "all") {
      filtered = filtered.filter((r) => r.status === status);
    }
    if (channel && channel !== "all") {
      filtered = filtered.filter((r) => r.channel === channel);
    }
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.returnNumber.toLowerCase().includes(q) ||
          r.orderNumber.toLowerCase().includes(q) ||
          r.customerName.toLowerCase().includes(q) ||
          r.items.some((i) => i.title.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q))
      );
    }

    const awaitingInspection = filtered.filter(
      (r) => r.inspectionStatus === "pending" || r.inspectionStatus === "review"
    ).length;
    const refundsPending = filtered.filter(
      (r) => r.refundStatus === "pending" || r.refundStatus === "ready"
    ).length;

    return HttpResponse.json({
      data: filtered,
      meta: {
        total: filtered.length,
        open: filtered.filter((r) => r.status !== ReturnStatus.Closed && r.status !== ReturnStatus.Refunded).length,
        awaitingInspection,
        refundsPending,
      },
    });
  }),

  // 2. Get single return by ID
  http.get(`${ENDPOINTS.RETURNS}/:id`, async ({ params }) => {
    await delay(80);
    const { id } = params;
    const found = returns.find((r) => r.id === id || r.returnNumber === id);
    if (!found) {
      return new HttpResponse(JSON.stringify({ error: "Return not found" }), { status: 404 });
    }
    return HttpResponse.json({ data: found });
  }),

  // 3. Create a new return
  http.post(ENDPOINTS.RETURNS, async ({ request }) => {
    await delay(180);
    const body = (await request.json()) as CreateReturnInput;

    const nextIndex = returns.length + 10480;
    const newReturnId = `RTN-${nextIndex}`;
    const totalAmount = body.items.reduce(
      (sum, item) => sum + (item.unitPrice || 49) * item.quantity,
      0
    );

    const newReturn = {
      id: newReturnId,
      returnNumber: newReturnId,
      orderNumber: body.orderNumber,
      channel: (body.channel || "shopify") as "shopify",
      customerName: body.customerName || "Emma Wilson",
      reason: body.reason || "Size or fit issue",
      status: ReturnStatus.Requested,
      requestedAt: new Date().toISOString(),
      receivedAt: "—",
      inspectionStatus: "not_started" as const,
      items: body.items.map((i) => ({
        sku: i.sku,
        title: i.title,
        quantity: i.quantity,
      })),
      refundAmount: Math.round(totalAmount),
      refundStatus: "pending" as const,
      inventoryDisposition: "pending" as const,
      issueNote: body.notes,
      actionText: "Review →",
    };

    returns = [newReturn as any, ...returns];
    return HttpResponse.json({ data: newReturn }, { status: 201 });
  }),

  // 4. Submit inspection results
  http.post(`${ENDPOINTS.RETURNS}/:id/inspect`, async ({ params, request }) => {
    await delay(150);
    const { id } = params;
    const body = (await request.json()) as SubmitInspectionInput;

    const index = returns.findIndex((r) => r.id === id || r.returnNumber === id);
    if (index === -1) {
      return new HttpResponse(JSON.stringify({ error: "Return not found" }), { status: 404 });
    }

    const current = returns[index];
    const newInspectionStatus =
      body.status === "Pass" ? "passed" : body.status === "Fail" ? "failed" : "review";

    const updated = {
      ...current,
      inspectionStatus: newInspectionStatus,
      status:
        body.status === "Pass"
          ? ReturnStatus.Resolution
          : body.status === "Fail"
          ? ReturnStatus.Resolution
          : ReturnStatus.Inspecting,
      refundStatus:
        body.status === "Pass" ? ("ready" as const) : current.refundStatus,
      actionText: body.status === "Pass" ? "Refund →" : "Review →",
      conditions: body.conditions,
    };

    returns[index] = updated as any;
    return HttpResponse.json({ data: updated });
  }),

  // 5. Confirm inventory disposition
  http.post(`${ENDPOINTS.RETURNS}/:id/disposition`, async ({ params, request }) => {
    await delay(120);
    const { id } = params;
    const body = (await request.json()) as ConfirmDispositionInput;

    const index = returns.findIndex((r) => r.id === id || r.returnNumber === id);
    if (index === -1) {
      return new HttpResponse(JSON.stringify({ error: "Return not found" }), { status: 404 });
    }

    const current = returns[index];
    const updated = {
      ...current,
      inventoryDisposition: body.disposition as any,
    };

    returns[index] = updated as any;
    return HttpResponse.json({ data: updated });
  }),

  // 6. Process refund
  http.post(`${ENDPOINTS.RETURNS}/:id/refund`, async ({ params }) => {
    await delay(200);
    const { id } = params;

    const index = returns.findIndex((r) => r.id === id || r.returnNumber === id);
    if (index === -1) {
      return new HttpResponse(JSON.stringify({ error: "Return not found" }), { status: 404 });
    }

    const current = returns[index];
    const updated = {
      ...current,
      refundStatus: "processed" as const,
      status: ReturnStatus.Refunded,
      actionText: "View →",
    };

    returns[index] = updated as any;
    return HttpResponse.json({ data: updated });
  }),

  // 7. Retry connector refund
  http.post(`${ENDPOINTS.RETURNS}/:id/retry-refund`, async ({ params }) => {
    await delay(200);
    const { id } = params;

    const index = returns.findIndex((r) => r.id === id || r.returnNumber === id);
    if (index === -1) {
      return new HttpResponse(JSON.stringify({ error: "Return not found" }), { status: 404 });
    }

    const current = returns[index];
    const updated = {
      ...current,
      refundStatus: "ready" as const,
      actionText: "Refund →",
    };

    returns[index] = updated as any;
    return HttpResponse.json({ data: updated });
  }),
];
