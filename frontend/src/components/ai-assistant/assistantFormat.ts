import { isApiError } from "@/api/errors";
import { formatInZone } from "@/utils/format";
import type { AssistantConversation, SuggestedAction } from "@/types/assistant";

export const TEXT_MIN = 3;
export const TEXT_MAX = 500;
export const TITLE_MAX = 80;
/** the server stores at most this many messages in one conversation */
export const MAX_MESSAGES = 200;

export type BlockReason = "feature_disabled" | "ai_disabled";

/** a 403 from the AI endpoints that means "AI is off" (not "you may not"): the platform flag, or the business switch */
export function blockReason(e: unknown): BlockReason | null {
  if (!isApiError(e) || e.status !== 403) return null;
  return e.rule === "feature_disabled" || e.rule === "ai_disabled" ? e.rule : null;
}

/** the message time in the business time zone, with the day ("21 Oct, 14:05") */
export function formatMessageTime(iso: string): string {
  return formatInZone(iso, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
}

export function isFull(c: Pick<AssistantConversation, "messagesCount"> | undefined): boolean {
  return !!c && c.messagesCount + 2 > MAX_MESSAGES;
}

/** only in-app paths are followed: the server never sends anything else, and a link must never leave the app */
export function safeTarget(url: string | undefined): string | null {
  if (!url || !url.startsWith("/") || url.startsWith("//") || url.includes("\\")) return null;
  return url;
}

/** where an action that is not a plain link lands when the server gave no address */
export function actionTarget(a: SuggestedAction): string | null {
  const given = safeTarget(a.targetUrl);
  if (given) return given;
  if (a.actionType === "apply_rule") return "/automation";
  if (a.actionType === "draft_po") return "/procurement";
  return null;
}

export const ACTION_CONFIRM: Record<SuggestedAction["actionType"], { title: string; confirm: string }> = {
  navigate: { title: "Open this page?", confirm: "Open" },
  apply_rule: { title: "Review this automation rule?", confirm: "Open automation" },
  draft_po: { title: "Start a purchase order?", confirm: "Open procurement" },
  dismiss: { title: "Dismiss this suggestion?", confirm: "Dismiss" },
};

export const SEVERITY_CLASS: Record<string, string> = {
  critical: "bg-red-50 text-red-700 border-red-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
  info: "bg-sky-50 text-sky-700 border-sky-200",
};
