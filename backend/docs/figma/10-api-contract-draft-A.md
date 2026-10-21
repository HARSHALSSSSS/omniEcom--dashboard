# API contract draft - Part A: conventions, shell, dashboard, issues, products

Status: **DRAFT for review** (nothing here is implemented). Derived from the Dashboard section of the Figma file (Parts 1-6 in this folder).
Legend: **EXISTS** = already in the API and enough; **EXTEND** = exists, needs new fields / filters; **NEW** = to be built.
Existing endpoints were checked against `docs/api/openapi.json` (326 paths) on this date.

## 0. Conventions (apply to every endpoint)
* Base `/api/v1`. Auth: bearer token. Every response: `{ "success": true, "data": ..., "requestId": "..." }`; errors `{ "success": false, "error": { "code", "message", "details" } }` (unchanged).
* **Money**: integer minor units + `currency` (`"INR"`, `"USD"`); the UI formats (2.84L, 68K). Never floats.
* **Time**: ISO-8601 UTC strings. Day-based endpoints take `asOf=YYYY-MM-DD` (default today in the business time zone) and return `generatedAt`.
* **Permissions**: reads `<area>:read`, writes `<area>:write`. New: `issues:read`, `issues:write`, `views:write` (saved views, every role).
* **Pagination**: today the API uses opaque cursors (`limit`, `cursor`) which cannot show "Page 3 of 4". The workspace lists in the designs need numbered pages, so lists marked **[paged]** accept
  `page` (1-based) + `pageSize` (default 25, max 100) and return `{ items, page, pageSize, total, pages }`. Deep paging is capped at 10,000 rows; beyond that use filters. Existing cursor lists stay as they are.
* **Counts for tabs / chips** are always returned by a separate cheap call (`.../counts`) or by a `counts` object in the same response, never by fetching all rows.
* **Filters** use the existing style: `filter[name]=value`, repeated for multi-select (`filter[marketplace]=amazon_in&filter[marketplace]=flipkart`); `q` for search; `sort=-updatedAt`.
* **Channel reference** (reused everywhere): `{ "code": "amazon_in", "name": "Amazon", "accountId": "uuid|null", "availability": "live|coming_soon" }`.
* **Badge object** (reused): `{ "key": "low_stock", "label": "Low stock", "tone": "neutral|good|warn|bad|info" }` - the backend sends a stable `key` + `tone`; the UI owns the wording.
* **Actions** returned by the API are `{ "key": "retry_sync", "label": "Retry sync", "method": "POST", "href": "/api/v1/...", "enabled": true, "disabledReason": null }` so the UI never guesses what is allowed.
* **Idempotency**: every POST/PUT/PATCH honours `Idempotency-Key` (already global).

---------------------------------------------------------------------------------------------------

## 1. App shell (all screens)
| Endpoint | Status | Purpose |
|---|---|---|
| `GET /workspace/shell` | NEW | One call on load: current user (name, initials, role label), current business (id, name, plan, tier), **businesses the user can switch to**, sidebar badges, feature flags, `asOf`, notification unread count. |
| `GET /me/businesses` | NEW | List the businesses the signed-in user belongs to (today one user = one vendor, so this returns one row; the contract is ready for more). |
| `POST /auth/switch-business` `{ businessId }` | NEW | Returns a token pair scoped to that business. Needs a `user_memberships` concept (see Open questions Q1). |
| `GET /search?q=bag&scope=all\|products\|orders\|skus&limit=5` | NEW | Cmd+K search. Grouped result: `{ groups: [{ type: "product\|order\|sku", total, items: [{ id, title, subtitle, meta, badge, href }] }], total }`. Product subtitle `"TRV-1042 . 4 available . Low stock"`, order subtitle `"Premium Travel Bag . Amazon . Picking . Dispatch today"`, SKU subtitle `"Available 4 . Threshold 10"`. Min 2 chars, max 5 per group, 150 ms budget (indexed prefix + trigram). |
| `GET /notifications`, `GET /notifications/unread-count` | EXISTS | Bell. |

