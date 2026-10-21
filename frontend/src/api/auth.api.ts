import { client, unwrap, type SessionTokens } from "./client";
import { ENDPOINTS } from "./endpoints";

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  userType: "vendor" | "platform";
  vendorId: string | null;
  roles: string[];
  emailVerified: boolean;
  status: string;
  lastLoginAt: string | null;
}

export interface AuthVendor {
  id: string;
  displayName: string;
  slug: string;
  status: string;
}

/** POST /auth/login and POST /auth/refresh */
export interface LoginResult extends SessionTokens {
  tokenType: "Bearer";
  user: AuthUser;
  vendor: AuthVendor | null;
}

export interface RegisterInput {
  businessName: string;
  fullName: string;
  email: string;
  password: string;
  phone?: string;
  gstin?: string;
}

export interface RegisterResult {
  user: AuthUser;
  vendor: AuthVendor;
  emailVerificationRequired: boolean;
}

/** GET /me */
export interface MeResult {
  userId: string;
  userType: "vendor" | "platform";
  vendorId: string | null;
  roles: string[];
  permissions: string[];
}

export interface OnboardingSummary {
  status: "in_progress" | "completed";
  currentStep: string;
  resumeStep: string;
  percentComplete: number;
}

export const authApi = {
  login: async (email: string, password: string) => unwrap<LoginResult>(await client.post(ENDPOINTS.AUTH_LOGIN, { email, password })),
  register: async (input: RegisterInput) => unwrap<RegisterResult>(await client.post(ENDPOINTS.AUTH_REGISTER, input)),
  logout: async () => {
    await client.post(ENDPOINTS.AUTH_LOGOUT, {});
  },
  me: async () => unwrap<MeResult>(await client.get(ENDPOINTS.ME)),
  onboarding: async () => unwrap<OnboardingSummary>(await client.get(ENDPOINTS.ONBOARDING)),
  verifyEmail: async (token: string) => {
    await client.post(ENDPOINTS.AUTH_VERIFY_EMAIL, { token });
  },
  resendVerification: async () => {
    await client.post(ENDPOINTS.AUTH_RESEND_VERIFICATION, {});
  },
  forgotPassword: async (email: string) => {
    await client.post(ENDPOINTS.AUTH_FORGOT_PASSWORD, { email });
  },
  resetPassword: async (token: string, password: string) => {
    await client.post(ENDPOINTS.AUTH_RESET_PASSWORD, { token, password });
  },
};
