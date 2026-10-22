# 05 - Bulk import design: backend additions

Everything below is additive to `/api/v1/imports` (see `03-screen-endpoint-map.md` section 8.F). Existing endpoints and shapes are unchanged except for the new fields called out here. All envelopes are `{ data, meta }`. Permissions: reads need `imports:read`, writes `imports:write`; every call is tenant scoped (another vendor's import answers 404).

## 1. Settings toggles

`PUT /imports/{id}/settings` and the `settings` object of every session response (and `GET /imports/options` -> `defaults`) gain three booleans, all default `true`:

| field | false means |
|---|---|
| `includeImages` | image URL columns are ignored: no `invalid_image` issues, no image data on the rows |
| `includeQuantities` | the stock column is ignored: no stock is received/counted, no warehouse is required |
| `matchVariants` | rows are never grouped by product code nor merged into an existing product: every row is its own product (product code = SKU) |

```json
PUT /api/v1/imports/{id}/settings   { "includeImages": false, "includeQuantities": false, "matchVariants": false }
```

Changing a toggle sends a validated import back to `analyzed` (validate again). Validation, issues, `commit-preview` and the commit all honour them. They live in the existing settings jsonb (no migration).

`settings.duplicateStrategy` accepts two more values (listed in `GET /imports/options` -> `duplicateStrategies`):
`ask` (every row whose SKU exists becomes a duplicate issue, see 2) and `create_new` (every such row is created as a new product with a generated unique SKU).

## 2. Per-row duplicate decision

With `duplicateStrategy: "ask"` a row whose SKU already exists in the catalogue gets a `duplicate_sku` issue (severity `error`, so the row waits for a decision). The issue shows both sides:

```json
{ "id": "...", "code": "duplicate_sku", "rowNumber": 2, "sourceValue": "DUP-A-S",
  "suggestion": { "kind": "set_value", "field": "sku", "value": "DUP-A-S-2", "label": "Create a new product as DUP-A-S-2", "existing": { "...": "same object as productData.existing" } },
  "productData": { "sku": "DUP-A-S", "title": "CSV Tee A", "price": 150, "source": { "...": "raw CSV cells" },
    "existing": { "id": "<productId>", "productId": "...", "variantId": "...", "productCode": "DUP-A", "sku": "DUP-A-S", "title": "Existing Tee A", "price": 100, "barcode": null } } }
```
`productData.existing` is `null` for every other issue. It is also set on the "SKU belongs to another product" duplicate raised under the other strategies.

Two new resolve actions, on `POST /imports/{id}/issues/{issueId}` and `POST /imports/{id}/issues/bulk` (`{ "code": "duplicate_sku", "action": "create_new" }`):

- `use_existing`: the row updates the existing product/variant (plan `update`, stock column becomes a stock count).
- `create_new`: the row becomes a new product. At commit a unique SKU (`SKU-2`, `SKU-3`, ...) and product code are generated; the row result reports it: `rows[].result = { action: "created", sku: "DUP-A-S-2", notes: ["SKU DUP-A-S was already taken; created as DUP-A-S-2"] }`.

Both are stored on the row, survive a revalidation and win over the global strategy; they do not make the validation stale (`pendingFixes` stays 0). Use `commit` mode `include_resolved` to import decided rows. Applying them to any other issue code, or `use_existing` to a duplicate inside the file, answers 400 (`VALIDATION_FAILED`; in bulk the issue is listed under `skipped`). For a duplicate inside the file `create_new` applies the suggested new SKU.

## 3. Marketplace source

`GET /imports/marketplace-sources`
```json
{ "items": [ { "accountId": "...", "marketplace": "mock", "displayName": "Sandbox Store", "mode": "sandbox",
  "connection": "connected", "productsAvailable": 25, "importedProducts": 0, "lastImportAt": null, "canImport": true } ] }
```
`connection`: `connected | attention | disconnected` (pending authorisation = disconnected). `productsAvailable` is `null` until counted (`POST /onboarding/products/refresh-counts`). `lastImportAt` is the latest finished catalogue import job or committed marketplace import. `canImport` needs a connected account whose connector supports `catalog.import`.

`POST /imports/from-marketplace { "accountId": "<uuid>" }`
- 201: the catalogue fitted one page (100 products): session `status: "analyzed"`, `source: "marketplace"`, `fileName: "<account display name> catalog"`, `settings.currencyUnit: "paise"`.
- 202: larger catalogue: session `status: "uploaded"` (`uiStatus: "analyzing"`), a job reads it (max 10,000 products); `counters.processed` grows (and `counters.percent` once `productsAvailable` is known); poll `GET /imports/{id}` until `analyzed` (or `failed` with `failureMessage`).
- Calling again while a session of that account is running returns that session (idempotent).
- Errors: 404 unknown account (or another tenant's), 409 not connected / marketplace without catalogue import.

Rows are mapped to the standard columns (SKU, Product title, Description, Brand, Category, Selling price, MRP, Stock quantity, Barcode, Primary/More image URLs), the mapping is pre-set, then mapping/settings/validate/issues/commit work as for a file.

## 4. Activity feed

`GET /imports/{id}/activity?limit=50&before=<cursor>` (`limit` 1-200)
```json
{ "items": [ { "id": "17", "at": "2026-10-22T12:00:00.000Z", "kind": "row_created", "rowNumber": 2, "sku": "TG-1", "title": "Trail Shirt", "message": "Created product" } ],
  "nextBefore": "16" }
```
Newest first; pass `nextBefore` as `before` for the next page (`null` = end). Kinds: `row_validated | row_warning | row_error | row_created | row_updated | row_skipped | row_failed | issue_resolved | stage`. Recorded by validation (stage start/end plus up to 150 row events: errors/warnings first), the commit (one event per row, stage at the end), and issue resolution (one event per single resolve, one summary per bulk). The newest 300 events per session are kept (stored in `import_sessions.stats`, no table).

## 5. Revalidation progress

`GET /imports/{id}` -> `revalidation`, and the revalidate response (`POST /imports/{id}/revalidate`) -> `revalidation` and `session.revalidation`; `null` before the first validation.
```json
{ "status": "running", "total": 1200, "checked": 400, "current": "Validating SKUs, prices, image URLs, stock (rows 201-400 of 1200)",
  "changes": [ { "rowNumber": 3, "field": "title", "from": null, "to": "Fixed title", "outcome": "passed" } ] }
```
`status`: `idle | running | complete | failed`. `changes` lists the fixes the seller applied since the last run (`from` = the original value, `to` = the fix) with `passed` or `still_failing` (max 200). Kept until the next validate/revalidate. Files up to 1,000 rows revalidate inside the request (status already `complete`); bigger ones are a job, poll `GET /imports/{id}`.

## 6. Notifications

The commit now publishes `import.committed` (status `committed` or `partially_committed`) and the new `import.failed` (the commit imported nothing, validation crashed, or the marketplace catalogue could not be read). Both notify the team (category `system`, types `import.finished` info / `import.failed` warning):
title `Import finished: N created, M updated, K failed`, action `/products/import/<id>/processing`.
`import.committed` payload gained `created`, `updated`, `productsUpdated` and `failed` (from the session totals).

## 7. Processing and Issues screens (round 2)

**Session DTO** (every response that returns a session, so `GET /imports/{id}`, `/validate`, revalidate, commit ...) now documents and carries:
- `revalidation` (section 5) - object or `null`.
- `scope: { products, newProducts, updates }` - planned effect of committing the ready rows (valid, with warnings, already imported): products touched, new products, existing products updated. `products` is distinct product codes; a row created as a new product although its SKU exists counts as one new product.
- `products: number` - distinct products in the file; `plan: { create, update, addVariant, skip }` - rows by what the commit will do (create = new product, update = existing SKU updated, addVariant = new SKU under an existing product, skip = skipped or ignored rows). Decided by the duplicate strategy and the per-row decisions, so they change when a decision changes. All zeros before the first validation (and until the file is analysed).
- `GET /imports/{id}/summary` carries the same `products`, `plan` and `scope`.

**Mapping**: `GET /imports/{id}/mapping` -> `columns[].autoTargetField: string | null`, the automatic suggestion of that column whatever the seller changed (reset = `PUT .../mapping { mapping: {...from autoTargetField} }`).

**Issue DTO** (`GET /imports/{id}/issues`, resolve responses):
- `suggestion.confidence: 'high' | 'medium' | 'low'` and `suggestion.confidenceReason: string` (category: match score and "fuzzy"; mechanical clean-ups high; defaults low).
- `whyItMatters: string`, `impact: string` - server-owned copy per issue code (and field for pricing / invalid value issues).
- `duplicateMatch: { existingSku, existingTitle, confidence: 'exact' | 'high' | 'medium', reason } | null` - derived from `productData.existing` (same SKU and title = exact; same product code but another title = high; another product code and title = medium). `productData.existing` and `suggestion.existing` stay as described in section 2.

**List**: `GET /imports/{id}/issues?filter[field]=<targetField>&sort=severity|row|code` (prefix `-` for descending; default `severity`: errors first, then row). The data object is `{ items, page, pageSize, total, pages, sort }`; `sort` echoes the applied sort.

**Image upload**: `POST /imports/{id}/issues/{issueId}/image`, raw body, `Content-Type: image/png | image/jpeg | image/webp`, `imports:write`, max 5 MB (413), other types or bytes that are not that image 415, an issue that is not `invalid_image` 400, 404 for another tenant. The file goes to object storage under `vendors/<vendorId>/imports/<importId>/images/`, the issue is resolved with `resolution.action = "upload_image"`, and the response is `{ issue, issues, counters }`. Like any fix it needs a revalidation before the commit; the commit then attaches the image to the created or updated product through the documents module (first image becomes the primary image) and adds the note "Uploaded image attached to the product" to the row result.

**Changing an answer**: `POST /imports/{id}/issues/{issueId}` (and the image endpoint) now also work on an issue that is already `resolved` or `ignored`, until its row is imported (409 `already_handled` afterwards). The earlier answer is taken back (fix, decision, uploaded image, ignore flag), the new one applies and counters update. Sending the same answer again is still 409. Bulk resolve still only touches open issues.

## Migration

None. (`ImportRevalidation` and `ImportActivity` schemas appear in OpenAPI after `openapi:export`.)
