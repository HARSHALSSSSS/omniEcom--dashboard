import { useQuery } from "@tanstack/react-query";
import { automationApi, assistantApi, settingsApi } from "@/api/platform.api";

export const PLATFORM_KEYS = {
  automation: ["platform", "automation"] as const,
  assistantInsights: ["platform", "assistant", "insights"] as const,
  settings: ["platform", "settings"] as const,
};

export function useAutomationOverview() {
  return useQuery({
    queryKey: PLATFORM_KEYS.automation,
    queryFn: automationApi.getOverview,
  });
}

export function useAssistantInsights() {
  return useQuery({
    queryKey: PLATFORM_KEYS.assistantInsights,
    queryFn: assistantApi.getInsights,
  });
}

export function usePlatformSettings() {
  return useQuery({
    queryKey: PLATFORM_KEYS.settings,
    queryFn: settingsApi.getSettings,
  });
}
