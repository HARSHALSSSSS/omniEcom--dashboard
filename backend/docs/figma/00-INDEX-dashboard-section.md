# Figma study: "Dashboard" section (Frame 3) - index and cross-cutting findings

Source: Figma file "omni-chanel (Copy)" (`i9ubxkDuWLlgX5iz7Zv0pR`), page "Omni chanel", section heading **Dashboard** (Frame 3 `1:28105`).
Everything below the heading was read screen by screen from full-resolution renders (55 frames). This is a **study only**: no backend code was changed for it.

| Part | Screens | File |
|---|---|---|
| 1 | App shell, Screen 08 Dashboard home, global search, channel / inventory / recommendation detail panels | `01-dashboard-home.md` |
| 2 | Screen 09 Needs attention (11 states) | `02-needs-attention.md` |
| 3 | Screen 10 Products list, Screen 11 Product details (6 tabs + incomplete state), Screen 14 Variants & SKU management | `03-products.md` |
| 4 | Screen 26 Inventory Control Room (+ adjust stock, product context, bulk, sync, home seller) | `04-inventory.md` |
| 5 | Screen 28 Orders workspace (+ order drawer), Screen 34 Shipping workspace (5 tabs, exceptions, 3 drawers) | `05-orders-and-shipping.md` |
| 6 | Screen 35 Returns workspace (4 tabs, 4 drawers) | `06-returns.md` |
| API A | **Contract draft**: conventions, shell, dashboard, issues engine, products | `10-api-contract-draft-A.md` |
| API B | **Contract draft**: inventory, orders (SLA), shipping, returns, cross-cutting, data changes, build order | `11-api-contract-draft-B.md` |
| Q | **Open questions** with proposed defaults | `12-open-questions.md` |

Not part of this section (other headings in the file, not read yet): Listings / Marketplace Hub (Screens 18-24, 23), Create product / Edit product / Bulk import (Screens 12, 13, 15-17), Pricing, Promotions, Procurement, Reports,
Product Intelligence, AI Assistant, Automation, Settings, Profitability and Fulfillment workspaces. A few loose frames inside the section were skimmed only: "Spendings" (`1:27262`, small component), context menus.

## Cross-cutting findings (the same need appears on many screens)
1. **One "issue / exception" engine.** Needs-attention queue, dashboard card, product "Needs attention" banner, shipping exceptions, returns attention, inventory signals, order "Needs Attention" strip all show the same thing:
   a detected problem with priority, area, impact, due time, affected records, recommended action, and a lifecycle (open -> in progress -> snoozed / resolved, with history and bulk actions). Build it once (`issues` module) and let each area publish detectors.
2. **SLA / deadline model.** Orders have a dispatch deadline with live time remaining and bands (safe, approaching, at risk, breached); shipping, returns (inspection overdue) and the dashboard use it.
3. **Saved views** on Products, Inventory ledger, Orders ledger ("Saved views", "Save current view"). One generic `saved_views` store per (vendor, user, screen).
4. **Counters + tabs with counts + keyset pagination with page numbers** on every list ("All 427 / Draft 18 / Needs attention 7", "Page 1 of 4"). Lists need a cheap counts endpoint per screen.
5. **Advisory AI ("recommendations only")** on dashboard, inventory, returns, orders: always text + evidence + a reviewable action, never an automatic change. This matches the existing `ai` module modes (observe / recommend / approve).
6. **Channel-aware everywhere.** Channels shown: Amazon, Flipkart, Meesho, Shopify (Myntra and Snapdeal do not appear in this section). Meesho and Shopify are "coming soon" in the backend; the designs treat them as live.
7. **Global search (Cmd+K)** across products, orders, SKUs, inventory rows with scopes; and a **business switcher** (one user, several businesses).
8. **Connector-honest states**: "Requires configuration / capability verification", "Not supported by connector", "From connector", "Illustrative". The API must expose capability flags per marketplace and per shipping method so the UI never invents support.
9. **As-of date / live indicator** ("Today . Oct 5, 2026", "7 Oct . Live inventory"): the dashboard and inventory endpoints take an `asOf` day and return `generatedAt`.
10. **Mock data conventions to respect** (not requirements): INR in the dashboard / orders, USD in returns refunds (amounts come from the connector), SLA examples in minutes, order ids `ORD-10291`, return ids `RTN-10482`.

## Gap summary (backend vs designs) - verify each row against the code before building
| Area | Biggest gaps |
|---|---|
| Dashboard | aggregate dashboard endpoint with previous-period comparisons, channel contribution, pipeline counts, inventory health, channel health, needs-attention; global search; business switcher |
| Needs attention | the whole issues engine (detectors, lifecycle, snooze/resolve/assign, history, counts) |
| Products | counters, saved views, per-product overview/activity feed, inventory + channel filters, duplicate, bulk publish, variant filters (color/size/channel/inventory) |
| Inventory | quarantined bucket, coverage / lead time / velocity, signals (stockout risk, mismatch, slow-moving, aging, imbalance), per-channel sync state with affected SKUs and retry, adjustment types + preview, bulk by filter, saved groups |
| Orders | dispatch SLA, SLA pressure buckets, attention counters (payment issue, cancellation risk), source split, saved views, order drawer DTO |
| Shipping | per-order shipping decision (available methods, preference, selection, confirm), methods + capability matrix (marketplace / seller / third-party), shipping rules with priority and affected count, tracking states, exceptions, pulse deltas, bulk label / recalculate |
| Returns | counters + signals, inspection (assign, checklist, result), quarantine and repair dispositions, refund-from-connector tracking, create-return by order search, return-reasons analytics + intelligence, export |

## What already helps (confirmed from the repo at the time of writing)
Orders, fulfillment (pick / pack, status events), shipping (providers, shipments, manifests, tracking, NDR), returns (lifecycle, dispositions), inventory ledger and buckets (available / reserved / incoming / damaged / returned), warehouses (simple and warehouse mode from onboarding), listings and import,
analytics roll-ups, AI recommendations (modes + approvals), automation rules, notifications, audit log, sync jobs, feature flags, onboarding APIs.

## Errata (checked against the code after Parts 1-6 were written)
See section 12 of `11-api-contract-draft-B.md`: inventory coverage / velocity already exist (`analytics/inventory-health`), `quarantine` already exists as a return disposition, `GET /orders` already has attention / payment / inventory filters. Where a part says "missing", trust the contract drafts.
