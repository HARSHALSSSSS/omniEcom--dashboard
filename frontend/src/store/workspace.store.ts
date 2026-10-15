import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface WorkspaceUser {
  id: string;
  fullName: string;
  email: string;
  businessName: string;
  businessType?: string;
  teamSize?: string;
  city?: string;
  role: "owner" | "admin" | "seller" | "viewer";
}

export interface OnboardingState {
  business: {
    name: string;
    type: string;
    teamSize: string;
    city: string;
  };
  connectedChannels: string[];
  importedCatalogs: string[];
  inventory: {
    mode: "simple" | "warehouse";
    locationName: string;
    warehouseName?: string;
    city?: string;
    address?: string;
    startingMethod?: "manual" | "marketplace" | "file";
  };
  fulfillment: {
    method: "marketplace" | "seller" | "third_party";
    preference: string;
  };
}

interface WorkspaceStore {
  isAuthenticated: boolean;
  user: WorkspaceUser | null;
  needsAttentionCount: number;
  onboardingComplete: boolean;
  onboardingData: OnboardingState;

  // Actions
  setUser: (user: WorkspaceUser | null) => void;
  setAuthenticated: (status: boolean) => void;
  setNeedsAttentionCount: (count: number) => void;
  setOnboardingComplete: (complete: boolean) => void;
  updateOnboardingData: (data: Partial<OnboardingState>) => void;
  toggleChannelConnection: (channelId: string) => void;
  completeOnboarding: () => void;
  clearWorkspace: () => void;
}

const DEFAULT_ONBOARDING_DATA: OnboardingState = {
  business: {
    name: "Nova Living",
    type: "d2c_brand",
    teamSize: "just_me",
    city: "Mumbai, Maharashtra",
  },
  connectedChannels: ["amazon"],
  importedCatalogs: ["amazon"],
  inventory: {
    mode: "simple",
    locationName: "Home Inventory",
    startingMethod: "manual",
  },
  fulfillment: {
    method: "marketplace",
    preference: "Recommended for most orders",
  },
};

const DEFAULT_USER: WorkspaceUser = {
  id: "user-001",
  fullName: "Aayush Kumar",
  email: "aayush@gmail.com",
  businessName: "Nova Living",
  businessType: "d2c_brand",
  teamSize: "just_me",
  city: "Mumbai, Maharashtra",
  role: "owner",
};

export const useWorkspaceStore = create<WorkspaceStore>()(
  persist(
    (set) => ({
      isAuthenticated: true,
      user: DEFAULT_USER,
      needsAttentionCount: 4,
      onboardingComplete: true,
      onboardingData: DEFAULT_ONBOARDING_DATA,

      setUser: (user) => set({ user, isAuthenticated: !!user }),
      setAuthenticated: (isAuthenticated) => set({ isAuthenticated }),
      setNeedsAttentionCount: (count) => set({ needsAttentionCount: count }),
      setOnboardingComplete: (onboardingComplete) => set({ onboardingComplete }),

      updateOnboardingData: (partial) =>
        set((state) => ({
          onboardingData: { ...state.onboardingData, ...partial },
        })),

      toggleChannelConnection: (channelId) =>
        set((state) => {
          const current = state.onboardingData.connectedChannels;
          const exists = current.includes(channelId);
          const updated = exists
            ? current.filter((id) => id !== channelId)
            : [...current, channelId];
          return {
            onboardingData: {
              ...state.onboardingData,
              connectedChannels: updated,
            },
          };
        }),

      completeOnboarding: () =>
        set((state) => ({
          onboardingComplete: true,
          user: state.user
            ? {
              ...state.user,
              businessName:
                state.onboardingData.business.name || state.user.businessName,
              businessType: state.onboardingData.business.type,
              city: state.onboardingData.business.city,
            }
            : null,
        })),

      clearWorkspace: () =>
        set({
          isAuthenticated: false,
          user: null,
          needsAttentionCount: 0,
          onboardingComplete: false,
          onboardingData: DEFAULT_ONBOARDING_DATA,
        }),
    }),
    {
      name: "omni-ecom-workspace-store",
    },
  ),
);
