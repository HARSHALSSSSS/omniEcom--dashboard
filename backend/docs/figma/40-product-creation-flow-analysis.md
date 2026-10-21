# Product creation flow: study and gap analysis (no code written)

Source: Figma "omni-chanel (Copy)", heading **Product creation flow** (Frame 4), 6 screens of "Screen 12". Read from full-resolution renders on 2026-10-16.
Frames: `1:20263` Create product (main), `1:20048` More product information, `1:19826` AI suggestion preview, `1:19619` Primary image uploading, `1:19413` Unsaved SKU validation, `1:19198` Leave confirmation.
Related but separate flows in the file (not part of this study): Edit product (Screen 13, 7 frames), Bulk import (Screens 15-17), Variants management (Screen 14, already built on the dashboard side).

## 1. What this flow is
A **one-page wizard step called "Basic information"** for creating a *master product* ("Build a master product that can be distributed across your connected sales channels"). It is the first step of a longer chain shown in the side panel:
**Product -> Variants -> Inventory -> Listings -> Channels.** Only step 1 is designed in these 6 screens; the footer says "Continue checks this step only" and the SKU error says "Continue validates only Basic information, not the remaining setup steps". So the other steps (variants, inventory, listings, channels) exist as product screens elsewhere (Variants, Inventory, Listings) but there is **no designed wizard for them** in this flow.

Shell: same app shell as the dashboard (breadcrumb "Products / Create product", search, business switcher). Page header: title "Create product", sub "Build a master product ...", buttons **Save draft** and **Cancel** (an "Unsaved changes" label appears next to Save draft when dirty). Footer bar: **Save as draft** + "Last saved just now" (left), "Continue checks this step only", **Back**, **Continue ->** (right). In the dirty/error state the left footer shows **Discard changes** and **Save draft**.

## 2. The six screens
### Screen 1 - Create product (default)
Two columns. Left "Basic information" ("Start with the information shared across your sales channels."):
* **Image block**: dashed box "Add product image" with **Upload** and **Generate placeholder**.
* **Add your product**: **Product name** (text, prefilled "Premium Travel Bag", hint "Use a clear, customer-facing product name."), **Product type** (select, "Physical product"), **Category** (select, "Travel Accessories"), **Brand** (select, "Urban Carry"), **Master SKU** (text, "TRV-1042", hint "Used internally to identify this master product.").
* **Description**: rich-text editor with toolbar **Bold, Italic, Bullets, Link**, placeholder "Describe what makes this product useful, who it is for and what customers should know.", counter "0 / 2,000 characters", and an **Improve with AI** link (sparkle icon).
* Link **Add more product information +** ("Optional details can be added later. You can always save a draft.").
Right rail **Product readiness**: "38% complete" progress bar; **Required** list: Product name, Category, Product type (done), Primary image (pending), Master SKU (tag "Verify"); **Recommended**: Description, Brand (tag "Confirm"), Attributes. Footnote "SKU and brand are entered; circles indicate pending verification or confirmation, not missing values." Block **"1 issue blocking publication"** ("Add a primary image before publishing this product to marketplaces.") with **Fix issue** button. Block **Where this information goes**: Master Product -> Amazon . Flipkart . Meesho . Shopify, "Core product information can be inherited by connected listings. Marketplace-specific content can be customized later.", chain "Product -> Variants -> Inventory -> Listings -> Channels".

### Screen 2 - More product information (expanded)
Subtitle shows "Premium Travel Bag . TRV-1042" and "Identity and description above . Lower editor view". Section **Add more product information -** ("Optional information improves listing quality. Leave any field blank and save a draft.") with:
**Product category** (select, placeholder text reads "Select material" - looks like a design copy error), **Material** (select), **Country of origin** (select "Select country"), **Dimensions** ("Length x Width x Height . cm", hint "Use the product's dimensions, not its shipping package."), **Weight** ("Enter weight . kg"), **GST / tax information** (select "Select tax rate"), **HSN code** (text), and **Custom attributes** ("Add a product-specific attribute to the master record. Confirm factual details before distributing them to listings."): **Attribute name** ("e.g. Collection") + **Attribute value** + **+ Add attribute** (repeatable). Readiness stays 38%.

