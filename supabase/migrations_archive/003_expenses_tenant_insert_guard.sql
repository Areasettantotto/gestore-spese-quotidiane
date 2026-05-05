-- Migration 003: BEFORE INSERT guard on public.expenses
-- Defensive tenant_id fallback from profiles.default_tenant_id.
--
-- Apply after supabase/migrations/002_saas_tenant_rls.sql.
--
-- Purpose:
-- Protect production from old frontend builds / browser cache / PWA cache that may still
-- insert expenses without tenant_id.
--
-- Behavior:
-- - Does not update existing rows.
-- - Does not change NEW.tenant_id when already provided.
-- - Only fills NEW.tenant_id on INSERT when it is NULL.
-- - Resolves the user from COALESCE(NEW.user_id, NEW.owner_id, auth.uid()).
--
-- Idempotent:
-- - CREATE OR REPLACE FUNCTION
-- - DROP TRIGGER IF EXISTS + CREATE TRIGGER

-- ---------------------------------------------------------------------------
-- 1) Trigger function: set tenant_id from profiles.default_tenant_id
-- ---------------------------------------------------------------------------

create or replace function public.set_expense_tenant_from_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_user_id uuid;
begin
  if new.tenant_id is not null then
    return new;
  end if;

  resolved_user_id := coalesce(new.user_id, new.owner_id, auth.uid());

  if resolved_user_id is null then
    return new;
  end if;

  select p.default_tenant_id
    into new.tenant_id
  from public.profiles p
  where p.id = resolved_user_id
  limit 1;

  return new;
end;
$$;

revoke all on function public.set_expense_tenant_from_profile ()
from public;

revoke all on function public.set_expense_tenant_from_profile ()
from anon;

revoke all on function public.set_expense_tenant_from_profile ()
from authenticated;

comment on function public.set_expense_tenant_from_profile () is 'Migration 003: defensive BEFORE INSERT guard. If tenant_id is null, set it from profiles.default_tenant_id using coalesce(new.user_id, new.owner_id, auth.uid()). Leaves explicit tenant_id unchanged.';

-- ---------------------------------------------------------------------------
-- 2) Trigger: before insert only, no backfill / no updates
-- ---------------------------------------------------------------------------

drop trigger if exists expenses_set_tenant_before_insert on public.expenses;

create trigger expenses_set_tenant_before_insert
  before insert on public.expenses
  for each row
  execute function public.set_expense_tenant_from_profile();

comment on trigger expenses_set_tenant_before_insert on public.expenses is 'Migration 003: defensive tenant_id fallback for legacy clients omitting tenant_id because of cache/PWA/old frontend bundle.';

-- End of migration 003
