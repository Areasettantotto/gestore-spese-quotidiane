-- =============================================================================
-- BILLING-72 — Tenant complimentary access invite artifact (additive)
-- =============================================================================
-- Additive on top of 000_baseline_current_schema.sql,
-- 007_billing_subscription_sync_concurrency.sql,
-- 008_tenant_subscriptions_product_tier.sql, and
-- 009_tenant_complimentary_access_grant.sql.
--
-- Introduces:
--   public.tenant_complimentary_access_invites
--   One-time bearer invite artifact to apply a current complimentary grant
--   (009) to an EXISTING tenant. CASO A: existing tenant grant invite.
--
-- This table is not a Stripe subscription, not membership, not onboarding,
-- and not the current complimentary grant (009). Writes and reads of the
-- raw invite are server-side only (postgres / service_role). No browser policies.
--
-- Explicitly out of scope:
--   token generation/hash algorithm, expiry duration, create/redeem runtime,
--   RPC/trigger into 009, membership, tenant creation, Edge Function, email, UI.
-- =============================================================================

create table public.tenant_complimentary_access_invites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  product_tier text not null,
  token_hash text not null,
  issued_by uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  redeemed_at timestamptz null,
  revoked_at timestamptz null,
  constraint tenant_complimentary_access_invites_product_tier_check
    check (product_tier in ('base', 'pro')),
  constraint tenant_complimentary_access_invites_token_hash_unique
    unique (token_hash),
  constraint tenant_complimentary_access_invites_expires_after_created_check
    check (expires_at > created_at),
  constraint tenant_complimentary_access_invites_not_redeemed_and_revoked_check
    check (redeemed_at is null or revoked_at is null)
);

comment on table public.tenant_complimentary_access_invites is
  'One-time tenant-scoped complimentary invite artifact (Base or Pro). Pins an existing tenant at create time. Distinct from public.tenant_complimentary_access_grants (current grant) and public.tenant_subscriptions (Stripe). Raw bearer token is never stored. Not membership, onboarding, or payment.';

comment on column public.tenant_complimentary_access_invites.id is
  'Invite artifact identity.';

comment on column public.tenant_complimentary_access_invites.tenant_id is
  'Existing workspace pinned at invite creation. Does not create a tenant.';

comment on column public.tenant_complimentary_access_invites.product_tier is
  'Complimentary commercial ProductTier (base|pro) to apply on redemption. Not a Stripe subscription field.';

comment on column public.tenant_complimentary_access_invites.token_hash is
  'Lookup key for the one-time bearer token. Stores a hash only; algorithm and encoding are decided at runtime. Raw token is never persisted.';

comment on column public.tenant_complimentary_access_invites.issued_by is
  'Supabase Auth user UUID of the product operator who created the invite. Audit metadata only; not granting authority on redemption. No FK to auth.users: cascade/set null/restrict deletion semantics are not a supported fit for this NOT NULL audit field.';

comment on column public.tenant_complimentary_access_invites.created_at is
  'When this invite artifact was recorded.';

comment on column public.tenant_complimentary_access_invites.expires_at is
  'When this invite stops being redeemable. Concrete duration is a runtime concern; no schema default interval.';

comment on column public.tenant_complimentary_access_invites.redeemed_at is
  'One-time redemption marker. NULL until redeemed. Mutually exclusive with revoked_at.';

comment on column public.tenant_complimentary_access_invites.revoked_at is
  'Pre-redemption revocation marker. NULL until revoked. Mutually exclusive with redeemed_at.';

create index idx_tenant_complimentary_access_invites_tenant_id
  on public.tenant_complimentary_access_invites (tenant_id);

alter table public.tenant_complimentary_access_invites enable row level security;

revoke all on table public.tenant_complimentary_access_invites from anon;
revoke all on table public.tenant_complimentary_access_invites from authenticated;

grant all privileges on table public.tenant_complimentary_access_invites to postgres;
grant all privileges on table public.tenant_complimentary_access_invites to service_role;
