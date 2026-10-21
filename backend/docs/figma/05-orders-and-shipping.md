# Figma study: Dashboard section, Part 5 - Orders (Screen 28) and Shipping (Screen 34)

Frames: Orders Workspace `1:38869`, Order context drawer `1:39381` (304px). Shipping Workspace `3:11451` (overview + all alternate views and states in one tall master),
tab pages Orders to ship `6:4821`, Shipping methods `6:6119`, Rules `6:7210`, Tracking `6:8104`; drawers `3:12333` (Choose Shipping, Add Provider, Create/edit rule).

## Screen 28 - Orders workspace
* Header: ORDER OPERATIONS / "Orders" / "All connected orders, unified into one operational workflow." Buttons **Refresh, Export, More**.
* Tabs: **All Orders, Needs Attention 17** (highlighted), **New, Processing, Shipped, Delivered, Returns / Disputes**.
* **Order Pulse** ("Today . Live operational flow"): 128 Today orders, then 18 New, 24 Confirmed, 16 Picking, 21 Packed, 12 Ready to Dispatch, 22 Dispatched, 15 In Transit (each a clickable stage chip).
* **Needs Attention strip**: counts that act as filters: **3 SLA risk, 5 Unprocessed, 2 Inventory issue, 1 Payment issue, 4 Cancellation risk, 2 Returns**.
* **Order sources** (47 recent orders): bar by marketplace with count and share: Amazon 18 . 38%, Flipkart 12 . 25%, Meesho 9 . 19%, Shopify 8 . 17%.
* **SLA Pressure** ("Time remaining -> Dispatch deadline -> Overdue"): **Safe 78 orders (more than 4 h)**, **Approaching deadline 32 orders (4 h -> 90 min)**, **At risk 12 orders (90 min -> 0 min)**,
  **Breached 6 orders (past deadline)**; sentence "3 orders may breach dispatch SLA within the next 90 minutes."; link **Review at-risk orders**.
* **Order Ledger** ("All orders . All marketplaces . Any status", "128 orders"): search "Search order / customer / SKU"; filters **Marketplace, Order status, SLA state, Payment, Fulfillment, Date, Saved views**,
  "No filters applied"; quick chips **SLA Risk, Unprocessed, Inventory Issue, Payment Issue, Delayed, Returns, Disputes**.
  Columns: select, **Order (ORD-10291), Marketplace, Customer, Items ("3 items"), Value (INR), Payment (Paid / Pending), Fulfillment (Picking / Ready to Dispatch / Inventory Issue / Packed), SLA ("Due in 42 min" / Healthy / Attention), Status (Confirmed / Ready to Dispatch / Packed), Created (time), Action (open)**.
  Rows carry a coloured left border by urgency. An **inline issue row** under an order: "Inventory issue - 1 item cannot currently be fulfilled. Black T-Shirt Required: 2 . Available: 1 - Recommended next step: Review inventory".
  Pagination "Showing 1-4 of 128 orders".
* **Recent Order Activity** (across all marketplaces): time, order id, event ("Payment confirmed", "Moved to Ready to Dispatch", "Picking started", "SLA risk detected", "Return request received").
* **Order details drawer**: "Order details" ORD-10291, status badge Picking; "Amazon . Created 23 Oct 12:04 PM"; **Dispatch SLA: 42 minutes remaining** with progress bar (Now . Picking in progress -> Dispatch deadline);
  **Customer** (name, city/state), **Order Value** + Paid; **Items . 3 units** (name x qty); **Fulfillment** (Warehouse Mumbai, Picking In progress); **Marketplace status** ("Amazon: Pending shipment");
  **Activity** timeline (12:04 Order received, 12:08 Inventory reserved, 12:18 Order confirmed, 12:32 Picking started); buttons **Open fulfillment**, **Cancel order**.

## Screen 34 - Shipping workspace
* Header: SHIPPING OPERATIONS / "Shipping" / "Choose, configure and monitor the shipping method used to move every order." Status line "4 connected channels . 2 shipping methods active . 7 orders need attention".
  Buttons **Shipping Rules, Add Provider, Sync Shipping** (primary), **...**. Tabs **Overview, Orders to Ship, Shipping Methods, Rules, Tracking**.
