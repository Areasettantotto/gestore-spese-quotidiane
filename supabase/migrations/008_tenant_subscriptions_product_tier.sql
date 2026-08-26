-- =============================================================================
-- BILLING-56 — ProductTier schema on public.tenant_subscriptions (additive)
-- =============================================================================
-- Additive on top of 000_baseline_current_schema.sql and
-- 007_billing_subscription_sync_concurrency.sql.
--
-- Introduces:
--   public.tenant_subscriptions.product_tier (text, nullable, no default)
--   CHECK tenant_subscriptions_product_tier_check: base | pro when not NULL
--
-- Explicitly out of scope:
--   backfill, plan_code, public.tenants, interval, CommercialAccessSource,
--   RLS/GRANT/trigger, webhook wiring, Snapshot H2.
-- =============================================================================

alter table public.tenant_subscriptions
  add column product_tier text null;

alter table public.tenant_subscriptions
  add constraint tenant_subscriptions_product_tier_check
    check (product_tier in ('base', 'pro'));

comment on column public.tenant_subscriptions.product_tier is
  'Stripe commercial ProductTier (base|pro). Distinct from legacy plan_code. NULL = unclassified / not applicable; not Base and not Pro.';
