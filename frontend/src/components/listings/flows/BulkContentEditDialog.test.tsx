import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const flows = vi.hoisted(() => ({ bulkContent: vi.fn() }));
vi.mock("@/api/listingFlows.api", () => ({ listingFlowsApi: flows }));
vi.mock("@/lib/session", () => ({ refreshShell: vi.fn().mockResolvedValue(undefined) }));

import { BulkContentEditDialog } from "./BulkContentEditDialog";
import { buildBulkContentEdits, emptyBulkForm } from "./flowFormat";

const result = (dryRun: boolean, ids: string[]) => ({
  action: "edit_content" as const,
  dryRun,
  summary: { total: ids.length, succeeded: ids.length, failed: 0, skipped: 0 },
  results: ids.map((id, index) => ({ index, id, sku: `SKU-${id}`, ok: true, status: "done" as const, outcome: dryRun ? ("preview" as const) : ("updated" as const), message: "ok", changedFields: ["title"], changes: { title: { before: "A", after: "Summer A" } }, error: null })),
});

function setup(ids: string[]) {
  const onClose = vi.fn();
  const onDone = vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <BulkContentEditDialog open listingIds={ids} onClose={onClose} onDone={onDone} />
    </QueryClientProvider>,
  );
  return { onClose, onDone };
}

beforeEach(() => {
  flows.bulkContent.mockReset();
});

describe("buildBulkContentEdits", () => {
  it("only sends ticked sections and asks for what is missing", () => {
    expect(buildBulkContentEdits(emptyBulkForm()).error).toMatch(/at least one/);
    const f = emptyBulkForm();
    f.title = { on: true, op: "prefix", text: "", find: "" };
    expect(buildBulkContentEdits(f).error).toMatch(/text to add/);
    f.title.text = "Summer ";
    f.searchTerms = { on: true, op: "add", text: "a, b\nc" };
    expect(buildBulkContentEdits(f).edits).toEqual({ title: { op: "prefix", value: "Summer " }, searchTerms: { op: "add", values: ["a", "b", "c"] } });
  });
});

describe("BulkContentEditDialog", () => {
  it("previews, then applies to every selected listing, in groups of 100", async () => {
    const user = userEvent.setup();
    const ids = Array.from({ length: 150 }, (_, i) => `id-${i}`);
    flows.bulkContent.mockImplementation(async (...args: Array<{ ids: string[]; dryRun?: boolean }>) => {
      const b = args[0] as { ids: string[]; dryRun?: boolean };
      return result(b.dryRun === true, b.ids);
    });
    const { onDone } = setup(ids);

    await user.click(screen.getByLabelText("Title"));
    await user.type(screen.getByLabelText("Title text"), "Summer ");
    await user.click(screen.getByRole("button", { name: "Preview changes" }));
    expect(await screen.findByText(/Preview: 150 of 150 would change/)).toBeInTheDocument();
    expect(flows.bulkContent).toHaveBeenCalledTimes(2);
    expect(flows.bulkContent.mock.calls[0]?.[0]).toMatchObject({ dryRun: true, edits: { title: { op: "prefix", value: "Summer " } } });
    expect((flows.bulkContent.mock.calls[0]?.[0] as { dryRun: boolean; ids: string[] }).ids).toHaveLength(100);
    expect(onDone).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Apply to 150 listings" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(flows.bulkContent).toHaveBeenCalledTimes(4);
    expect(await screen.findByText("Content changed")).toBeInTheDocument();
  });

  it("validates before calling the API and shows a failed call", async () => {
    const user = userEvent.setup();
    flows.bulkContent.mockImplementation(async () => {
      throw new Error("boom");
    });
    setup(["a"]);
    await user.click(screen.getByRole("button", { name: "Preview changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/at least one/);
    expect(flows.bulkContent).not.toHaveBeenCalled();
    await user.click(screen.getByLabelText("Brand"));
    await user.type(screen.getByLabelText("Brand", { selector: "input[placeholder=Brand]" }), "Nova");
    await user.click(screen.getByRole("button", { name: "Preview changes" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
