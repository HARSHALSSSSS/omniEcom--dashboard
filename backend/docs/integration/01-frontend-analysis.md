# Frontend vs backend: integration analysis

Status: analysis only. Nothing was changed in frontend or backend. Findings come from four read-only reviews (auth/onboarding/dashboard/settings/shell, products/import, ops screens, hub/intelligence). Items marked (unverified) were not run, only read.

## 1. State of the frontend
* About 40 pages, all running on MSW mocks (`src/mocks`) or hardcoded constants. No page talks to the real backend.
* Only three areas have an api + hook layer (products, orders/inventory/listings, connectors/import/attention), and even those use mock shapes. Pricing, Promotions, Procurement, Reports, Profitability, Product Intelligence, AI Assistant, Automation, Shipping, Fulfillment, Returns, Settings, Dashboard, Needs Attention, Recommendations, Onboarding and Auth have no working data layer.
* `ConnectorDetailPage` is an 11-line stub.

## 2. Global blockers (apply to every screen)
| # | Issue | Fix side |
|---|---|---|
| G1 | `ENDPOINTS` already contain `/api/v1` and axios `baseURL` is `/api/v1` too: `/api/v1/api/v1/...` (unverified at runtime); no Vite proxy | frontend |
| G2 | Auth paths: `/auth/signin|signup|signout` vs backend `/auth/login|register|logout`; register returns no tokens (needs login after) | frontend |
| G3 | Refresh: frontend expects an httpOnly cookie + empty body; backend wants `{refreshToken}` in the body, rotates it on every call, no cookie. Needs a single in-flight refresh (parallel 401s trigger reuse detection and kill the session) | frontend |
| G4 | `withCredentials: true` vs backend CORS `credentials: false` | frontend |
| G5 | Persisted fake session in `workspace.store` (`isAuthenticated: true`, `onboardingComplete: true`); needs a bootstrap (refresh, `/workspace/shell`, `/onboarding`) before route guards | frontend |
| G6 | Response envelope: backend `{success,data,requestId}`; numbered lists `data:{items,page,pageSize,total,pages}`; cursor lists `data:[]` + `meta:{limit,nextCursor,hasMore}`. Frontend expects `{data:[],meta:{total,...}}` everywhere | frontend (adapters) |
| G7 | Filters: backend `filter[x]=`, `q`, `sort=-field`, `page/pageSize` or `limit/cursor`; frontend sends flat `status/search/channel`. Unknown keys are dropped silently | frontend |
| G8 | Errors: backend field errors in `details.issues` (400) or `details.errors` (422); frontend reads `error.fields` (never exists). A login 401 runs through the refresh/redirect branch | frontend |
| G9 | Money: backend integer minor units (`*Minor`) on variants, prices, orders; `formatINR` divides by 100 but all mock data is in rupees (mock screens show amounts 100x too small) | frontend |
| G10 | Marketplace codes: `amazon` vs `amazon_in`; backend has amazon_in, flipkart, myntra, snapdeal, mock; Meesho/Shopify are "coming soon", Delhivery/Blue Dart do not exist | both |
| G11 | `version` (optimistic lock) is required on product draft/edit/variant/vendor writes; `Idempotency-Key` supported on side-effect POSTs; frontend sends neither | frontend |
| G12 | RBAC: frontend role map (owner/admin/seller/viewer, default allow) vs backend permission strings from `GET /me`; 403 states not handled; AI and Automation sit behind feature flags (403) | both |
| G13 | Backend deep links (`/orders/{id}`, `/inventory/variants/{id}`, `/channels/{id}`, `?health=low`) have no frontend routes; Orders/Inventory/Listings ignore query params | both |
| G14 | Async jobs: frontend polls `/jobs/{id}`; backend has `/sync/jobs/{id}` and `/data-jobs/{id}`; many backend writes are 202 + job | frontend |

## 3. Coverage by screen
Legend: OK = backend exists, mostly wiring and adapters. PART = backend exists but differs or lacks fields. NONE = no backend.