`GET /workspace/shell` response (sketch):
```json
{ "user": { "id": "...", "name": "Abhishek", "initials": "A", "roleLabel": "Business owner" },
  "business": { "id": "...", "name": "Nova Living", "plan": "growth", "tier": "growing" },
  "businesses": [{ "id": "...", "name": "Nova Living", "current": true }],
  "badges": { "needsAttention": 4, "orders": 17, "returns": 3, "notifications": 6 },
  "features": { "ai.enabled": true }, "asOf": "2026-10-05", "inventoryMode": "warehouse" }
```
`needsAttention` = number of **open issue groups** (see section 3), identical to the sidebar badge and the "4" on the dashboard.

---------------------------------------------------------------------------------------------------

## 2. Dashboard home (Screen 08)
One aggregate call (fast path) plus drill-down endpoints that already exist. All numbers come from the analytics roll-ups, never from scanning orders.

### `GET /dashboard?asOf=2026-10-05&salesPeriod=30d` - NEW (reuses `analytics/overview`, `orders/summary`, `analytics/inventory-health`, `analytics/marketplaces`)
```json
{ "asOf": "2026-10-05", "generatedAt": "...", "greeting": { "firstName": "Abhishek" },
  "needsAttention": { "items": [ { "issueKey": "low_stock", "area": "inventory", "title": "Low stock",
      "summary": "18 products are running low on inventory", "count": 18, "action": { "label": "Review inventory", "href": "/inventory?health=low" } } ] },
  "recommendation": { "id": "rec_...", "title": "18 products are approaching their stock threshold.", "rationale": "...", "status": "open",
      "actions": ["review", "dismiss"] },
  "snapshot": { "period": "today", "currency": "INR", "metrics": [
      { "key": "orders", "value": 126, "previous": 112, "changePct": 12.5 },
      { "key": "revenueMinor", "value": 284000000, "previous": 262000000, "changePct": 8.4 },
      { "key": "units", "value": 318, "changePct": 6.2 },
      { "key": "returnRatePct", "value": 4.8, "changePct": -0.7 },
      { "key": "lowStockProducts", "value": 18, "note": "needs_review" } ] },
  "sales": { "period": "30d", "series": [ { "day": "2026-09-06", "revenueMinor": 0, "previousRevenueMinor": 0, "orders": 0 } ],
      "channelContribution": [ { "channel": { "code": "amazon_in", "name": "Amazon" }, "revenueMinor": 124000000, "sharePct": 43.7 } ] },
  "orderFlow": [ { "stage": "new", "count": 24 }, { "stage": "confirmed", "count": 31 }, { "stage": "picking", "count": 12 },
                 { "stage": "packing", "count": 18 }, { "stage": "dispatched", "count": 41 }, { "stage": "delivered", "count": 96 } ],
  "inventoryHealth": { "healthy": 403, "low": 18, "out": 6, "mostAffected": [ { "productId": "...", "title": "Premium Travel Bag", "sku": "TRV-1042", "available": 4, "status": "low" } ] },
  "channelHealth": [ { "channel": { "code": "meesho", "name": "Meesho", "accountId": "..." }, "health": "attention", "connection": "connected",
                       "lastSyncAt": "...", "openIssues": 2, "action": { "key": "review", "href": "/channels/{accountId}" } } ],
  "sync": { "lastSyncedAt": "...", "systemStatus": "operational|degraded|down" } }
```
Rules:
* `period` for `snapshot` is the selected "Today" (day of `asOf`); each metric carries its comparison against the **previous equal period** (yesterday for "today"). `changePct` is null when `previous` is 0.
* Return rate = returned units / delivered units over the period; revenue excludes cancelled orders (same rules as `analytics`).
* `orderFlow` is the live pipeline for `asOf` (orders created that day, by current stage), not cumulative.
* Series always returns one row per day (zero-filled) for both current and previous period (previous is shifted by the period length).
* `inventoryHealth.mostAffected` = top 3 by lowest cover (out of stock first); `status` in `out|low`.
* `channelHealth` includes `coming_soon` channels never; Meesho/Shopify appear only when a connector exists.
* Permission: `analytics:read` (sections the user cannot read are omitted, not errors).

