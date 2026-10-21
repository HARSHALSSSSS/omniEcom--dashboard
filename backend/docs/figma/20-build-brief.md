# Build brief (shared rules for everyone implementing the dashboard APIs)

Read first: `docs/figma/10-api-contract-draft-A.md`, `docs/figma/11-api-contract-draft-B.md`, `docs/figma/12-open-questions.md` (use the **proposed defaults**), the study note of your area (`01`-`06`), and section 12 of `11-...` (corrections).
The contract is a DRAFT: if the real code makes a better shape possible, keep the **information and behaviour** of the contract, fix the details, and note the deviation in your final report.

## What is already done (do not redo, do not change)
* **Schema + migrations 0012/0013 are FROZEN** (`packages/database/src/schema/*`, `packages/database/migrations/*`). Do not edit schema files or migrations. If you truly need another column, work around it (jsonb in an existing column, derived value) and list it in your report as a "needs schema change" item.
  New/changed tables and columns: `issues`, `issue_events`, `saved_views`, `inventory_groups`, `inventory_group_items`, `marketplace_sla`, `return_inspections`, `shipping_snapshots`;
  `orders.dispatch_due_at`; `inventory.quantity_quarantined`; `inventory_movements.delta_quarantined` + movement types `quarantine`, `quarantine_release`; `product_variants.lead_time_days`;
  `fulfillments.ship_method_kind / ship_provider_id / ship_selected_by / ship_confirmed_at / ship_recommendation`; `vendor_shipping_providers.kind / channel_code / verification / supported_order_types`;
  `return_orders.inspection_status / inspector_id / inspection_started_at / refund_currency / refund_source / refund_error` (+ refund statuses `ready`, `processing`; dispositions `rejected`, `repair`); rule type `shipping`.
  The SQL function `inventory_ledger_drift` now also returns `quarantined` / `ledger_quarantined`.
* Vendor settings (validated JSON, `modules/vendors/src/schemas.ts`) already allow: `inventory.defaultLeadTimeDays`, `sla.{defaultHandlingHours, approachingMinutes, atRiskMinutes}`, `returns.{highValueMinor, inspectionOverdueHours}`, `shipping.awaitingFirstScanHours`, plus `lowStockThreshold`.
* Permissions added: `issues:read|write`, `views:read|write` (reuse the existing ones for everything else).
* Helpers: `@oms/contracts` -> `PageQuerySchema`, `pagedEnvelope(item)`; `@oms/module-kit` -> `paged(req, items, {page,pageSize}, total)`, `pageWindow({page,pageSize})`.
* New modules scaffolded (empty): `modules/issues`, `modules/workspace`. Scheduler entries exist for jobs `issues.sweep` (5 min) and `shipping.snapshot` (hourly): implement handlers with exactly these names (JobHandler `{ queue: 'maintenance', name, handle }`) and export them in your module's `jobs`.

## Ownership (strict: edit ONLY your files, other agents work in parallel in the same working tree)
Each agent owns its module folder under `modules/<name>/` and its own test file `tests/api/<area>-dashboard.test.ts`. Do not touch another module's folder, `scripts/`, `packages/*`, `apps/*`, `docs/` or `pnpm-lock.yaml`.
You may **read** any table through `schema` from `@oms/database` (like `modules/analytics` does); you may **import** another module only if it is in YOUR module's `dependsOn` (see `modules/<you>/package.json`, `@oms/mod-*`). Never import another module's internal files (only its package entry).
If you need data owned by another area, query the table directly (read-only) rather than adding a dependency.

## Code conventions (match the surrounding code; read `modules/onboarding`, `modules/analytics`, `modules/returns` for the style)
* Fastify routes with `r = app.withTypeProvider<ZodTypeProvider>()`; every route needs `config: { access: { permission: '<resource>:<action>' } }` (or `'authenticated'`), `schema: { tags, summary, description?, querystring?, params?, body?, response: { 2xx: successEnvelope(...)/pagedEnvelope(...) } }` (the route policy rejects undocumented routes at boot). Mutations are audited with `audit(tx, req, ...)` and publish `emit(tx, req, ...)` when other modules care.
* Tenant isolation: always `vendorTx(req, (tx, vendorId) => ...)`; every query filters `vendor_id` explicitly in addition to RLS. Money = integer minor units + currency. Timestamps = ISO UTC strings. Business time zone (`vendors.timezone`) for "today" / due-today buckets.
* Lists marked **[paged]** use `PageQuerySchema` + `pageWindow` + `paged(...)` with a **separate COUNT query**; counts for tabs/chips come from one grouped query (never per-row loops: no N+1). Keep p95 queries index-friendly; page size max 100.
* Existing endpoints must keep working (extend by adding optional query params / response fields; do not rename or remove fields). Run the existing tests of the module you touch.
* Exports: `GET /<area>/export` returns `text/csv` (attachment, max 50,000 rows, 413 beyond, spreadsheet-formula-safe cells as in `modules/catalog/src/csv.ts` toCsv), audited, same filters as the list.
* Errors: `AppError` / `Errors.*` (409 for state conflicts with `details.rule`, 400/422 for validation, 404 for missing). Never leak other tenants' data; unknown id -> 404.
* Role model: owner/admin everything; staff: operate (resolve/snooze issues, inspect, adjust stock, confirm shipping) but not configure rules/methods or confirm refunds; viewers read.

## Tests (required)
`tests/api/<area>-dashboard.test.ts` using `buildTestApp({ database: true })`, `clientFor`, helpers in `packages/testing/src/index.ts` and `tests/helpers/stage4.ts` (`buildWorld`, `orderArrives`, `pickAndPack` ...).
Cover: each new endpoint happy path with real numbers, validation errors, tenant isolation (second vendor sees nothing), permission denial (viewer cannot write), and one failure/edge case per feature.
**Run only your own test file**: `pnpm exec vitest run --project api tests/api/<file>.test.ts --maxWorkers=1` (several agents run tests at once; do not run the full suite, it exhausts memory).
Type-check only your module: `pnpm --filter @oms/mod-<name> typecheck` (other modules may be mid-edit; ignore errors outside your module, except report them). Lint your files: `pnpm exec eslint modules/<name> tests/api/<file>`.

## Final report (what the lead needs, keep it short and factual)
1. Endpoints implemented (method + path + one line), 2. endpoints skipped or partially done and why, 3. deviations from the contract, 4. "needs schema change" items, 5. tests added and their result, 6. anything another area must do (e.g. an event or table you expect).
Do NOT claim something works unless a test you ran proves it.
