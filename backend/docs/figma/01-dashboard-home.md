# Figma study: Dashboard section, Part 1 - app shell + Screen 08 (Dashboard home)

Source: Figma file "omni-chanel (Copy)", section "Dashboard" (Frame 3). Frames: `1:11342` Dashboard / Refreshed, `1:26962` Global search / Results,
`1:26705` Channel, inventory and recommendation details, `1:11735` Sidebar expanded, `1:27313` Sidebar collapsed.

## App shell (on every screen)
* **Brand**: "[Product Name]" + "Commerce Operating System".
* **Sidebar** (expanded 224px, collapsed 64px = brand abbreviation + avatar), three groups plus utilities:
  * WORKSPACE: Dashboard, Needs Attention (badge with open-issue count, e.g. 4), Products, Inventory, Orders, Shipping, Returns.
  * COMMERCE: Listings, Pricing, Promotions, Procurement.
  * INTELLIGENCE: Reports, Product Intelligence, AI Assistant, Automation.
  * Utilities: Notifications, Settings. User block: initials, name ("Abhishek"), role ("Business owner"), with a switch/menu chevron.
* **Header**: breadcrumb "Workspace / <page>", global search trigger ("Search products, orders, SKUs..." with Cmd+K), notification bell,
  help icon, **business switcher** (current business "Nova Living", dropdown), avatar.

## Screen 08 - Dashboard home
Greeting "Good morning, <first name>." + "Here's what needs your attention today." Date control "Today . Oct 5, 2026" (dropdown, sets the "as of" day).

1. **Needs attention** (card, 4 priority rows, each with title, one-line count sentence and a contextual action link):
   * Low stock - "18 products are running low on inventory" -> Review inventory.
   * Orders at risk - "7 orders need action before dispatch" -> View orders.
   * Listing issue - "4 marketplace listings need attention" -> Review listings.
   * Sync issue - "2 channel connections need attention" -> Check connections.
   Order and wording are by priority; the sidebar badge (4) is the number of open issue groups.
2. **Recommended action** (AI card): headline "18 products are approaching their stock threshold.", rationale "Based on recent sales velocity,
   replenishing 6 products this week could reduce potential stockouts."; buttons **Review recommendation** and **Dismiss**.
3. **Business snapshot** (period label "Today"): five metrics, each value + comparison:
   Orders 126 (+12% vs previous period), Revenue 2.84L (+8.4%), Units sold 318 (+6.2%), Return rate 4.8% (-0.7%), Low-stock products 18 ("Needs review").
4. **Sales performance**: period switch **7 days / 30 days / 90 days**; line chart "Daily revenue . INR" with a **previous period** dashed
   comparison line; hover tooltip shows the date with both values; x axis dates, y axis INR. Next to it **Channel contribution . Today**:
   channel list with revenue and a share bar (Amazon 1.24L, Flipkart 68K, Shopify 50K, Meesho 42K).
5. **Order flow** "Today's operational pipeline": six stages with counts: New 24, Confirmed 31, Picking 12, Packing 18, Dispatched 41,
   Delivered 96; link "View all orders".
6. **Inventory health** "stock position across all connected channels": stacked bar Healthy (403) / Low stock (18) / Out of stock (6);
   table **Most affected products** (Product, SKU, Available, Status badge): Premium Travel Bag TRV-1042 4 Low stock; Cotton Overshirt OS-2048 0 Out of stock;
   Classic Backpack BP-1021 8 Low stock; link "View inventory".
7. **Channel health** "Connection and sync status": per channel name, health word (Healthy / Attention), badge **Connected**, "Last sync: 2 min ago",
   action **Details** (or "2 issues" + **Review** when attention). Links "Manage channels"; note "Showing sales channels. The priority queue includes all channel connections."
8. **Footer**: "Last synced 2 minutes ago", "All systems operational".

Note: this screen shows **Amazon, Flipkart, Meesho and Shopify as connected channels** (Meesho and Shopify are "coming soon" in the backend today).

## Global search dialog (Cmd+K)
Input + Esc; scope tabs **All results / Products / Orders / SKUs**; results grouped: "PRODUCTS . 2 RESULTS" (title, "SKU . N available . Low stock", type
label "Product"), "ORDERS . 1 RESULT" (Order #1042, "Premium Travel Bag . Amazon . Picking . Dispatch today"), "INVENTORY . 1 RESULT"
(SKU row "TRV-1042 / Home Inventory", "Premium Travel Bag . Available 4 . Threshold 10"). Keyboard: up/down navigate, Enter open, Esc close, footer "4 results".

## Companion detail panels (opened from the dashboard)
1. **Channel connection panel** (Meesho): header "Channel connection", title, "Nova Living . Marketplace connection", badges Connected + Attention;
   fields Last sync (18 min ago), Open issues (2), Sync mode (Automatic); "What needs attention": issue cards each with title, explanation, action link
   ("Inventory update rejected - The stock update for TRV-1042 was not accepted. Review the channel SKU mapping before retrying." -> Review mapping;
   "Catalog sync delayed - The latest catalog sync is waiting for the marketplace. Last successful sync: 18 minutes ago." -> View sync log);
   scope note; buttons **Retry sync**, link **Manage connection**.
2. **Product / inventory panel** (Premium Travel Bag, "TRV-1042 . Home Inventory"): badge Low stock; big "4 units available" ("On-hand stock minus reserved units");
   rows On hand 6, Reserved 2, Available 4, Low-stock threshold 10, Recent sales velocity 2 units/day, Estimated stock cover 2 days;
   "Recent stock movement" (dated rows: Oct 4 Stock received +12, Oct 5 Dispatched -6, Oct 5 Reserved 2); note "central stock source is shared across your connected channels";
   buttons **Review replenishment**, link **Open product**.
3. **Recommendation panel** ("Replenish 6 products this week"): "Why this is recommended" text; **Suggested quantities** "14-day target cover, less available stock":
   rows Product / Available / Add units (Premium Travel Bag 4 -> +24, Classic Backpack 8 -> +34, Weekender Duffel 6 -> +22, Canvas Tote 5 -> +23,
   Cotton Crew Tee 9 -> +33, Leather Tote 3 -> +25); disclaimer "Recommendation only ... No inventory changes have been made."; **Review replenishment**, **Dismiss**.

## What the backend must provide (vs what exists)
| Need | Status in backend today |
|---|---|
| Dashboard summary (needs-attention counts, snapshot metrics with comparison, revenue series + previous period, channel contribution, order pipeline counts, inventory health + affected products, channel health) | Partly: `/analytics/*`, `/reports/*`, `/analytics/health` exist; no single dashboard endpoint with exactly this shape, no "previous period" comparison on every metric, no `asOf` day |
| Needs-attention queue (grouped issue rows + count badge) | Missing as one API (data exists across inventory/orders/listings/sync) |
| Recommendation card + detail with suggested quantities, dismiss | Exists in `/ai/recommendations` (reorder suggestions, approve/dismiss); needs the 14-day-cover quantity table + "recommendation only" text |
| Global search (products, orders, SKUs, inventory rows) | Missing |
| Channel detail (last sync, open issues, sync mode, issue list with actions, retry sync) | Partly: sync jobs + health-check exist; no per-channel issue list |
| Product/inventory detail panel (on hand/reserved/available/threshold/velocity/cover/recent movement) | Partly: `/inventory/variants/{id}`, movements exist; velocity + cover missing |
| Business switcher, user block with role | Missing multi-business membership API (one user = one vendor today) |
| Notifications bell, help | Notifications exist (`/notifications`) |