Drill-down panels (open from the dashboard):
| Panel | Endpoint | Status |
|---|---|---|
| Channel connection panel (last sync, open issues, sync mode, issue list, Retry sync, Manage connection) | `GET /channels/{accountId}/overview` | NEW. Returns `{ channel, connection, lastSyncAt, syncMode: "automatic|manual", openIssues: [ { code, title, explanation, action:{label,href} } ], actions: [ retry_sync, manage ] }`; builds on `marketplace-accounts`, `sync/jobs`, issues |
| Retry sync | `POST /marketplace-accounts/{id}/inventory-sync`, `POST /marketplace-accounts/{id}/sync-orders`, `POST /sync/jobs/{id}/retry` | EXISTS |
| Product / inventory panel (available, on hand, reserved, threshold, velocity, estimated cover, recent movements) | `GET /inventory/variants/{id}/panel` | NEW (adds `unitsPerDay`, `daysOfCover`, `lowStockThreshold`, `recentMovements[5]`, per-location + per-channel quantities) |
| Recommendation panel (why, suggested quantities, dismiss / review) | `GET /ai/recommendations/{id}`, `POST /ai/recommendations/{id}/approve\|reject` | EXTEND: add `suggestedQuantities: [{ variantId, sku, title, available, add, basis: "14-day target cover" }]` and `recommendationOnly: true` |
| Date control | `asOf` query on `/dashboard` | NEW |

---------------------------------------------------------------------------------------------------

## 3. Needs attention (Screen 09) - the issues engine
A new module **`issues`** that every area publishes into. One **issue** = one *group* of related records (e.g. "7 orders are at risk of missing dispatch"), not one row per order.

### 3.1 Data model
`issues`: `id, vendor_id, key (detector code), area, priority (critical|high|medium|low), status (open|in_progress|snoozed|resolved), title, explanation, impact, count, affected (jsonb: [{type,id,label}] first 50 + total), due_at, recommended_action (jsonb), source_ref (jsonb: detector scope), first_seen_at, last_seen_at, snoozed_until, resolved_at, resolved_by, resolution (text), assigned_to, version`.
`issue_events` (append-only): `issue_id, type (detected|updated|started|snoozed|unsnoozed|resolved|reopened|assigned|auto_resolved|resolution_failed), actor, note, at`.
Unique `(vendor_id, key, scope_hash)` so a detector updates the same issue instead of duplicating it. When the condition disappears the issue is **auto-resolved**; when it returns after a manual resolve it is **reopened** (new `reopened` event).

### 3.2 Detectors (each is a scheduled job + event reaction; owner module publishes)
| Key | Area | Priority rule (proposed) | Due | Source |
|---|---|---|---|---|
| `orders_dispatch_risk` | orders | critical when any order is at risk / breached, high when approaching | earliest dispatch deadline | order SLA (section Part B 6) |
| `stock_below_threshold` | inventory | high; critical when any SKU is out of stock with sales in last 7 days | today | inventory + velocity |
| `listings_incomplete` | listings | high | today | listing validation |
| `channel_sync_failing` (per account) | channels | medium; high if > 60 min since last success or auth expired | today | sync jobs / account health |
| `returns_awaiting_approval` | returns | medium | tomorrow (return SLA) | returns |
| `returns_inspection_overdue`, `refund_failed`, `quantity_mismatch`, `disposition_missing` | returns | medium/high (refund failed or value above threshold = high) | by rule | returns |
| `shipping_no_method`, `label_unavailable`, `tracking_not_received`, `shipping_sync_failed`, `shipping_sla_risk`, `connector_capability_limit` | shipping | high / medium | order deadline | shipping |
| `inventory_mismatch`, `warehouse_imbalance` | inventory | low / medium | none | ledger drift, distribution |
The existing `analytics/business-health` (score + issue codes) and `fulfillment-exceptions` become **inputs**; they stay as they are.

