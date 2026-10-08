#!/usr/bin/env node
/**
 * Single source of truth for the domain module map.
 * Generates: modules/<name>/* (package + manifest + layer folders),
 *            modules/registry (aggregate), docs/architecture/MODULES.md.
 * Safe to re-run: it only overwrites generated files (package.json, manifest.ts, index.ts, registry, docs).
 * Hand-written code inside src/{domain,application,infrastructure,http} is never touched.
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** extraction: 'early' = first candidate for its own service, 'later' = plausible, 'keep' = stays in monolith */
const modules = [
  {
    name: 'vendors', title: 'Vendor / Organization',
    responsibility: 'Tenant root. Vendor (merchant business) lifecycle, profile, status, plan assignment, tenant settings.',
    owns: ['vendors'], dependsOn: [], api: ['/api/v1/vendors', '/api/v1/vendor'],
    publishes: ['vendor.created', 'vendor.updated', 'vendor.suspended', 'vendor.reactivated'], consumes: ['billing.subscription_changed'],
    extraction: 'keep',
  },
  {
    name: 'identity', title: 'Identity & Access',
    responsibility: 'Authentication (password, tokens, refresh rotation, MFA later), roles, permissions, RBAC policy evaluation, API keys.',
    owns: ['roles', 'permissions', 'role_permissions', 'user_roles', 'refresh_tokens', 'user_tokens'], dependsOn: ['vendors'],
    api: ['/api/v1/auth', '/api/v1/me', '/api/v1/roles'],
    publishes: ['identity.login_succeeded', 'identity.login_failed', 'identity.role_changed', 'identity.session_revoked'], consumes: ['vendor.created', 'vendor.suspended'],
    extraction: 'later',
  },
  {
    name: 'users', title: 'User Management',
    responsibility: 'User profiles and membership of a vendor (or platform staff), invitations, activation/deactivation.',
    owns: ['users', 'invitations'], dependsOn: ['identity', 'vendors'], api: ['/api/v1/users', '/api/v1/invitations'],
    publishes: ['user.created', 'user.updated', 'user.deactivated', 'user.invited'], consumes: ['vendor.suspended'],
    extraction: 'keep',
  },
  {
    name: 'categories', title: 'Categories',
    responsibility: 'Vendor-internal category tree and mapping targets for marketplace category taxonomies.',
    owns: ['categories'], dependsOn: ['vendors'], api: ['/api/v1/categories'],
    publishes: ['category.created', 'category.updated', 'category.deleted'], consumes: [],
    extraction: 'keep',
  },
  {
    name: 'attributes', title: 'Attributes',
    responsibility: 'Attribute definitions/schemas (size, colour, material...) and per-category attribute requirements incl. marketplace-specific mappings.',
    owns: ['attribute_definitions', 'attribute_values', 'category_attributes', 'product_attribute_values'], dependsOn: ['categories'], api: ['/api/v1/attributes', '/api/v1/categories/:id/attributes'],
    publishes: ['attribute.updated'], consumes: ['category.deleted'],
    extraction: 'keep',
  },
  {
    name: 'catalog', title: 'Product Catalog',
    responsibility: 'Canonical product + variant/SKU master data. The single source of truth for what a vendor sells, independent of any marketplace.',
    owns: ['products', 'product_variants', 'product_marketplace_data', 'data_jobs'], dependsOn: ['vendors', 'categories', 'attributes'], api: ['/api/v1/products', '/api/v1/variants', '/api/v1/data-jobs'],
    publishes: ['product.created', 'product.updated', 'product.archived', 'variant.created', 'variant.updated', 'variant.price_changed'], consumes: ['category.deleted', 'document.processed'],
    extraction: 'later',
  },
  {
    name: 'documents', title: 'Documents & Media',
    responsibility: 'Product images/documents metadata, upload (pre-signed URLs), virus-scan/processing pipeline, object storage lifecycle.',
    owns: ['product_documents'], dependsOn: ['catalog'], api: ['/api/v1/documents', '/api/v1/products/:id/documents'],
    publishes: ['document.uploaded', 'document.processed', 'document.deleted'], consumes: ['product.archived'],
    extraction: 'later',
  },
  {
    name: 'warehouses', title: 'Warehouse',
    responsibility: 'Vendor fulfilment locations, addresses, default/priority routing and activation. Stock lives in inventory; a warehouse with stock cannot be removed.',
    owns: ['warehouses'], dependsOn: ['vendors'], api: ['/api/v1/warehouses'],
    publishes: ['warehouse.created', 'warehouse.updated', 'warehouse.deactivated'], consumes: [],
    extraction: 'keep',
  },
  {
    name: 'inventory', title: 'Inventory',
    responsibility: 'Stock per variant per warehouse (on hand / reserved / incoming / damaged / returned), the append-only movement ledger, reservations, adjustments, transfers and availability. Never changes a quantity without a movement.',
    owns: ['inventory', 'inventory_movements', 'inventory_reservations', 'stock_transfers', 'stock_transfer_items', 'vendor_counters'], dependsOn: ['catalog', 'warehouses'], api: ['/api/v1/inventory'],
    publishes: ['inventory.adjusted', 'inventory.reserved', 'inventory.released', 'inventory.low_stock', 'inventory.transferred'], consumes: [],
    extraction: 'early',
  },
  {
    name: 'marketplace-accounts', title: 'Marketplace Accounts',
    responsibility: 'A vendor\'s connection to a marketplace (seller account), authorization lifecycle, encrypted credential custody. Credentials never leave the backend.',
    owns: ['marketplace_accounts', 'marketplace_authorizations'], dependsOn: ['vendors'], api: ['/api/v1/marketplace-accounts'],
    publishes: ['marketplace_account.connected', 'marketplace_account.authorization_expired', 'marketplace_account.disconnected', 'marketplace_account.paused'], consumes: ['vendor.suspended'],
    extraction: 'later',
  },
  {
    name: 'marketplace-connectors', title: 'Marketplace Connectors',
    responsibility: 'Runtime hosting of connector implementations (Amazon IN, Flipkart, Myntra, Snapdeal) behind the capability-based MarketplaceConnector contract; rate limiting, retries, normalisation.',
    owns: [], dependsOn: ['marketplace-accounts'], api: ['/api/v1/marketplaces', '/api/v1/marketplace-accounts/:id/authorization-url', '/api/v1/marketplace-accounts/:id/authorize', '/api/v1/marketplace-accounts/:id/reconnect', '/api/v1/marketplace-accounts/:id/refresh', '/api/v1/marketplace-accounts/:id/health-check', '/api/v1/marketplace-accounts/:id/disconnect', '/api/v1/marketplace-accounts/:id/remote-products'],
    publishes: ['connector.rate_limited', 'connector.degraded'], consumes: [],
    extraction: 'early',
  },
  {
    name: 'listings', title: 'Listings & Channels',
    responsibility: 'Master product -> marketplace listing flow (category/attribute mapping, validation, preview, merchant approval, publish, status tracking), marketplace catalogue import, and channel inventory/price synchronisation (safety buffer, allocation, overselling protection).',
    owns: ['marketplace_listings', 'category_mappings', 'attribute_mappings', 'imported_products', 'channel_inventory_policies', 'channel_stock_updates'],
    dependsOn: ['catalog', 'marketplace-accounts', 'marketplace-connectors', 'inventory', 'sync', 'warehouses'],
    api: ['/api/v1/listings', '/api/v1/category-mappings', '/api/v1/attribute-mappings', '/api/v1/imported-products', '/api/v1/marketplace-accounts/:id/categories', '/api/v1/marketplace-accounts/:id/import-products', '/api/v1/marketplace-accounts/:id/inventory-policy', '/api/v1/marketplace-accounts/:id/inventory-sync', '/api/v1/marketplace-accounts/:id/refresh-listing-status'],
    publishes: ['listing.created', 'listing.approved', 'listing.submitted', 'listing.published', 'listing.failed', 'listing.deactivated', 'listing.status_changed'],
    consumes: ['inventory.adjusted', 'inventory.reserved', 'inventory.released', 'variant.price_changed', 'marketplace_account.disconnected', 'marketplace_account.connected'],
    extraction: 'later',
  },
  {
    name: 'pricing', title: 'Pricing',
    responsibility: 'Price lists, marketplace-specific pricing rules, margin guards, repricing proposals.',
    owns: ['price_rules (future)'], dependsOn: ['catalog', 'listings'], api: ['/api/v1/pricing'],
    publishes: ['pricing.rule_changed', 'pricing.price_proposed'], consumes: ['variant.updated', 'order.created'],
    extraction: 'later',
  },
  {
    name: 'orders', title: 'Orders',
    responsibility: 'Normalised order aggregate across marketplaces: idempotent import (unique per vendor + marketplace + marketplace order id), inventory reservation, status model + timeline, manual and marketplace-reported transitions, and outbound status sync (requested/sent/successful/failed/retrying).',
    owns: ['orders', 'order_items', 'order_status_events', 'order_status_updates'],
    dependsOn: ['catalog', 'marketplace-accounts', 'marketplace-connectors', 'inventory', 'listings', 'sync'],
    api: ['/api/v1/orders', '/api/v1/marketplace-accounts/:id/sync-orders'],
    publishes: ['order.created', 'order.updated', 'order.status_changed', 'order.cancelled', 'order.dispatched', 'order.delivered', 'order.returned', 'order.needs_attention'],
    consumes: ['inventory.adjusted', 'inventory.released'],
    extraction: 'early',
  },
  {
    name: 'fulfillment', title: 'Fulfillment',
    responsibility: 'Pick/pack workflow, allocation of order items to warehouses, packing and handover readiness.',
    owns: ['fulfillments (future)'], dependsOn: ['orders', 'warehouses', 'inventory'], api: ['/api/v1/fulfillments'],
    publishes: ['fulfillment.allocated', 'fulfillment.packed'], consumes: ['order.created', 'order.cancelled'],
    extraction: 'later',
  },
  {
    name: 'shipping', title: 'Shipping',
    responsibility: 'Carrier integrations, labels, manifests, tracking and delivery status.',
    owns: ['shipments (future)'], dependsOn: ['fulfillment'], api: ['/api/v1/shipments'],
    publishes: ['shipment.created', 'shipment.in_transit', 'shipment.delivered', 'shipment.failed'], consumes: ['fulfillment.packed'],
    extraction: 'later',
  },
  {
    name: 'returns', title: 'Returns',
    responsibility: 'Return/RTO/refund lifecycle, QC outcomes, restock decisions.',
    owns: ['returns (future)'], dependsOn: ['orders', 'inventory'], api: ['/api/v1/returns'],
    publishes: ['return.created', 'return.received', 'return.completed'], consumes: ['order.delivered', 'shipment.failed'],
    extraction: 'later',
  },
  {
    name: 'notifications', title: 'Notifications',
    responsibility: 'In-app/email/SMS/webhook-out notifications, templates, preferences, delivery tracking.',
    owns: ['notifications (future)'], dependsOn: ['users'], api: ['/api/v1/notifications'],
    publishes: ['notification.sent', 'notification.failed'], consumes: ['inventory.low_stock', 'marketplace_account.authorization_expired', 'sync.failed', 'user.invited'],
    extraction: 'early',
  },
  {
    name: 'jobs', title: 'Jobs',
    responsibility: 'Background job platform: queue definitions, retry/backoff policy, dead-letter handling, job visibility API for operators.',
    owns: [], dependsOn: [], api: ['/api/v1/jobs'],
    publishes: ['job.failed', 'job.dead_lettered'], consumes: [],
    extraction: 'keep',
  },
  {
    name: 'sync', title: 'Synchronization',
    responsibility: 'Async sync job engine: durable job rows (API -> job -> queue -> worker -> connector -> marketplace -> normalise -> DB -> sync log), idempotent enqueue, retries with exponential backoff, dead-lettering, progress, failure details, manual retry. Domain modules own their runners; this module owns the engine, history and scheduling.',
    owns: ['sync_jobs', 'sync_logs'], dependsOn: ['marketplace-accounts', 'marketplace-connectors', 'jobs'], api: ['/api/v1/sync'],
    publishes: ['sync.started', 'sync.completed', 'sync.failed', 'sync.dead_lettered'], consumes: [],
    extraction: 'early',
  },
  {
    name: 'webhooks', title: 'Webhooks',
    responsibility: 'Inbound marketplace webhooks: raw-body receipt, per-account signature verification, idempotent persistence (duplicate deliveries dropped), fast ack, async processing with retry and dead-lettering; webhook secret management.',
    owns: ['webhook_events'], dependsOn: ['marketplace-accounts', 'marketplace-connectors', 'jobs', 'sync', 'orders', 'listings'], api: ['/api/v1/webhooks', '/api/v1/marketplace-accounts/:id/webhook-secret', '/api/v1/marketplace-accounts/:id/webhook-config'],
    publishes: ['webhook.received', 'webhook.rejected', 'webhook.dead_lettered'], consumes: [],
    extraction: 'early',
  },
  {
    name: 'reports', title: 'Reports',
    responsibility: 'Operational reports and exports (async generation, stored in object storage). Reads from read-optimised views.',
    owns: ['report_runs (future)'], dependsOn: ['orders', 'inventory', 'catalog'], api: ['/api/v1/reports'],
    publishes: ['report.generated'], consumes: [],
    extraction: 'later',
  },
  {
    name: 'analytics', title: 'Analytics',
    responsibility: 'Aggregated metrics/read models (sales, margin, stock-out) fed from domain events; dashboards.',
    owns: ['analytics_* (future read models)'], dependsOn: ['orders', 'inventory', 'listings'], api: ['/api/v1/analytics'],
    publishes: [], consumes: ['order.created', 'order.updated', 'inventory.adjusted', 'listing.published'],
    extraction: 'early',
  },
  {
    name: 'billing', title: 'Billing',
    responsibility: 'Plans, subscriptions, usage metering, invoices, payment-provider integration.',
    owns: ['plans (future)', 'subscriptions (future)', 'invoices (future)'], dependsOn: ['vendors'], api: ['/api/v1/billing'],
    publishes: ['billing.subscription_changed', 'billing.payment_failed'], consumes: ['vendor.created', 'order.created'],
    extraction: 'later',
  },
  {
    name: 'ai', title: 'AI',
    responsibility: 'AI-assisted features (listing content generation, category prediction, anomaly detection) behind a provider-agnostic gateway with per-vendor quotas and audit.',
    owns: ['ai_runs (future)'], dependsOn: ['catalog', 'listings', 'orders'], api: ['/api/v1/ai'],
    publishes: ['ai.suggestion_created'], consumes: ['product.created'],
    extraction: 'early',
  },
  {
    name: 'automation', title: 'Automation',
    responsibility: 'Vendor-defined rules (trigger -> condition -> action), e.g. auto-pause listing on zero stock; consumes events, emits commands.',
    owns: ['automation_rules (future)'], dependsOn: ['jobs'], api: ['/api/v1/automation'],
    publishes: ['automation.rule_fired'], consumes: ['inventory.low_stock', 'order.created', 'listing.failed'],
    extraction: 'later',
  },
  {
    name: 'audit', title: 'Audit',
    responsibility: 'Append-only audit trail of security- and business-relevant actions; query API for vendors and platform staff.',
    owns: ['audit_logs'], dependsOn: [], api: ['/api/v1/audit-logs'],
    publishes: [], consumes: ['*'],
    extraction: 'early',
  },
  {
    name: 'platform-admin', title: 'Platform Admin',
    responsibility: 'Cross-tenant operations for platform staff: vendor support, impersonation (audited), feature flags, system health, global connector config.',
    owns: ['feature_flags (future)'], dependsOn: ['vendors', 'users', 'billing'], api: ['/api/v1/admin'],
    publishes: ['admin.impersonation_started'], consumes: [],
    extraction: 'keep',
  },
];

