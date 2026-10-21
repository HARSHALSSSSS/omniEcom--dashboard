# API contract draft - Part B: inventory, orders, shipping, returns, cross-cutting, data changes, build order

Same conventions and legend as Part A (`10-api-contract-draft-A.md`): **EXISTS / EXTEND / NEW**, **[paged]** lists, minor-unit money, `asOf`, badge + action objects.

## 5. Inventory Control Room (Screen 26)
Existing building blocks: `GET /inventory` (levels), `GET /inventory/movements`, `GET /inventory/variants/{id}`, `POST /inventory/adjust|damage|receive|outbound|returns`, `POST /inventory/transfers...`,
`GET /analytics/inventory-health` (low stock, stock-out risk, excess, aging, fast/slow movers with `unitsPerDay`, `daysOfCover`, `stockoutDate`, `suggestedReorderUnits`), channel inventory policy + `inventory-sync`, `GET /ai/recommendations`.
Not modelled today: **quarantined** stock bucket, **replenishment lead time**, per-channel sent quantity, per-SKU channel sync state.

### 5.1 Overview (one call for the top of the page)
`GET /inventory/overview?asOf=&warehouseId=` - **NEW**
```json
{ "asOf": "2026-10-07", "live": true, "mode": "warehouse|simple",
  "pulse": { "available": 8462, "reserved": 1184, "incoming": 2640, "returned": 184, "damaged": 76, "quarantined": 32,
             "flow": { "incomingToday": 428 } },
  "horizon": { "leadTimeBasis": "supplier|default", "items": [ { "variantId": "...", "productId": "...", "title": "Classic Black T-Shirt", "sku": "TS-BLK-042", "stock": 42,
             "unitsPerDay": 6, "coverDays": 7, "leadTimeDays": 10, "scaleMaxDays": 20,
             "health": "attention|healthy|stockout|critical", "action": { "key": "review_replenishment", "label": "Reorder attention required", "href": "..." } } ] },
  "signals": [ { "key": "low_stock", "count": 12, "trend": [..7 numbers..], "tone": "bad", "href": "/inventory?signal=low_stock" },
               { "key": "stockout_risk", "count": 4 }, { "key": "inventory_mismatch", "count": 7 }, { "key": "slow_moving", "count": 16 },
               { "key": "high_velocity", "count": 9 }, { "key": "aging_inventory", "count": 3 }, { "key": "warehouse_imbalance", "count": 2 } ],
  "advisory": { "title": "Reorder attention", "text": "7 products may stock out before their expected replenishment lead time.",
                "items": [ { "title": "Black T-Shirt", "units": 42, "coverDays": 7, "leadTimeDays": 10 } ], "recommendationOnly": true, "recommendationId": "..." },
  "distribution": { "byWarehouse": [ { "warehouseId": "...", "name": "Mumbai", "units": 4280, "sharePct": 51 } ], "insight": { "text": "Mumbai currently holds 23% more inventory than demand patterns suggest.", "advisoryOnly": true } },
  "recentMovements": [ { "at": "...", "type": "order_reserved|received|adjusted|returned|synced", "text": "Amazon order reduced master inventory", "detail": "72 -> 68", "ref": {...} } ] }
```
Notes:
* `pulse` = sums over active warehouses; `available = on_hand - reserved`; the stacked bar is computed by the client from the numbers.
* `horizon`: coverage = `available / unitsPerDay` (velocity = units sold per day over a 14-day window; **no sales => `coverDays: null`**, never "infinite"); `leadTimeDays` comes from the variant (or supplier) lead time, else the business default (Q3); health: `stockout` when available = 0, `critical` when cover < lead time / 2, `attention` when cover < lead time, else `healthy`. Top N by urgency (`limit`, default 10).
* `signals`: `low_stock` (<= reorder level), `stockout_risk` (cover < lead time), `inventory_mismatch` (ledger drift or master vs channel quantity differs), `slow_moving`, `high_velocity` (top decile), `aging_inventory` (no movement N days), `warehouse_imbalance` (share deviates from demand share by > X%). Thresholds come from `analytics/inventory-health` query params and business settings.
* `distribution` only when `mode="warehouse"`; in simple mode the response has `location: { name: "Home Inventory" }` and the UI hides distribution and the warehouse column.

