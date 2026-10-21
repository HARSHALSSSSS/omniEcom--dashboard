# Figma study: Dashboard section, Part 6 - Screen 35 Returns workspace

Frames: Overview `9:14432` (one tall master with the filtered / exception states), Returns tab `7:11494` and `7:9968`, Inspection `7:12452`, Refunds `7:13410`;
drawers: Return detail `7:10680`, Inspect `7:12935`, Refund detail `7:14028`, Create Return `12:3759`.

## Header (all tabs)
RETURNS OPERATIONS / "Returns" / "Centralize returns, inspect returned products, process refunds and decide the next inventory disposition."
Status line "**12 open returns . 4 awaiting inspection . 3 refunds pending**". Buttons **Create Return**, **Sync Returns** (primary), **Export**, **...**.
Note top right: "**Create Return: Shopify connection only**" (creating a return from the dashboard is available for Shopify orders only). Tabs **Overview, Returns, Inspection, Refunds**.

## Overview
* "Every return, one controlled path": Return Request -> Receive -> Inspect -> Decide -> Refund -> Inventory Disposition -> Close.
  Stage counters: **Requested 12 (To review), Approved 9 (Authorized), In Transit 3 (Await receipt), Received 6 (Verify stock), Inspecting 4 ("3 need review"),
  Resolution 3 ("Refund pending"), Refunded 8 (Disposition), Closed 48 (Complete, last 30 days)**. "Stage counts are independent operational queues; closed totals cover the last 30 days."
* **Needs Attention** strip (signals can overlap, click to filter the ledger): "3 returns awaiting inspection", "2 refunds pending", "1 return has inventory discrepancy", "1 high-value return needs review"; link "Filter returns below".
* **Returns ledger** ("Know what came back, why it came back, and what happens next."): quick tabs **All, Needs Attention, Awaiting Receipt, Awaiting Inspection, Refund Pending, Completed**;
  search "Search return, order, product or SKU"; **Marketplace** select, **Filters**; selection bar "2 selected" **Select visible, Select all, Assign inspection, Export, Mark inspection status, Review selected**;
  columns **Return ID (RTN-10482), Order, Product / SKU, Marketplace, Return Reason, Quantity, Return Status (Requested / Approved / In Transit / Received / Inspecting / Refund Pending / Resolved / Rejected), Received (date), Inspection (Not started / Pending / Review / Failed / Passed), Refund (Pending / Ready / Refunded / N/A), Inventory Disposition (Pending / Damaged / Sellable / Rejected), Action (Inspect / Review / View / Track / Refund)**.
  Footer "Showing 8 of 60 returns . 12 open . No bulk refunds or dispositions" (bulk actions never refund or move stock), pagination 1 2 3.
  Applied-filter example: "FILTER APPLIED . Inventory discrepancy . 1 result": RTN-10491 Linen cushion LC-SND-45, issue "Expected 2 . Received 1", next action Review inspection.
* **Why products are coming back** (last 100 returns, last 30 days, one primary reason each): Sizing issue 17%, Damaged product 16%, Color mismatch 15%, Quality complaint 14%, Missing accessory 13%, Delivery complaint 13%, Other 12%.
* **Return Intelligence (RECOMMENDATIONS ONLY)**: "17% of recent returns mention a sizing issue. Evidence: 17 of the last 100 returns. Cotton shirt CS-WHT-M accounts for 11 of those mentions. [Review size chart]";
  "Return activity for this SKU is higher than its recent baseline. CS-WHT-M . 9 returns in 7 days vs. 4 in the preceding 7 days. [Inspect Product]"; "AI recommends only. It never changes listings, inventory, or refund decisions."
  Line "Return activity is concentrated around 3 products. [View Products]".
