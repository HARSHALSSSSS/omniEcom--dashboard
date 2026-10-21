# Figma study: Dashboard section, Part 2 - Screen 09 Needs attention (11 states)

Frames: Open queue `1:26442`, Dispatch detail `1:26137`, Bulk actions `1:25848`, Filter options `1:25550`, All caught up `1:25360`, Loading `1:25093`,
In progress `1:24872`, Resolution failed `1:24607`, Issue resolved `1:24349`, Issue snoozed `1:24091`, Resolved and snoozed history `1:23881`.

## What the screen is
A unified **operations issue queue** for the business: every problem that can hurt orders, inventory or sales, ranked by priority, with one contextual
action each. Reached from the sidebar item "Needs Attention" (badge = open issues) and from the dashboard card of the same name.

## Layout (Open queue)
* Header: eyebrow OPERATIONS, title "Needs attention", sub "Resolve issues before they affect orders, inventory or sales.";
  right side "**18 open issues**" and "Updated 2 min ago".
* Tabs with counts: **All 18 / Critical 3 / Today 11 / Upcoming 4**; right: **View history**.
* Filters (dropdowns): **Area** (All, Orders, Inventory, Listings, Channels, Returns, Shipping), **Priority** (All, Critical, High, Medium),
  **Status** (Open, In progress, Snoozed), **Due** (Any time, Today, Tomorrow, This week). "Clear filters" appears once a filter is active
  (list line then reads "Due today . 11 matching issues").
* Table columns: select checkbox, **Priority** (Critical red / High amber / Medium purple dot + label), **Issue** (bold title + one-line explanation,
  optional status line e.g. "In progress . Picking and packing review started" or "Open . Resolution failed"), **Area**, **Impact**
  (e.g. "Customer delivery risk", "Potential stockout", "Reduced product visibility", "Catalog sync", "Customer resolution delay"),
  **Due** (e.g. "Today . 3:30 PM", "Today", "Tomorrow"), **Action** link (Review orders, Review inventory, Fix listings, Check connection, Review returns).
* Rows are bordered in the priority colour. Pagination: "Showing 5 of 18", Previous / "Page 1 of 4" / Next (page size 5).
* Bottom banner **Recommended action**: "12 of the 18 low-stock products have sold at least 3 units in the last 7 days. Consider reviewing replenishment
  for these products first." with button **Review recommendation**.

Issue types seen (each is a *group* with a count, not one row per order/product):
1. "7 orders are at risk of missing dispatch" - Orders, Critical, due Today 3:30 PM (dispatch cut-off).
2. "18 products are below their stock threshold" - Inventory, High.
3. "4 marketplace listings are incomplete" - Listings, High ("Missing listing details may limit product discovery").
4. "Meesho connection has 2 synchronization issues" - Channels, Medium ("Catalog updates may not reach Meesho until sync succeeds").
5. "3 returns are waiting for approval" - Returns, Medium, due Tomorrow.

## States
* **Dispatch detail** (right drawer, 390px): eyebrow "Orders . Critical", title, "Open . Requires action"; **Why this matters** text;
  **Affected orders** list (ORD-10482, ORD-10479, ORD-10472 each with an open-in-new link, "+4 more"); **Deadline** box "Today . 3:30 PM";
  **Recommended action** box ("Review picking and packing status for the affected orders."); buttons **Open affected orders**, **Snooze issue**.
* **Bulk actions**: selecting rows shows a bar "3 selected" with **Mark resolved**, **Snooze** (menu: Later today / Tomorrow / This week), **Assign**, **More**, close (x);
  header checkbox shows indeterminate.
* **Filter options**: the four dropdowns open (values above, current value ticked).
* **All caught up**: "0 open issues", tabs all 0, empty card "You're all caught up. There are no outstanding issues requiring your attention right now."
  with buttons **Go to dashboard**, **View activity**.
* **Loading**: skeleton rows, header "Loading issues... / Checking for updates".
* **In progress**: status filter = In progress; header "18 **active** issues"; banner "Dispatch review is in progress - You've started addressing this issue.
  It stays in the queue until the affected orders are ready to dispatch."; row shows "In progress . Picking and packing review started".
* **Resolution failed**: red banner "Meesho issue couldn't be resolved - Synchronization hasn't succeeded. The issue is still Open. Check the connection, retry sync,
  then mark it resolved." with **Retry sync**; the row shows "Open . Resolution failed". (So "resolve" can be an automatic action that may fail.)
* **Issue resolved**: green banner "Returns issue marked resolved - 3 returns are waiting for approval has been removed from the active queue. It's available in history."
  with **View history**; counts drop (17 open, Upcoming 3).
* **Issue snoozed**: banner "Dispatch issue snoozed until tomorrow - It will return tomorrow; you can find it in history now."; counts drop (17 open, Critical 2).
* **History** (tabs "Open queue . 16" / "History . 2"; "Back to open queue"): "Resolved & snoozed" with chips All 2 / Resolved 1 / Snoozed 1;
  columns Issue, Area, Status (Resolved with tick / Snoozed with clock), **Updated / Returns** ("Just now" / "Until tomorrow"), Action (link + **Unsnooze** button);
  subline "Marked resolved by Abhishek", "Temporarily removed from the active queue".

## Backend needs (vs what exists)
| Need | Status |
|---|---|
| `GET /issues` queue: grouped issue records (type, area, priority, impact text, due time, count, affected ids, status open / in_progress / snoozed / resolved), tabs counts (all/critical/today/upcoming), filters area/priority/status/due, pagination (page numbers), `updatedAt`, open count for the sidebar badge | **Missing.** Today only separate lists exist (low stock, listings issues, sync jobs, returns) and `/analytics/health`; there is no issue entity |
| Issue detail (why it matters, affected records with deep links, deadline, recommended action) | Missing |
| Actions: mark resolved, snooze (later today / tomorrow / this week), unsnooze, assign, bulk versions, "start working" (in progress) | Missing |
| History list (resolved + snoozed, who resolved, snooze end) | Missing |
| Resolution can fail and report why (retry sync) | Partly (sync retry exists) |
| Detectors that create / refresh issues: orders at risk of missing dispatch (SLA cut-off), stock below threshold, incomplete listings, channel sync failures, returns waiting for approval; also shipping (NDR) | Detection data exists in several modules; no scheduler that materialises issues. `automation`/`ai` modules can be reused (anomaly + recommendations) |
| Needs-attention recommendation ("12 of 18 low-stock sold >=3 units in 7 days") | `ai` module can supply (reorder candidates with velocity) |