### 5.2 Channel synchronization
| Endpoint | Status | Notes |
|---|---|---|
| `GET /inventory/channel-sync` | NEW | `{ master: { available, lastUpdateAt }, channels: [ { channel: ChannelRef, state: "healthy\|syncing\|attention\|failed\|not_connected", lastSyncAt, lastSyncLabel: "not_reported"?, sentUnits, affectedSkus, affectedProducts } ], incidents: [ { id, channel, title, reason, affected: { skus, variants, products }, lastFailedAt, actions: [retry_sync, view_affected] } ], operations: { syncing: { skus, progress? }, lastSuccess, requireReview, failed } }`. Built from `marketplace_accounts`, `sync_jobs` (type inventory), channel stock-update history (`/listings/{id}/stock-updates`). |
| `GET /inventory/channel-sync/{accountId}/affected` **[paged]** | NEW | SKUs whose last push was rejected / differs: `{ variantId, sku, title, masterAvailable, channelQuantity, lastError, lastTriedAt }`. |
| `POST /inventory/channel-sync` `{ accountId? }` | NEW (wraps `POST /marketplace-accounts/{id}/inventory-sync`) | "Sync all" (no `accountId`) or one channel (Retry sync). 202 + job ids. |

### 5.3 Ledger (table) and selection
`GET /inventory/ledger` **[paged]** - NEW (extends `GET /inventory`). Filters: `q` (SKU/product/barcode), `filter[warehouse]`, `filter[channel]`, `filter[health]=healthy\|attention\|critical\|stockout_risk`, `filter[stockMin]`, `filter[stockMax]`,
`filter[movement]=received\|adjusted\|reserved\|returned\|synced`, `filter[savedViewId]`, `filter[signal]`. Item: `{ variantId, productId, thumbnailUrl, title, sku, available, reserved, incoming, coverDays, warehouse: { id, name }, channelSync: "healthy\|attention\|failed", health, lastMovementAt, borderTone }`.
* **Selection**: `selection: { mode: "ids" \| "all_matching", ids?, filters? }` is sent to bulk endpoints; `POST /inventory/ledger/selection-count` `{ filters }` -> `{ total }` shows "24 products selected" before the action.
* `GET /inventory/ledger/{variantId}/panel` = the right-hand **product context** panel: `{ product, snapshot{available,reserved,incoming}, byLocation[], channelAvailability: [ { channel, quantity } ], health { state, text }, recentMovements[], actions[] }` (this is the `/inventory/variants/{id}/panel` of Part A).

### 5.4 Adjustments and bulk
| Endpoint | Status | Notes |
|---|---|---|
| `POST /inventory/adjustments` | NEW (wraps `adjust`, `damage`, `returns`) | Body `{ variantId, warehouseId, type: "damage\|return\|correction\|manual\|other", quantity, direction?, reason, note?, idempotencyKey }`. `type` decides the bucket: `damage` moves available -> damaged; `return` -> returned/available per setting; `correction` and `manual` change on-hand by delta (or count); `other` requires a note. |
| `POST /inventory/adjustments/preview` | NEW | Same body, no write: `{ currentAvailable: 42, adjustment: -6, newAvailable: 36, warnings: [..] }` (the preview card). Fails with the same validation as the write. |
| `POST /inventory/bulk` `{ selection, action: "adjust\|transfer\|export\|sync\|group", params }` | NEW | Applies per variant; returns `{ results:[{variantId,ok,error?}], jobId? }`; large selections run as a job. |
| `POST /inventory/transfers` | EXISTS | "Transfer stock". |
| Saved groups ("Add to saved group") | NEW | `GET/POST /inventory/groups`, `POST /inventory/groups/{id}/items` (static list of variant ids, separate from saved views). |
| Export | NEW | `POST /inventory/exports` -> data job (CSV). |
| Starting stock import | EXISTS | `POST /inventory/imports` (done in onboarding). |

### 5.5 Empty / simple mode
`GET /inventory/overview` returns `mode:"simple"`, `location:{ id, name:"Home Inventory" }` and `pulse` zeros when there is no stock; the UI shows the "Your inventory starts here" state when `ledger.total = 0`. Quarantine and warehouse columns are omitted in simple mode.

---------------------------------------------------------------------------------------------------

## 6. Orders workspace (Screen 28)
Existing: `GET /orders` (filters `status, marketplace, accountId, placedFrom/To, attention, inventoryStatus, payment`), `GET /orders/{id}`, `/timeline`, `/cancel`, `/transition`, `GET /orders/summary`, fulfillment APIs.
**New core concept: dispatch SLA.**

