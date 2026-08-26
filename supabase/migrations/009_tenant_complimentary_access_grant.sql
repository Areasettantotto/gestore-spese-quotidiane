-- =============================================================================
-- Tenant complimentary access grant (additive)
-- =============================================================================
-- Additive on top of 000_baseline_current_schema.sql,
-- 007_billing_subscription_sync_concurrency.sql, and
-- 008_tenant_subscriptions_product_tier.sql.
--
-- Introduces:
--   public.tenant_complimentary_access_grants
--   One current complimentary commercial candidate per tenant (Base or Pro).
--
-- This table is not a Stripe subscription, not membership, and not an invite.
-- Writes and reads of the raw grant are server-side only
-- (postgres / service_role). No browser policies.
--
-- Explicitly out of scope:
--   invite, token, acceptance, membership write, Edge Function, email, UI,
--   runtime adapter, billing_state_revision trigger, backfill.
-- =============================================================================

create table public.tenant_complimentary_access_grants (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  product_tier text not null,
  granted_at timestamptz not null default now(),
  constraint tenant_complimentary_access_grants_product_tier_check
    check (product_tier in ('base', 'pro'))
);

comment on table public.tenant_complimentary_access_grants is
  'Current tenant-scoped complimentary commercial candidate (Base or Pro). Distinct from public.tenant_subscriptions (Stripe). At most one row per tenant. Not membership, invite, payment, or per-user entitlement.';

comment on column public.tenant_complimentary_access_grants.tenant_id is
  'Owning workspace. Primary key: one current complimentary grant per tenant.';

comment on column public.tenant_complimentary_access_grants.product_tier is
  'Complimentary commercial ProductTier (base|pro). Not a Stripe subscription field.';

comment on column public.tenant_complimentary_access_grants.granted_at is
  'When this current complimentary grant was recorded.';

alter table public.tenant_complimentary_access_grants enable row level security;

revoke all on table public.tenant_complimentary_access_grants from anon;
revoke all on table public.tenant_complimentary_access_grants from authenticated;

grant all privileges on table public.tenant_complimentary_access_grants to postgres;
grant all privileges on table public.tenant_complimentary_access_grants to service_role;
