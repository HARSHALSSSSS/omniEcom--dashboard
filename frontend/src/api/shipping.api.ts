import { client } from "@/api/client";
import { ENDPOINTS } from "@/api/endpoints";
import {
  ShippingOverviewResponse,
  ShippingPulse,
  ShippingMethodItem,
  ShippingRuleItem,
  TrackingRecord,
} from "@/types/shipping";

export const shippingApi = {
  getOverview: async (): Promise<ShippingOverviewResponse> => {
    const res = await client.get<ShippingOverviewResponse>(ENDPOINTS.SHIPPING_SUMMARY);
    return res.data;
  },

  getPulse: async (): Promise<ShippingPulse> => {
    const res = await client.get<ShippingPulse>(ENDPOINTS.SHIPPING_SUMMARY);
    return res.data;
  },

  getMethods: async (): Promise<ShippingMethodItem[]> => {
    const res = await client.get<{ methods: ShippingMethodItem[] }>(ENDPOINTS.SHIPPING_METHODS);
    return res.data.methods;
  },

  getRules: async (): Promise<ShippingRuleItem[]> => {
    const res = await client.get<{ rules: ShippingRuleItem[] }>(ENDPOINTS.SHIPPING_RULES);
    return res.data.rules;
  },

  getTracking: async (): Promise<TrackingRecord[]> => {
    const res = await client.get<{ tracking: TrackingRecord[] }>(ENDPOINTS.SHIPPING_TRACKING);
    return res.data.tracking;
  },

  syncShipping: async (): Promise<{ success: boolean; processed: number; updated: number; exceptions: number }> => {
    const res = await client.post(`${ENDPOINTS.SHIPPING_SUMMARY}/sync`);
    return res.data;
  },

  assignShippingMethod: async (orderId: string, methodId: string) => {
    const res = await client.post(`${ENDPOINTS.SHIPPING_METHODS}/assign`, { orderId, methodId });
    return res.data;
  },

  createRule: async (rule: Omit<ShippingRuleItem, "id">): Promise<ShippingRuleItem> => {
    const res = await client.post(ENDPOINTS.SHIPPING_RULES, rule);
    return res.data;
  },
};
