-- Migration 003: BEFORE INSERT guard on public.expenses — default tenant_id from profile
-- Apply after migrations/002_saas_tenant_rls.sql (expects public.expenses.tenant_id NOT NULL,
-- public.profiles.default_tenant_id, auth.uid() session on client inserts).
--
-- Idempotent: CREATE OR REPLACE function; DROP TRIGGER IF EXISTS + CREATE TRIGGER.
-- Does not UPDATE existing rows; only fills NEW.tenant_id when it is NULL on INSERT.

-- ---------------------------------------------------------------------------
-- 1) Trigger function: set tenant_id from profiles.default_tenant_id for auth.uid()
-- ---------------------------------------------------------------------------

create or replace function public.set_expense_tenant_from_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.tenant_id is null then
    select p.default_tenant_id
      into new.tenant_id
    from public.profiles p
    where p.id = (select auth.uid())
    limit 1;
  end if;

  return new;
end;
$$;

revoke all on function public.set_expense_tenant_from_profile() from public;

grant execute on function public.set_expense_tenant_from_profile() to authenticated;

comment on function public.set_expense_tenant_from_profile() is
  'Migration 003: on INSERT, if tenant_id is null, set it from profiles.default_tenant_id for auth.uid(); leaves explicit tenant_id unchanged.';

-- ---------------------------------------------------------------------------
-- 2) Trigger (before insert only — no backfill / no updates)
-- ---------------------------------------------------------------------------

drop trigger if exists expenses_set_tenant_before_insert on public.expenses;

create trigger expenses_set_tenant_before_insert
  before insert on public.expenses
  for each row
  execute procedure public.set_expense_tenant_from_profile();

comment on trigger expenses_set_tenant_before_insert on public.expenses is
  'Migration 003: defensive default for legacy clients omitting tenant_id (cache/PWA/old bundle).';

-- End of migration 003