### 6.1 SLA model
Add to orders: `dispatch_due_at` (computed when the order is confirmed: marketplace SLA, cut-off time of the warehouse, handling time), `sla_state` (derived, not stored: `safe`, `approaching`, `at_risk`, `breached`, `none`).
Bands (proposed, configurable per business): `safe` = more than 4 h to deadline, `approaching` = 90 min to 4 h, `at_risk` = 0-90 min, `breached` = past deadline. Shipped / cancelled orders have `sla_state = none`.
The dispatch deadline comes from `marketplace_sla` per channel (Q2) with fallback "end of the next business day".

### 6.2 Endpoints
| Endpoint | Status | Notes |
|---|---|---|
| `GET /orders/workspace?asOf=` | NEW | `{ pulse: { today: 128, stages: [ { key: "new", count: 18 }, confirmed, picking, packed, ready_to_dispatch, dispatched, in_transit ] }, needsAttention: { slaRisk: 3, unprocessed: 5, inventoryIssue: 2, paymentIssue: 1, cancellationRisk: 4, returns: 2 }, sources: { total: 47, items: [ { channel, orders, sharePct } ] }, slaPressure: { safe: { orders: 78, hint: "more than 4 h" }, approaching: { orders: 32 }, atRisk: { orders: 12 }, breached: { orders: 6 }, summary: "3 orders may breach dispatch SLA within the next 90 minutes.", reviewHref } , tabs: { all, needsAttention: 17, new, processing, shipped, delivered, returnsDisputes } }` |
| `GET /orders` **[paged]** | EXTEND | Add filters `filter[slaState]`, `filter[fulfillmentStatus]`, `filter[attention]=sla_risk\|unprocessed\|inventory_issue\|payment_issue\|cancellation_risk\|returns\|delayed\|disputes`, `filter[savedViewId]`, `filter[date]`; item adds `itemCount`, `sla: { state, dueAt, label: "Due in 42 min", minutesRemaining }`, `fulfillmentStatus`, `payment: { status, method }`, `rowTone`, and `inventoryIssue: { productTitle, sku, required, available, action } \| null` (the inline issue row). |
| `GET /orders/{id}/drawer` | NEW | The 304px drawer: `{ id, number, status, channel, createdAt, sla: { dueAt, minutesRemaining, progressPct, stageLabel }, customer: { name, city, state }, value: { totalMinor, paymentStatus }, items: { units, lines: [{ title, qty }] }, fulfillment: { warehouse, picking: "in_progress", fulfillmentId }, marketplaceStatus: "Amazon: Pending shipment", activity: [ { at, text } ], actions: [ open_fulfillment, cancel_order ] }` (wraps order, fulfillment, timeline). |
| `GET /orders/activity?limit=5` | NEW | "Recent Order Activity" across marketplaces: `{ at, orderNumber, event }`. |
| `GET /orders/sources` | EXISTS-ish | Covered by `/orders/workspace` (and `analytics/marketplaces`). |
| `POST /orders/export`, `POST /orders/sync` | NEW / EXISTS | Export = data job; Refresh/sync = `sync-orders` per account. |
| `POST /orders/{id}/cancel`, `/transition` | EXISTS | Drawer buttons. |
Customer data rule from the designs: show only what the channel provided; never infer. DTO fields are nullable.

---------------------------------------------------------------------------------------------------

## 7. Shipping workspace (Screen 34)
Existing: shipments (labels, AWB, dispatch, tracking, refresh-tracking), manifests, NDR, shipping providers + catalog, `fulfillment_preferences` (from onboarding), rules engine (types `pricing, stock, marketplace, fulfillment, notification`).
New concept: the **shipping decision** per order - which method (marketplace / seller / third-party) will move it, before a label exists.

