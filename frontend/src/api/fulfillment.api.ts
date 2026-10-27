import { client, unwrap } from "./client";
import { ENDPOINTS } from "./endpoints";
import type {
  ActionInput,
  ActionResult,
  ActivityEvent,
  BatchHandoverResponse,
  CarrierOption,
  ExceptionsPage,
  ExceptionsQuery,
  PickListResult,
  QueuePage,
  QueueQuery,
  ResolveInput,
  WarehouseOption,
  Workspace,
} from "@/types/fulfillment";

/** the `filter[...]` style of the API; empty values are left out */
export function queueParams(q: QueueQuery): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  if (q.q) out.q = q.q;
  if (q.stage) out["filter[stage]"] = q.stage;
  if (q.warehouse) out["filter[warehouse]"] = q.warehouse;
  if (q.carrier) out["filter[carrier]"] = q.carrier;
  if (q.priority) out["filter[priority]"] = q.priority;
  if (q.hasException !== undefined) out["filter[hasException]"] = String(q.hasException);
  if (q.page > 1) out.page = q.page;
  out.pageSize = q.pageSize;
  return out;
}

export function exceptionParams(q: ExceptionsQuery): Record<string, string | number> {
  const out: Record<string, string | number> = { "filter[status]": q.status, pageSize: q.pageSize };
  if (q.q) out.q = q.q;
  if (q.warehouse) out["filter[warehouse]"] = q.warehouse;
  if (q.page > 1) out.page = q.page;
  return out;
}

export const fulfillmentApi = {
  queue: async (query: QueueQuery, signal?: AbortSignal) => unwrap<QueuePage>(await client.get(ENDPOINTS.FULFILLMENT_QUEUE, { params: queueParams(query), signal })),

  exceptions: async (query: ExceptionsQuery, signal?: AbortSignal) =>
    unwrap<ExceptionsPage>(await client.get(ENDPOINTS.FULFILLMENT_EXCEPTIONS, { params: exceptionParams(query), signal })),

  workspace: async (orderId: string, fulfillmentId?: string, signal?: AbortSignal) =>
    unwrap<Workspace>(await client.get(ENDPOINTS.FULFILLMENT_WORKSPACE(orderId), { params: fulfillmentId ? { fulfillmentId } : undefined, signal })),

  /** a refused action is 409 `action_not_available` with the reason; a repeated one answers `applied: false` */
  act: async ({ orderId, ...body }: ActionInput) => unwrap<ActionResult>(await client.post(ENDPOINTS.FULFILLMENT_ACTIONS(orderId), body)),

  /** a 200 with a result per order, even when some of them failed */
  batchHandover: async (carrier: string, orderIds: string[]) =>
    unwrap<BatchHandoverResponse>(await client.post(ENDPOINTS.FULFILLMENT_BATCH_HANDOVER, { carrier, orderIds })),

  /** the latest status changes across the warehouse, with real timestamps */
  activity: async (limit: number, signal?: AbortSignal) => unwrap<ActivityEvent[]>(await client.get(ENDPOINTS.FULFILLMENT_ACTIVITY, { params: { limit }, signal })),

  /** verifies the code on the server (a wrong item is refused), then records one unit as picked */
  scanAndPick: async (input: { taskId: string; code: string }) => {
    await client.post(ENDPOINTS.PICK_TASK_SCAN(input.taskId), { itemBarcode: input.code });
    return unwrap<unknown>(await client.post(ENDPOINTS.PICK_TASK_PICK(input.taskId), { quantity: 1, itemBarcode: input.code }));
  },

  assignPicker: async (pickListId: string, userId: string | null) => unwrap<unknown>(await client.post(ENDPOINTS.PICK_LIST_ASSIGN(pickListId), { userId })),

  createPickList: async (fulfillmentIds: string[]) => unwrap<PickListResult>(await client.post(ENDPOINTS.PICK_LISTS, { fulfillmentIds })),

  resolveException: async ({ id, ...body }: ResolveInput) => unwrap<{ id: string; status: string }>(await client.post(ENDPOINTS.FULFILLMENT_EXCEPTION_RESOLVE(id), body)),

  warehouses: async (): Promise<WarehouseOption[]> => {
    const res = await client.get<{ data: WarehouseOption[] }>(ENDPOINTS.WAREHOUSES, { params: { limit: 100, "filter[status]": "active" } });
    return res.data.data.map((w) => ({ id: w.id, code: w.code, name: w.name }));
  },

  carriers: async (): Promise<CarrierOption[]> => {
    const res = unwrap<{ items: Array<{ providerCode: string; name: string; status: string }> }>(await client.get(ENDPOINTS.SHIPPING_CARRIERS));
    const seen = new Map<string, CarrierOption>();
    for (const c of res.items) if (c.status === "active" && !seen.has(c.providerCode)) seen.set(c.providerCode, { providerCode: c.providerCode, name: c.name });
    return [...seen.values()];
  },
};
