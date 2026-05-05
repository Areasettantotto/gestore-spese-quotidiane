-- =============================================================================
-- MANUAL RUNBOOK ONLY — not a migration. Do not commit real UUIDs.
-- Purpose: verify demo tenant metadata, ownership hints, and expense hygiene.
-- Role: run in Supabase SQL Editor (or equivalent) with a role that can read
--       public.tenants, public.expenses, public.profiles, public.tenant_memberships,
--       and auth.users for email display.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A) Tenants explicitly marked as demo workspaces
-- -----------------------------------------------------------------------------
select
  t.id as tenant_id,
  t.name,
  t.plan_code,
  t.subscription_status,
  t.is_demo,
  t.trial_ends_at,
  t.is_personal,
  t.created_by
from public.tenants t
where t.is_demo = true
order by t.created_at;

-- -----------------------------------------------------------------------------
-- B) Same list with creator email (auth.users) when created_by is set
-- -----------------------------------------------------------------------------
select
  t.id as tenant_id,
  t.name,
  t.plan_code,
  t.subscription_status,
  t.is_demo,
  au.email as created_by_email
from public.tenants t
left join auth.users au on au.id = t.created_by
where t.is_demo = true
order by t.name;

-- -----------------------------------------------------------------------------
-- C) Profiles whose default workspace is a demo tenant (who opens the app there)
-- -----------------------------------------------------------------------------
select
  p.id as profile_user_id,
  p.default_tenant_id,
  t.name as tenant_name,
  t.plan_code,
  t.is_demo
from public.profiles p
join public.tenants t on t.id = p.default_tenant_id
where t.is_demo = true;

-- -----------------------------------------------------------------------------
-- D) Expense counts per demo tenant
-- -----------------------------------------------------------------------------
select
  t.id as tenant_id,
  t.name,
  count(e.id) as expenses_count
from public.tenants t
left join public.expenses e on e.tenant_id = t.id
where t.is_demo = true
group by t.id, t.name
order by t.name;

-- -----------------------------------------------------------------------------
-- E) Hygiene: expenses must never have null tenant_id (expect 0)
-- -----------------------------------------------------------------------------
select count(*) as expenses_without_tenant
from public.expenses
where tenant_id is null;

-- -----------------------------------------------------------------------------
-- F) Optional: members of a specific demo tenant (replace placeholder)
-- -----------------------------------------------------------------------------
-- select tm.tenant_id, tm.user_id, tm.role, au.email
-- from public.tenant_memberships tm
-- left join auth.users au on au.id = tm.user_id
-- where tm.tenant_id = '<DEMO_TENANT_ID>'::uuid
-- order by tm.role, tm.user_id;
