# Figma study: Dashboard section, Part 4 - Screen 26 Inventory Control Room (6 frames)

Frames: Control room `1:35478`, Black T-Shirt context `1:37018`, Adjust stock context `1:36180`, Bulk stock operations `1:38296`,
Synchronization operations `1:37873`, Home seller inventory (simple mode, empty) `1:38706`.
Sidebar here lists COMMERCE as Listings, **Marketplace Hub**, Pricing, Promotions, Procurement (Marketplace Hub = channel management, see later parts).
Header differs from other pages: search "Search products, listings, SKUs...", **"7 Oct . Live inventory"** (as-of + live indicator), bell, **AI** button, business switcher.

## Control room layout
* Title "Inventory Control Room", sub "Master inventory is the source of truth across connected channels." Buttons **Sync all**, **Adjust stock** (primary), **Transfer stock**, **...** menu.
* **The stock pulse** ("Master stock . Units"): Available 8,462, Reserved 1,184, Incoming 2,640, Returned 184, Damaged 76, Quarantined 32, and a proportional stacked bar
  (returned / damaged / quarantined shown at actual proportion). Note "Available stock is ready to sell. Reserved stock is committed to orders."
  A second visual **"Where stock is moving"**: flow diagram Incoming (+428) -> Available (8,462) -> Reserved (1,184), with Returned, Damaged, Quarantined branches.
* **Stock Horizon** (coverage against replenishment lead time): rows Product/SKU, **Stock**, **Avg / day**, **Coverage** bar with days (7 days, 31 days, 0 days, 4 days)
  and a marker for lead time (10d lead), **Lead** (10d), **Health / Action** (Attention "Reorder attention required", Healthy "View product", Stockout "Review stock", Critical "Review replenishment").
* **Inventory signals** (counts with sparkline, each clickable): Low stock 12, Stockout risk 4, Inventory mismatches 7, Slow-moving 16, High velocity 9, Aging inventory 3, Warehouse imbalance 2.
* **Inventory intelligence (ADVISORY)** gradient card: "Reorder attention - 7 products may stock out before their expected replenishment lead time." rows
  (Black T-Shirt 42 units . 7 days coverage . 10 day lead time; Travel Duffel 28 units . 4 days . 8 day lead; Canvas Shoes 19 units . 3 days . 6 day lead); "Recommendations only. No automatic stock changes."; **Review recommendations**.
* **Inventory synchronization**: "Master Inventory 8,462 - Available units . Source of truth - One master, four connected channels"; per channel (Amazon, Flipkart, Meesho, Shopify): stock value,
  state (Healthy / Syncing / Attention Required), "Last sync: 2 min ago / 18 sec ago / Not reported", "7 SKUs affected"; "Last master inventory update: 12:42:18 PM".
  Incident card: "**Amazon inventory sync needs attention** - 7 products affected; Last failed 12:31 PM; REASON: Marketplace API returned inventory update rejection; AFFECTED: 7 SKUs / 14 variants;
  Review affected listings and retry synchronization"; buttons **View affected items**, **Retry sync**. Banner "Meesho inventory requires review - 7 SKUs affected . Review current channel availability [View affected items]".
  "Sync operational states" examples: Syncing 124 SKUs... [View progress], Inventory synced . 2 min ago [View sync history], 7 SKUs require review [Review SKUs], 3 products failed to sync [View failures].
* **Stock distribution** (by warehouse, advisory): Mumbai 51% 4,280 units, Delhi 28% 2,410, Bangalore 21% 1,772 (Pune appears in the ledger); insight "Mumbai currently holds 23% more inventory than demand patterns suggest. Advisory only."
* **Inventory ledger**: "Save view"; summary "All products . All warehouses . All channels . Any health", count "4 visible product examples"; search "Search SKU/product/barcode";
  filters **Warehouse, Channel, Inventory health, Stock range, Movement, Saved filters**; selection modes **Select products / Recommended / Custom / All matching** ("Selection extends beyond the visible rows");
  columns: select, Product (thumb + name, coloured left border by health), SKU, **Available, Reserved, Incoming, Coverage (7d/31d/0d/4d), Warehouse, Channel sync (Healthy / Failed / Attention), Health (Attention / Healthy / Critical / Stockout Risk), Last movement, More (...)**.
  Note "Channel sync reflects each product. Product-level issues can exist while a channel is healthy."