### 3.3 Endpoints
| Endpoint | Status | Notes |
|---|---|---|
| `GET /issues` **[paged]** | NEW | Query: `tab=all\|critical\|today\|upcoming`, `filter[area]`, `filter[priority]`, `filter[status]=open\|in_progress\|snoozed`, `filter[due]=today\|tomorrow\|this_week`, `sort` (default priority, then due). Page size 5 in the design (use `pageSize=5`). |
| `GET /issues/counts` | NEW | `{ open: 18, tabs: { all: 18, critical: 3, today: 11, upcoming: 4 }, byArea: {...}, updatedAt }`; also drives the sidebar badge and dashboard. |
| `GET /issues/{id}` | NEW | Drawer: `{ id, priority, area, status, title, whyItMatters, affected: { total, items: [{type:"order",id,label:"ORD-10482",href}] }, deadline: { at, label }, recommendedAction: { text, action }, timeline[] }`. |
| `POST /issues/{id}/start` | NEW | Marks "in progress" (e.g. dispatch review started, with optional `note`). |
| `POST /issues/{id}/snooze` `{ until: "later_today\|tomorrow\|this_week" \| ISO date }` | NEW | Leaves the open queue; auto-unsnoozes at `until`. Critical issues can be snoozed at most until the next business day (rule, see Q4). |
| `POST /issues/{id}/unsnooze` | NEW | |
| `POST /issues/{id}/resolve` `{ note? }` | NEW | Manual resolve. Some issues resolve by **action** (retry sync): `POST /issues/{id}/resolve` with `mode: "attempt"` runs the safe action; on failure returns `409 resolution_failed` + the banner text ("Meesho issue couldn't be resolved ... Retry sync") and the issue stays open with a `resolution_failed` event. |
| `POST /issues/bulk` `{ ids[], action: "resolve\|snooze\|assign", until?, assigneeId? }` | NEW | Max 100 ids; per-id result `{ id, ok, error? }` (partial success allowed). |
| `POST /issues/{id}/assign` `{ userId }` | NEW | "Assign" in the bulk bar. |
| `GET /issues/history` **[paged]** | NEW | `status=resolved\|snoozed\|all`; rows `{ id, title, area, status, updatedAt, resolvedBy?, returnsAt? }`; counts for the chips (`all 2 / resolved 1 / snoozed 1`). |
| `GET /issues/recommendation` | NEW | The banner ("12 of the 18 low-stock products have sold at least 3 units in the last 7 days"), computed from inventory-health + sales; returns `{ text, evidence, action }` or null. |

Empty state: `GET /issues/counts` -> `open: 0`; the UI shows "You're all caught up". Loading skeleton is UI only. `Updated 2 min ago` comes from `counts.updatedAt`.

---------------------------------------------------------------------------------------------------

## 4. Products (Screens 10, 11, 14)
### 4.1 List
| Endpoint | Status | Notes |
|---|---|---|
| `GET /products/stats` | NEW | `{ products: 427, variants: 1286, active: 1042?, draft: 18, archived: n, needsAttention: 7 }`. **Open question Q6**: "Active 1,042" in the design is higher than products (427) so it is variants-active; the contract returns both `activeProducts` and `activeVariants`. |
| `GET /products` **[paged]** | EXTEND | Add filters `filter[channel]`, `filter[inventory]=healthy\|low\|out`, `filter[productType]`, `filter[needsAttention]=true`, `filter[savedViewId]`; `sort` adds `inventory`, `title`, `sku`, `updatedAt`. Item gets a `summary` block: `{ thumbnailUrl, skuFamily, variantCount, availableUnits, inventoryStatus: "healthy\|low\|out", channels: [ChannelRef+listingStatus], publishReadinessPct, hint: { key, text }, primaryAction: { key: "open\|review_inventory\|update_inventory\|continue_editing", href } }`. Heavy fields are computed from read models (`product_summaries` refreshed by events), not per request joins. |
| `GET /products/tabs-counts` | NEW (or part of `/products/stats`) | `{ all, active, draft, archived, needsAttention }` for the tab labels; respects the current search/filters if `?q=` is passed. |
| Saved views | NEW | see section 8. |
| Bulk | `POST /products/bulk` EXTEND | actions add `publish` (queue listings for selected channels), `archive`, `duplicate`, `export` (-> data job); response per item. |
| `POST /products/{id}/duplicate` | NEW | Copies master + variants (new SKUs `-COPY`), as draft. |
| Import menu | EXISTS | `POST /products/imports` (CSV), `POST /marketplace-accounts/{id}/import-products`; Excel = convert to CSV in the client (Q8). |

