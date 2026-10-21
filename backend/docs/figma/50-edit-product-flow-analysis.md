# Edit product flow: study and gap analysis (no code written)

Source: Figma "omni-chanel (Copy)", heading **Edit product flow** (Frame 5), 7 frames of "Screen 13". Read from full-resolution renders on 2026-10-16.
Frames: `1:18911` Name modified, `1:18638` Unchanged / Saved, `1:18336` AI rewrite preview (not applied), `1:18021` Additional attributes expanded, `1:17733` Changes saved, `1:17428` Category change confirmation, `1:17133` Unsaved navigation protection.
All seven are the **Overview** tab of one editing page in different states; the other tabs in the left menu (Media, Details, Variants, Inventory, Listings, Content, Activity) are listed but not designed here (they map to the product-detail tabs that already exist as read views).

## 1. What the page is
Editing an existing, **active** master product ("Premium Travel Bag", Master product TRV-1042, status badge Active). Its defining idea: **every edit shows its impact on connected listings before and after saving** ("Changes made here update the master product and may affect connected listings").
Layout: page title "Edit product" + live state label (**Unsaved changes** / **Saved**), header buttons **Discard** and **Save changes** (disabled when nothing changed), sticky footer repeating the state ("Unsaved changes" / "All changes saved") and the same two buttons.
Left column: section nav "Product": **Overview** (current), Media, Details, Variants, Inventory, Listings, Content, Activity; below it meta: **Product ID** TRV-1042 (= master code), **Created** Jan 18, 2026, **Last updated** Today, 2:16 PM.
Centre: **Product information**; right rail: **Change impact**, **Product readiness**, **Suggested improvement**.

## 2. The seven screens
### 1) Name modified (`1:18911`)
* Fields: primary image block (large image + 2 thumbnails + "Manage media"), **Product name** (edited to "Urban Carry Premium Travel Bag"; shows **Modified** and **Revert** links and "Previously: Premium Travel Bag"), **Product type** (select, Physical product), **Master SKU** (locked: lock icon, grey field, "Used as the primary internal product identifier."), **Category** (select), **Brand** (select), **Description** (rich text: Bold, Italic, Bullets, Link; counter "186 / 2,000 characters"; link **Improve with AI**), **Additional attributes +** ("6 attributes configured"), and the block "Master product - Inherited by connected listings - Amazon . Flipkart . Meesho . Shopify - Changes to core product information may be reflected across connected listings. Marketplace-specific content remains independently manageable." with **View affected listings**.
* Header: "Unsaved changes", Discard, Save changes (enabled). Footer "Unsaved changes".
* **Change impact** panel (live): "**Product name changed**; Potential impact . 3 connected listings"; rows **Amazon - Name inherited**, **Flipkart - Name inherited**, **Meesho - Name inherited**; text "**Shopify content is independently managed.** Updates are not sent to listings until you save."; link **Review affected listings**.
* **Product readiness** "92% complete": Core information (ok), Product media (ok), Required attributes (ok), Marketplace content (open circle) - "1 marketplace listing needs content review." **Review ->**.
* **Suggested improvement**: "Your product description is shorter than the average for this category. Adding key product benefits may improve listing completeness." **Review suggestion** / **Dismiss**.

### 2) Unchanged / Saved (`1:18638`)
Header label "**Saved**", Discard and Save changes both **disabled**, footer "All changes saved". Change impact: "**No changes yet** - Edit a field to see what may be affected." Product name shows the original value, no Modified/Revert. Everything else as above.

### 3) AI rewrite preview (`1:18336`)
Under the description: panel **Improve with AI** with the flow "**Recommend -> Explain -> Approve**"; two options: **Rewrite for clarity** (selected) and **Make more concise**; a line "**Alternative:** A durable premium travel bag for short business trips and weekends." (the result of the other option); a grey **Preview . Not applied** card with the suggestion "A durable, premium travel bag for short business trips and weekend travel.", the explanation "**Simplifies the sentence using only your existing description. No new features or product claims have been added. Your original remains unchanged above.**", buttons **Apply suggestion** / **Dismiss**. The description editor still holds the original until applied; applying changes the editor (then the page shows Unsaved changes).

