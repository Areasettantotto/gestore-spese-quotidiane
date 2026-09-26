-- =============================================================================
-- DATA-48 — Companions core persistence + authorization cutover (additive)
-- =============================================================================
-- Additive on top of 000_baseline_current_schema.sql and 007→015.
--
-- Introduces:
--   public.tenant_settings              (per-tenant companions_enabled)
--   public.tenant_companions            (stable companion identity + optional Auth link)
--   public.expenses.companion_id        (nullable, same-tenant composite FK)
--   public.current_delegated_companion_id(uuid)  (fail-closed delegated subject)
--   expenses ownership immutability trigger (tenant_id always; user_id once set)
--
-- DATA-49 hardening (same file, pre-apply):
--   expenses.tenant_id immutable after INSERT (blocks multi-tenant move)
--   authenticated UPDATE grants column-limited on tenant_settings /
--   tenant_companions (stable id + tenant_id not client-updatable)
--
-- DATA-50 least-privilege grants (same file, pre-apply):
--   expenses: REVOKE ALL from anon/authenticated; GRANT SELECT/INSERT/UPDATE/DELETE
--     to authenticated only (no TRUNCATE/REFERENCES/TRIGGER)
--   tenant_memberships: REVOKE ALL from anon/authenticated; GRANT SELECT
--     to authenticated only (client read-only; provisioning remains server-side)
--   tenant_monthly_budgets grants intentionally untouched (013 baseline)
--
-- Security cutover (atomic in this migration):
--   DROP owner-based expenses policies
--   REPLACE tenant-wide expenses policies with admin / delegated companion split
--   TIGHTEN tenant_memberships SELECT (admin-or-self)
--   TIGHTEN tenant_monthly_budgets SELECT (admin only)
--
-- Explicitly out of scope:
--   frontend, TypeScript, Realtime publication/channels, Auth invite/provisioning,
--   EffectiveAccess / Pro-Base gating, Settings UI, legacy accompagnatore backfill,
--   drop owner_id / accompagnatore, max-20 DB lock, CONTRACT categories.
--
-- Realtime DELETE server-side gate remains OPEN. This migration does NOT authorize
-- delegated account activation.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) tenant_settings
-- -----------------------------------------------------------------------------

create table public.tenant_settings (
  tenant_id uuid not null
    references public.tenants (id) on delete cascade,
  companions_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_settings_pkey primary key (tenant_id)
);

comment on table public.tenant_settings is
  'Per-tenant settings row. One row per tenant. companions_enabled gates delegated companion data access; default false (opt-in).';

comment on column public.tenant_settings.tenant_id is
  'Owning workspace PK/FK. Cascades with public.tenants.';

comment on column public.tenant_settings.companions_enabled is
  'When false, delegated companion data access is fail-closed. Does not remove companion rows or expense history.';

insert into public.tenant_settings (tenant_id, companions_enabled)
select t.id, false
from public.tenants t
on conflict (tenant_id) do nothing;

drop trigger if exists set_tenant_settings_updated_at on public.tenant_settings;
create trigger set_tenant_settings_updated_at
  before update on public.tenant_settings
  for each row
  execute function public.set_updated_at();

alter table public.tenant_settings enable row level security;

-- Privileges: authenticated needs DML so RLS can authorize per-role.
-- Column-level UPDATE (companions_enabled) makes tenant_id / created_at /
-- updated_at immutable for the normal client even when the same admin
-- belongs to two tenants. updated_at remains maintained by set_updated_at.
-- anon has no access. RLS remains the row-level authority.
revoke all on table public.tenant_settings from anon;
revoke all on table public.tenant_settings from authenticated;

grant select, insert on table public.tenant_settings
  to authenticated;
grant update (companions_enabled) on table public.tenant_settings
  to authenticated;

grant all privileges on table public.tenant_settings to postgres;
grant all privileges on table public.tenant_settings to service_role;

create policy tenant_settings_select_admin
  on public.tenant_settings
  for select
  to authenticated
  using (
    public.has_tenant_role(
      tenant_settings.tenant_id,
      array['admin']::text[]
    )
  );

create policy tenant_settings_insert_admin
  on public.tenant_settings
  for insert
  to authenticated
  with check (
    public.has_tenant_role(
      tenant_settings.tenant_id,
      array['admin']::text[]
    )
  );

create policy tenant_settings_update_admin
  on public.tenant_settings
  for update
  to authenticated
  using (
    public.has_tenant_role(
      tenant_settings.tenant_id,
      array['admin']::text[]
    )
  )
  with check (
    public.has_tenant_role(
      tenant_settings.tenant_id,
      array['admin']::text[]
    )
  );

