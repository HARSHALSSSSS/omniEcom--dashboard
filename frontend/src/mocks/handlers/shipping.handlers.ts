import { http, HttpResponse } from "msw";
import { ENDPOINTS } from "@/api/endpoints";
import {
  initialShippingOverview,
  initialShippingMethods,
  initialShippingRules,
  initialTrackingRecords,
} from "@/mocks/data/shipping.data";
import { ShippingRuleItem } from "@/types/shipping";

let currentRules = [...initialShippingRules];
let currentMethods = [...initialShippingMethods];
let currentOverview = { ...initialShippingOverview };

export const shippingHandlers = [
  // GET shipping overview (summary, pulse, orders, exceptions)
  http.get(ENDPOINTS.SHIPPING_SUMMARY, () => {
    return HttpResponse.json(currentOverview);
  }),

  // GET shipping methods
  http.get(ENDPOINTS.SHIPPING_METHODS, () => {
    return HttpResponse.json({ methods: currentMethods });
  }),

  // GET shipping rules
  http.get(ENDPOINTS.SHIPPING_RULES, () => {
    return HttpResponse.json({ rules: currentRules });
  }),

  // POST create shipping rule
  http.post(ENDPOINTS.SHIPPING_RULES, async ({ request }) => {
    const body = (await request.json()) as Omit<ShippingRuleItem, "id">;
    const newRule: ShippingRuleItem = {
      id: `rule-${Date.now()}`,
      ...body,
    };
    currentRules.push(newRule);
    return HttpResponse.json(newRule, { status: 201 });
  }),

  // GET tracking records
  http.get(ENDPOINTS.SHIPPING_TRACKING, () => {
    return HttpResponse.json({ tracking: initialTrackingRecords });
  }),

  // POST sync shipping
  http.post(`${ENDPOINTS.SHIPPING_SUMMARY}/sync`, () => {
    return HttpResponse.json({
      success: true,
      processed: 184,
      updated: 181,
      exceptions: 3,
      timestamp: new Date().toISOString(),
    });
  }),

  // POST assign shipping method
  http.post(`${ENDPOINTS.SHIPPING_METHODS}/assign`, async ({ request }) => {
    const { orderId, methodId } = (await request.json()) as { orderId: string; methodId: string };
    const method = currentMethods.find((m) => m.id === methodId);
    return HttpResponse.json({
      id: orderId,
      orderNumber: orderId,
      selectedShipping: method?.name || "Selected Shipping",
      status: "confirmed",
    });
  }),
];