### 4.2 Product details (Screen 11)
| Endpoint | Status | Notes |
|---|---|---|
| `GET /products/{id}/overview` | NEW | The shared header + health strip + Overview tab in one response: `{ product (core fields, category, brand, type, status, updatedAt), primaryImage, health: { state: "ready\|incomplete", text }, inventory: { available, reserved, incoming, lowStockVariants, status, byWarehouse: [{ warehouse, available }] }, variants: { count, sellable, items[] (first 4) }, channels: { connected, active, attention, items: [{ channel, listingStatus, lastSyncAt, action }] }, content: { pct, fields: [{ key, state }], marketplaceContent: "ok\|needs_review\|not_published" }, attentionBanner: { text, action } \| null, statusPanel: { catalog, inventory, listings, content, syncLastAt }, media: { total, items[6] }, recentActivity[4] }`. Reuses `products/{id}`, `readiness`, `inventory/variants/{id}`, `listings`, `documents`. |
| Tabs reuse | | Variants tab: `GET /products/{id}/variants` EXISTS (+ stock via overview). Inventory tab: `GET /products/{id}/inventory` NEW = `{ totals{available,reserved,incoming,lowStockVariants}, health, byVariant:[{variantId,name,sku,available,status}], byWarehouse[], lowStockCallout }`. Listings tab: `GET /products/{id}/listings` NEW = `{ summary{connected,active,attention,lastSyncAt}, items:[{channel,listingId,status,lastSyncAt,error?}], publicationModel: "master>listing>marketplace" }` (wraps `/listings?filter[productId]`). Content tab: `GET /products/{id}/content` NEW = `{ readiness{pct,fields[]}, masterAttributes:[{attribute,value,state}], marketplaceContent:[{channel,state,issues[]}] }` (wraps `readiness`, `attribute-values`, `marketplace-data`). |
| `GET /products/{id}/activity?scope=all\|master\|variants\|channels` **[paged]** | NEW | Merged feed from audit log + sync/listing events + inventory movements: `{ at, type: "inventory\|content\|listings\|variants", text, actor?, ref }`. Row text is built from structured fields (`event`, `params`) so the UI can localise. |
| Media | EXISTS | `/products/{id}/documents` (+ `PATCH /documents/{id}` primary/reorder). |
| Edit / More menu (duplicate, archive, export, view activity) | EXISTS / NEW (duplicate) | |
| Incomplete state | NEW fields | `health.state="incomplete"`, `statusPanel.listings="not_published"`, `channels.connected=0`, action `publish_product` (enabled only when readiness passes). |

### 4.3 Variants & SKU management (Screen 14)
| Endpoint | Status | Notes |
|---|---|---|
| `GET /products/{id}/variants` **[paged]** | EXTEND | Filters `filter[color]`, `filter[size]` (generic: `filter[option.color]`), `filter[channel]`, `filter[inventory]=healthy\|low\|out`, `filter[lifecycle]=active\|draft\|archived`; `q` over name/SKU/barcode. Item adds `stock { available, status }`, `channels[]`, `lifecycle`, `thumbnailUrl`. |
| `GET /products/{id}/variants/counts` | NEW | `{ all, active, lowStock, outOfStock, draft, archived }`. |
| `POST /products/{id}/variants/bulk` | NEW | `{ ids[], action: "archive\|activate\|price\|delete" }`. |
| `POST /products/{id}/variants/import` | NEW | CSV of variants for one product (reuses data-jobs). |
| `POST /products/{id}/variants`, `PATCH /variants/{id}` | EXISTS | Add / Edit. |
