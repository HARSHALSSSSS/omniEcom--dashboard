import { create } from "zustand";
import { persist } from "zustand/middleware";

/** the signed-in person, as the shell shows them */
export interface WorkspaceUser {
  id: string;
  fullName: string;
  email: string;
  businessName: string;
  businessType?: string;
  teamSize?: string;
  city?: string;
  /** display role derived from the server role (vendor_admin -> owner, vendor_staff -> seller, vendor_viewer -> viewer) */
  role: "owner" | "admin" | "seller" | "viewer";
  emailVerified?: boolean;
}

/** GET /workspace/shell: what the sidebar and top bar need */
export interface ShellData {
  user: { id: string; name: string; initials: string; roleLabel: string; email?: string; role?: string };
  business: { id: string; name: string; plan: string; tier: string; timezone?: string; currency?: string; numberFormat?: string; preferences?: { defaultRoute: string; pageSize: number; reportingPeriod: "7d" | "30d" | "qtd" | "fytd"; catalogView: string; language: string; telemetrySeconds: number; showThumbnails: boolean } };
  badges: { needsAttention: number; orders: number; returns: number; notifications: number };
  features: Record<string, boolean>;
  inventoryMode?: string;
  unreadBySeverity?: Record<string, number>;
}

export type OnboardingStatus = "in_progress" | "completed";
export type BootstrapStatus = "idle" | "loading" | "ready";

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
  /** session: nothing here is persisted, it is rebuilt from the server on every page load */
  bootstrapStatus: BootstrapStatus;
  isAuthenticated: boolean;
  user: WorkspaceUser | null;
  permissions: string[];
  shell: ShellData | null;
  onboardingStatus: OnboardingStatus | null;
  onboardingResumeStep: string;
  needsAttentionCount: number;
  onboardingComplete: boolean;

  /** the business name typed at sign-up, an unsaved-form buffer only: the server (GET /onboarding) is the source of truth */
  onboardingData: OnboardingState;

  setBootstrapStatus: (status: BootstrapStatus) => void;
  setSession: (session: {
    user: WorkspaceUser;
    permissions: string[];
    shell: ShellData | null;
    onboardingStatus: OnboardingStatus;
    onboardingResumeStep: string;
  }) => void;
  setShell: (shell: ShellData) => void;
  setUser: (user: WorkspaceUser | null) => void;
  setAuthenticated: (status: boolean) => void;
  setNeedsAttentionCount: (count: number) => void;
  setOnboardingComplete: (complete: boolean) => void;
  updateOnboardingData: (data: Partial<OnboardingState>) => void;
  /** where the server says onboarding stands (GET /onboarding); the route guards read it */
  setOnboardingProgress: (progress: { status: OnboardingStatus; resumeStep: string }) => void;
  clearWorkspace: () => void;
}

const DEFAULT_ONBOARDING_DATA: OnboardingState = {
  business: {
    name: "",
    type: "d2c_brand",
    teamSize: "just_me",
    city: "",
  },
  connectedChannels: [],
  importedCatalogs: [],
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

const SIGNED_OUT = {
  isAuthenticated: false,
  user: null,
  permissions: [] as string[],
  shell: null,
  onboardingStatus: null,
  onboardingResumeStep: "business",
  needsAttentionCount: 0,
  onboardingComplete: false,
};

export const useWorkspaceStore = create<WorkspaceStore>()(
  persist(
    (set) => ({
      bootstrapStatus: "idle",
      ...SIGNED_OUT,
      onboardingData: DEFAULT_ONBOARDING_DATA,

      setBootstrapStatus: (bootstrapStatus) => set({ bootstrapStatus }),

      setSession: ({ user, permissions, shell, onboardingStatus, onboardingResumeStep }) =>
        set({
          isAuthenticated: true,
          user,
          permissions,
          shell,
          onboardingStatus,
          onboardingResumeStep,
          onboardingComplete: onboardingStatus === "completed",
          needsAttentionCount: shell?.badges.needsAttention ?? 0,
        }),

      setShell: (shell) => set({ shell, needsAttentionCount: shell.badges.needsAttention }),
      setUser: (user) => set({ user, isAuthenticated: !!user }),
      setAuthenticated: (isAuthenticated) => set({ isAuthenticated }),
      setNeedsAttentionCount: (count) => set({ needsAttentionCount: count }),
      setOnboardingComplete: (onboardingComplete) =>
        set({ onboardingComplete, onboardingStatus: onboardingComplete ? "completed" : "in_progress" }),

      updateOnboardingData: (partial) =>
        set((state) => ({
          onboardingData: { ...state.onboardingData, ...partial },
        })),

      setOnboardingProgress: ({ status, resumeStep }) =>
        set({ onboardingStatus: status, onboardingResumeStep: resumeStep, onboardingComplete: status === "completed" }),

      clearWorkspace: () =>
        set({
          ...SIGNED_OUT,
          onboardingData: DEFAULT_ONBOARDING_DATA,
        }),
    }),
    {
      name: "omni-onboarding-draft",
      // only the wizard draft survives a reload; the session is always rebuilt from the server
      partialize: (state) => ({ onboardingData: state.onboardingData }),
    },
  ),
);
