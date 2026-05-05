-- =============================================================================
-- MANUAL RUNBOOK ONLY — not a migration. Do not commit real UUIDs.
-- Purpose: mark an existing workspace as the product demo tenant (metadata only).
-- Before run: pick a dedicated tenant UUID (e.g. personal tenant of demo user).
-- =============================================================================

-- Replace with your demo workspace id from Supabase (never commit real values).
-- <DEMO_TENANT_ID>

begin;

update public.tenants
set
  plan_code = 'demo',
  subscription_status = 'active',
  is_demo = true,
  trial_ends_at = null
where id = '<DEMO_TENANT_ID>'::uuid;

-- Optional: assert one row updated
-- do $$
-- begin
--   if (select count(*) from public.tenants where id = '<DEMO_TENANT_ID>'::uuid and is_demo = true and plan_code = 'demo') <> 1 then
--     raise exception 'Mark demo failed: tenant not found or not updated as expected';
--   end if;
-- end $$;

commit;
