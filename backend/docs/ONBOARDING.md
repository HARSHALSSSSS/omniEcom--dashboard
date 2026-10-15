# Seller onboarding (guided setup)

Module `onboarding`, API prefix `/api/v1/onboarding`. Permissions: `onboarding:read` (everyone in the business), `onboarding:write` (admins).
Account creation (screen 01) is `POST /api/v1/auth/register`, then `POST /api/v1/auth/login`.

The setup has six steps: `business`, `channels`, `products`, `inventory`, `fulfillment`, `ready`. Progress is stored per business, so
"Save & exit" and coming back later resume on `resumeStep`. Every step except `business` can be skipped. Every save can be repeated
later ("you can update these details anytime in Settings").

## Screen to API

| Screen | Read | Save / action |
|---|---|---|
| Stepper, resume | `GET /onboarding`, `GET /onboarding/options` | `PUT /onboarding/steps/{step}/draft` (Save & exit), `POST /onboarding/steps/{step}/skip` |
| 02 Business | `GET /onboarding/options` (types, team sizes) | `PUT /onboarding/business` |
| 03 Sales channels | `GET /onboarding/channels` | `PUT /onboarding/channels` (ticks), `POST /onboarding/channels/{code}/connect`, then the marketplace authorization endpoints |
| 04 Products | `GET /onboarding/products` | `POST /onboarding/products/refresh-counts`, `POST /onboarding/products/import`, `POST /onboarding/products/continue`; CSV: `POST /products/imports`; create: `POST /products`, `POST /products/bulk` |
| 05 Inventory | `GET /onboarding/inventory`, `GET /onboarding/inventory/overview` | `PUT /onboarding/inventory`; stock: `POST /inventory/receive`, `POST /inventory/imports` (CSV) |
| 06 Fulfillment | `GET /onboarding/fulfillment` | `PUT /onboarding/fulfillment`; third-party: `POST /shipping/providers` |
| 07 Ready | `GET /onboarding/readiness` | `POST /onboarding/complete` |

## Rules worth knowing

* **Channels**: Amazon, Flipkart, Myntra and Snapdeal are `availability: available`. Meesho, Shopify and Social Commerce are
  `coming_soon`: they can be ticked (interest is stored) but `connect` answers 409 `channel_coming_soon`. The sandbox marketplace appears
  outside production only.
* **Business**: saves into the vendor profile (`displayName`, `businessType`, `teamSize`, `operatingLocation`). `workspaceTier` is derived:
  just me / 2-5 = starter, 6-20 = growing, 21+ = scale.
* **Products**: `productsAvailable` is `null` until `refresh-counts` reads the marketplace catalogue (read-only, up to 5,000 per
  marketplace; `productsAvailableIsCapped` tells when more exist). Importing is asynchronous: follow the returned sync job, then review
  under `/imported-products`.
* **Inventory**: simple mode keeps one default location (code `HOME`); warehouse mode keeps a named default warehouse (code `MAIN`) with
  city / state and an optional address. Saving again updates that same warehouse. Simple mode is refused while several warehouses are active.
  The overview numbers come from the real stock tables.
* **Stock file** (`POST /inventory/imports`, `text/csv`, columns `sku,quantity[,warehouse_code]`): `mode=set` records a count, `mode=add`
  receives on top. Each row is applied on its own and reported; re-uploading the same file changes nothing twice. Excel files are not
  read by the API: export to CSV first.
* **Fulfillment**: default method (`marketplace`, `seller`, `third_party`), preference and per-marketplace overrides are stored in
  `fulfillment_preferences`. A method that is not available yet is saved and returned in `warnings`. Routing and shipping read these
  preferences when an order is fulfilled (not wired into routing yet).
* **Readiness** is computed from what exists (connected channels, products, warehouse, preferences), not from clicks. `percentComplete`
  counts the five setup items. `complete` needs the business step and is safe to call twice.
* **Drafts** hold the unsaved form (max 8 KB). Keys that look like secrets (password, token, api key ...) are rejected.