* **Overview**
  * **Shipping Pulse** (Order -> Shipping Decision -> Carrier/Method -> Label -> Dispatch -> Tracking): **42 Ready to Ship (+8 since last sync, "2 need a decision")**, **36 Shipping Selected (+6, "Preference confirmed")**,
    **31 Label Ready (+4, "1 label unavailable")**, **18 Dispatched (+3, "Dispatch recorded")**, **126 In Transit (+12, "1 tracking issue")**.
  * **Shipping Decision Field**: per order (ORD-10482 "1 item . 0.65 kg"): Marketplace + warehouse, **Available methods** ("Flipkart Shipping / Seller Shipping"), **Merchant preference** ("Flipkart Shipping - Default for Flipkart orders"),
    **Selected shipping** ("Flipkart Shipping - Selection confirmed" / "Seller Shipping - Manual override available"). Footnote: "Preference -> selection -> confirmation is visible for every order. Manual override remains available where supported."
  * **Availability comparison** table (Marketplace, Method, Provider, Availability "Requires configuration / capability verification", Default (Preferred / Order-specific / Not set), Override (Where supported / Verify capability / Unavailable)).
  * Footer strip "**7 orders need shipping attention** - 2 undecided . 1 label . 1 tracking . 1 sync . 1 SLA risk . 1 capability  [View exceptions]".
* **Orders to Ship** (42 ready to ship): search "Search order / SKU"; filters Marketplace, Warehouse, Shipping method, SLA, Status; bulk actions **Select all, Assign shipping method, Generate labels where supported, Recalculate shipping option, Export**;
  columns select, Order, Marketplace, Warehouse, **Destination** ("Pune, MH"), Order Value, **Weight (kg)**, **Available Shipping**, **Selected Method** (Not confirmed / Seller Shipping / Unassigned), **SLA** (Review deadline / Not assessed / Review required),
  **Status** (Needs Shipping Decision / Shipping Selected / Label Pending / Ready to Dispatch / Shipping Exception), **Action** (Choose / Review / View label / Dispatch / Resolve).
* **Shipping Methods**: left list **Connected Shipping Methods** (Flipkart Shipping - Marketplace shipping . Flipkart - Configured . active; Seller Shipping - Merchant-managed . connected channels - Configured . active;
  Third-party provider - No verified connector selected - Requires configuration); right detail for the selected method: Method name, Connected marketplace/provider, **Supported order types**, **Status / last successful sync** ("Configured . 08 Oct, 12:40"),
  **Default status** ("Preferred for Flipkart orders"); buttons **Set as default, Configure, Disable, View capability**; **Capability matrix** (rows Marketplace Shipping / Seller Shipping / Unverified connector; columns **Label support, Tracking support, Dispatch update, Status synchronization**; values "Requires configuration" / "Not supported by connector").
* **Rules**: "Control which shipping method is preferred for different operating conditions." **+ Create Shipping Rule**. A rule is shown as IF/AND/THEN: "Flipkart - Mumbai preference: IF Marketplace = Flipkart AND Warehouse = Mumbai AND Order Value > threshold THEN Prefer = configured shipping method";
  right side Enabled badge, "Priority 1 . 18 orders affected", last updated, **Edit / Duplicate / Disable**; list below (Rule, Status, Priority, Last updated, Orders affected, Action Edit/Duplicate/Enable) e.g. "Fallback - Seller Shipping preference - Disabled - priority 2".
* **Tracking** ("Sync Tracking"): pipeline Dispatched -> In Transit -> Delivered; columns Order, Marketplace, Shipping Method, **Tracking ID**, **Dispatch Date**, **Current Status** (Tracking Active / Awaiting First Scan / In Transit / Delivery Delayed / Tracking Sync Failed / Delivered), **Last Update**, **Attention** (No attention / Check first scan / Review update / Retry required / Completed).
  Failure card: "Tracking sync needs attention - What failed? The latest tracking status was not received. Failed 08 Oct at 12:32 . ORD-10474 - Possible reason: connector timeout or tracking capability not verified - [Retry]".
* **Shipping exception** (contextual state, "7 orders need shipping attention", "6 categories, 7 distinct orders", Export exceptions): rows **No shipping method selected (2: ORD-10482, ORD-10484) -> Choose shipping**,
  **Label unavailable (1) -> Verify label capability**, **Tracking not received (1) -> Review tracking**, **Shipping sync failed (1) -> Retry sync**, **SLA risk (1) -> Review order deadline**, **Connector capability limitation (1) -> View capability**;
  expanded row shows "What happened? / Why? / What can I do now?" + **Choose Shipping**.