* **Filtered view: "4 returns need attention"** ("One row per affected return. Signals can overlap"), **Export exceptions**, columns Return, Issue, Impact, Recommended action:
  RTN-10482 **Inspection overdue** (Received 07 Oct . Inspection not started) -> Start inspection; RTN-10496 **Refund pending** (Refund failed . $249.00 . High-value review required) -> Review connector failure;
  RTN-10491 **Quantity mismatch** (Expected 2 . Received 1) -> Review inspection; RTN-10498 **Inventory disposition missing** (Refund processing . Stock destination not confirmed) -> Review disposition.

## Returns tab
Compact list (Return, Product, State, Action) with the selected row highlighted ("RTN-10482 selected - Your place in the ledger is preserved."). Block **"Received is not resolved."** - "Confirm what came back before committing a refund or moving stock into inventory":
three steps **Verify** (inspect product, check quantity), **Decide** (explicitly confirm inventory disposition), **Resolve** (process the connector-supported refund, then close).
**Receipt reconciliation** (RTN-10482 . Received by Abhishek . 07 Oct, 14:20): Product/SKU, Expected 1, Received 1, Match "Matched"; "Quantity matches the request. Physical condition still needs verification; the received unit has not been added to sellable stock."
Compact resolved state: "RTN-10488 / Resolved - Cotton shirt . 1 unit . Shopify - Inspection Complete . Refund Processed - Disposition Sellable . Closed 05 Oct, 16:32 - Operator confirmed sellable stock after a passed inspection. Connector confirmed the $49.00 refund."
Footer: "Customer information is shown only when provided by the connected channel. No customer data is inferred."

## Inspection tab
"Return Inspection - Verify returned products before deciding refund and inventory disposition." **Assign inspection**. Columns Return, Product, SKU, Quantity, **Physical Condition** (Not verified / Checking / Usable . intact / Cracked / Usable . 1 unit), **System Condition** (Receipt matched / SKU matched / Quantity mismatch),
**Inspector**, **Inspection Status** (Not Started / In Progress / Passed / Failed / Requires Review), **Recommended Disposition** (No recommendation / Pending inspection / Sellable / Damaged / "Quarantine . Suggested"), Action (Start / Resume / View / Review).
**Inspection and inventory decision drawer/panel** ("What should happen to this returned stock?"): recommendation box (e.g. "Quarantine - Expected 2 . Received 1. Hold the received unit while the missing quantity is reviewed. Suggested only . No decision selected or inventory change made");
radio options **Return to sellable stock** (suitable for resale), **Damaged** (keep out of sellable stock), **Rejected** (do not accept into stock), **Quarantine** (hold until further review), **Repair** (repair before resale), **Write-off** (should not return to inventory);
"No option is selected. The operator must explicitly confirm the disposition before stock can move."; **Confirm disposition** (disabled until chosen) / Cancel. Label sets: Inspection Pending / In Progress / Complete; Refund Pending / Processed / Not applicable; Disposition Pending / Sellable / Damaged / Rejected / Quarantine / Repair / Write-off.

## Refunds tab
"Review connector-provided amounts and status. Availability depends on the connected channel." Columns Return, Order, Marketplace, **Refund Status** (Pending / Ready for Refund / Processing / Refunded / Refund Failed / Not Applicable), **Refund Amount** (USD in the mock, e.g. $49.00 - amount comes **from the connector**), Return Status, Inspection Status, Last Update, Action (View / Review refund / Review failure).
Footer "3 refunds pending resolution: 1 ready . 1 processing . 1 failed. Pre-inspection returns are not yet in the actionable refund queue." Contextual state "Refund detail / Connector failure".

## Drawers
* **Return RTN-10482** (return detail): "ORD-10482 . Shopify . Emma Wilson"; product card (Cotton shirt . CS-WHT-M, "Quantity 1 . Sizing issue . Received 07 Oct 2026"); **Return Details** (Order ID, Marketplace, Customer name + email, Product, SKU, Quantity "1 expected . 1 received", Return reason, Requested / Approved / Received dates);
  **Current State** ("Inspection Pending . Refund Pending / Disposition Pending . No decision confirmed"); **Event timeline** (Requested - Complete, customer via Shopify; Approved - Complete, Abhishek "Return accepted for receipt"; Received - Complete "1 of 1 expected units received"; Inspection - Pending Unassigned; Refund - Pending Shopify "Awaiting inspection decision"; Disposition - Pending Operator decision; Closed - Pending System "Requires refund and disposition resolution"); buttons **Start inspection**, **View Order**.
