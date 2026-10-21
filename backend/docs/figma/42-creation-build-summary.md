# Product creation flow: what was built

Design: Figma "Product creation flow" (6 screens). Decisions: `41-creation-build-brief.md`. Study: `40-product-creation-flow-analysis.md`.
Final run: typecheck clean, eslint clean, module graph OK; unit + contract + database 134, **api 676**, e2e + connector 183 (2 skipped as before). API surface 499 -> **523 operations** (+24). A walkthrough test (`tests/api/product-creation-walkthrough.test.ts`, 7 tests) replays the six screens against the real API with the design's numbers and wording (38 % start, 1 blocker, Verify / Confirm / Duplicate / Uploading tags, the AI sentence, 2 blockers on duplicate SKU, Continue -> Variants).

## Endpoints (all `/api/v1`)
| Screen / feature | Endpoint |
|---|---|
| Form dropdowns and limits (product type, GST slabs, countries, materials, units, limits, image rules) | `GET /products/form-options`, `GET /products/standard-categories` |
| Brand select with confirmation | `GET /brands`, `POST /brands`, `POST /brands/{id}/confirm`, `DELETE /brands/{id}` |
| Master SKU live check + verify | `GET /products/sku-check`, `POST /products/{id}/sku/verify` |
| Save draft / autosave / resume / discard | `POST /products/drafts`, `PATCH /products/{id}/draft` (version lock), `GET /products/{id}/creation`, `GET /products/drafts`, `DELETE /products/{id}/draft` |
| Readiness panel (saved and unsaved values) | `GET /products/{id}/creation-readiness`, `POST /products/creation-readiness` |
| Continue (checks this step only) | `POST /products/{id}/validate-step`, `POST /products/{id}/creation/continue` |
| Improve with AI | `POST /products/{id}/ai/description`, `GET ...`, `POST .../{id}/apply`, `POST .../{id}/dismiss` |
| Upload / Generate placeholder / Cancel upload / image state | `POST /products/{id}/documents/placeholder`, `GET /products/{id}/primary-image`, `POST /documents/{id}/cancel` (+ `DELETE` on a pending upload), stricter validation on the existing upload and confirm |
| Product fields | existing `POST/PATCH/GET /products` now carry `descriptionHtml`, `dimensions` (cm) + `dimensionsMm`, `weight` (kg) + `weightGrams`, `material`, `standardCategory`, `customAttributes`; variants expose `effectiveDimensionsMm` / `effectiveWeightGrams` |

## Behaviour that matches the design
* Draft needs only a title; master code auto-generated `DRAFT-XXXXXXXX` until the seller chooses one; Continue needs a real unique code (case-insensitive, also enforced by a DB unique index; races give exactly one winner).
* Readiness: 8 equal items, percent = done / 8 (3 done = 38 %), required items block publishing, states done / pending / verify / confirm / duplicate / uploading / placeholder, fix targets, "where this goes" channels, hints.
* Description: rich text (bold, italic, bullets, link) stored as sanitised HTML + plain text; 2,000-character limit on the plain text; marketplaces keep reading the plain text.
* Dimensions / weight on the product (cm / kg in the UI, mm / g stored, in / lb accepted); GST/HSN/country validated; custom attributes (max 20, confirm before they reach listings).
* AI: preview, never auto-applied, only real facts, grounding note, rate limited, feature flag and AI settings respected, expiry, single decision.
* Images: magic-byte and dimension validation (>= 200 px, warning below 1000 px, 100 MP bomb guard, 20 per product), placeholder never publishable and replaced by the first real image, first real image becomes primary, cancel upload is idempotent.

## Judgement calls and deviations (please review)
1. **"Product category" second select** (Screen 2) is built as an optional free-text *standard category* with suggestions (design shows the same placeholder as Material, so it looks like a copy error).
2. **Readiness 50 %** on the upload screen of the design cannot come from any consistent rule; the API gives the honest value (the same product would show 63 %).
3. **Continue with a duplicate code returns 422** (field errors listed, the rest of the draft is saved); create / patch with a duplicate return 409.
4. **Image size cap is 10 MB** (existing code), not the brief's 25 MB; `form-options` reports the real value.
5. `sku-check` is read-only (a GET never writes); the verified code is recorded by `sku/verify`, `validate-step` or `continue`.
6. Error "codes" like `description_too_long` are in `error.details.rule` (the shared error-code list is fixed); mime mismatch stays HTTP 415 (existing contract).
7. AI `apply` returns `{ suggestion, product }`; call `GET /products/{id}/creation` for the full creation DTO.
8. Discard soft-deletes the draft and its variants; uploaded files are left in storage.
9. Stricter field rules now also apply to the existing product create/patch/bulk endpoints (brand <= 80, HSN 4/6/8 digits, country must be a real ISO code); CSV and marketplace imports stay lenient (they truncate instead of failing).
10. Shared test fixtures `PNG_1x1` / `JPEG_BYTES` are now valid 256x256 images (the image validation rejects tiny images).

## Not covered (needs designs or a decision)
* The next wizard steps (Variants, Inventory, Listings, Channels): the chain is tracked (`completedSteps`), but no screens were designed.
* A real LLM for "Improve with AI" (rules provider today, interface ready).
* Removing the stale files of discarded drafts from storage (cleanup job).
* Load test of the SKU check / draft list at very large catalogues (indexes are in place).
