-- Migration 005: Tenant plan / subscription readiness (no billing provider).
--
-- Adds lightweight columns on public.tenants for future SaaS billing and
-- operational flags (demo workspace, trial end). Plan and subscription state
-- belong to the tenant, not the user.
--
-- Does not modify public.expenses, RLS on expenses, or orphan/archive tables.
-- New inserts into tenants (e.g. handle_new_user) pick up column defaults.
-- Idempotent where practical (IF NOT EXISTS columns; named constraints guarded).

-- ---------------------------------------------------------------------------
-- 1) Columns (defaults backfill existing rows on first add)
-- ---------------------------------------------------------------------------

alter table public.tenants
  add column if not exists plan_code text not null default 'free',
  add column if not exists subscription_status text not null default 'active',
  add column if not exists is_demo boolean not null default false,
  add column if not exists trial_ends_at timestamptz null;

-- ---------------------------------------------------------------------------
-- 2) Check constraints (guard named constraints for re-run)
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tenants_plan_code_check'
  ) then
    alter table public.tenants
      add constraint tenants_plan_code_check
      check (plan_code in ('free', 'trial', 'paid', 'internal', 'demo'));
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tenants_subscription_status_check'
  ) then
    alter table public.tenants
      add constraint tenants_subscription_status_check
      check (
        subscription_status in (
          'active',
          'trialing',
          'past_due',
          'canceled',
          'suspended'
        )
      );
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 3) Documentation (DB comments)
-- ---------------------------------------------------------------------------

comment on column public.tenants.plan_code is
  'Commercial / product tier for the workspace: free, trial, paid, internal, demo. Billing provider not wired yet.';

comment on column public.tenants.subscription_status is
  'Lifecycle mirror for a future subscription record: active, trialing, past_due, canceled, suspended.';

comment on column public.tenants.is_demo is
  'True for presentation / sandbox tenants; pair with plan_code demo where useful.';

comment on column public.tenants.trial_ends_at is
  'Optional trial end timestamp; null when not on trial or not applicable.';

-- End of migration 005