### Screen 3 - AI suggestion preview
Description focus. Under the editor, **Improve with AI** panel with the line "AI recommends -> Merchant approves": three radio options **Rewrite for clarity**, **Create a concise product description** (selected), **Highlight key benefits**. A grey **Preview . Not applied** card shows the suggested text ("Explore the Premium Travel Bag in our Travel Accessories collection. Review the product details to find out whether it suits your travel needs.") with the grounding note "Based on the product name and category only. Add verified features before highlighting specific benefits." and buttons **Apply suggestion** / **Dismiss**. Nothing is written until applied.

### Screen 4 - Primary image uploading
Large image area with local preview ("Local preview . Upload in progress"), file row `premium-travel-bag.jpg` **64%** with progress bar, "1.5 MB of 2.4 MB . Uploading primary image", **Cancel upload**, note "The image will become your primary image after uploading. Product readiness will update when the file is available." Below: **Primary image** section ("Use a clear product image. This becomes the default image inherited by connected listings.") with **Upload** and **Generate placeholder**, and "Saved . Basic information". Readiness is **50%**; "Primary image" shows tag "Uploading"; SKU and Brand show ticks; blocking text "Primary image is uploading. Publication stays blocked until the upload completes."

### Screen 5 - Unsaved SKU validation (error state)
Top banner "**Check your Master SKU to continue** - Your draft can still be saved. Continue validates only Basic information, not the remaining setup steps." Master SKU field has an error ring/icon and text "**Master SKU already exists** - Use a unique SKU to continue." Readiness: Master SKU tag **Duplicate**, "Resolve the duplicate SKU to continue.", **2 issues blocking publication** (image + SKU). Header shows "Unsaved changes", footer **Discard changes** / **Save draft**; note "Description and optional information below . No changes have been discarded."

### Screen 6 - Leave confirmation
Modal over screen 5: "**Save changes before leaving?** You have unsaved changes to Premium Travel Bag. Save a draft to keep your work, or discard the changes and leave. Draft saving is available even when this step needs a correction. Nothing is published." Buttons **Stay**, **Discard changes**, **Save draft**.

## 3. Behaviour rules the flow implies
1. **Drafts are first-class**: Save draft works even with errors (e.g. duplicate SKU); "Last saved just now" implies a saved timestamp (autosave or explicit). Nothing is published from here ("Nothing is published").
2. **Continue validates only the current step** (Basic information) and blocks on: required fields, duplicate Master SKU. Drafts bypass validation.
3. **Master SKU is a family/master code** unique per business (maps to the existing `productCode`, not a variant SKU).
4. **Readiness is a checklist, not only a percentage**: Required (name, category, type, primary image, master SKU) and Recommended (description, brand, attributes); each item has a state (done, pending, with tags Verify / Confirm / Duplicate / Uploading); a "blocking publication" list with a **Fix issue** shortcut; and "where this information goes" (the connected channels that inherit it).
5. **AI is advisory**: three transformations, preview before apply, grounded only on name and category unless the seller adds verified facts, explicit Apply / Dismiss.
6. **Image upload**: local preview, progress, cancel; the first uploaded image becomes the primary; placeholder generation is an alternative.
7. **Units**: dimensions in cm, weight in kg (UI) while the API stores mm / grams (conversion needed). Dimensions mean the product itself, not the shipping package.
8. Rich text: bold, italic, bullet list, link; 2,000-character limit.

