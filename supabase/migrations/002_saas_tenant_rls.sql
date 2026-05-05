-- Migration 002: SaaS tenant-first (profiles, tenants, memberships, tenant_id, RLS helpers)
-- Apply after migrations/migration.sql in Supabase SQL Editor (Project → SQL).
-- Idempotent where practical; safe to re-run for idempotent sections (tables/policies guarded).
--
-- ORPHAN EXPENSES (explicit, conservative):
-- Rows that still have tenant_id IS NULL after backfill cannot satisfy NOT NULL + RLS.
-- They are COPIED to public.expenses_orphan_archive_002 (JSON snapshot) then REMOVED from
-- public.expenses. Inspect the archive table after migration; restore manually if needed.
-- This avoids silent data loss while allowing the schema to enforce tenant_id.

-- ---------------------------------------------------------------------------
-- 1) Core tables
-- ---------------------------------------------------------------------------

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_personal boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  default_tenant_id uuid references public.tenants (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tenant_memberships (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('admin', 'user', 'billing')),
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create index if not exists idx_tenant_memberships_user_id
  on public.tenant_memberships (user_id);

create index if not exists idx_tenant_memberships_tenant_id
  on public.tenant_memberships (tenant_id);

-- ---------------------------------------------------------------------------
-- 2) expenses: owner_id alignment, tenant_id, indexes, FK
-- ---------------------------------------------------------------------------

alter table public.expenses add column if not exists owner_id uuid;

update public.expenses
set owner_id = user_id
where owner_id is null and user_id is not null;

alter table public.expenses add column if not exists tenant_id uuid;

-- ---------------------------------------------------------------------------
-- 3) Backfill personal tenant + profile + membership for existing auth users
-- ---------------------------------------------------------------------------

do $$
declare
  r record;
  v_tenant_id uuid;
begin
  for r in
    select au.id
    from auth.users au
    where not exists (select 1 from public.profiles p where p.id = au.id)
  loop
    insert into public.tenants (name, is_personal, created_by)
    values ('Personale', true, r.id)
    returning id into v_tenant_id;

    insert into public.profiles (id, default_tenant_id)
    values (r.id, v_tenant_id);

    insert into public.tenant_memberships (tenant_id, user_id, role)
    values (v_tenant_id, r.id, 'admin');
  end loop;
end
$$;

-- Link memberships for users who had profile but no membership (repair)
insert into public.tenant_memberships (tenant_id, user_id, role)
select p.default_tenant_id, p.id, 'admin'
from public.profiles p
where p.default_tenant_id is not null
  and not exists (
    select 1
    from public.tenant_memberships tm
    where tm.tenant_id = p.default_tenant_id and tm.user_id = p.id
  );

-- Backfill expenses.tenant_id from owner's default tenant
update public.expenses e
set tenant_id = p.default_tenant_id
from public.profiles p
where e.tenant_id is null
  and e.user_id is not null
  and p.id = e.user_id
  and p.default_tenant_id is not null;

update public.expenses e
set tenant_id = p.default_tenant_id,
    user_id = coalesce(e.user_id, e.owner_id),
    owner_id = coalesce(e.owner_id, e.user_id)
from public.profiles p
where e.tenant_id is null
  and coalesce(e.user_id, e.owner_id) is not null
  and p.id = coalesce(e.user_id, e.owner_id)
  and p.default_tenant_id is not null;

-- Rows that still lack tenant_id: archive snapshot then remove from live table (explicit).
create table if not exists public.expenses_orphan_archive_002 (
  id uuid primary key,
  archived_at timestamptz not null default now(),
  source_row jsonb not null
);

comment on table public.expenses_orphan_archive_002 is
  'Migration 002: expenses that could not be assigned tenant_id; snapshot before removal from public.expenses.';

alter table public.expenses_orphan_archive_002 enable row level security;

revoke all on table public.expenses_orphan_archive_002 from public;
revoke all on table public.expenses_orphan_archive_002 from anon, authenticated;

insert into public.expenses_orphan_archive_002 (id, source_row)
select e.id, to_jsonb(e.*)
from public.expenses e
where e.tenant_id is null
  and not exists (
    select 1 from public.expenses_orphan_archive_002 a where a.id = e.id
  );

delete from public.expenses e
where e.tenant_id is null;

do $$
begin
  if exists (select 1 from public.expenses where tenant_id is null) then
    raise exception 'Migration 002: expenses still have null tenant_id after orphan handling';
  end if;
end
$$;

alter table public.expenses alter column tenant_id set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'expenses_tenant_id_fkey'
  ) then
    alter table public.expenses
      add constraint expenses_tenant_id_fkey
      foreign key (tenant_id) references public.tenants (id)
      on update cascade on delete restrict;
  end if;
end
$$;