| Screen | Backend coverage | Main gaps |
|---|---|---|
| Sign in / sign up | OK | paths, password min 10 (frontend 8), verify-email, forgot/reset pages missing |
| Onboarding (6 steps) | OK (`/onboarding/*`) | per-step API, enum mapping (`retail_business` to `retail`, `2-5` to `2_5`), channel connect = create + authorize, meesho/shopify coming soon, save & exit loops through guard |
| Dashboard | OK (`GET /dashboard`) | adapters, chart axis fixed 0-60K, 7/30/90 not wired, sales are minor units |
| Needs attention | OK (`/issues/*`) | page ignores hook/api, two models, enums (area vs category), snooze rules, `entityName`/`impactMetrics` absent |
| Recommendations | PART | static page; choose source (`/issues/recommendation`, `/inventory/overview.advisory`, `/ai/recommendations`) |
| Settings | PART | renames, PAN only (no CIN), `numberFormat` rejected (strict schema), multi-state GSTIN has NO backend, ops prefs and alerts need design decision |
| App shell, search, notifications | OK (`/workspace/shell`, `/search`, `/notifications`) | not hydrated, business switcher has no backend (one business only), `/notifications` route missing |
| Products list | OK (`/products/stats`, `/products/catalog`) | page is 4 hardcoded cards; KPI semantics differ; bulk action names/shape differ; saved views unused |
| Create product | OK (drafts, readiness, sku-check, brands, AI, images) | page still posts monolithic `POST /products` with fixed price/stock, swallows errors, image upload simulated, AI dialog unreachable |
| Edit product | OK (`/edit`, `/change-impact`, `/edit/save`, insights) | page calls non-existent `PUT /products/{id}`; price/MRP are variant-level |
| Product detail | OK (`/overview` plus tab endpoints) | hardcoded page, `prod-1` fallbacks, tab not URL driven |
| Variants | OK (`/variant-grid`, counts, bulk) | hardcoded; barcode generation and variant-only import have no backend |
| Import wizard / issues | PART | `/imports*` and `/jobs` do not exist; backend has fixed-header CSV data-jobs (<=20,000 rows, 5 MB), no mapping/issue/revalidate/commit model, no xlsx, no image/stock columns |
| Inventory | OK (best match) | `/inventory/summary|sync|transfer` do not exist (use overview, ledger, adjustments, channel-sync); adjust needs variantId + warehouseId |
| Orders | OK | `/orders/{id}/action` vs `/transition`; manual status limited once fulfillment exists |
| Fulfillment | PART | no `/fulfillment/queue`; buttons are alerts |
| Shipping | PART | no data layer; per-carrier AWB counts and on-time % have no source |
| Returns | OK | status vocab differs; real flow approve, receive, inspect, disposition, refund |
| Listings / Listing studio | PART | no bulk-publish, no status counts; publish = validate, approve, publish (202); no composite studio endpoint; content-sync states not shown |
| Marketplace hub (4 pages) | PART | `/connections`, `/connectors` vs `/marketplace-accounts`, `/marketplaces`; no OAuth callback route; setup order create, authorize, test; no health aggregate; directory metadata (rating, pricing) not in backend |
| Pricing | PART | backend is a price manager (marketplace prices, bulk, rules, history); proposals/approval workflow/competitor price: NONE |
| Promotions | NONE | no campaigns/coupons module (only scheduled sale prices) |
| Procurement | NONE | no suppliers/purchase orders (only inbound shipments with free-text supplier) |
| Reports | PART | JSON reports only; GST register, settlement audit, valuation PDF, xlsx/pdf, scheduling missing |
| Profitability | PART | `/analytics/profitability` (nullable/estimated, 92-day cap); no ad spend/returns impact |
| Product intelligence | PART | built from inventory-health + analytics; competitor price, confidence, raise_price/promote have no source |
| AI assistant | PART | stateless `/ai/ask`; no conversations/history; replies are intent-based |
| Automation | PART | engine exists but triggers/actions/status vocabulary differ completely |

## 4. Backend work that integration would need (not yet built)
1. Promotions module (campaigns, coupons, budget, results).
2. Procurement module (suppliers, purchase orders, receive into inventory).
3. Pricing proposals (approval workflow, competitor price) if that UX is kept.
4. Reports: GST register, settlement audit, valuation, xlsx/pdf export, scheduled reports with e-mail.
5. Multi-state GSTIN registry; business switcher (membership model + switch endpoint).
6. Import: row-level issue model with preview, mapping, revalidate and commit; xlsx; image and stock columns; template download.
7. Listings: bulk publish, status counts, studio composite endpoint.
8. AI conversations (sessions, messages) if history is required.
9. Connectors: Shopify, Meesho, Delhivery, Blue Dart; credential-field descriptors per connector; connection-health aggregate.
10. Shipping per-carrier stats; fulfillment queue view; settings fields (CIN, auto-acknowledge, round-to-9) and alert settings model.

## 5. Suggested integration order
1. Foundation: base URL/proxy, envelope + error adapters, auth (login, refresh single-flight, bootstrap, guards), shell, permissions.
2. Onboarding, dashboard, needs attention, notifications, search.
3. Products (list, create, edit, detail, variants), inventory, orders.
4. Listings, marketplace hub, fulfillment, shipping, returns.
5. Settings, then screens that need new backend (pricing, promotions, procurement, reports, intelligence, AI, automation, import).

## 6. Open decisions for the owner
* Import: extend the backend to the frontend's wizard (mapping, issues, commit) or simplify the wizard to the backend CSV flow?
* Pricing proposals, Promotions, Procurement: build these backend modules now, or hide/stub the pages for the first release?
* Multi-business switcher and multi-state GSTIN: needed for the first release?
* Which recommendation source should the Recommendations page show?
* Meesho/Shopify/Delhivery/Blue Dart: build connectors or mark "coming soon" in the UI (backend already does)?
* Settings alerts and ops preferences: which backend model wins?
* Who changes what: backend adapts (aliases, extra endpoints) or frontend adapts (adapters, rewrites)? Default proposal: backend contract is the source of truth; frontend adapts.
