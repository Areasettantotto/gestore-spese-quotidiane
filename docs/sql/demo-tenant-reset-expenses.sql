-- =============================================================================
-- MANUAL RUNBOOK ONLY — not a migration. Do not commit real UUIDs.
-- Purpose: DELETE all rows in public.expenses for ONE demo tenant only.
--
-- Safety:
--   - Refuses unless tenant exists AND is_demo = true AND plan_code = 'demo'
--   - Does NOT delete tenants, profiles, memberships, orphan archive, backups
--   - Does NOT touch public.expenses_orphan_archive_002 or private.backup_*
-- =============================================================================

begin;

do $$
declare
  v_demo_tenant_id uuid := '<DEMO_TENANT_ID>'::uuid;
begin
  if not exists (
    select 1
    from public.tenants
    where id = v_demo_tenant_id
      and is_demo is true
      and plan_code = 'demo'
  ) then
    raise exception
      'Refusing to reset: tenant % is not marked as demo (is_demo + plan_code demo required)',
      v_demo_tenant_id;
  end if;

  delete from public.expenses
  where tenant_id = v_demo_tenant_id;
end $$;

commit;
