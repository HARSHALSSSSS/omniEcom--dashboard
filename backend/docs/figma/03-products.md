# Figma study: Dashboard section, Part 3 - Products (Screen 10, 11 and 14)

Frames: Screen 10 Products: Master catalog `1:22523`, New merchant and loading `1:23599`, Filters / no matches / saved view / sort `1:23346`,
Search results `1:23113`, Bulk selection and edit `1:22815`; menus `1:22796` (Import), `1:22804` (row menu), `1:22514` (More menu).
Screen 11 Product details: Overview `1:22108`, Variants `1:21854`, Inventory `1:21589`, Listings `1:21353`, Content `1:21060`, Activity `1:20834`,
Incomplete and unpublished `1:20489`. Screen 14 Variants & SKU Management `1:28127`.

Core idea repeated everywhere: **Master Product -> Variants (SKUs) -> Channel Listings**. The master product is the single source of truth; each
channel listing inherits core info but may carry marketplace-specific content.

## Screen 10 - Products list ("Catalog")
* Header: eyebrow CATALOG, title "Products", "Manage your master catalog, variants and product information from one place.";
  buttons **Import** (menu "IMPORT PRODUCTS": Marketplace catalog import / CSV / Excel import / Other connected source) and **+ Create product**.
* Counters strip: **427 Products, 1,286 Variants, 1,042 Active, 18 Draft, 7 Need attention**.
* Tabs with counts: **All products 427 / Active / Draft 18 / Archived / Needs attention 7**.
* Search "Search by product name, SKU, barcode..." (Cmd+K; "Clear search"; result line `1 matching product for "TRV-1042"`).
* Filters: **Category, Status, Channel, Inventory (Any / Healthy / Low stock / Out of stock / "Advanced inventory filters"), Product type, More filters**;
  active filters shown as removable chips + "Clear filters"; **Saved views** and **Sort** (Last updated, Product name, Inventory, SKU; direction arrow).
  "Save current view" dialog: view name, summary of filters + sort, "Available in this workspace", Cancel / Save view.
* Two layouts: **table** (columns Product with thumbnail, SKU, Variants, Channels e.g. "Amazon . Shopify +1", Inventory "124 / Healthy", Status badge, Updated "2h ago")
  and **cards** (name, "SKU . N variants", status badge Active / Low stock / Out of stock / Draft, thumbnail, big number: available units (or "68% Publish readiness"),
  channel names, one hint line ("1 listing needs attention", "Stock coverage: 2 days", "Potential lost sales", "Images and description missing"), one primary
  action button: Open product / Review inventory / Update inventory / Continue editing).
* Pagination: Previous / page / Next, page size selector (4 / page, 50 / page); "Showing 1-4 of 4 products".
* Bulk selection bar "4 products selected": **Edit, Publish, Inventory, Export, Archive**, close. Row menu: Archive, Export, View listings, View inventory, View activity.
  "More" menu on detail: Duplicate, Archive, Export, View activity.
* Empty (new merchant): "Your catalog starts here. Create your first master product or import an existing catalog from a connected sales channel." [Create product] [Import products];
  Loading: skeleton table "Loading catalog / Checking for product updates"; No match: "No products match these filters." [Clear filters].

## Screen 11 - Product details (6 tabs, shared header)
Header: breadcrumb "Products / Premium Travel Bag", thumbnail, category label (TRAVEL ACCESSORIES), title, "SKU family: TRV-1042", status badge (Active / Draft),
category, "4 variants . 3 sales channels . Last updated 2 hours ago"; buttons **Edit product**, **More**, link **Manage listings** (or **Publish product** when draft).
Health strip: **Product health** (Ready / Incomplete) + sentence; **Inventory** "124 units / Healthy"; **Variants** "4 / Sellable SKUs"; **Channels** "3 connected / 2 Active . 1 Attention".
Attention banner: "Needs attention - Meesho listing requires review. [Review]". Tabs: **Overview, Variants, Inventory, Listings, Content, Activity**.

* **Overview**: Product information (name, product type "Physical product", category, master SKU, brand, description; "Edit information"); Product media (6 images, primary image,
  "Manage media"); Variants table (Variant, SKU, Size, Color, Inventory, Status; "View all variants"); Inventory block (Available 124, Reserved 18, Incoming 40, Low-stock variants 1,
  per-warehouse line "Main Warehouse 124 available", "View inventory"); Sales channels table (Channel, Listing status, Last sync, Action View listing / Review);
  Content readiness (92% complete; Title / Description / Images / Attributes Complete, Marketplace content "1 channel needs review"; "Improve content"); Recent activity (4 events). Right rail:
  **Product status** (Catalog Ready, Inventory Healthy, Listings "2 Active . 1 Attention", Content "92% complete", Sync "Last synced 18 min ago", "View product activity"),
  **Quick actions** (Edit product, Manage variants, Update inventory, Manage listings, Export product), note on master vs variants vs listings.