const write = (path, content) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
};
const q = (s) => JSON.stringify(s);
const arr = (a) => `[${a.map(q).join(', ')}]`;

for (const m of modules) {
  const dir = join(root, 'modules', m.name);
  const pkgName = `@oms/mod-${m.name}`;
  const pkgPath = join(dir, 'package.json');
  const previous = existsSync(pkgPath) ? JSON.parse(readFileSync(pkgPath, 'utf8')).dependencies ?? {} : {};
  const kept = Object.fromEntries(Object.entries(previous).filter(([k]) => !k.startsWith('@oms/mod-')));
  const deps = { ...kept, '@oms/module-kit': 'workspace:*', ...Object.fromEntries(m.dependsOn.map((d) => [`@oms/mod-${d}`, 'workspace:*'])) };
  write(join(dir, 'package.json'), JSON.stringify({
    name: pkgName, version: '0.1.0', private: true, type: 'module',
    exports: { '.': './src/index.ts' },
    scripts: { typecheck: 'tsc -p tsconfig.json --noEmit' },
    dependencies: deps,
  }, null, 2) + '\n');
  write(join(dir, 'tsconfig.json'), JSON.stringify({ extends: '../../tsconfig.base.json', include: ['src'] }, null, 2) + '\n');
  write(join(dir, 'src', 'manifest.ts'),
`import { defineModule } from '@oms/module-kit';

/** GENERATED by scripts/scaffold-modules.mjs - edit the script's module map, not this file. */
export const manifest = defineModule({
  name: ${q(m.name)},
  title: ${q(m.title)},
  responsibility: ${q(m.responsibility)},
  owns: ${arr(m.owns)},
  dependsOn: ${arr(m.dependsOn)},
  api: ${arr(m.api)},
  publishes: ${arr(m.publishes)},
  consumes: ${arr(m.consumes)},
  extraction: ${q(m.extraction)},
});
`);
  // index.ts is hand-owned after first generation (modules add routes/services there).
  const idx = join(dir, 'src', 'index.ts');
  if (!existsSync(idx)) {
    write(idx,
`import { manifest } from './manifest';

export { manifest };

/**
 * Public surface of the ${m.title} module.
 * Other modules may import ONLY from this entry point (enforced by ESLint + scripts/check-modules.ts).
 *
 * Layering inside the module (dependencies point downward only):
 *   http/            Fastify routes + zod schemas (OpenAPI source). Calls application services.
 *   application/     Use-cases / services. Transaction + tenant-context aware. Emits events via outbox.
 *   domain/          Entities, value objects, policies, state machines. Pure, no I/O.
 *   infrastructure/  Repositories (tenant-scoped), external clients.
 */
export const ${m.name.replace(/-([a-z])/g, (_, c) => c.toUpperCase())}Module = { manifest };
`);
  }
  for (const layer of ['domain', 'application', 'infrastructure', 'http']) {
    const keep = join(dir, 'src', layer, '.gitkeep');
    if (!existsSync(keep)) write(keep, '');
  }
}

