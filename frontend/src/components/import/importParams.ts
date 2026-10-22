import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { ROW_STATUSES, type ImportSession, type IssueSeverity, type IssueStatus, type RowStatus } from "@/types/import";
import { ROUTES } from "@/constants/routes";
import { hasFile } from "./importFormat";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const oneOf = <T extends string>(value: string | null | undefined, allowed: readonly T[]): T | undefined => allowed.find((a) => a === value);
const positive = (value: string | null, fallback: number): number => {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? n : fallback;
};

export const resumeUrl = (id: string) => `${ROUTES.PRODUCTS_IMPORT}?import=${id}`;
export const issuesUrl = (id: string) => `${ROUTES.PRODUCTS_IMPORT}/${id}/issues`;

export const PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;

// ---------------------------------------------------------------- wizard

export const WIZARD_STEPS = [
  { id: "source", label: "Source" },
  { id: "upload", label: "Upload" },
  { id: "mapping", label: "Mapping" },
  { id: "review", label: "Review" },
  { id: "import", label: "Import" },
] as const;
export type WizardStepId = (typeof WIZARD_STEPS)[number]["id"];
const STEP_IDS = WIZARD_STEPS.map((s) => s.id);

/**
 * the furthest step an import may be on, and the one a seller continues on (by status):
 * source, upload, mapping (analysed), review (validating / exceptions), import (confirmation, commit)
 */
export function stepBounds(session: ImportSession | undefined): { max: number; natural: number } {
  if (!session) return { max: 1, natural: 0 };
  if (!hasFile(session)) return { max: 1, natural: session.status === "created" ? 1 : 0 };
  switch (session.status) {
    case "created":
      return { max: 1, natural: 1 };
    case "uploaded":
    case "analyzed":
      return { max: 2, natural: 2 };
    case "validating":
    case "failed":
      return { max: 3, natural: 3 };
    case "validated":
      return { max: 4, natural: 3 };
    case "cancelled":
      return { max: 0, natural: 0 };
    default:
      // committing, committed, partially_committed
      return { max: 4, natural: 4 };
  }
}

export interface WizardUrl {
  importId: string | null;
  requestedStep: WizardStepId | null;
  historyPage: number;
}

export function readWizardUrl(params: URLSearchParams): WizardUrl {
  const id = params.get("import") ?? "";
  return {
    importId: UUID.test(id) ? id : null,
    requestedStep: oneOf(params.get("step"), STEP_IDS) ?? null,
    historyPage: positive(params.get("hp"), 1),
  };
}

/** The wizard keeps the import id and the step in the URL (?import=<id>&step=mapping), so a reload or a shared link continues where it was. */
export function useWizardUrl() {
  const [params, setParams] = useSearchParams();
  const state = useMemo(() => readWizardUrl(params), [params]);

  const go = useCallback(
    (patch: { importId?: string | null; step?: WizardStepId | null; historyPage?: number | null }, opts: { replace?: boolean } = {}) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          const set = (key: string, value: string | null | undefined) => {
            if (value === undefined) return;
            if (value === null || value === "") next.delete(key);
            else next.set(key, value);
          };
          set("import", patch.importId);
          set("step", patch.step);
          if (patch.historyPage !== undefined) set("hp", patch.historyPage && patch.historyPage > 1 ? String(patch.historyPage) : null);
          return next;
        },
        { replace: opts.replace },
      );
    },
    [setParams],
  );

  return { ...state, go };
}

/** the step on screen: the requested one, kept inside what the import's status allows */
export function resolveStep(requested: WizardStepId | null, session: ImportSession | undefined): number {
  const { max, natural } = stepBounds(session);
  if (!requested) return natural;
  return Math.max(0, Math.min(STEP_IDS.indexOf(requested), max));
}

// ---------------------------------------------------------------- issues screen

export type IssuesView = "issues" | "rows";

export interface IssuesUrl {
  view: IssuesView;
  code?: string;
  severity?: IssueSeverity;
  /** "open" unless the URL says otherwise */
  status: IssueStatus | "all";
  q?: string;
  rowStatus?: RowStatus;
  /** a target field key: the server's `filter[field]` */
  field?: string;
  /** `severity` unless the URL says otherwise; a leading `-` is descending */
  sort: "severity" | "-severity" | "row" | "-row" | "code" | "-code";
  issueId?: string;
  page: number;
  pageSize: number;
}

export function readIssuesUrl(params: URLSearchParams): IssuesUrl {
  const size = Number(params.get("size"));
  const rawStatus = params.get("status");
  const code = params.get("code") ?? "";
  const issue = params.get("issue") ?? "";
  return {
    view: params.get("view") === "rows" ? "rows" : "issues",
    code: /^[a-z0-9_]{1,40}$/.test(code) ? code : undefined,
    severity: oneOf(params.get("severity"), ["error", "warning"] as const),
    status: rawStatus === "all" ? "all" : (oneOf(rawStatus, ["open", "resolved", "ignored"] as const) ?? "open"),
    q: params.get("q")?.trim() || undefined,
    rowStatus: oneOf(params.get("rows"), ROW_STATUSES),
    field: /^[A-Za-z0-9_.]{1,60}$/.test(params.get("field") ?? "") ? (params.get("field") ?? undefined) : undefined,
    sort: oneOf(params.get("sort"), ["severity", "-severity", "row", "-row", "code", "-code"] as const) ?? "severity",
    issueId: UUID.test(issue) ? issue : undefined,
    page: positive(params.get("page"), 1),
    pageSize: (PAGE_SIZES as readonly number[]).includes(size) ? size : DEFAULT_PAGE_SIZE,
  };
}

type IssuesPatch = Partial<Record<"view" | "code" | "severity" | "status" | "q" | "rows" | "field" | "sort" | "issue" | "page" | "size", string | null>>;
const DEFAULTS: Partial<Record<keyof IssuesPatch, string>> = { view: "issues", status: "open", sort: "severity" };

/** Filters, search, page, view and the selected issue live in the URL (reload, back and deep links work). */
export function useIssuesUrl() {
  const [params, setParams] = useSearchParams();
  const state = useMemo(() => readIssuesUrl(params), [params]);

  /** a filter change goes back to page 1; `replace` keeps typing and selection out of the history */
  const update = useCallback(
    (patch: IssuesPatch, opts: { replace?: boolean } = {}) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          const filtersChanged = Object.keys(patch).some((k) => k !== "issue" && k !== "page");
          if (filtersChanged && !("page" in patch)) next.delete("page");
          if (!("issue" in patch)) next.delete("issue");
          for (const [key, value] of Object.entries(patch) as Array<[keyof IssuesPatch, string | null | undefined]>) {
            next.delete(key);
            if (value !== null && value !== undefined && value !== "" && value !== DEFAULTS[key]) next.set(key, value);
          }
          return next;
        },
        { replace: opts.replace },
      );
    },
    [setParams],
  );

  const clearFilters = useCallback(() => update({ code: null, severity: null, status: null, q: null, rows: null, field: null }), [update]);
  return { ...state, update, clearFilters };
}

export const isIssueFiltered = (u: IssuesUrl): boolean => Boolean(u.code || u.severity || u.q || u.field || u.status !== "open");