### 4) Additional attributes expanded (`1:18021`)
"Additional attributes -" opens six fields in a grid: **Material, Dimensions, Weight, Country of origin, HSN code, Tax information**, each showing "**Not supplied**"; note "**Attribute values were not supplied in the existing product record. Confirm factual and tax details before distributing them.**" Header counter still says "6 attributes configured" (mock inconsistency: nothing is supplied).

### 5) Changes saved (`1:17733`)
After saving: header "Saved", buttons disabled, footer "All changes saved". **Change impact** shows "**No pending changes**" and a card "**Changes saved** - 3 listings will sync shortly."; per channel **Amazon / Flipkart / Meesho - Sync pending**; "Shopify content is independently managed. **Saved to the master product. Listings have not synced yet.**" **View listings ->**. Product name now "Urban Carry Premium Travel Bag".

### 6) Category change confirmation (`1:17428`)
Category changed to "Luggage & Travel Bags" (field shows Modified / Revert). Change impact: "**Category changed** . Potential impact . 3 connected listings; Amazon / Flipkart / Meesho - **May need remapping**". Modal: "**This change may affect connected listings.** 3 marketplace listings may need to be remapped. Travel Accessories -> Luggage & Travel Bags; Amazon / Flipkart / Meesho - Category mapping review." Buttons **Review impact**, **Cancel**, **Save and continue**. Appears when the seller presses Save with a category change.

### 7) Unsaved navigation protection (`1:17133`)
Leaving with edits: modal "**You have unsaved changes** - Your latest edits will be lost if you leave now." **Keep editing / Discard changes / Save changes**. (Pure client behaviour; Save changes goes through the same save, including the category modal when it applies.)

## 3. Behaviour the flow implies
1. **Local edit session**: the page keeps a baseline (last saved values) and per-field dirty state (Modified / Revert / "Previously: ..."). Nothing is written until Save changes; there is no server-side draft of edits.
2. **Change impact is computed before saving** from the proposed changes (no write): which connected listings inherit each changed field, which channels manage that content independently, and what the change will cause (name inherited; category -> mapping review).
3. **Some changes need confirmation**: a category change shows the modal (listing remapping). Name/description changes do not.
4. **Master SKU is locked** on an active product.
5. **After saving, listings sync**: affected listings are marked "sync pending" and updated shortly; the panel then says "Listings have not synced yet" until they do. Independently managed channels (Shopify in the mock) are not touched.
6. **Readiness here is a different checklist** from the creation flow (Core information, Product media, Required attributes, Marketplace content) and shares its numbers with the detail screens (92%).
7. **Suggested improvements** are insights with Review / Dismiss (dismissal remembered).
8. **AI = recommend, explain, approve** with preview, "Apply" only edits the editor (the seller still presses Save changes); two modes on existing text: rewrite for clarity and make more concise, plus an alternative preview.
9. Optimistic concurrency is implied by "Last updated" (another user may save first).

