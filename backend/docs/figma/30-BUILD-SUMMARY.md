# Dashboard APIs: what was built, what was not

Scope: the whole "Dashboard" section of the Figma file (Dashboard home, Needs attention, Products, Product details, Variants, Inventory, Orders, Shipping, Returns, app shell, search, saved views).
Contract used: `10-api-contract-draft-A.md` and `11-api-contract-draft-B.md` with the proposed defaults of `12-open-questions.md` (nobody answered the open questions, so the defaults are in force).
Verification (final run): typecheck clean, eslint clean, `check:modules` OK (32 modules, acyclic), unit 105, database 27, **api 483**, e2e + connector + contract 185 (2 skipped, as before): all passing. API surface: 394 -> **499 operations** (+105). Not committed or pushed.

## 1. Foundation (shared)
* Migrations **0012 / 0013**: new tables `issues`, `issue_events`, `saved_views`, `inventory_groups`, `inventory_group_items`, `marketplace_sla`, `return_inspections`, `shipping_snapshots`;
  new columns: `orders.dispatch_due_at` (backfilled 24 h for open orders), `inventory.quantity_quarantined`, `inventory_movements.delta_quarantined` (+ movement types `quarantine`, `quarantine_release`, drift function updated), `product_variants.lead_time_days`,
  fulfillment shipping decision (`ship_*`), shipping method kind / verification, return inspection + refund tracking columns, return dispositions `rejected` / `repair`, refund statuses `ready` / `processing`, rule type `shipping`. All tenant tables have RLS; history tables are append-only.
* Permissions `issues:*`, `views:*`; vendor settings for SLA bands, default lead time, high-value returns, awaiting-first-scan hours; numbered-page helpers; two new modules (`issues`, `workspace`); jobs `issues.sweep` (5 min) and `shipping.snapshot` (hourly).
* `docs/api/ENDPOINTS.md` now lists every tag (it was missing the Stage 5 and Onboarding groups).

## 2. Built, by screen
| Screen | Endpoints (all `/api/v1`) | Notes |
|---|---|---|
| **App shell** | `GET /workspace/shell`, `GET /me/businesses`, `GET /search`, views: `GET/POST /views`, `PATCH/DELETE /views/{id}` | badges (needs attention, orders, returns, notifications), tier, inventory mode; search groups products / orders / SKUs with permission checks; saved views private or shared, 50 per user per screen, filter allow-list per screen |
| **Dashboard home** | `GET /dashboard`, `GET /channels/{accountId}/overview` | snapshot with previous-period change, sales series (zero-filled, previous period shifted), channel contribution, order flow, inventory health, channel health, needs-attention rows, recommendation; sections the role cannot read are omitted |
| **Needs attention** | `GET /issues`, `/issues/counts`, `/issues/history`, `/issues/recommendation`, `/issues/{id}`, `POST /issues/refresh`, `/issues/{id}/start\|snooze\|unsnooze\|resolve\|assign`, `POST /issues/bulk` | 17 detectors (dispatch risk, stock below threshold, incomplete listings, channel sync failing, returns waiting / inspection overdue / refund failed / quantity mismatch / disposition missing, shipping x6, inventory mismatch, warehouse imbalance); auto-resolve and reopen; snooze rules; resolve-by-action (retry sync) with failure banner |
| **Products** | `GET /products/stats`, `/products/catalog` (paged), `/products/export`, `POST /products/{id}/duplicate`, `POST /products/bulk-actions`; `GET /products/{id}/overview\|inventory\|listings\|content\|activity` | cards with availability, channels, publish readiness %, hint and primary action; incomplete / draft state; merged activity feed |
| **Variants** | `GET /products/{id}/variant-grid` (paged) + `/counts`, `POST /products/{id}/variants/bulk`, `PUT /variants/{id}/lead-time` | filters color / size / any option / channel / inventory / lifecycle |
| **Inventory** | `GET /inventory/overview`, `/inventory/channel-sync` (+ `/{accountId}/affected`, `POST /inventory/channel-sync`), `GET /inventory/ledger` (paged) + `POST /inventory/ledger/selection-count`, `GET /inventory/variants/{id}/panel`, `POST /inventory/adjustments` + `/preview`, `POST /inventory/bulk`, groups (`GET/POST /inventory/groups`, items add / remove, delete), `GET /inventory/export`, `POST /inventory/quarantine` + `/release` | **quarantined bucket** in the ledger (drift = 0 proven); stock pulse, horizon with lead time, 7 signals, advisory, distribution (warehouse mode only), channel incidents with affected SKUs and retry; preview runs the real write in a rolled-back savepoint |
| **Orders** | `GET /orders/workspace`, `/orders/ledger` (paged), `/orders/{id}/drawer`, `/orders/activity`, `/orders/export`, `GET/PUT /orders/sla-policies`, `DELETE /orders/sla-policies/{id}` | **dispatch SLA model**: due date from marketplace / warehouse policy + cut-off, bands safe / approaching / at risk / breached (pure function + SQL), attention chips, tabs that equal the ledger filters |
| **Shipping** | `GET /shipping/overview`, `/shipping/methods` (+ add, patch, capabilities, verify), `GET /shipping/orders` (paged) + `/{id}/options` + `POST /{id}/selection` + `POST /shipping/orders/bulk` + `/shipping/orders/export`, `GET /shipping/tracking` (+ failures, `POST /shipping/tracking/sync`), `GET /shipping/exceptions` (+ export), shipping rules (`GET/POST/PATCH/DELETE /shipping/rules`, duplicate / enable / disable, `PUT /shipping/rules/order`), `POST /shipping/sync` | per-order shipping **decision** with precedence rule > channel override > default preference (reads the onboarding preferences); capability matrix from real connector / provider capabilities; rule type `shipping` in the rules engine; pulse deltas from hourly snapshots |
| **Returns** | `GET /returns/overview`, `/returns/ledger` (paged), `/returns/counts`, `/returns/export`, `/returns/{id}/detail`, inspection (`POST /returns/{id}/inspection/assign`, `POST /returns/inspection/assign`, `POST/GET /returns/{id}/inspection`), `GET /returns/{id}/disposition-options`, `POST /returns/{id}/disposition`, `GET /returns/refunds`, `GET /returns/{id}/refund`, `POST /returns/{id}/refund/retry`, `GET /returns/eligibility`, `GET /returns/analytics`, `GET /returns/attention` (+ export) | three tracks (return / inspection / refund) + disposition; quarantine and repair move stock only through the inventory ledger; reasons breakdown and intelligence; create-return eligibility with quantity limits |

