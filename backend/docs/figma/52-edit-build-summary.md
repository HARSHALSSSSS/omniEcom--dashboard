# Edit product flow: what was built

Design: Figma "Edit product flow" (7 screens). Study: `50-edit-product-flow-analysis.md`. Decisions and package contract: `51-edit-build-brief.md`.
Final run: typecheck clean, eslint clean, module graph OK (33 modules); unit + contract + database 134, **api 810**, e2e + connector 183 (2 skipped as before): all passing. API surface 523 -> **532 operations** (+9). Not committed or pushed.

## New and changed endpoints (all `/api/v1`)
| Screen / feature | Endpoint |
|---|---|
| Load the editor (fields, locks, meta, nav, attribute slots, media, channels inheriting, readiness, insights) | `GET /products/{id}/edit` |
| Change impact (live, before saving; Modified / Revert are client side) | `POST /products/{id}/change-impact` (read-only) |
| Save changes, category/type confirmation, post-save sync states, version conflict | `POST /products/{id}/edit/save` |
| Suggested improvement + Dismiss / restore | `GET /products/{id}/insights`, `POST /products/{id}/insights/{key}/dismiss`, `POST .../restore` |
| Master SKU lock (E1) | `PATCH /products/{id}`, drafts, edit save: 409 `code_locked` for non-drafts; `productCodeLocked` in the product DTO |
| "View affected listings", sync state per listing | `GET /products/{id}/listing-content`, `GET /listings` (+ `filter[contentState]`, `filter[productId]`, content fields), `POST /listings/{id}/content-sync`, `POST /listings/{id}/content-review/resolve` |
| AI in the editor (Rewrite / Make more concise, Alternative, explanation, Apply into the editor) | `POST /products/{id}/ai/description` (`alsoSuggest`), `POST .../apply` (`persist: false`) |
| Needs-attention integration | issue detectors `listing_content_review`, `listing_content_failed` |

## How it behaves (matches the screens)
* **Screen 1 / 2:** the editor read returns the baseline and `version`; the impact preview says "Product name changed", 3 listings, per channel `name_inherited`, an independent channel is reported as "<channel> content is independently managed", with "Updates are not sent to listings until you save". No changes -> `hasChanges: false` ("No changes yet").
* **Screen 3:** `Rewrite for clarity` turns "A durable premium travel bag designed for short business trips and weekend travel." into "A durable, premium travel bag for short business trips and weekend travel." (the design sample); `Make more concise` condenses the existing text (only deletions / function words); the explanation text matches the design; the alternative is a second stored suggestion; Apply with `persist: false` fills the editor only.
* **Screen 4:** six attribute slots with `supplied` flags and the "Attribute values were not supplied ..." note; the configured counter is the real count.
* **Screen 5:** save is one transaction (product + listing marking + audit + outbox); response lists per channel `sync_pending` and "3 listings will sync shortly" / "Listings have not synced yet"; a content-sync job per account runs after commit.
* **Screen 6:** a category (or product-type) change that hits live listings needs `confirm: true`; the 409 carries the modal payload (from -> to category, per channel "category mapping review"). Listings go to `needs_review` with the suggested marketplace category and keep their old category until the seller resolves it.
* **Screen 7:** pure client behaviour (a second `GET /edit` shows the unchanged product).
* Readiness percent equals the content-readiness percent of the same product everywhere (tested).

## Production behaviour
* Inherited master content now reaches live listings (**this did not exist before**): `product.updated` consumer for edits from any route, a coalesced content-sync job per account (retries, dead-letter, rate limiting), channel overrides in `product_marketplace_data` are never overwritten, non-live listings are never touched, connectors without `listings.update` give `needs_republish` (+ Needs-attention issue).
* The listing input builder now applies channel overrides (title, description, bullets, brand, attributes) on publish and sync.
* Concurrency: row lock + `version`; two saves with the same version -> one success, the other 409 `VERSION_CONFLICT` with the current editor view; idempotency key supported; a no-op save writes nothing.
* Limits: more than 500 listings per product -> 413 `too_many_listings`.

## Judgement calls and deviations (please review)
1. **Confirmation is conditional:** the modal is required only when a category / type change hits at least one live listing.
2. **Content-sync job** runs as sync type `listings` (`kind: content`, job `sync.listings`) because the engine's job types are fixed.
3. **Category change never auto-remaps live listings** (marketplaces restrict it); the seller reviews each one.
4. **Locked code applies to archived products too**; a draft can change its code and activate in one call.
5. **Core attributes** (material, dimensions, weight, HSN, tax) are now exposed to listings through attribute mappings (`CORE_FIELDS` extended).
6. **Insights:** `description_short` (median of >= 5 peers in the category, else 150 characters) and `few_images` (< 3 real images).
7. **Concise vs the design's alternative:** the design shows "... weekends."; the rules provider produces "A durable premium travel bag for short business trips and weekend travel." (shorter, source words only). Matching the mock exactly would need a non-word-safe rule.
8. `previewProductChange` / `applyProductChange` take connector capabilities from `opts.connectors`; the edit module always passes them.

## Still open
* Editor tabs Media, Details, Variants, Inventory, Listings, Content, Activity are not designed for editing (existing detail endpoints are reused).
* Real connectors' `listings.update` behaviour is unverified (sandbox only).
* Applying the "persist: false" accept is recorded in audit; the final write happens at Save changes.
* No load test of the content-sync fan-out for products with hundreds of listings.