-- -----------------------------------------------------------------------------
-- 2) tenant_companions
-- -----------------------------------------------------------------------------

create table public.tenant_companions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null
    references public.tenants (id) on delete cascade,
  display_name text not null,
  is_active boolean not null default true,
  delegated_auth_user_id uuid null
    references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_companions_tenant_id_id_key
    unique (tenant_id, id)
);

comment on table public.tenant_companions is
  'Tenant-scoped companion subjects. Stable identity is id. Archive via is_active=false (no V1 DELETE). delegated_auth_user_id is optional Auth link; Auth user delete sets NULL (history preserved).';

comment on column public.tenant_companions.id is
  'Stable companion identity.';

comment on column public.tenant_companions.tenant_id is
  'Owning workspace. Cascades with public.tenants.';

comment on column public.tenant_companions.display_name is
  'Presentation label. Not identity; not globally unique.';

comment on column public.tenant_companions.is_active is
  'Archive flag. Inactive companions cannot be used for delegated access or new admin assignments.';

comment on column public.tenant_companions.delegated_auth_user_id is
  'Optional Auth user linked for delegated access. Not FK to tenant_memberships (membership may be suspended while Auth link is retained). ON DELETE SET NULL.';

-- Same Auth user cannot be linked to more than one companion in the same tenant
-- (active or archived). Different tenants remain allowed.
create unique index tenant_companions_tenant_delegated_auth_user_uidx
  on public.tenant_companions (tenant_id, delegated_auth_user_id)
  where delegated_auth_user_id is not null;

create index idx_tenant_companions_tenant_id
  on public.tenant_companions (tenant_id);

drop trigger if exists set_tenant_companions_updated_at on public.tenant_companions;
create trigger set_tenant_companions_updated_at
  before update on public.tenant_companions
  for each row
  execute function public.set_updated_at();

alter table public.tenant_companions enable row level security;

-- Privileges: authenticated needs DML so RLS can authorize per-role.
-- Column-level UPDATE (display_name, is_active, delegated_auth_user_id)
-- makes id / tenant_id / created_at / updated_at immutable for the normal
-- client even when the same admin belongs to two tenants. updated_at
-- remains maintained by set_updated_at. anon has no access. RLS remains
-- the row-level authority. No DELETE grant (archive-first via is_active).
revoke all on table public.tenant_companions from anon;
revoke all on table public.tenant_companions from authenticated;

grant select, insert on table public.tenant_companions
  to authenticated;
grant update (display_name, is_active, delegated_auth_user_id)
  on table public.tenant_companions
  to authenticated;

grant all privileges on table public.tenant_companions to postgres;
grant all privileges on table public.tenant_companions to service_role;

-- -----------------------------------------------------------------------------
-- 3) Fail-closed delegated companion helper
-- -----------------------------------------------------------------------------
-- Returns the unique active delegated companion id for (auth.uid(), tenant)
-- only when membership role=user, companions_enabled, companion active, and
-- delegated_auth_user_id matches. Otherwise NULL.
-- Pattern: same SECURITY DEFINER + pinned search_path as is_tenant_member /
-- has_tenant_role in 000_baseline_current_schema.sql.

create or replace function public.current_delegated_companion_id(p_tenant_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select tc.id
  from public.tenant_companions tc
  inner join public.tenant_settings ts
    on ts.tenant_id = tc.tenant_id
  where tc.tenant_id = p_tenant_id
    and ts.companions_enabled = true
    and tc.is_active = true
    and tc.delegated_auth_user_id = (select auth.uid())
    and exists (
      select 1
      from public.tenant_memberships tm
      where tm.tenant_id = p_tenant_id
        and tm.user_id = (select auth.uid())
        and tm.role = 'user'
    )
  limit 1;
$$;

comment on function public.current_delegated_companion_id(uuid) is
  'DATA-48: fail-closed delegated companion subject for auth.uid() in a tenant. NULL unless membership role=user, companions_enabled, companion active, and Auth link match. Unique via partial unique index on (tenant_id, delegated_auth_user_id).';

revoke all on function public.current_delegated_companion_id(uuid) from public;
revoke all on function public.current_delegated_companion_id(uuid) from anon;
grant execute on function public.current_delegated_companion_id(uuid) to authenticated;
grant execute on function public.current_delegated_companion_id(uuid) to postgres;
grant execute on function public.current_delegated_companion_id(uuid) to service_role;

-- Companions RLS (after helper exists)

create policy tenant_companions_select_admin
  on public.tenant_companions
  for select
  to authenticated
  using (
    public.has_tenant_role(
      tenant_companions.tenant_id,
      array['admin']::text[]
    )
  );

create policy tenant_companions_select_own_delegated
  on public.tenant_companions
  for select
  to authenticated
  using (
    tenant_companions.id
      = public.current_delegated_companion_id(tenant_companions.tenant_id)
  );

create policy tenant_companions_insert_admin
  on public.tenant_companions
  for insert
  to authenticated
  with check (
    public.has_tenant_role(
      tenant_companions.tenant_id,
      array['admin']::text[]
    )
  );

create policy tenant_companions_update_admin
  on public.tenant_companions
  for update
  to authenticated
  using (
    public.has_tenant_role(
      tenant_companions.tenant_id,
      array['admin']::text[]
    )
  )
  with check (
    public.has_tenant_role(
      tenant_companions.tenant_id,
      array['admin']::text[]
    )
  );

-- -----------------------------------------------------------------------------
-- 4) expenses.companion_id + same-tenant composite FK
-- -----------------------------------------------------------------------------