* **Variants**: "Variants / SKUs - 4 variants linked to this master product." table (Variant, SKU, Size, Color, Inventory, Status); explanatory note; low-stock callout
  ("1 low-stock variant: Navy / Large . TRV-1042-N-L . 16 available [View inventory]"); "Inventory across variants - 4 variants . 124 units available"; right rail **Variant structure**
  (Master SKU, Sizes "Cabin . Large", Colors "Black . Navy", Variants 4).
* **Inventory**: Product inventory (Available / Reserved / Incoming / Low-stock variants; "Update inventory"); **Stock by variant** (Variant, SKU, Available, Status Healthy / Low stock, Total available);
  **Warehouse** table (Location, Available; "View inventory"); low-stock callout; right rail **Inventory health** (Aggregate Healthy, Available 124 units, Low-stock variants 1 + sentence).
* **Listings**: **Channel listings** table (Channel, Listing status Active / Needs attention, Last sync, Action); failure callout ("Meesho listing synchronization failed - Needs attention . Last sync 1 hr ago. [Review]");
  "Publication model: Master Product -> Channel Listing -> Marketplace"; right rail **Listing status** (Connected channels 3, Active listings 2, Needs attention 1, Last synced 18 min ago, "Manage listings").
* **Content**: Product information, Product media, **Master attributes** table (Attribute, Master value, Readiness), **Marketplace content** ("Channel-specific content is separate from your master information" +
  per-channel review callout, "Improve content"); right rail **Content readiness** ("92% complete" bar, per-field Complete list).
* **Activity**: "Recent changes for this master product and its connected representations." sub-tabs **All activity / Master product / Variants / Channels**; timeline rows (icon, "2h ago", text, scope tag):
  "Inventory updated from Amazon" (Inventory), "Product content edited" (Content), "Meesho listing synchronization failed" (Listings), "Variant added" (Variants); callout for the outstanding issue; right rail **Activity scope**.
* **Incomplete / unpublished (alternate state)**: status Draft, "0 sales channels", health **Incomplete** ("Add missing attributes to improve listing readiness."), "0 connected / Not published yet";
  banner "Product information incomplete - [Complete product]"; Product status (Catalog Incomplete, Listings Not published, Content "Attributes missing", Sync Not synced); Sales channels "Not published yet ... [Publish product]".

## Screen 14 - Variants & SKU Management
Breadcrumb Products / Premium Travel Bag / Variants. Buttons **+ Add variant**, **Import variants**, **More**. Product summary bar (thumbnail, name, SKU family, chips "4 variants", "3 channels", "124 available", "1 low stock", **View product**).
Tabs: **All variants 4 / Active 4 / Low stock 1 / Out of stock / Draft / Archived**. Search "Search by variant, SKU, barcode...", **Bulk actions**, filters **Color, Size, Channel, Inventory**.
Table: select, Variant (thumbnail placeholder, name "Black / Cabin", "Color: Black . Size: Cabin"), SKU, Inventory (number), Channels ("Amazon . Shopify . Meesho"), Status (In stock / Low stock), Lifecycle (Active), Actions (Edit dropdown).
Pagination "Showing 1-4 of 4 variants".

## Backend needs (vs what exists)
| Need | Status |
|---|---|
| Product list with counters, tabs, search (name/SKU/barcode), filters (category, status, channel, inventory band, product type, more), sort, saved views, page size | Mostly exists (`GET /products` with filters + keyset paging). Missing: counters endpoint (products/variants/active/draft/needs-attention), inventory-band + channel filters, **saved views**, per-row summary (available units, channels list, health, "next action", publish readiness %) |
| Product detail summary (health, inventory totals reserved/incoming/low-stock variants, per-warehouse, channels with listing status and last sync, content readiness %, activity) | Partly: `/products/{id}`, `/readiness`, `/inventory/variants/{id}`, listings, audit exist; need one aggregate "product overview" + **activity feed** per product (audit + sync + inventory movements merged, filtered by scope master/variants/channels) |
| Product media (6 images, primary, manage) | `documents` module covers images; needs ordering/primary flag verified |
| Variant management screen (counts per lifecycle tab, filters color/size/channel/inventory, bulk actions, import variants, edit) | Variants CRUD + bulk exist; missing filters by option values / channel / inventory band and the per-tab counts |
| Bulk actions on products: edit, publish, inventory, export, archive; duplicate | Bulk ops exist for create/status/delete; **duplicate** and bulk publish missing |
| Import menu (marketplace catalog, CSV/Excel, other source) | CSV + marketplace import exist; Excel not supported (CSV only) |