## 4. Field inventory (UI -> API today)
| UI field | Required for Continue? | Backend today | Status |
|---|---|---|---|
| Product name | yes | `products.title` (3-200 chars) | EXISTS |
| Product type | yes | `productType` physical/digital/service (stored in `attributes` jsonb, accepted on POST/PATCH) | EXISTS (storage is a workaround) |
| Category | yes | `categoryId` + `/categories`, `/categories/tree` | EXISTS |
| Brand (select) | recommended | `brand` free text; **no brand list** | EXTEND (needs a brand source or free-text combobox) |
| Master SKU | yes | `productCode` unique per business, pattern `[A-Za-z0-9._-/]`, max 64 | EXISTS, but **no live duplicate check**, no "next free code" |
| Description (rich text, 2,000) | recommended | `description` text, max 10,000, plain text | EXTEND (format, sanitising, 2,000 rule) |
| Primary image | yes (to publish) | `/products/{id}/documents` (presigned or API upload), `PATCH /documents/{id}` (isPrimary), `DELETE` for cancel | EXISTS; first-image-is-primary needs checking; **placeholder generation missing** |
| Product category (second select) | no | none | UNCLEAR (probably a design copy error: it repeats "Material") |
| Material | no | none (could be a custom attribute) | NEW or attribute |
| Country of origin | no | `countryOfOrigin` | EXISTS (country list is static) |
| Dimensions (cm) | no | only per variant `dimensionsMm` | NEW at product level (or use variant default) |
| Weight (kg) | no | only per variant `weightGrams` | NEW at product level |
| GST rate | no | `gstRateBps` | EXISTS (needs a slab list: 0/5/12/18/28 %) |
| HSN code | no | `hsnCode` | EXISTS (format validation unknown) |
| Custom attributes (name/value, repeatable) | no | attribute **definitions** must exist first (`/attributes`), values by `attributeId` | EXTEND: free-form name/value per product |
| Improve with AI | no | AI module has ask/summary/recommendations only | NEW |
| Save draft / autosave / last saved | - | `status: draft`, `PATCH` with `version`, `updatedAt` | EXISTS (needs a draft-friendly create) |

## 5. API gap analysis
**Already works for this flow**
* Create/update/delete product (`POST /products`, `PATCH /products/{id}` with optimistic locking, `DELETE`), draft status, categories, document upload (pending -> uploaded, cancel by delete, set primary), country/HSN/GST fields, attribute definitions, product readiness for **marketplace listing** (`GET /products/{id}/readiness`), product overview/readiness % for the dashboard (built in the dashboard work).

**Missing or needs change**
| # | Need | Why | Proposed API |
|---|---|---|---|
| 1 | Draft-friendly create | `POST /products` needs a code and a title of 3+ characters; the design saves a draft with partial data | allow `status: draft` with only a title (auto code `DRAFT-xxxx` until the seller sets one), or a dedicated `POST /products/drafts` |
| 2 | **Live SKU check** | "Master SKU already exists" before Continue | `GET /products/sku-check?code=TRV-1042&excludeId=` -> `{ available, existing: { id, title }, suggestion }`; duplicate on save returns 409 with `details.field='productCode'` and `existingProductId` |
| 3 | **Creation readiness checklist** | required/recommended items with states, percent, "issues blocking publication" with fix targets, "where this goes" (connected channels) | `GET /products/{id}/creation-readiness` -> `{ percent, required: [{ key, state: done\|pending\|verify\|confirm\|duplicate\|uploading, tag? }], recommended: [...], blockers: [{ key, message, fixTarget }], channels: [...] }`; the existing `/readiness` is per marketplace and must stay |
| 4 | Step validation | "Continue checks this step only" | `POST /products/{id}/validate-step` `{ step: 'basic' }` -> field errors list (required, duplicate SKU, description length), no writes |
| 5 | **Improve with AI** | 3 modes, preview, apply, dismiss | `POST /products/{id}/ai/description` `{ mode: rewrite\|concise\|benefits, text? }` -> `{ suggestionId, text, basis: ['name','category'], notApplied: true }`; `POST .../ai/description/{id}/apply` and `/dismiss` (audited); deterministic template when no model is configured; never invents features; uses `ai.enabled` flag and AI settings |
| 6 | Rich description | toolbar + 2,000 limit | store a restricted format (sanitised HTML subset: `b, i, ul/li, a`) or Markdown; validate length of the **text**, sanitise links (http/https only); decision needed |
| 7 | Placeholder image | "Generate placeholder" | `POST /products/{id}/documents/placeholder` -> creates a generated image (initials of the name/code on a neutral background) flagged `isPlaceholder`; readiness should show it as image present but **not publishable** (open question) |
| 8 | Brand source | Brand is a select | `GET /brands` (distinct brands of the business + create) or keep free text with suggestions |
| 9 | Product-level physical data | dimensions (cm), weight (kg), material | accept `dimensionsMm`, `weightGrams`, `material` on the product (API units mm/g; UI converts) and use them as the default for new variants |
| 10 | Free-form custom attributes | name/value pairs | `customAttributes: [{ name, value }]` on the product (stored in `attributes` jsonb), with rules: max 20, name 1-60 chars, value 1-250, flagged "unconfirmed" until the seller confirms facts before listing; optional promotion to a real attribute definition |
| 11 | First image becomes primary + upload hardening | "The image will become your primary image after uploading" | verify/ensure first confirmed image is primary; validate image min size/aspect; checksum; reject non-images for `product_image` (already by MIME) |
| 12 | Draft recovery | leave confirmation, Discard changes | server side is simple (PATCH / DELETE draft); add `GET /products/drafts` (my unfinished drafts, last saved) for resuming |
| 13 | Next steps of the chain | Variants -> Inventory -> Listings -> Channels | endpoints exist separately (variants, inventory receive, listings, channels); a **wizard state** (`creation_step`, completed steps) is not stored; designs for those steps are missing |