## 3. Not built, partial, or different from the contract
**Not built**
1. `POST /auth/switch-business` (needs a membership model; `/me/businesses` returns the one business).
2. Real Meesho / Shopify connectors (still "coming soon"; the designs show them live). "Create Return" is gated to Shopify (and the sandbox marketplace outside production).
3. Connector-issued refunds: the connector interface has no refund operation, so `mode: connector` always answers 409 `not_supported_by_connector`; refunds are tracked / recorded manually. `POST /returns/sync` reports `returns_sync_not_available` (no returns sync runner exists).
4. Excel (.xlsx) import: CSV only; the client converts.
5. Real couriers: still only the sandbox courier + interfaces.

**Partial / simplified**
* Exports are direct CSV downloads (`GET .../export`, max 50,000 rows), not background data jobs.
* Saved views are stored by the workspace module; list endpoints accept `filter[savedViewId]` only where noted by their areas (the client normally applies the saved filters itself).
* Inventory: only 3 of 7 signals have a real 7-point trend (others `null`, not faked); lead time comes from the variant or the business default (no supplier lead time until Procurement exists); `POST /inventory/channel-sync` calls the listings sync through an internal request, so the caller needs `listings:write` as well.
* Shipping: `ship_recommendation` is computed on read and stored on first selection (not when the fulfillment becomes ready); marketplace label booking is not wired (`marketplace_label_pending` / `not_supported_by_connector`); `supportedOrderTypes` is display-only; `POST /shipping/sync` answers with counts immediately.
* Dashboard: `lowStockProducts` has no previous-period comparison (no stock history); system status is `operational` or `degraded` only.
* Issues: `inventory_mismatch` uses ledger drift only; `connector_capability_limit` is rough and untested; manual resolve keeps an issue resolved until the count rises or the condition clears and returns.
* Orders: changing an SLA policy does not recompute due dates of existing orders; payment-confirmed time uses the order creation time; "disputes" is a proxy (rejected return or failed refund).
* Products: `productType` is stored in `products.attributes` (default `physical`), a real column would be cleaner; variant "draft" lifecycle is derived from the product; variant bulk has no price action; unarchive returns a product to draft.
* Returns: `POST /returns` is not channel-gated (only eligibility and the overview flag are), so imported returns keep working; customer email is masked in lists and shown in the detail only when the channel provided it (no extra `orders:read` check).

**Deviations from the contract (paths)**: new list paths instead of changing existing ones (`/products/catalog`, `/orders/ledger`, `/inventory/ledger`, `/returns/ledger`); shipping decision paths use `fulfillmentId` (not `orderId`); exports are `GET`; shipping rule fields use the engine's camelCase names (`orderValueMinor`, `destinationState` ...).

## 4. Things to do next (not done here)
* Commit and push (nothing was committed in this step).
* Answer the open questions in `12-open-questions.md` (SLA rules, lead time, priorities ...), then adjust defaults.
* Marketplaces' real connectors and a membership model for business switching.
* Load test the heavy aggregates (dashboard, ledger, issues sweep) against realistic volumes; the design uses roll-ups, grouped queries and indexes, but no load run has been done.
