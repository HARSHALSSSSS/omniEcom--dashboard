import { http, HttpResponse } from "msw";
import {
  MOCK_PRICING_METRICS,
  MOCK_PRICING_PROPOSALS,
  MOCK_PRICING_RULES,
  MOCK_CAMPAIGNS,
  MOCK_PROMO_PRODUCTS,
  MOCK_SUPPLIERS,
  MOCK_PURCHASE_ORDERS,
  MOCK_PROFITABILITY_WATERFALL,
  MOCK_CHANNEL_PROFITABILITY,
  MOCK_PRODUCT_INTELLIGENCE,
  MOCK_SCHEDULED_REPORTS,
} from "@/mocks/data/phase10.data";
import {
  MOCK_COPILOT_INSIGHTS,
  MOCK_COPILOT_HISTORY,
  MOCK_AUTOMATION_RULES,
  MOCK_AUTOMATION_APPROVALS,
  MOCK_AUTOMATION_RUNS,
} from "@/mocks/data/assistant.data";
import {
  MOCK_BUSINESS_SETTINGS,
  MOCK_GSTIN_ENTRIES,
  MOCK_OPERATIONAL_PREFERENCES,
  MOCK_NOTIFICATIONS,
} from "@/mocks/data/settings.data";

export const hardeningHandlers = [
  // Pricing
  http.get("/api/v1/pricing/overview", () => {
    return HttpResponse.json({
      metrics: MOCK_PRICING_METRICS,
      rules: MOCK_PRICING_RULES,
    });
  }),
  http.get("/api/v1/pricing/proposals", () => {
    return HttpResponse.json({ proposals: MOCK_PRICING_PROPOSALS });
  }),
  http.post("/api/v1/pricing/proposals/:id/:action", ({ params }) => {
    return HttpResponse.json({
      success: true,
      proposalId: params.id,
      action: params.action,
      timestamp: new Date().toISOString(),
    });
  }),

  // Promotions
  http.get("/api/v1/promotions/overview", () => {
    return HttpResponse.json({
      campaigns: MOCK_CAMPAIGNS,
      products: MOCK_PROMO_PRODUCTS,
    });
  }),
  http.get("/api/v1/promotions/campaigns", () => {
    return HttpResponse.json({ campaigns: MOCK_CAMPAIGNS });
  }),

  // Procurement
  http.get("/api/v1/procurement/overview", () => {
    return HttpResponse.json({
      suppliers: MOCK_SUPPLIERS,
      orders: MOCK_PURCHASE_ORDERS,
    });
  }),
  http.get("/api/v1/procurement/suppliers", () => {
    return HttpResponse.json({ suppliers: MOCK_SUPPLIERS });
  }),
  http.get("/api/v1/procurement/purchase-orders", () => {
    return HttpResponse.json({ orders: MOCK_PURCHASE_ORDERS });
  }),

  // Intelligence
  http.get("/api/v1/profitability/waterfall", () => {
    return HttpResponse.json({
      waterfall: MOCK_PROFITABILITY_WATERFALL,
      channels: MOCK_CHANNEL_PROFITABILITY,
    });
  }),
  http.get("/api/v1/product-intelligence", () => {
    return HttpResponse.json({ items: MOCK_PRODUCT_INTELLIGENCE });
  }),
  http.get("/api/v1/reports", () => {
    return HttpResponse.json({ reports: MOCK_SCHEDULED_REPORTS });
  }),

  // AI & Automation
  http.get("/api/v1/ai/insights", () => {
    return HttpResponse.json({ insights: MOCK_COPILOT_INSIGHTS });
  }),
  http.get("/api/v1/ai/conversations", () => {
    return HttpResponse.json({ conversations: MOCK_COPILOT_HISTORY });
  }),
  http.get("/api/v1/automation/overview", () => {
    return HttpResponse.json({
      rules: MOCK_AUTOMATION_RULES,
      approvals: MOCK_AUTOMATION_APPROVALS,
      runs: MOCK_AUTOMATION_RUNS,
    });
  }),

  // Settings & Notifications
  http.get("/api/v1/settings", () => {
    return HttpResponse.json({
      business: MOCK_BUSINESS_SETTINGS,
      gstin: MOCK_GSTIN_ENTRIES,
      preferences: MOCK_OPERATIONAL_PREFERENCES,
    });
  }),
  http.get("/api/v1/notifications", () => {
    return HttpResponse.json({ notifications: MOCK_NOTIFICATIONS });
  }),
  http.patch("/api/v1/notifications/:id/read", ({ params }) => {
    return HttpResponse.json({ success: true, notificationId: params.id });
  }),
];
