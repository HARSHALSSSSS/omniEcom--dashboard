import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./errors";

const get = vi.hoisted(() => vi.fn());
const post = vi.hoisted(() => vi.fn());
const patch = vi.hoisted(() => vi.fn());
const del = vi.hoisted(() => vi.fn());
vi.mock("./client", () => ({ API_BASE: "/api/v1", client: { get, post, patch, delete: del }, unwrap: (res: { data: { data: unknown } }) => res.data.data }));

import { fileNameFrom, reportsApi, runParams, scheduleParams } from "./reports.api";

beforeEach(() => vi.clearAllMocks());

describe("reports api requests", () => {
  it("writes run filters in the API's filter[...] style and sends page 1 implicitly", () => {
    expect(runParams({ page: 1, pageSize: 25 })).toEqual({ pageSize: 25 });
    expect(runParams({ type: "sales", status: "failed", trigger: "schedule", page: 3, pageSize: 50 })).toEqual({ "filter[type]": "sales", "filter[status]": "failed", "filter[trigger]": "schedule", page: 3, pageSize: 50 });
    expect(scheduleParams({ status: "paused", page: 1, pageSize: 25 })).toEqual({ "filter[status]": "paused", pageSize: 25 });
  });

  it("posts an export with background defaulting to false", async () => {
    post.mockResolvedValue({ data: { data: { id: "r" } } });
    await reportsApi.exportReport({ type: "sales", format: "csv", params: { range: "last_7_days" } });
    expect(post).toHaveBeenCalledWith("/api/v1/reports/exports", { type: "sales", format: "csv", params: { range: "last_7_days" }, background: false });
  });

  it("posts schedule actions with an empty body and patches with the version", async () => {
    post.mockResolvedValue({ data: { data: {} } });
    patch.mockResolvedValue({ data: { data: {} } });
    await reportsApi.pauseSchedule("s1");
    await reportsApi.runScheduleNow("s1");
    await reportsApi.updateSchedule("s1", { version: 4, name: "x" });
    expect(post).toHaveBeenCalledWith("/api/v1/reports/schedules/s1/pause", {});
    expect(post).toHaveBeenCalledWith("/api/v1/reports/schedules/s1/run-now", {});
    expect(patch).toHaveBeenCalledWith("/api/v1/reports/schedules/s1", { version: 4, name: "x" });
  });

  it("downloads the file as a blob and takes the name from Content-Disposition", async () => {
    const blob = new Blob(["a,b"]);
    get.mockResolvedValue({ data: blob, headers: { "content-disposition": 'attachment; filename="sales-2026-10.csv"' } });
    const file = await reportsApi.downloadRun({ id: "r1", fileName: "other.csv", format: "csv" });
    expect(get).toHaveBeenCalledWith("/api/v1/reports/runs/r1/download", { responseType: "blob" });
    expect(file).toEqual({ blob, fileName: "sales-2026-10.csv" });
  });

  it("falls back to the run's file name, and turns a 404 into the expired message", async () => {
    get.mockResolvedValueOnce({ data: new Blob(["x"]), headers: {} });
    expect((await reportsApi.downloadRun({ id: "r1", fileName: "kept.xlsx", format: "xlsx" })).fileName).toBe("kept.xlsx");
    get.mockRejectedValueOnce(new ApiError({ code: "UNKNOWN_ERROR", message: "Request failed", status: 404 }));
    await expect(reportsApi.downloadRun({ id: "r1", fileName: null, format: "pdf" })).rejects.toMatchObject({ status: 404, rule: "file_expired" });
  });

  it("reads file names in both Content-Disposition forms", () => {
    expect(fileNameFrom(undefined)).toBeNull();
    expect(fileNameFrom("attachment; filename=plain.csv")).toBe("plain.csv");
    expect(fileNameFrom("attachment; filename*=UTF-8''gst%20register.xlsx")).toBe("gst register.xlsx");
  });
});