## 4. Coverage today (after the creation-flow build)
| Need on the page | Exists today | Gap |
|---|---|---|
| Load the editor (fields, media thumbnails, meta Created / Last updated, status, channels inheriting) | `GET /products/{id}`, `/products/{id}/overview`, `/documents`, `/products/{id}/listings` (data exists, spread over 4 calls) | **One edit-oriented read** with lock flags, baseline `version`, nav counts, "attributes configured" count |
| Save edits | `PATCH /products/{id}` with `version` (409 on conflict), field rules from the creation work (description html, dimensions, weight, HSN, GST, custom attributes) | PATCH lets the **master code change**; no impact result; no category-change confirmation; no per-field error list in a single response; no post-save listing sync |
| Master SKU locked | none | rule `code_locked` when the product is not a draft (and a `productCodeLocked` flag) |
| **Change impact** (before save) | nothing | **NEW**: per-field, per-channel impact, confirmation requirement, independent channels |
| **Post-save sync state** ("3 listings will sync shortly", per-channel Sync pending) | `product.updated` event is emitted, but **no listings consumer reacts to product content changes** (only stock, price, account events). Listings store `approvedHash` / `syncHash`, the connector interface has `updateListing` and a `listings.update` capability | **NEW**: content propagation (detect stale listing content, mark pending, enqueue update job where the connector supports it, otherwise flag "needs republish"), per-listing content-sync state API |
| Category change -> mapping review | `category_mappings` (our category -> marketplace category) and `GET /marketplace-accounts/{id}/categories...` exist | **NEW**: on category change compute per listing: mapped (can auto-remap) vs needs review; mark listing `needs review`; expose review list |
| Channels managed independently | `product_marketplace_data` (marketplace-specific content overrides) exists | **NEW**: expose which fields each channel overrides, to say "Name inherited" vs "independently managed" |
| Edit readiness panel (Core info / Media / Required attributes / Marketplace content, 92%) | content readiness % and per-field states in `GET /products/{id}/content`, listing attention counts in `/listings` | **EXTEND**: group into the four items with state, counts and a Review link |
| Suggested improvement + Dismiss | none | **NEW**: insights (description shorter than category average ...), dismissal storage |
| AI Rewrite for clarity | `POST /products/{id}/ai/description` mode `rewrite` works on text, returns note | note wording; **explanation** field ("Simplifies ... No new features"); **Alternative** (second mode) in one call |
| AI "Make more concise" **on existing text** | mode `concise` exists but **ignores the text** (it builds a sentence from name + category: that is the creation-screen behaviour) | **CHANGE**: when source text exists, `concise` condenses it (never adds facts); keep "create from name + category" only when there is no text |
| AI "Apply" only edits the editor | `apply` **persists immediately** (writes description) | **EXTEND**: `persist: false` (accept into the editor, record the decision, no product write) |
| Media: thumbnails, manage media | documents endpoints | none for this page |
| View affected listings | `GET /products/{id}/listings` | filter / flag "impacted" |
| Activity of edits | audit + activity feed (`product.updated` with before/after) | none |
| Unsaved navigation / Discard / Revert | client | none |

