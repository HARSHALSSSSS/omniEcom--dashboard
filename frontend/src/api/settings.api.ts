import { client, unwrap } from "./client";
import { ENDPOINTS } from "./endpoints";
import type {
  AccountSession,
  AiSettings,
  CursorPage,
  Gstin,
  GstinCheck,
  GstinCreateBody,
  GstinPatchBody,
  GstState,
  Invitation,
  Member,
  MemberStatus,
  Role,
  SettingsOverview,
  SettingsPatch,
  VendorRoleKey,
} from "@/types/settings";

interface CursorEnvelope<T> {
  data: { data: T[]; meta?: { nextCursor?: string | null; hasMore?: boolean } };
}
const cursorPage = <T>(res: CursorEnvelope<T>): CursorPage<T> => ({
  items: res.data.data,
  nextCursor: res.data.meta?.nextCursor ?? null,
  hasMore: res.data.meta?.hasMore ?? false,
});

/** The Settings screen: one aggregate read, one save, the GSTIN registry, AI switch, team and account security. */
export const settingsApi = {
  get: async (): Promise<SettingsOverview> => unwrap(await client.get(ENDPOINTS.SETTINGS)),
  /** only the changed groups plus the `version` that was read; returns the refreshed aggregate */
  save: async (patch: SettingsPatch): Promise<SettingsOverview> => unwrap(await client.patch(ENDPOINTS.SETTINGS, patch)),

  // GSTIN registry
  gstStates: async (): Promise<GstState[]> => unwrap(await client.get(ENDPOINTS.VENDOR_GST_STATES)),
  validateGstin: async (gstin: string, signal?: AbortSignal): Promise<GstinCheck> => unwrap(await client.post(ENDPOINTS.VENDOR_GSTIN_VALIDATE, { gstin }, { signal })),
  addGstin: async (body: GstinCreateBody): Promise<Gstin> => unwrap(await client.post(ENDPOINTS.VENDOR_GSTINS, body)),
  updateGstin: async (id: string, body: GstinPatchBody): Promise<Gstin> => unwrap(await client.patch(ENDPOINTS.VENDOR_GSTIN(id), body)),
  setPrimaryGstin: async (id: string): Promise<Gstin> => unwrap(await client.post(ENDPOINTS.VENDOR_GSTIN_PRIMARY(id), {})),
  deleteGstin: async (id: string): Promise<{ deleted: true }> => unwrap(await client.delete(ENDPOINTS.VENDOR_GSTIN(id))),

  // advisory AI
  getAi: async (): Promise<AiSettings> => unwrap(await client.get(ENDPOINTS.AI_SETTINGS)),
  setAiEnabled: async (enabled: boolean): Promise<AiSettings> => unwrap(await client.put(ENDPOINTS.AI_SETTINGS, { enabled })),

  // team and access
  listMembers: async (params: { cursor?: string; q?: string; status?: MemberStatus; role?: VendorRoleKey; limit?: number } = {}): Promise<CursorPage<Member>> => {
    const query: Record<string, string | number> = { limit: params.limit ?? 50 };
    if (params.cursor) query.cursor = params.cursor;
    if (params.q) query.q = params.q;
    if (params.status) query["filter[status]"] = params.status;
    if (params.role) query["filter[role]"] = params.role;
    return cursorPage<Member>(await client.get(ENDPOINTS.USERS, { params: query }));
  },
  updateMember: async (id: string, body: { roleKey?: VendorRoleKey; status?: "active" | "disabled"; fullName?: string }): Promise<Member> =>
    unwrap(await client.patch(ENDPOINTS.USER(id), body)),
  removeMember: async (id: string): Promise<{ message: string }> => unwrap(await client.delete(ENDPOINTS.USER(id))),
  listInvitations: async (params: { cursor?: string; status?: Invitation["status"]; limit?: number } = {}): Promise<CursorPage<Invitation>> => {
    const query: Record<string, string | number> = { limit: params.limit ?? 50 };
    if (params.cursor) query.cursor = params.cursor;
    if (params.status) query["filter[status]"] = params.status;
    return cursorPage<Invitation>(await client.get(ENDPOINTS.INVITATIONS, { params: query }));
  },
  invite: async (body: { email: string; roleKey: VendorRoleKey }): Promise<Invitation> => unwrap(await client.post(ENDPOINTS.INVITATIONS, body)),
  resendInvitation: async (id: string): Promise<Invitation> => unwrap(await client.post(ENDPOINTS.INVITATION_RESEND(id), {})),
  revokeInvitation: async (id: string): Promise<Invitation> => unwrap(await client.delete(ENDPOINTS.INVITATION(id))),
  roles: async (): Promise<Role[]> => unwrap(await client.get(ENDPOINTS.ROLES)),

  // account security (the signed-in person)
  changePassword: async (body: { currentPassword: string; newPassword: string }): Promise<{ message: string }> => unwrap(await client.post(ENDPOINTS.ME_CHANGE_PASSWORD, body)),
  sessions: async (): Promise<AccountSession[]> => unwrap(await client.get(ENDPOINTS.ME_SESSIONS)),
  revokeOtherSessions: async (): Promise<{ revoked: number }> => unwrap(await client.delete(ENDPOINTS.ME_SESSIONS)),
  revokeSession: async (id: string): Promise<{ message: string }> => unwrap(await client.delete(ENDPOINTS.ME_SESSION(id))),
  updateProfile: async (fullName: string): Promise<{ user: { id: string; fullName: string; email: string } }> => unwrap(await client.patch(ENDPOINTS.ME_PROFILE, { fullName })),
};
