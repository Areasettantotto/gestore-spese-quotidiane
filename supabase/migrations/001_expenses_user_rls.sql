-- Migration: add user_id column, FK and RLS policies for public.expenses
-- Run these statements in Supabase SQL editor (Project → SQL)

-- 1) Add user_id column if missing
alter table public.expenses add column if not exists user_id uuid;

-- 2) Add FK constraint only if column exists and constraint missing
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='expenses' and column_name='user_id'
  ) then
    if not exists (
      select 1 from pg_constraint where conname = 'expenses_user_id_fkey'
    ) then
      alter table public.expenses
        add constraint expenses_user_id_fkey
        foreign key (user_id) references auth.users(id) on delete cascade;
    end if;
  end if;
end
$$;

-- 3) Enable Row Level Security
alter table public.expenses enable row level security;

-- 4) Create owner-only policies (safe: check first to avoid errors)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'expenses' and policyname = 'allow_select_owner'
  ) then
    execute $q$create policy allow_select_owner on public.expenses
      for select using (auth.uid() = user_id);$q$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'expenses' and policyname = 'allow_insert_owner'
  ) then
    execute $q$create policy allow_insert_owner on public.expenses
      for insert with check (auth.uid() = user_id);$q$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'expenses' and policyname = 'allow_update_owner'
  ) then
    execute $q$create policy allow_update_owner on public.expenses
      for update using (auth.uid() = user_id) with check (auth.uid() = user_id);$q$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'expenses' and policyname = 'allow_delete_owner'
  ) then
    execute $q$create policy allow_delete_owner on public.expenses
      for delete using (auth.uid() = user_id);$q$;
  end if;
end
$$;

-- End of migration