## 6. Open questions / risks
1. Can a draft exist **without a Master SKU**? (Design implies SKU is verified on Continue, drafts can save anyway.) Default proposal: yes, auto placeholder code, must be unique and real before Continue.
2. **Readiness percentage**: the designs do not agree with any simple formula (3 done = 38%, then 50% with 4 required + brand done). Proposal: weight required items 2 and recommended 1 and tell the designer; or show the checklist counts instead of a percent.
3. Does a **placeholder** satisfy "Primary image"? Marketplaces reject placeholders, so default: it satisfies the draft checklist but still blocks publishing.
4. Description format and sanitising (HTML subset vs Markdown); marketplaces often want plain text or their own HTML.
5. Material/Product category selects: is "Product category" a duplicate of Category, or a sub-type? (design shows both with the same placeholder).
6. Dimensions/weight at product level or only on variants? (marketplaces want shipping weight on the variant/package; the design says product dimensions, not shipping package.)
7. Brand governance: free text vs managed list (affects marketplace brand approval later).
8. AI: which provider (none today), tone and length limits, languages; policy for "key benefits" without verified facts (design says add verified features first).
9. Missing designs: the Variants / Inventory / Listings / Channels steps of this wizard, and the end of the flow (after Continue). Without them the API can only support step 1 plus the existing separate screens.
10. Autosave vs manual: "Last saved just now" suggests autosave; define the interval and conflict rule (the PATCH `version` check already returns 409).

## 7. What a developer can build today vs what needs backend work
* **Today (existing APIs)**: create the product with `POST /products` (title, code, type, category, brand, description, country, HSN, GST, status draft), upload the image through `/products/{id}/documents`, patch fields, delete the draft, read marketplace readiness. Duplicate SKU is only discovered when saving.
* **Needs new backend work for the designed experience**: items 1-4 (draft create, SKU check, creation readiness, step validation), 5-7 (AI, rich text, placeholder), 8-10 (brand, physical data, custom attributes), 12 (draft list).

Suggested build order once you give the go-ahead: (a) draft-friendly create + SKU check + creation readiness + validate-step, (b) product-level physical data + custom attributes + brand list, (c) image placeholder + first-image-primary hardening, (d) AI description suggestions, (e) draft list; tests per item; Swagger updated.