## 5. Proposed API (draft, for approval)
1. `GET /products/{id}/edit` -> `{ product (editor DTO), version, locks: { productCode: { locked, reason } }, meta: { productId, createdAt, updatedAt, status }, nav: [{ key, label, count? }], attributes: { configured, fields: [{ key, supplied }] , note }, media: { primary, thumbnails[3], total }, inheritance: { channels: [{ code, name, listingId?, independent: [fields] }] }, readiness: { percent, items: [{ key: core_information|product_media|required_attributes|marketplace_content, state, detail, action }] }, insights: [{ key, message, detail, actions }] }`.
2. `POST /products/{id}/change-impact { changes: { title?, categoryId?, brand?, description?, productType?, material?, dimensions?, weight?, ... } }` -> `{ hasChanges, items: [{ field, label, message }], listings: { potential: 3 }, channels: [{ code, name, effect: name_inherited|description_inherited|brand_inherited|attribute_inherited|may_need_remapping|independent|not_listed, listingId }], independentNote, requiresConfirmation, confirmation?: { title, message, mapping: { from, to }, channels: [{ code, action: 'category_mapping_review' }] } }`. No writes.
3. `POST /products/{id}/edit/save { version, changes, confirm?: boolean }` -> applies the same validation as PATCH (strict field rules; **master code locked** for non-drafts), returns `{ saved: true, savedAt, product, version, impact: { listingsQueued, channels: [{ code, state: sync_pending|needs_review|independent|unchanged, listingId }] }, readiness }`; when `requiresConfirmation` and `confirm` is false -> 409 `confirmation_required` with the impact (so "Save and continue" = same call with `confirm: true`). Atomic: product write + listing marking + outbox event in one transaction.
4. **Listings propagation** (listings module): consumer of `product.updated` / `product.edited`: recompute the content hash per live listing of the product, mark stale ones (`content_state = sync_pending`), enqueue one coalesced update job per account when the connector supports `listings.update` (else `needs_republish` + issue in the Needs-attention queue), and on category change set `mapping_review` per listing; `GET /products/{id}/listings` and `/listings` expose `contentState`.
5. `GET /products/{id}/insights`, `POST /products/{id}/insights/{key}/dismiss` (and restore). First insight: **description shorter than category average** (compare with the business's active products of the same category using the plain-text length; needs >= 5 samples, otherwise a fixed floor of 150 characters; never shown when the description is >= the benchmark).
6. AI changes: `concise` condenses existing text (shorter or `unchanged`), responses carry `explanation`, `alternative` (optional second suggestion in the same call via `modes: ['rewrite','concise']`), `apply { persist: false }`.
7. Rule: `productCode` immutable once `status != draft` (409 `code_locked`), flag in the DTOs.
8. Tests: replay the seven screens against the real API with the design's numbers and wording (like the creation walkthrough).

## 6. Decisions I will take (industry practice) unless you change them
| # | Question | Decision |
|---|---|---|
| E1 | Lock the master code? | Yes once the product is not a draft (Amazon and Flipkart do not let you change a SKU after listing). Existing code that changes a code on active products must keep working only for drafts. |
| E2 | Does a category change need confirmation? | Yes (it can invalidate marketplace categories). Name, description, brand and attribute changes do not. Product type change also needs confirmation (it changes how the product is fulfilled). |
| E3 | What does "sync shortly" do? | Inherited content is pushed automatically for live listings **when the connector supports listing updates**; otherwise the listing is flagged "needs republish" and appears in Needs attention. Marketplace-specific overrides are never overwritten. |
| E4 | Which channels are "independent"? | A channel that has a marketplace-specific override for the changed field in `product_marketplace_data`. |
| E5 | Category change remapping | Automatic when a mapping for the new category already exists for that marketplace; otherwise the listing goes to "category mapping review" and stays live with its old marketplace category until reviewed. |
| E6 | Benchmark for "shorter than average" | The business's own active products of the same category (>= 5 samples, median of plain-text length), else a 150-character floor. |
| E7 | AI "Apply" | Edits the editor only (`persist: false`); the seller's Save changes writes it. The existing persisting apply stays for non-editor callers. |
| E8 | Core attributes confirmation ("Confirm factual and tax details before distributing them") | Material, dimensions, weight, country, HSN and tax stay editable facts; listings only send facts that are supplied; **no separate confirmation flag for core fields** (custom attributes keep `confirmed`). |
| E9 | "6 attributes configured" counter | Real count of supplied slots among the six plus confirmed custom attributes (the design number is mock). |
| E10 | Other tabs (Media, Details, Variants, Inventory, Listings, Content, Activity) | Reuse the existing detail endpoints; no new work until they are designed as edit screens. |

## 7. Open points that need your word
1. E3: auto-sync on edit may overwrite marketplace content a seller edited directly on the marketplace; confirm that master content wins for inherited fields.
2. Which marketplaces really support listing updates in our connectors (the capability exists; sandbox connectors implement it; real ones are unverified).
3. Design mock inconsistencies I will not copy: "6 attributes configured" with nothing supplied; "92%" (we compute honestly and the walkthrough test will use our own computed value for the demo data).
4. The tabs Media / Details / Variants / Inventory / Listings / Content / Activity inside the editor have no edit designs.