alter table public.expenses
  add column companion_id uuid null;

comment on column public.expenses.companion_id is
  'Optional companion subject for this expense. Same-tenant composite FK. Nullable; legacy rows and CURRENT admin writer remain NULL until frontend cutover. Archive-first: ON DELETE RESTRICT.';

alter table public.expenses
  add constraint expenses_tenant_companion_fkey
    foreign key (tenant_id, companion_id)
    references public.tenant_companions (tenant_id, id)
    on update restrict
    on delete restrict;

create index idx_expenses_tenant_companion
  on public.expenses (tenant_id, companion_id)
  where companion_id is not null;

-- -----------------------------------------------------------------------------
-- 5) expenses ownership immutability (tenant_id always; user_id once set)
-- -----------------------------------------------------------------------------
-- DATA-49: tenant_id is ownership identity and must not move across tenants
-- even when the same auth user is admin/delegated in both tenants.
-- DATA-48 actor rule preserved: legacy rows with user_id IS NULL may receive
-- an explicit future backfill (NULL → value); once set, user_id is immutable.
-- Delegated users cannot appropriate NULL-actor rows because delegated
-- UPDATE/DELETE require user_id = auth.uid() on the current row.

create or replace function public.enforce_expenses_ownership_immutability()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.tenant_id is distinct from old.tenant_id then
    raise exception
      'expenses.tenant_id is immutable after insert (DATA-49 ownership protection)';
  end if;

  if old.user_id is not null
     and new.user_id is distinct from old.user_id then
    raise exception
      'expenses.user_id is immutable once set (DATA-48 actor protection)';
  end if;

  return new;
end;
$$;

comment on function public.enforce_expenses_ownership_immutability() is
  'DATA-49/DATA-48: BEFORE UPDATE guard. Prevents changing expenses.tenant_id. Prevents changing or nullifying expenses.user_id after it is set. Allows NULL → value for explicit future backfill.';

revoke execute on function public.enforce_expenses_ownership_immutability() from public;
revoke execute on function public.enforce_expenses_ownership_immutability() from anon;
revoke execute on function public.enforce_expenses_ownership_immutability() from authenticated;

drop trigger if exists trg_expenses_enforce_ownership_immutability on public.expenses;
create trigger trg_expenses_enforce_ownership_immutability
  before update on public.expenses
  for each row
  execute function public.enforce_expenses_ownership_immutability();

-- -----------------------------------------------------------------------------
-- 6) Expenses RLS cutover — drop owner + legacy tenant-wide policies
-- -----------------------------------------------------------------------------
-- DATA-50: strip inherited client table privileges (incl. TRUNCATE/REFERENCES/
-- TRIGGER) then re-grant only DML the CURRENT Expense repository uses.
-- anon: none. postgres/service_role untouched. No column-level UPDATE here.

revoke all on table public.expenses from anon;
revoke all on table public.expenses from authenticated;

grant select, insert, update, delete on table public.expenses
  to authenticated;

drop policy if exists select_own_expenses on public.expenses;
drop policy if exists insert_own_expenses on public.expenses;
drop policy if exists update_own_expenses on public.expenses;
drop policy if exists delete_own_expenses on public.expenses;

drop policy if exists expenses_select_tenant on public.expenses;
drop policy if exists expenses_insert_tenant on public.expenses;
drop policy if exists expenses_update_tenant on public.expenses;
drop policy if exists expenses_delete_tenant on public.expenses;

-- SELECT: admin — all tenant expenses
create policy expenses_select_admin
  on public.expenses
  for select
  to authenticated
  using (
    public.has_tenant_role(
      expenses.tenant_id,
      array['admin']::text[]
    )
  );

