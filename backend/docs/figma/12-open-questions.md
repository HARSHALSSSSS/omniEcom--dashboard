# Open questions (answers needed before building)

Each question lists **why it matters**, my **proposed default** (what I will build if nobody answers), and who probably knows (designer / product owner / you).
Mark the answer next to the question; unanswered ones use the default.

## A. Product and business rules
**Q1. Business switcher: can one user belong to several businesses?** (header shows "Nova Living v")
Matters: today one user = one business; supporting several needs memberships and a token per business.
Default: build the endpoints (`/me/businesses`, `/auth/switch-business`) but ship with one business per user; add memberships later.

**Q2. Dispatch SLA: how is the deadline decided?**
Matters: orders at risk, SLA pressure, the whole issues queue and the dashboard depend on it.
Options: (a) per marketplace handling time (Amazon 24 h, Flipkart 48 h ...), (b) warehouse cut-off time (e.g. orders before 2 PM ship same day), (c) a mix. The design shows "Today . 3:30 PM" and bands safe > 4 h / approaching 90 min-4 h / at risk < 90 min / breached.
Default: per-channel handling hours + warehouse cut-off, editable in settings; bands exactly as in the design.

**Q3. Replenishment lead time: where does it come from?**
Matters: "Stock Horizon", stockout risk and the AI advisory ("10d lead", "8 day lead") need it.
Options: per product, per variant, per supplier (Procurement section), or one default.
Default: `lead_time_days` on the variant, falling back to a business default of 7 days; supplier lead time later when Procurement is built.

**Q4. Issue priorities, due times and snooze limits.**
Matters: the queue order and what "Critical" means.
Default: as in the Part A table (dispatch risk = critical, low stock = high, incomplete listings = high, sync failure = medium, returns waiting = medium). Snooze: critical issues can only be snoozed to the next business day; others up to 7 days; snoozed issues return automatically.

**Q5. Shipping: how is a method "verified", and what is "awaiting first scan" / "delivery delayed"?**
Matters: the design shows "Requires configuration / capability verification" everywhere and tracking states beyond the carrier's raw statuses.
Default: a method is *verified* when its connector/provider declares the capability AND a successful test call (label or tracking) has been recorded; `awaiting_first_scan` = dispatched with no scan after 12 h; `delivery_delayed` = past the estimated delivery date.

**Q6. Products counters: what is "Active 1,042" when there are 427 products?**
It looks like active **variants**, but the label says Active next to Products/Variants/Draft. Default: return `activeProducts` and `activeVariants`; the UI picks which to show.

**Q7. Returns: where does stock go for Quarantine and Repair?**
Default: `quarantined` bucket (also holds repair with reason `repair`); not sellable, not counted as available, shown in the stock pulse as Quarantined.

**Q8. Excel import.** The menu says "CSV / Excel import". The API reads CSV only. Default: the frontend converts .xlsx to CSV before upload (no server-side Excel parsing now).

## B. Data and scale
**Q9. Page numbers vs cursors.** Designs show "Page 1 of 4" and "Showing 1-4 of 60". Default: offset pagination (`page`, `pageSize`, `total`) for these workspace lists with a 10,000-row cap; keyset cursors stay for feeds and very large tables.

**Q10. Currency.** Dashboard and orders use INR; the returns screens show USD refunds ("from connector"). Default: every amount is minor units + the order/refund currency; the dashboard totals convert nothing and show the business currency only (multi-currency totals are out of scope).

**Q11. "Last N days / period" for comparisons.** Dashboard "vs previous period" - previous equal-length period (default) or same period last year?

**Q12. Real-time.** "Live inventory", "Updated 2 min ago", "Last sync 18 sec ago". Default: polling every 30-60 s for counters and the issues badge (ETag/`updatedAt`), SSE/WebSocket later if needed.

## C. Channels and integrations
**Q13. Meesho and Shopify** appear as live channels in the dashboard, inventory, shipping and returns designs (and "Create Return: Shopify connection only"), but are "coming soon" in the API (no connectors). Which should be built first, and is a **simulator** acceptable like the other marketplaces?
Default: add simulator-backed connectors for Shopify first (needed for Create Return), then Meesho; contracts stay channel-neutral.

**Q14. Marketplace shipping / seller shipping / third-party provider** - which real carriers or aggregators are in scope (Shiprocket, Delhivery, Shopify shipping, Flipkart Ekart)? Default: provider-neutral interface + sandbox courier (as built); no real carrier until named.

**Q15. Refund execution.** "Connector-supported refund": should the platform ever **issue** a refund through the marketplace, or only **record/track** what the marketplace did? Default: track the marketplace refund status and amounts (read-only) plus a manual "mark refunded" with a reference; no money movement.

## D. UX details the API must support
**Q16. Customer data.** Shown only when the channel provides it (name, email, city). Retention / masking rules (PII)? Default: store what the channel sends, mask email in lists, full only in the detail drawer for roles with `orders:read`.

**Q17. Saved views visibility.** "Available in this workspace" = shared with all users of the business? Default: private by default, `shared` flag publishes to the business.

**Q18. Bulk limits.** Max rows per bulk action (design shows "All matching" selection). Default: ids mode max 500; all-matching runs as a background job with progress and a per-row result file.

**Q19. Who can do what.** Needs-attention actions, shipping rules, disposition confirmation, refunds: which roles? Default: owner/admin everything; staff can resolve/snooze issues, inspect, adjust stock, confirm shipping, but not create rules or confirm refunds.

**Q20. Notifications.** Should an issue (critical) create a notification and email? Default: yes for critical and new `refund_failed` / `sync failing > 60 min`, through the existing notifications module and user preferences.

## E. Not covered by this section (will need their own pass)
Listings / Marketplace Hub / connection setup, Create / Edit product and bulk import, Pricing, Promotions, Procurement (lead times, suppliers, purchase orders), Reports, Product Intelligence, AI Assistant, Automation, Profitability, Fulfillment workspace, Settings (business, regional, general).