### 7.1 Methods and capabilities
| Endpoint | Status | Notes |
|---|---|---|
| `GET /shipping/methods` | NEW (wraps providers + marketplace + seller) | `{ items: [ { id, kind: "marketplace\|seller\|third_party", name: "Flipkart Shipping", channel?: ChannelRef, provider?: { code, label }, state: "configured\|requires_configuration\|disabled", active, isDefault, lastSyncAt, supportedOrderTypes[], capabilities: { label, tracking, dispatchUpdate, statusSync } } ], capabilityMatrix: [ { method: "marketplace", label: "supported\|requires_configuration\|not_supported", tracking, dispatchUpdate, statusSync } ], summary: "2 active methods" }`. Capability values come from connector capabilities (`/marketplaces/{code}`) and provider catalog; **never hard-coded**. A method is `requires_configuration` until verified (Q5). |
| `POST /shipping/methods` (Add Provider) | NEW (wraps `POST /shipping/providers`) | Body `{ kind, providerCode?, channelCode?, config }`; for marketplace kind it enables marketplace shipping for the account; returns the method and the verification state. |
| `PATCH /shipping/methods/{id}` | EXTEND | `{ isDefault?, active?, config? }` (Set as default, Disable, Configure). |
| `GET /shipping/methods/{id}/capabilities` | NEW | "View capability" drawer. |

### 7.2 Decision per order
| Endpoint | Status | Notes |
|---|---|---|
| `GET /shipping/orders` **[paged]** | NEW | "Orders to Ship" table. Filters `q`, `filter[marketplace]`, `filter[warehouse]`, `filter[method]`, `filter[sla]`, `filter[status]=needs_decision\|selected\|label_pending\|ready_to_dispatch\|exception`. Item `{ orderId, number, channel, warehouse, destination: { city, state }, valueMinor, weightGrams, availableMethods: [ { kind, name, available, reason? } ], selectedMethod: { kind, name } \| null, selectionConfirmed, sla: {...}, status, action: { key: choose\|review\|view_label\|dispatch\|resolve, href } }`. Counts `readyToShip: 42`. |
| `GET /shipping/orders/{orderId}/options` | NEW | The **Choose Shipping** drawer: `{ order: { marketplace, destination, warehouse, product, sku, weightGrams, valueMinor }, options: [ { kind, name, recommended, available, managedBy: "marketplace\|merchant\|provider", reason? } ], recommendation: { kind, why: "Matches your default preference for Flipkart orders.", ruleId? } }`. The recommendation = rules result (7.4) -> channel override -> default preference (`fulfillment_preferences`). |
| `POST /shipping/orders/{orderId}/selection` `{ kind, providerId? , source: "recommended\|manual_override" }` | NEW | Confirms the selection (idempotent); stored on the fulfillment (`shipping_method_kind`, `selected_by`, `confirmed_at`). Rejects methods that are not available (409 `method_unavailable`). |
| `POST /shipping/orders/bulk` `{ selection, action: "assign_method\|generate_labels\|recalculate", params }` | NEW | `generate_labels` only for orders whose method supports labels (others reported `not_supported_by_connector`); `recalculate` re-runs the rules. Per-order results. |
| Labels, dispatch | EXISTS | `POST /shipments`, `GET /shipments/{id}/label`, `POST /shipments/{id}/dispatch`, manifests. |
| `POST /shipping/orders/export` | NEW | CSV job. |

### 7.3 Overview, tracking, exceptions
| Endpoint | Status | Notes |
|---|---|---|
| `GET /shipping/overview?asOf=` | NEW | `{ statusLine: { connectedChannels: 4, activeMethods: 2, ordersNeedAttention: 7 }, pulse: { readyToShip: { count, sinceLastSync: 8, needDecision: 2 }, shippingSelected: { count, sinceLastSync, note: "preference_confirmed" }, labelReady: { count, labelUnavailable: 1 }, dispatched, inTransit: { count, trackingIssues: 1 } }, decisionField: [ { order, channel, warehouse, itemCount, weightGrams, availableMethods[], merchantPreference: { kind, name, why: "default_for_channel" }, selected: { kind, name, confirmed } } ] (first 5, `Review decisions` -> orders tab), availabilityComparison: [ { channel, method, provider, availability: "requires_configuration\|ready\|unavailable", default: "preferred\|order_specific\|not_set", override: "where_supported\|verify_capability\|unavailable" } ], attention: { total: 7, parts: { undecided: 2, label: 1, tracking: 1, sync: 1, slaRisk: 1, capability: 1 } } }`. "Since last sync" deltas need `shipping_snapshots` (hourly count snapshot) or compare with the stored last-sync counters. |
| `GET /shipping/tracking` **[paged]** | NEW (wraps shipments + tracking events) | Rows `{ orderId, number, channel, method, awb, dispatchedAt, status: "tracking_active\|awaiting_first_scan\|in_transit\|delivery_delayed\|tracking_sync_failed\|delivered", lastUpdateAt, attention: "none\|check_first_scan\|review_update\|retry_required\|completed" }`; counters per stage (dispatched / in transit / delivered). `awaiting_first_scan` = dispatched but no scan within N h; `delivery_delayed` = past estimated delivery (Q5). |
| `POST /shipping/tracking/sync` | NEW | Bulk refresh (job); single = `POST /shipments/{id}/refresh-tracking` EXISTS. Failure card data: `GET /shipping/tracking/failures` -> `{ orderNumber, failedAt, whatFailed, possibleReason, action: retry }`. |
| `GET /shipping/exceptions` **[paged]** | NEW (issues engine, area `shipping`) | Six categories with counts, affected orders, and the 3-part explanation `{ whatHappened, why, whatCanIDoNow, action }`: `no_method_selected`, `label_unavailable`, `tracking_not_received`, `shipping_sync_failed`, `sla_risk`, `connector_capability_limit`. Export = `POST /shipping/exceptions/export`. |
| `POST /shipping/sync` | NEW | "Sync Shipping": runs tracking refresh + method verification + status sync; 202 + progress `{ orders: 184, statuses: 176 }`, completion `{ processed, updated, requireAttention }` (`GET /sync/jobs/{id}`). |

