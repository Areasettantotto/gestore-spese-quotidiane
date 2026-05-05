-- Migration 006: Billing data model (tenant-first, schema only)
--
-- Creates billing domain tables and conservative access controls.
-- This migration does NOT integrate Stripe SDK/API, checkout, webhook handlers,
-- Edge Functions, or Node backend flows.
--
-- Scope guards:
-- - Does NOT modify public.expenses or expenses RLS.
-- - Does NOT remove public.expenses_orphan_archive_002.
-- - Does NOT touch private.backup_* tables.
-- - Does NOT introduce secrets or service_role usage in frontend runtime.
--
-- Alignment docs:
-- - docs/billing-data-model.md
-- - supabase/snippets/drafts/draft_006_billing_data_model.sql (historical draft)

-- -----------------------------------------------------------------------------
-- 1) public.tenant_billing_customers
-- Maps tenant ↔ provider customer (currently provider check allows only stripe).
-- -----------------------------------------------------------------------------
create table if not exists public.tenant_billing_customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  provider text not null,
  provider_customer_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_billing_customers_provider_customer_unique
    unique (provider, provider_customer_id),
  constraint tenant_billing_customers_tenant_provider_unique
    unique (tenant_id, provider),
  constraint tenant_billing_customers_provider_check
    check (provider in ('stripe'))
);

create index if not exists idx_tenant_billing_customers_tenant_id
  on public.tenant_billing_customers (tenant_id);

comment on table public.tenant_billing_customers is
  'Mapping provider customer → tenant. One row per (tenant, provider). Writes must be server-side only (Edge Function / webhook with privileged DB role), never from anon/authenticated client.';

comment on column public.tenant_billing_customers.tenant_id is
  'Tenant (workspace) owning the billing relationship; anchor for RLS and domain invariants.';

comment on column public.tenant_billing_customers.provider is
  'Billing provider id (migration restricts to stripe; extend via migration when multi-provider is required).';

comment on column public.tenant_billing_customers.provider_customer_id is
  'Opaque customer id from the provider; unique per provider across all tenants for idempotent linkage.';

comment on column public.tenant_billing_customers.created_at is 'Row creation time.';
comment on column public.tenant_billing_customers.updated_at is
  'Last update time; application or a future shared trigger may refresh it. No project-wide updated_at trigger pattern exists yet.';

-- -----------------------------------------------------------------------------
-- 2) public.tenant_subscriptions
-- Application-side subscription detail; denormalized snapshot stays on tenants.
-- -----------------------------------------------------------------------------
create table if not exists public.tenant_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  provider text not null,
  provider_subscription_id text not null,
  provider_customer_id text null,
  plan_code text not null,
  status text not null,
  current_period_start timestamptz null,
  current_period_end timestamptz null,
  cancel_at_period_end boolean not null default false,
  trial_ends_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_subscriptions_provider_subscription_unique
    unique (provider, provider_subscription_id),
  constraint tenant_subscriptions_provider_check
    check (provider in ('stripe')),
  constraint tenant_subscriptions_plan_code_check
    check (plan_code in ('free', 'trial', 'paid', 'internal', 'demo')),
  constraint tenant_subscriptions_status_check
    check (
      status in (
        'active',
        'trialing',
        'past_due',
        'canceled',
        'unpaid',
        'incomplete',
        'incomplete_expired',
        'paused',
        'suspended',
        'unknown'
      )
    )
);

create index if not exists idx_tenant_subscriptions_tenant_id
  on public.tenant_subscriptions (tenant_id);

create index if not exists idx_tenant_subscriptions_provider_customer_id
  on public.tenant_subscriptions (provider_customer_id)
  where provider_customer_id is not null;

comment on table public.tenant_subscriptions is
  'Per-tenant subscription state from provider. Multiple rows per (tenant_id, provider) are allowed for history/transitions. Current commercial snapshot stays on public.tenants; this table stores detail. No direct client writes.';

comment on column public.tenant_subscriptions.tenant_id is
  'Owning workspace; subscription is tenant-scoped, not per-user.';

comment on column public.tenant_subscriptions.provider is
  'Billing provider (migration: stripe only).';

comment on column public.tenant_subscriptions.provider_subscription_id is
  'Provider subscription id; unique with provider for idempotent upserts.';

comment on column public.tenant_subscriptions.provider_customer_id is
  'Optional denormalized provider customer id for diagnostics or joins to tenant_billing_customers.';

comment on column public.tenant_subscriptions.plan_code is
  'Product tier vocabulary aligned with public.tenants.plan_code (free, trial, paid, internal, demo).';

comment on column public.tenant_subscriptions.status is
  'Lifecycle state set (Stripe-like plus suspended/unknown for mapping/versioning); revise via migration if provider adds states.';