-- SELECT: delegated — only own companion subject (not NULL, not other companions)
create policy expenses_select_delegated_companion
  on public.expenses
  for select
  to authenticated
  using (
    expenses.companion_id is not null
    and expenses.companion_id
      = public.current_delegated_companion_id(expenses.tenant_id)
  );

-- INSERT: admin — actor = auth.uid(); companion NULL or active same-tenant
create policy expenses_insert_admin
  on public.expenses
  for insert
  to authenticated
  with check (
    public.has_tenant_role(
      expenses.tenant_id,
      array['admin']::text[]
    )
    and expenses.user_id = (select auth.uid())
    and (
      expenses.companion_id is null
      or exists (
        select 1
        from public.tenant_companions tc
        where tc.id = expenses.companion_id
          and tc.tenant_id = expenses.tenant_id
          and tc.is_active = true
      )
    )
  );

-- INSERT: delegated — own active companion only; actor = auth.uid()
create policy expenses_insert_delegated_companion
  on public.expenses
  for insert
  to authenticated
  with check (
    expenses.user_id = (select auth.uid())
    and expenses.companion_id is not null
    and expenses.companion_id
      = public.current_delegated_companion_id(expenses.tenant_id)
  );

-- UPDATE: admin — any tenant expense; actor immutability via trigger
create policy expenses_update_admin
  on public.expenses
  for update
  to authenticated
  using (
    public.has_tenant_role(
      expenses.tenant_id,
      array['admin']::text[]
    )
  )
  with check (
    public.has_tenant_role(
      expenses.tenant_id,
      array['admin']::text[]
    )
    and (
      expenses.companion_id is null
      or exists (
        select 1
        from public.tenant_companions tc
        where tc.id = expenses.companion_id
          and tc.tenant_id = expenses.tenant_id
      )
    )
  );

-- UPDATE: delegated — only rows they created for their companion;
-- result must remain own companion + self actor + valid delegation
create policy expenses_update_delegated_companion
  on public.expenses
  for update
  to authenticated
  using (
    expenses.companion_id is not null
    and expenses.companion_id
      = public.current_delegated_companion_id(expenses.tenant_id)
    and expenses.user_id = (select auth.uid())
  )
  with check (
    expenses.companion_id is not null
    and expenses.companion_id
      = public.current_delegated_companion_id(expenses.tenant_id)
    and expenses.user_id = (select auth.uid())
  );

-- DELETE: admin — any tenant expense
create policy expenses_delete_admin
  on public.expenses
  for delete
  to authenticated
  using (
    public.has_tenant_role(
      expenses.tenant_id,
      array['admin']::text[]
    )
  );

-- DELETE: delegated — own companion + self actor only
-- NOTE: DB/REST authorization only. Does NOT close Realtime DELETE server-side gate.
create policy expenses_delete_delegated_companion
  on public.expenses
  for delete
  to authenticated
  using (
    expenses.companion_id is not null
    and expenses.companion_id
      = public.current_delegated_companion_id(expenses.tenant_id)
    and expenses.user_id = (select auth.uid())
  );

-- -----------------------------------------------------------------------------
-- 7) tenant_memberships SELECT tightening
-- -----------------------------------------------------------------------------
-- BEFORE: own row OR any tenant member (enumerates all memberships).
-- AFTER:  admin sees tenant memberships; others see only own row.
-- DATA-50: client is read-only on memberships. Strip inherited DML (and
-- TRUNCATE/REFERENCES/TRIGGER); grant SELECT only to authenticated.
-- anon: none. postgres/service_role untouched. Provisioning/revoke = FUTURE server-side.

revoke all on table public.tenant_memberships from anon;
revoke all on table public.tenant_memberships from authenticated;

grant select on table public.tenant_memberships
  to authenticated;

drop policy if exists tenant_memberships_select_visible on public.tenant_memberships;

create policy tenant_memberships_select_admin_or_self
  on public.tenant_memberships
  for select
  to authenticated
  using (
    tenant_memberships.user_id = (select auth.uid())
    or public.has_tenant_role(
      tenant_memberships.tenant_id,
      array['admin']::text[]
    )
  );

-- -----------------------------------------------------------------------------
-- 8) Budget SELECT tightening — admin only (write policies already admin-only)
-- -----------------------------------------------------------------------------

drop policy if exists tenant_monthly_budgets_select_admin_user
  on public.tenant_monthly_budgets;

create policy tenant_monthly_budgets_select_admin
  on public.tenant_monthly_budgets
  for select
  to authenticated
  using (
    public.has_tenant_role(
      tenant_monthly_budgets.tenant_id,
      array['admin']::text[]
    )
  );
