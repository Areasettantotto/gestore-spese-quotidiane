-- =============================================================================
-- MANUAL RUNBOOK ONLY — not a migration. Do not commit real UUIDs.
-- Purpose: insert fictional demo expenses for a single demo tenant.
--
-- Preconditions (enforced):
--   - Tenant exists, is_demo = true, plan_code = 'demo'
--   - Exactly one admin membership on that tenant (owner for user_id/owner_id)
--     OR set v_owner_user_id manually to '<DEMO_OWNER_USER_ID>'::uuid below.
--
-- Categories must match app enum in src/types.ts (Italian labels).
-- =============================================================================

begin;

do $$
declare
  v_demo_tenant_id uuid := '<DEMO_TENANT_ID>'::uuid;
  -- Set to NULL to auto-pick the sole admin member; or replace placeholder for explicit owner.
  v_owner_user_id uuid := null; -- e.g. '<DEMO_OWNER_USER_ID>'::uuid
  v_count int;
begin
  if not exists (
    select 1
    from public.tenants
    where id = v_demo_tenant_id
      and is_demo is true
      and plan_code = 'demo'
  ) then
    raise exception
      'Refusing to seed: tenant % is not a guarded demo tenant (is_demo + plan_code demo)',
      v_demo_tenant_id;
  end if;

  if v_owner_user_id is null then
    select count(*) into v_count
    from public.tenant_memberships
    where tenant_id = v_demo_tenant_id
      and role = 'admin';

    if v_count <> 1 then
      raise exception
        'Refusing to seed: expected exactly one admin in tenant_memberships for tenant % (found %). Set v_owner_user_id explicitly.',
        v_demo_tenant_id,
        v_count;
    end if;

    select tm.user_id into v_owner_user_id
    from public.tenant_memberships tm
    where tm.tenant_id = v_demo_tenant_id
      and tm.role = 'admin'
    limit 1;
  end if;

  if v_owner_user_id is null then
    raise exception 'Refusing to seed: could not resolve owner user id';
  end if;

  if not exists (
    select 1
    from public.tenant_memberships tm
    where tm.tenant_id = v_demo_tenant_id
      and tm.user_id = v_owner_user_id
  ) then
    raise exception
      'Refusing to seed: user % is not a member of tenant %',
      v_owner_user_id,
      v_demo_tenant_id;
  end if;

  insert into public.expenses (
    id,
    amount,
    category,
    description,
    date,
    accompagnatore,
    user_id,
    owner_id,
    tenant_id
  )
  values
    (gen_random_uuid(), 3.20, 'Alimentazione', 'Caffè e cornetto (demo)', '2026-05-01', null, v_owner_user_id, v_owner_user_id, v_demo_tenant_id),
    (gen_random_uuid(), 42.80, 'Alimentazione', 'Spesa supermercato settimanale (demo)', '2026-05-02', null, v_owner_user_id, v_owner_user_id, v_demo_tenant_id),
    (gen_random_uuid(), 9.50, 'Trasporti', 'Biglietti trasporto locale (demo)', '2026-05-02', null, v_owner_user_id, v_owner_user_id, v_demo_tenant_id),
    (gen_random_uuid(), 15.00, 'Svago', 'Pranzo fuori (demo)', '2026-05-03', null, v_owner_user_id, v_owner_user_id, v_demo_tenant_id),
    (gen_random_uuid(), 850.00, 'Casa', 'Affitto mensile appartamento demo (fittizio)', '2026-05-01', null, v_owner_user_id, v_owner_user_id, v_demo_tenant_id),
    (gen_random_uuid(), 28.00, 'Shopping', 'Accessori casa (demo)', '2026-05-04', null, v_owner_user_id, v_owner_user_id, v_demo_tenant_id);
end $$;

commit;