create index if not exists idx_expenses_tenant_id on public.expenses (tenant_id);
create index if not exists idx_expenses_tenant_date on public.expenses (tenant_id, date desc);

-- ---------------------------------------------------------------------------
-- 4) Helper functions (SECURITY DEFINER, fixed search_path; before RLS policies)
-- ---------------------------------------------------------------------------

create or replace function public.is_tenant_member(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tenant_memberships tm
    where tm.tenant_id = p_tenant_id
      and tm.user_id = (select auth.uid())
  );
$$;

create or replace function public.has_tenant_role(p_tenant_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tenant_memberships tm
    where tm.tenant_id = p_tenant_id
      and tm.user_id = (select auth.uid())
      and tm.role = any (p_roles)
  );
$$;

create or replace function public.default_tenant_for_user()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.default_tenant_id
  from public.profiles p
  where p.id = (select auth.uid())
  limit 1;
$$;

revoke all on function public.is_tenant_member(uuid) from public;
revoke all on function public.has_tenant_role(uuid, text[]) from public;
revoke all on function public.default_tenant_for_user() from public;

grant execute on function public.is_tenant_member(uuid) to authenticated;
grant execute on function public.has_tenant_role(uuid, text[]) to authenticated;
grant execute on function public.default_tenant_for_user() to authenticated;

comment on function public.is_tenant_member(uuid) is 'True if auth.uid() has any membership in the tenant.';
comment on function public.has_tenant_role(uuid, text[]) is 'True if auth.uid() has one of the given roles in the tenant.';
comment on function public.default_tenant_for_user() is 'Returns profiles.default_tenant_id for auth.uid().';

-- ---------------------------------------------------------------------------
-- 5) RLS on tenant tables
-- ---------------------------------------------------------------------------

alter table public.tenants enable row level security;
alter table public.profiles enable row level security;
alter table public.tenant_memberships enable row level security;

drop policy if exists tenants_select_member on public.tenants;
create policy tenants_select_member on public.tenants
  for select using (public.is_tenant_member(tenants.id));

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using ((select auth.uid()) = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Use is_tenant_member for the co-tenant branch to avoid RLS self-reference / recursion
-- on tenant_memberships (subqueries on the same table re-evaluate policies).
drop policy if exists tenant_memberships_select_visible on public.tenant_memberships;
create policy tenant_memberships_select_visible on public.tenant_memberships
  for select using (
    user_id = (select auth.uid())
    or public.is_tenant_member(tenant_memberships.tenant_id)
  );

-- ---------------------------------------------------------------------------
-- 6) expenses: replace owner-only policies with tenant-aware policies
-- ---------------------------------------------------------------------------

drop policy if exists allow_select_owner on public.expenses;
drop policy if exists allow_insert_owner on public.expenses;
drop policy if exists allow_update_owner on public.expenses;
drop policy if exists allow_delete_owner on public.expenses;

drop policy if exists expenses_select_tenant on public.expenses;
drop policy if exists expenses_insert_tenant on public.expenses;
drop policy if exists expenses_update_tenant on public.expenses;
drop policy if exists expenses_delete_tenant on public.expenses;

create policy expenses_select_tenant on public.expenses
  for select using (public.is_tenant_member(tenant_id));

create policy expenses_insert_tenant on public.expenses
  for insert with check (
    public.is_tenant_member(tenant_id)
    and public.has_tenant_role(tenant_id, array['admin', 'user']::text[])
    and user_id = (select auth.uid())
  );

create policy expenses_update_tenant on public.expenses
  for update
  using (
    public.is_tenant_member(tenant_id)
    and public.has_tenant_role(tenant_id, array['admin', 'user']::text[])
    and user_id = (select auth.uid())
  )
  with check (
    public.is_tenant_member(tenant_id)
    and public.has_tenant_role(tenant_id, array['admin', 'user']::text[])
    and user_id = (select auth.uid())
  );

create policy expenses_delete_tenant on public.expenses
  for delete using (
    public.is_tenant_member(tenant_id)
    and public.has_tenant_role(tenant_id, array['admin', 'user']::text[])
    and user_id = (select auth.uid())
  );

alter table public.expenses enable row level security;

-- ---------------------------------------------------------------------------
-- 7) New user: personal tenant + profile + admin membership
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
begin
  insert into public.tenants (name, is_personal, created_by)
  values ('Personale', true, new.id)
  returning id into v_tenant_id;

  insert into public.profiles (id, default_tenant_id)
  values (new.id, v_tenant_id);

  insert into public.tenant_memberships (tenant_id, user_id, role)
  values (v_tenant_id, new.id, 'admin');

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant execute on function public.handle_new_user() to supabase_auth_admin;
  end if;
end
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

comment on function public.handle_new_user() is 'Creates personal tenant, profile row, and admin membership for new auth.users.';

-- End of migration 002