* **Inspect RTN-10491** (Requires Review . inspector . date): **Product Verification** (Product, SKU, Expected qty 2, Received qty 1; warning "1 unit is missing. Expected 2 . Received 1. Review the receipt before confirming disposition."); **Condition Check** Yes/No toggles: **Packaging intact, Product usable, Accessories present, Visible damage, Product mismatch, Missing quantity**, **+ Add Conditions**; **Inspection Result** **Pass / Fail / Needs Review** ("Requires Review: missing unit and accessory. Inspection does not approve a refund or select a disposition."); **Save inspection / Close**.
* **Refund - RTN-10482** ("Pending . Awaiting inspection decision"): Order, Marketplace, Return, Product, Quantity, **Refund amount "$49.00 USD . From connector"**, Refund status, Last update; **Refund Status timeline** (Requested - Customer via Shopify; Approved - Pending, Operator, awaiting inspection; Processing - Shopify awaiting refund approval; Completed - No connector completion received);
  note "Return approval is not refund approval. Inspect and decide before proceeding with a supported refund action."; **View return inspection**.
* **Create Return**: "Find an order and choose the items you want to return." **Order** search ("#1048", **Find order**, "Shopify orders only") -> order card (Order #1048 . customer . email . date . "4 items . $142.00 USD", Fulfilled badge); **Items to return** table (Product + variant + SKU, Fulfilled qty, **Return qty stepper**, Unit price; checkboxes; "Only fulfilled items are eligible. Quantities cannot exceed the amount available to return.");
  **Return reason** select ("Size or fit issue", "Applies to selected items."), **Notes (optional)**; footer "2 units . $96.00 item value - Creating a return does not issue a refund."; **Cancel / Create Return**.

## Backend needs (vs what exists)
| Need | Status |
|---|---|
| Return overview counters (requested, approved, in transit, received, inspecting, resolution, refunded, closed last 30d), attention signals | `returns` module has the lifecycle + list; **counters endpoint and attention signals missing** |
| Returns ledger columns (inspection, refund, disposition states), filters (tab presets, marketplace), bulk assign inspection / mark inspection status | List/filters partly; **inspection assignment (inspector), inspection status, refund status as separate tracks missing or merged** |
| Return reasons breakdown (% of last N returns) + intelligence ("17% mention sizing", SKU baseline spike) | **Missing** (`ai`/analytics can supply) |
| Create return from an order (search by order number, eligible fulfilled items, qty <= available, reason, notes, item value); Shopify-only gate | Create-return API exists (`/returns`); order search by marketplace order number and eligible-qty helper to verify; Shopify is "coming soon" in the backend today |
| Receipt reconciliation (expected vs received, mismatch) | Partly (received quantities); mismatch flag missing |
| Inspection: assign, condition checklist (6 yes/no), result pass/fail/needs review, system condition | **Missing** (only dispositions exist today) |
| Disposition choices: sellable, damaged, rejected, **quarantine, repair, write-off** | Existing dispositions: hold / restock / damaged / writeoff; **quarantine and repair are new** (and "quarantined" stock bucket, see Inventory) |
| Refund tab: amount/status **from the connector**, retry / review failure | Refund recording exists (`returns:refund`); connector-driven refund status + failure handling missing; amounts shown in USD in the mock (currency per marketplace) |
| Return event timeline (requested / approved / received / inspection / refund / disposition / closed with actor and note) | Return events exist (append-only); needs the pending future steps in the DTO |
| Export, Sync Returns | Returns export missing; `returns` sync job exists |