### 7.4 Shipping rules (IF / AND / THEN)
Use the existing rules engine: add rule type **`shipping`** (facts: `marketplace`, `warehouse`, `location` (destination state/city/pincode), `order_value`, `product`/`sku`/`category`, `weight`; operators `eq, contains, gt, lt` (+ the engine's existing set); action `prefer_shipping_method { kind, providerId? }`).
| Endpoint | Status | Notes |
|---|---|---|
| `GET /shipping/rules` | NEW (wraps `/rules?type=shipping`) | Rows `{ id, name, status: "enabled\|disabled", priority, lastUpdatedAt, ordersAffected, conditions: [{ combinator: "if\|and", field, op, value }], then: { prefer: { kind, providerId, label } } }`. `ordersAffected` = count of open (not yet shipped) orders that match now, computed by a dry run, cached 5 min. |
| `POST /shipping/rules`, `PATCH /shipping/rules/{id}`, `POST .../duplicate`, `POST .../enable`, `POST .../disable` | EXTEND `rules` | Validation: fields/operators whitelisted; threshold is a real number (the "Configured threshold" placeholder in the design must become a value); at most 100 rules per business; priorities unique and re-orderable (`PUT /shipping/rules/order`). |
| `POST /shipping/rules/evaluate` | EXISTS (`rules/evaluate`) | Dry-run for an order, used by `options`. |
Fallback: when no rule matches -> channel override in `fulfillment_preferences.overrides` -> `defaultMethod`. Manual override always allowed where the method is available.

---------------------------------------------------------------------------------------------------

## 8. Returns workspace (Screen 35)
Existing: returns lifecycle (`requested, approved, rejected, pickup_scheduled, picked_up, in_transit, received, inspecting, completed, cancelled`), items, reasons catalogue, receive, inspect (decides disposition), refund (records outcome), pickup, timeline, `GET /returns/reasons`, dispositions `restock, damaged, dispose, return_to_vendor, quarantine`.
Gaps: the design separates **three tracks per return** - *return status*, *inspection status*, *refund status* - plus *disposition*, and adds inspection assignment/checklist, **repair**, **rejected** and **write-off** (= `dispose`) wording, and connector-driven refunds.

### 8.1 Model additions
`return_orders`: `inspection_status (not_started|in_progress|passed|failed|requires_review)`, `inspector_id`, `inspection_started_at`, `inspection_result_at`, `refund_status (not_applicable|pending|ready|processing|refunded|failed)`, `refund_amount_minor`, `refund_currency`, `refund_source ("connector"|"manual")`, `refund_error`, `needs_attention_reason`.
`return_inspections` (append-only history): `return_id, checklist jsonb {packagingIntact, productUsable, accessoriesPresent, visibleDamage, productMismatch, missingQuantity}, result, note, inspector, at`.
Dispositions: map `restock = sellable`, `dispose = write-off`; **add `rejected`, `repair`** (and keep `damaged`, `quarantine`; `return_to_vendor` stays for the API but is not shown in this design). Quarantine moves stock to the new **quarantined** bucket; repair to a `repair` bucket (or quarantined with reason `repair`, Q7).

### 8.2 Endpoints
| Endpoint | Status | Notes |
|---|---|---|
| `GET /returns/overview` | NEW | `{ statusLine: { open: 12, awaitingInspection: 4, refundsPending: 3 }, createReturn: { available: false, reason: "shopify_only" }, stages: { requested: { count: 12, hint: "to_review" }, approved: 9, inTransit: 3, received: 6, inspecting: { count: 4, needReview: 3 }, resolution: { count: 3, refundPending: 3 }, refunded: 8, closed: { count: 48, window: "30d" } }, attention: [ { key: "awaiting_inspection", count: 3 }, { key: "refunds_pending", count: 2 }, { key: "inventory_discrepancy", count: 1 }, { key: "high_value_review", count: 1 } ] }` |
| `GET /returns` **[paged]** | EXTEND | Filters `tab=all\|needs_attention\|awaiting_receipt\|awaiting_inspection\|refund_pending\|completed`, `q` (return/order/product/SKU), `filter[marketplace]`, `filter[signal]` (the attention signals), `filter[inspectionStatus]`, `filter[refundStatus]`, `filter[disposition]`. Item: `{ id, number, orderNumber, product: { title, sku }, channel, reason: { code, label }, quantity, status, receivedAt, inspection: { status, inspector }, refund: { status, amountMinor, currency }, disposition, action: { key: inspect\|review\|view\|track\|refund } }`. Counts for the tabs from `GET /returns/counts`. |
| `GET /returns/{id}/detail` | NEW (wraps `GET /returns/{id}` + timeline) | Drawer: `{ header, product card, details { orderId, channel, customer { name, email } (only if provided), product, sku, quantity { expected, received }, reason, dates }, currentState { inspection, refund, disposition }, timeline: [ { step: requested\|approved\|received\|inspection\|refund\|disposition\|closed, status: complete\|pending, actor, at, note } ] , actions[] }`; future steps included as `pending`. |
| `POST /returns/{id}/inspection/assign` `{ userId }` + bulk `POST /returns/inspection/assign` `{ ids, userId }` | NEW | "Assign inspection". |
| `POST /returns/{id}/inspection` | NEW (replaces the blind `inspect` for the UI; old stays) | Body `{ checklist: {...six booleans}, extraConditions?: [{label, ok}], result: pass\|fail\|needs_review, note? }`. Computes `system condition` (receipt matched / SKU matched / quantity mismatch) from received vs expected. Never approves a refund or disposition by itself. |
| `GET /returns/{id}/disposition-options` | NEW | `{ recommendation: { kind: "quarantine", reason: "Expected 2, received 1", suggestedOnly: true }, options: [ sellable, damaged, rejected, quarantine, repair, write_off ] }` (recommendation from inspection + reconciliation). |
| `POST /returns/{id}/disposition` `{ kind }` | NEW (wraps `inspect` per item disposition) | Explicit confirmation required; moves stock to the matching bucket (sellable -> available, damaged, quarantined, repair, write-off -> removed). 409 if inspection not finished. |
| Refunds list | `GET /returns/refunds` **[paged]** NEW | `{ returnId, number, orderNumber, channel, refund: { status, amountMinor, currency, source: "connector" }, returnStatus, inspectionStatus, lastUpdateAt, action }`; footer counts `{ pending, ready, processing, failed }`. Pre-inspection returns are excluded from actionable states. |
| `GET /returns/{id}/refund` | NEW | Refund drawer: details + status timeline (requested / approved / processing / completed) + the note "Return approval is not refund approval". |
| `POST /returns/{id}/refund` | EXTEND | Today records an outcome; add `mode: "connector"` that asks the marketplace to refund (only if the connector supports it) and tracks `processing -> refunded|failed`; `POST /returns/{id}/refund/retry`. |
| `POST /returns` | EXTEND | Create Return: `GET /returns/eligibility?order=%231048` (find order by number, `marketplace` allowed list = Shopify only per design) -> `{ order: {...}, items: [ { orderItemId, title, variant, sku, fulfilledQty, alreadyReturnedQty, availableQty, unitPriceMinor } ] }`; create body `{ orderId, items: [{ orderItemId, quantity }], reasonCode, notes }`; validates `quantity <= availableQty`, order fulfilled, channel allowed; response includes `itemValueMinor` and "does not issue a refund". |
| `GET /returns/analytics` | NEW | `{ window: { returns: 100, days: 30 }, reasons: [ { code, label, sharePct } ], concentration: { products: 3, text }, intelligence: [ { kind: "reason_spike\|sku_baseline", text, evidence, action } ], recommendationOnly: true }`. |
| `POST /returns/export`, `POST /returns/sync` | NEW / EXISTS | Export job; Sync = `returns` sync job. |
| Attention list | via issues engine (area `returns`) | `GET /returns/attention` = filtered issues (`inspection_overdue`, `refund_pending`, `quantity_mismatch`, `disposition_missing`) with `impact` and `recommendedAction`. |

---------------------------------------------------------------------------------------------------

## 9. Cross-cutting building blocks
| Block | Endpoints | Notes |
|---|---|---|
| **Saved views** | `GET /views?screen=products\|inventory\|orders\|returns`, `POST /views` `{ screen, name, filters, sort, shared: false }`, `PATCH/DELETE /views/{id}` | Stored per business; `shared: true` = "Available in this workspace". Filters are validated against the screen's allowed filter keys. Max 50 per screen. |
| **Exports** | `POST /<area>/exports` -> `data_jobs` (CSV), `GET /data-jobs/{id}/download` | Existing data-jobs generalised beyond products (`entity`: products, inventory, orders, returns, shipping, exceptions). |
| **Counts** | per screen `.../counts` | cheap, cached 30 s. |
| **Advisory** | `recommendationOnly: true` flag + `evidence` object on every AI/insight payload | Matches the AI modes (observe/recommend/approve/automate). |
| **Capability honesty** | `GET /marketplaces`, `/shipping/methods/{id}/capabilities` | `supported`, `requires_configuration`, `not_supported_by_connector`. |
| **Business time zone** | vendor `timezone` | "Today", due-today buckets and SLA cut-offs use it. |

## 10. Data changes (migrations)
1. `issues`, `issue_events`, `saved_views`, `inventory_groups`.
2. `orders`: `dispatch_due_at`, `sla_policy_id`; `marketplace_sla` (per marketplace/warehouse handling hours + cut-off); business SLA band settings.
3. Inventory: `quarantined` (and `repair`) buckets in `inventory` + movement types; `product_variants.lead_time_days` (and later supplier lead time); `inventory_channel_state` (per variant per account: last pushed quantity, last result, error).
4. Fulfillment/shipping: `shipping_method_kind`, `shipping_selected_by`, `shipping_confirmed_at`, `shipping_recommendation` on fulfillments; `vendor_shipping_providers` kinds (marketplace / seller / third_party) + verification columns; rule type `shipping`; `shipping_snapshots` (counts for "since last sync").
5. Returns: columns and `return_inspections` from 8.1; dispositions `rejected`, `repair`.
6. Read models: `product_summaries` (list/cards), `order_workspace_counts` (optional cache). Refreshed by events.
7. Membership for switching businesses (`user_memberships`), if Q1 says yes.

## 11. Suggested build order
1. **Foundations**: issues engine + detectors v1 (orders SLA, low stock, sync failures, returns waiting) + saved views + counts helpers + `workspace/shell` + search.
2. **Orders SLA** + orders workspace/drawer.
3. **Inventory** overview, channel-sync, ledger, adjustments with preview, quarantined bucket.
4. **Products** stats, summaries, product overview/tabs/activity, variants filters, duplicate, bulk publish.
5. **Shipping** methods, per-order decision, rules type, tracking list, exceptions.
6. **Returns** inspection/disposition/refund tracks, create-from-order, analytics.
7. **Dashboard** aggregate last (it only reads the pieces above).
Each step ships with Swagger, tests (API + RLS isolation), and an updated `docs/api` export.

## 12. Corrections to the earlier study notes (found while checking the code)
* Inventory: coverage, velocity, stock-out risk, aging, slow/fast movers and suggested reorder **already exist** in `GET /analytics/inventory-health`; only lead time, quarantined bucket and channel sync state are missing.
* Returns: `quarantine` **already exists** as a disposition; `repair` and `rejected` are new; `dispose` = write-off.
* Orders: `attention`, `inventoryStatus` and `payment` filters already exist on `GET /orders`; `analytics/business-health` already returns issue codes (it becomes a detector input).
* `docs/api/ENDPOINTS.md` is missing the Stage 5 and onboarding groups although `openapi.json` has them (326 paths): `scripts/export-openapi.ts` only lists tags declared in the Swagger config, and the Stage 5 and Onboarding tags were never declared there (the `/docs` UI and `openapi.json` are complete). To fix separately by declaring those tags.
