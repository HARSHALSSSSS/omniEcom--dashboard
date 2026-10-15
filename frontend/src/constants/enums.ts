/**
 * Canonical enums for every status/state used across the app.
 * Import from here — never redefine statuses in components.
 *
 * NOTE(backend): These enums need to be agreed with the backend team.
 * See architecture.md §6.3 — "Agree first" items.
 */

// ---------- Order ----------
export enum OrderStatus {
  New = "new",
  Confirmed = "confirmed",
  Picking = "picking",
  Packing = "packing",
  ReadyToDispatch = "ready_to_dispatch",
  Dispatched = "dispatched",
  InTransit = "in_transit",
  Delivered = "delivered",
  Cancelled = "cancelled",
  ReturnRequested = "return_requested",
}

// ---------- Listing ----------
export enum ListingStatus {
  Live = "live",
  Ready = "ready",
  NeedsReview = "needs_review",
  Blocked = "blocked",
  Syncing = "syncing",
  Draft = "draft",
  NotListed = "not_listed",
}

// ---------- Connection ----------
export enum ConnectionStatus {
  Connected = "connected",
  NeedsAttention = "needs_attention",
  Syncing = "syncing",
  Disconnected = "disconnected",
  AuthExpired = "auth_expired",
  Error = "error",
}

// ---------- Return ----------
export enum ReturnStatus {
  Requested = "requested",
  Approved = "approved",
  InTransit = "in_transit",
  Received = "received",
  Inspecting = "inspecting",
  Resolution = "resolution",
  Refunded = "refunded",
  Closed = "closed",
}

// ---------- Inventory health ----------
export enum InventoryHealth {
  Healthy = "healthy",
  LowStock = "low_stock",
  OutOfStock = "out_of_stock",
  Overstock = "overstock",
}

// ---------- Product status ----------
export enum ProductStatus {
  Active = "active",
  Draft = "draft",
  Archived = "archived",
}

// ---------- Issue priority ----------
export enum IssuePriority {
  Critical = "critical",
  High = "high",
  Medium = "medium",
  Low = "low",
}

// ---------- Job status (polls for async ops) ----------
export enum JobStatus {
  Queued = "queued",
  Running = "running",
  Succeeded = "succeeded",
  Failed = "failed",
  Partial = "partial",
}

// ---------- SLA ----------
export enum SlaState {
  Safe = "safe",
  Approaching = "approaching",
  AtRisk = "at_risk",
  Breached = "breached",
}

// ---------- Procurement ----------
export enum PurchaseOrderStatus {
  Draft = "draft",
  AwaitingApproval = "awaiting_approval",
  Confirmed = "confirmed",
  InTransit = "in_transit",
  PartiallyReceived = "partially_received",
  Received = "received",
  Overdue = "overdue",
  Cancelled = "cancelled",
}

// ---------- Return disposition ----------
export enum ReturnDisposition {
  Sellable = "sellable",
  Damaged = "damaged",
  Rejected = "rejected",
}