* **Sync & first-use states**: Syncing ("Synchronizing shipping data... Orders: 184, Shipping statuses: 176 / 184, Tracking updates: processing"), Completion ("Shipping sync complete - 184 processed . 181 updated . 3 require attention [View Exceptions]"),
  Empty ("Shipping is ready when you are. [Configure Shipping] [View Connected Marketplaces]; 1 Connect your marketplace 2 Configure one shipping method 3 Review and confirm your first order").
* **Drawers**: **Choose Shipping - ORD-10482** (Marketplace, Destination, Warehouse, Product/SKU, Weight, Order value; **Available Shipping** cards "Flipkart Shipping - Recommended - Available . Marketplace-managed - Selected awaiting confirmation" and "Seller Shipping - Available . Merchant-managed";
  "Why this method? Matches your default preference for Flipkart orders."; **Confirm Selection / Cancel**). **Add Provider / Choose Shipping Method**: radio **Marketplace shipping / Seller shipping / Supported third-party provider / Configured logistics provider** (each "Requires configuration"), capability list
  (Shipping label, Tracking, Dispatch update, Status synchronization), note "Supported only after verification. When a capability is unavailable, show 'Not supported by connector'"; **Configure method / Cancel**.
  **Create / edit rule**: WHEN Marketplace = Flipkart, AND Warehouse = Mumbai, AND Condition field (Order value / Marketplace / Warehouse / Location / Product / Weight) with operator (**Equals, Contains, Greater than, Less than**) and value; THEN Preferred shipping method; "Manual override remains available where supported."; **Save Rule / Cancel**.

## Backend needs (vs what exists)
| Need | Status |
|---|---|
| Orders list with order pulse (stage counts), needs-attention counters (SLA risk, unprocessed, inventory issue, payment issue, cancellation risk, returns), source split, **SLA pressure buckets** | Orders list, filters, status machine exist. **Missing: dispatch SLA model** (deadline per order, time remaining, safe / approaching / at risk / breached), payment-issue and cancellation-risk flags, counters endpoint, source-share endpoint |
| Order detail drawer (SLA bar, customer city, items, fulfillment warehouse + picking state, marketplace status text, activity timeline, Open fulfillment / Cancel) | Mostly exists (`/orders/{id}`, fulfillment, status events, cancel); missing aggregated drawer DTO and SLA |
| Order ledger columns/filters (SLA state, payment, fulfillment, saved views, issue row with required vs available) | Partly; inline inventory-issue detail missing; saved views missing |
| Shipping pulse (ready to ship / shipping selected / label ready / dispatched / in transit with deltas since last sync) | Shipment statuses exist; deltas "since last sync" and "need a decision" counts missing |
| Per-order shipping decision (available methods, merchant preference, selected, confirm, override), recommendation + reason | **Missing**: shipping options per order, preference match (`fulfillment_preferences` from onboarding stores the default + overrides, not yet read by shipping) |
| Shipping methods list/detail, set default, configure, disable, capability matrix per provider (label, tracking, dispatch update, status sync) | `/shipping/providers` (+ catalog with capabilities) exists; need "marketplace shipping" and "seller shipping" as methods, verification state, supported order types, last sync |
| Shipping rules (IF/AND/THEN with fields marketplace, warehouse, location, order value, product, weight; operators equals/contains/gt/lt; priority; orders affected; enable/disable/duplicate) | `rules` module (routing rules engine) exists; needs shipping-method rule type with these fields, priority, affected-orders count, duplicate |
| Tracking list with statuses (active, awaiting first scan, in transit, delayed, sync failed, delivered), retry | Tracking events + refresh exist; needs derived "awaiting first scan / delayed" and per-order retry; bulk Sync Tracking exists as a job |
| Shipping exceptions (6 categories) with what / why / what to do | **Missing** (shares the issue/needs-attention engine, see Part 2); NDR cases exist for delivery failures |
| Bulk: assign method, generate labels where supported, recalculate option, export | Label creation exists per shipment; bulk + recalculate missing |
