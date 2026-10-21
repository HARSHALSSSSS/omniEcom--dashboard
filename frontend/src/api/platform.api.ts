import { client } from "./client";
import { ENDPOINTS } from "./endpoints";
import type {
  AutomationRule,
  AutomationApprovalItem,
  AutomationRunLog,
} from "@/types/automation";
import type {
  BusinessSettings,
  GstinEntry,
  OperationalPreferences,
} from "@/types/settings";

export const automationApi = {
  getOverview: async (): Promise<{
    rules: AutomationRule[];
    approvals: AutomationApprovalItem[];
    runs: AutomationRunLog[];
  }> => {
    const res = await client.get(ENDPOINTS.AUTOMATION_OVERVIEW);
    return res.data;
  },
};

export const assistantApi = {
  getInsights: async () => {
    const res = await client.get(ENDPOINTS.AI_INSIGHTS);
    return res.data;
  },
  getConversations: async () => {
    const res = await client.get(ENDPOINTS.AI_CONVERSATIONS);
    return res.data;
  },
};

export const settingsApi = {
  getSettings: async (): Promise<{
    business: BusinessSettings;
    gstin: GstinEntry[];
    preferences: OperationalPreferences;
  }> => {
    const res = await client.get("/settings");
    return res.data;
  },
};
