import { http, HttpResponse, delay } from "msw";
import { ENDPOINTS } from "@/api/endpoints";
import { initialAttentionItems } from "@/mocks/data/attention.data";
import { NeedsAttentionItem } from "@/types/attention";

let attentionItems: NeedsAttentionItem[] = [...initialAttentionItems];

export const attentionHandlers = [
  // List attention queue
  http.get(ENDPOINTS.NEEDS_ATTENTION, async ({ request }) => {
    await delay(120);
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const priority = url.searchParams.get("priority");

    let filtered = [...attentionItems];
    if (status && status !== "all") {
      filtered = filtered.filter((i) => i.status === status);
    }
    if (priority && priority !== "all") {
      filtered = filtered.filter((i) => i.priority === priority);
    }

    const openItems = attentionItems.filter((i) => i.status === "open");

    return HttpResponse.json({
      data: filtered,
      meta: {
        total: filtered.length,
        openCount: openItems.length,
        criticalCount: openItems.filter((i) => i.priority === "critical").length,
        highCount: openItems.filter((i) => i.priority === "high").length,
      },
    });
  }),

  // Resolve or snooze attention item
  http.post(`${ENDPOINTS.NEEDS_ATTENTION}/:id/action`, async ({ params, request }) => {
    await delay(200);
    const body = (await request.json()) as {
      action: "resolve" | "snooze" | "in_progress";
      snoozeHours?: number;
    };

    attentionItems = attentionItems.map((item) => {
      if (item.id === params.id) {
        if (body.action === "resolve") {
          return {
            ...item,
            status: "resolved",
            resolvedAt: new Date().toISOString(),
          };
        } else if (body.action === "snooze") {
          return {
            ...item,
            status: "snoozed",
            snoozedUntil: new Date(
              Date.now() + 1000 * 60 * 60 * (body.snoozeHours ?? 4),
            ).toISOString(),
          };
        } else if (body.action === "in_progress") {
          return {
            ...item,
            status: "in_progress",
          };
        }
      }
      return item;
    });

    const updated = attentionItems.find((i) => i.id === params.id);
    return HttpResponse.json({ data: updated });
  }),
];