comment on column public.tenant_subscriptions.metadata is
  'Non-sensitive operational keys only; no secrets. Minimize PII.';

comment on column public.tenant_subscriptions.cancel_at_period_end is
  'True if subscription remains active until current period end then cancels.';

comment on column public.tenant_subscriptions.trial_ends_at is
  'Trial end from provider or mapped rules; keep in sync with tenants.trial_ends_at when snapshot is updated server-side.';

-- -----------------------------------------------------------------------------
-- 3) public.billing_events
-- Provider events for idempotency/audit-debug; payload is server-side only.
-- -----------------------------------------------------------------------------
create table if not exists public.billing_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  tenant_id uuid null references public.tenants (id) on delete set null,
  processed_at timestamptz null,
  payload jsonb not null,
  processing_error text null,
  created_at timestamptz not null default now(),
  constraint billing_events_provider_event_unique
    unique (provider, provider_event_id),
  constraint billing_events_provider_check
    check (provider in ('stripe'))
);

create index if not exists idx_billing_events_tenant_id
  on public.billing_events (tenant_id);

create index if not exists idx_billing_events_event_type
  on public.billing_events (event_type);

create index if not exists idx_billing_events_processed_at
  on public.billing_events (processed_at);

comment on table public.billing_events is
  'Inbound provider events for idempotency, audit-lite, and debugging. Server-side only: no client SELECT for authenticated; payload is never exposed to frontend. Writes are server-side only via privileged paths.';

comment on column public.billing_events.provider is
  'Billing provider that emitted the event; check currently restricts to stripe.';

comment on column public.billing_events.provider_event_id is
  'Natural id for idempotency (e.g. Stripe evt_...); duplicate deliveries must not double-apply side effects.';

comment on column public.billing_events.event_type is
  'Provider event type string (e.g. customer.subscription.updated).';

comment on column public.billing_events.tenant_id is
  'Resolved tenant when known; null until correlated; ON DELETE SET NULL preserves event history.';

comment on column public.billing_events.processed_at is
  'Set when handler completed successfully; null while pending or failed.';

comment on column public.billing_events.payload is
  'Raw or normalized JSON body; may contain PII and is server-side only.';

comment on column public.billing_events.processing_error is
  'Last non-fatal error or short diagnostic; not a full stack trace store.';

-- -----------------------------------------------------------------------------
-- 4) Row Level Security (conservative)
-- - RLS ON for all billing tables.
-- - tenant_billing_customers / tenant_subscriptions: SELECT only for
--   authenticated tenant members with admin or billing role.
-- - billing_events: no SELECT policy for authenticated (server-side only).
-- - no INSERT / UPDATE / DELETE policies for authenticated on any billing table.
-- -----------------------------------------------------------------------------
alter table public.tenant_billing_customers enable row level security;
alter table public.tenant_subscriptions enable row level security;
alter table public.billing_events enable row level security;

drop policy if exists tenant_billing_customers_select_admin_billing
  on public.tenant_billing_customers;
create policy tenant_billing_customers_select_admin_billing
  on public.tenant_billing_customers
  for select
  using (
    public.has_tenant_role(
      tenant_billing_customers.tenant_id,
      array['admin', 'billing']::text[]
    )
  );

drop policy if exists tenant_subscriptions_select_admin_billing
  on public.tenant_subscriptions;
create policy tenant_subscriptions_select_admin_billing
  on public.tenant_subscriptions
  for select
  using (
    public.has_tenant_role(
      tenant_subscriptions.tenant_id,
      array['admin', 'billing']::text[]
    )
  );

-- Ensure billing_events stays non-readable from authenticated clients.
drop policy if exists billing_events_select_admin_billing
  on public.billing_events;

-- -----------------------------------------------------------------------------
-- 5) Table privileges (REVOKE / GRANT) — conservative complement to RLS
-- - anon: no access
-- - authenticated: SELECT only on customers/subscriptions, then row-filtered by RLS
-- - authenticated: no access to billing_events
-- - no client INSERT/UPDATE/DELETE grants on billing tables
-- -----------------------------------------------------------------------------
revoke all on table public.tenant_billing_customers from anon;
revoke all on table public.tenant_billing_customers from authenticated;
grant select on table public.tenant_billing_customers to authenticated;

revoke all on table public.tenant_subscriptions from anon;
revoke all on table public.tenant_subscriptions from authenticated;
grant select on table public.tenant_subscriptions to authenticated;

revoke all on table public.billing_events from anon;
revoke all on table public.billing_events from authenticated;

-- -----------------------------------------------------------------------------
-- 6) updated_at auto-refresh
-- No shared set_updated_at() trigger pattern exists in this project yet.
-- Keep updated_at managed explicitly in future server-side billing handlers/jobs.
-- -----------------------------------------------------------------------------