* Bulk bar (floating): "24 products selected" **Adjust stock, Transfer, Export, Sync, Add to saved group**, close.
* **Recent movements** (timeline, link "Inventory audit trail"): "12:42 Amazon order reduced master inventory 72 -> 68", "12:31 8 units received into Mumbai warehouse", "11:58 Manual stock adjustment Black T-Shirt +12",
  "11:20 4 returned units moved to Returned stock", "10:44 Inventory sync completed across 4 channels".

## Right-hand contextual panels
* **Product context** ("INVENTORY / PRODUCT CONTEXT", Black T-Shirt): product + SKU; **Stock snapshot** Available 42 / Reserved 8 / Incoming 100; **Inventory by location** (Mumbai 42, Delhi 0, Bangalore 0);
  **Channel availability** (Amazon 42, Flipkart 42, Meesho 40, Shopify 42 - the number pushed to each channel); **Health** (Attention: "Estimated coverage is 7 days while lead time is 10 days."); **Recent movements** (11:58 Manual stock adjustment Black T-Shirt +12);
  buttons **Adjust stock**, **Transfer**, links **View product**, **View sync history**.
* **Adjust stock panel**: Product (select), SKU, **Location** (select, e.g. Mumbai), **Adjustment type** chips **Damage / Return / Correction / Manual adjustment / Other**, **Quantity**, **Reason** (free text, e.g. "Damaged units"),
  Optional note; live **preview** (Current available 42, Adjustment -6, New available 36); "This action will be recorded in the inventory audit trail."; **Confirm adjustment** / Cancel.
* **Home seller inventory** (simple mode, no products): card "Home Inventory - All stock is managed from one location."; ledger header with empty state "Your inventory starts here - Import products or add your first product to begin tracking stock."
  [Import products] [+ Add product]; three tips (Add your products / Set your available stock / Track every movement). This confirms the **simple vs warehouse inventory mode** from onboarding (single location named by the seller).

## Backend needs (vs what exists)
| Need | Status |
|---|---|
| Stock pulse totals incl. Returned, Damaged, **Quarantined** (a separate bucket) | Buckets exist for available/reserved/incoming/damaged/returned; **quarantined is not modelled** |
| Stock Horizon (avg sales/day, coverage days, lead time per product, health, action) | Missing: needs sales velocity, **replenishment lead time per product/supplier** (procurement), coverage calc |
| Inventory signals (low stock, stockout risk, mismatches, slow-moving, high velocity, aging, warehouse imbalance) | Missing detectors except low stock; "mismatches" could use ledger drift + channel quantity diff |
| Inventory intelligence advisory + "Review recommendations" | `ai` reorder recommendations exist; need lead-time aware output |
| Channel sync status per channel (stock number sent, state, last sync, affected SKUs, failure reason) + Retry sync + affected items list + Sync all | Partly: channel inventory sync + sync jobs exist; need per-channel summary, per-SKU channel sync state, affected-items query |
| Stock distribution by warehouse + imbalance insight | Per-warehouse stock exists; insight missing |
| Inventory ledger list with product thumbnail, warehouse, channel sync, health, last movement, filters (warehouse, channel, health, stock range, movement type), saved views, select-all-matching | `GET /inventory` + movements exist; missing health/coverage columns, channel filter, saved views, select-all-matching bulk targeting |
| Bulk ops on selection: adjust, transfer, export, sync, add to saved group | Single ops exist; no bulk-by-filter, no saved groups |
| Adjust stock with type (Damage / Return / Correction / Manual / Other), reason, note, preview | `/inventory/adjust`, `/damage`, `/returns` exist; need a unified request with adjustment type + note and a dry-run preview |
| Recent movements feed with human text | `/inventory/movements` exists; text/formatting is frontend, but "reference" labels (Amazon order, received into warehouse) must be available |
| Simple mode "Home Inventory" single location | Done in onboarding (`HOME` default warehouse); the ledger must work without a warehouse column in this mode |