// ---- registry package -------------------------------------------------------
const reg = join(root, 'modules', 'registry');
write(join(reg, 'package.json'), JSON.stringify({
  name: '@oms/modules-registry', version: '0.1.0', private: true, type: 'module',
  exports: { '.': './src/index.ts' },
  scripts: { typecheck: 'tsc -p tsconfig.json --noEmit' },
  dependencies: { '@oms/module-kit': 'workspace:*', ...Object.fromEntries(modules.map((m) => [`@oms/mod-${m.name}`, 'workspace:*'])) },
}, null, 2) + '\n');
write(join(reg, 'tsconfig.json'), JSON.stringify({ extends: '../../tsconfig.base.json', include: ['src'] }, null, 2) + '\n');
const ident = (n) => n.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
write(join(reg, 'src', 'index.ts'),
`import type { ModuleDefinition } from '@oms/module-kit';
${modules.map((m) => `import { ${ident(m.name)}Module } from '@oms/mod-${m.name}';`).join('\n')}

/** GENERATED by scripts/scaffold-modules.mjs. Apps load modules from here; nothing else imports every module. */
export const allModules: ModuleDefinition[] = [
${modules.map((m) => `  ${ident(m.name)}Module,`).join('\n')}
];
`);

// ---- docs -------------------------------------------------------------------
const md = [];
md.push('# Domain Module Map\n');
md.push('> GENERATED by `pnpm scaffold:modules` from `scripts/scaffold-modules.mjs`. Edit the script, not this file.\n');
md.push('Modules live in `modules/<name>` as workspace packages `@oms/mod-<name>`. A module may import another module **only** through its package entry point and **only** if listed in `dependsOn`; `pnpm check:modules` verifies the declared graph is acyclic and that manifests match `package.json` dependencies. Everything else is communicated through domain events (outbox, see ARCHITECTURE.md §6).\n');
md.push('## Summary\n');
md.push('| Module | Owns (tables) | Depends on | Extraction |');
md.push('|---|---|---|---|');
for (const m of modules) md.push(`| **${m.title}** (\`${m.name}\`) | ${m.owns.map((o) => `\`${o}\``).join(', ') || '-'} | ${m.dependsOn.map((d) => `\`${d}\``).join(', ') || '-'} | ${m.extraction} |`);
md.push('\n## Details\n');
for (const m of modules) {
  md.push(`### ${m.title} — \`${m.name}\`\n`);
  md.push(`**Responsibility:** ${m.responsibility}\n`);
  md.push(`- **Owns data:** ${m.owns.map((o) => `\`${o}\``).join(', ') || 'none'}`);
  md.push(`- **API prefixes:** ${m.api.map((o) => `\`${o}\``).join(', ')}`);
  md.push(`- **Depends on (sync calls):** ${m.dependsOn.map((d) => `\`${d}\``).join(', ') || 'none'}`);
  md.push(`- **Publishes events:** ${m.publishes.map((o) => `\`${o}\``).join(', ') || 'none'}`);
  md.push(`- **Consumes events:** ${m.consumes.map((o) => `\`${o}\``).join(', ') || 'none'}`);
  md.push(`- **Microservice extraction:** ${m.extraction}\n`);
}
write(join(root, 'docs', 'architecture', 'MODULES.md'), md.join('\n') + '\n');
console.log(`Scaffolded ${modules.length} modules.`);
