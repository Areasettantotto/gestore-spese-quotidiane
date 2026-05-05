-- =============================================================================
-- LOCAL / CLI BASELINE (SQUASH)
-- =============================================================================
-- Derived from read-only production schema introspection.
-- DO NOT apply this baseline to production.
-- No production data is included in this file.
-- Future migrations must be additive and reviewed separately.
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_personal boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  plan_code text not null default 'free',
  subscription_status text not null default 'active',
  is_demo boolean not null default false,
  trial_ends_at timestamptz null,
  constraint tenants_plan_code_check
    check (plan_code in ('free', 'trial', 'paid', 'internal', 'demo')),
  constraint tenants_subscription_status_check
    check (
      subscription_status in ('active', 'trialing', 'past_due', 'canceled', 'suspended')
    )
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

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  amount numeric(12,2) not null,
  category text not null,
  description text not null,
  date date not null,
  accompagnatore text null,
  created_at timestamptz not null default now(),
  user_id uuid null references auth.users (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on update cascade on delete restrict,
  updated_at timestamptz not null default now(),
  constraint expenses_amount_check check (amount > 0)
);

create table if not exists public.expenses_orphan_archive_002 (
  id uuid primary key,
  archived_at timestamptz not null default now(),
  source_row jsonb
);

create table if not exists public.tenant_billing_customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  provider text not null,
  provider_customer_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_billing_customers_provider_customer_unique
    unique (provider, provider_customer_id),
  constraint tenant_billing_customers_tenant_provider_unique
    unique (tenant_id, provider),
  constraint tenant_billing_customers_provider_check
    check (provider in ('stripe'))
);

create table if not exists public.tenant_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  provider text not null,
  provider_subscription_id text not null,
  provider_customer_id text null,
  plan_code text not null,
  status text not null,
  current_period_start timestamptz null,
  current_period_end timestamptz null,
  cancel_at_period_end boolean not null default false,
  trial_ends_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_subscriptions_provider_subscription_unique
    unique (provider, provider_subscription_id),
  constraint tenant_subscriptions_provider_check
    check (provider in ('stripe')),
  constraint tenant_subscriptions_plan_code_check
    check (plan_code in ('free', 'trial', 'paid', 'internal', 'demo')),
  constraint tenant_subscriptions_status_check
    check (
      status in (
        'active',
        'trialing',
        'past_due',
        'canceled',
        'unpaid',
        'incomplete',
        'incomplete_expired',
        'paused',
        'suspended',
        'unknown'
      )
    )
);

create table if not exists public.billing_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  tenant_id uuid null references public.tenants (id) on delete set null,
  processed_at timestamptz null,
  payload jsonb not null,
  processing_error text null,
  created_at timestamptz not null default now(),
  constraint billing_events_provider_event_unique unique (provider, provider_event_id),
  constraint billing_events_provider_check check (provider in ('stripe'))
);

-- -----------------------------------------------------------------------------
-- Indexes
-- -----------------------------------------------------------------------------

create index if not exists idx_tenant_memberships_user_id on public.tenant_memberships (user_id);
create index if not exists idx_tenant_memberships_tenant_id on public.tenant_memberships (tenant_id);
create index if not exists idx_expenses_tenant_id on public.expenses (tenant_id);
create index if not exists idx_expenses_tenant_date on public.expenses (tenant_id, date desc);
create index if not exists idx_tenant_billing_customers_tenant_id
  on public.tenant_billing_customers (tenant_id);
create index if not exists idx_tenant_subscriptions_tenant_id
  on public.tenant_subscriptions (tenant_id);
create index if not exists idx_tenant_subscriptions_provider_customer_id
  on public.tenant_subscriptions (provider_customer_id)
  where provider_customer_id is not null;
create index if not exists idx_billing_events_tenant_id on public.billing_events (tenant_id);
create index if not exists idx_billing_events_event_type on public.billing_events (event_type);
create index if not exists idx_billing_events_processed_at on public.billing_events (processed_at);

-- -----------------------------------------------------------------------------
-- Functions
-- -----------------------------------------------------------------------------

create or replace function public.is_tenant_member(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tenant_memberships tm
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
    select 1
    from public.tenant_memberships tm
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

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Triggers (including duplicate legacy trigger name)
-- -----------------------------------------------------------------------------

drop trigger if exists expenses_set_tenant_before_insert on public.expenses;
create trigger expenses_set_tenant_before_insert
  before insert on public.expenses
  for each row
  execute function public.set_expense_tenant_from_profile();

drop trigger if exists set_expense_tenant_before_insert on public.expenses;
create trigger set_expense_tenant_before_insert
  before insert on public.expenses
  for each row
  execute function public.set_expense_tenant_from_profile();

drop trigger if exists set_expenses_updated_at on public.expenses;
create trigger set_expenses_updated_at
  before update on public.expenses
  for each row
  execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- RLS and Replica Identity
-- -----------------------------------------------------------------------------

alter table public.tenants enable row level security;
alter table public.profiles enable row level security;
alter table public.tenant_memberships enable row level security;
alter table public.expenses enable row level security;
alter table public.expenses_orphan_archive_002 enable row level security;
alter table public.tenant_billing_customers enable row level security;
alter table public.tenant_subscriptions enable row level security;
alter table public.billing_events enable row level security;

alter table public.expenses replica identity full;

-- -----------------------------------------------------------------------------
-- Policies (include both legacy owner-only and tenant-aware expenses policies)
-- -----------------------------------------------------------------------------

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

drop policy if exists tenant_memberships_select_visible on public.tenant_memberships;
create policy tenant_memberships_select_visible on public.tenant_memberships
  for select using (
    user_id = (select auth.uid())
    or public.is_tenant_member(tenant_memberships.tenant_id)
  );

drop policy if exists select_own_expenses on public.expenses;
create policy select_own_expenses on public.expenses
  for select to authenticated
  using (owner_id = auth.uid());

drop policy if exists insert_own_expenses on public.expenses;
create policy insert_own_expenses on public.expenses
  for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists update_own_expenses on public.expenses;
create policy update_own_expenses on public.expenses
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists delete_own_expenses on public.expenses;
create policy delete_own_expenses on public.expenses
  for delete to authenticated
  using (owner_id = auth.uid());

drop policy if exists expenses_select_tenant on public.expenses;
create policy expenses_select_tenant on public.expenses
  for select using (public.is_tenant_member(tenant_id));

drop policy if exists expenses_insert_tenant on public.expenses;
create policy expenses_insert_tenant on public.expenses
  for insert with check (
    public.is_tenant_member(tenant_id)
    and public.has_tenant_role(tenant_id, array['admin', 'user']::text[])
    and user_id = (select auth.uid())
  );

drop policy if exists expenses_update_tenant on public.expenses;
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

drop policy if exists expenses_delete_tenant on public.expenses;
create policy expenses_delete_tenant on public.expenses
  for delete using (
    public.is_tenant_member(tenant_id)
    and public.has_tenant_role(tenant_id, array['admin', 'user']::text[])
    and user_id = (select auth.uid())
  );

drop policy if exists tenant_billing_customers_select_admin_billing
  on public.tenant_billing_customers;
create policy tenant_billing_customers_select_admin_billing
  on public.tenant_billing_customers
  for select
  using (
    public.has_tenant_role(
      tenant_billing_customers.tenant_id,
      array['admin', 'billing']::text[]
    )
  );

drop policy if exists tenant_subscriptions_select_admin_billing
  on public.tenant_subscriptions;
create policy tenant_subscriptions_select_admin_billing
  on public.tenant_subscriptions
  for select
  using (
    public.has_tenant_role(
      tenant_subscriptions.tenant_id,
      array['admin', 'billing']::text[]
    )
  );

drop policy if exists billing_events_select_admin_billing on public.billing_events;

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------

grant all privileges on table public.billing_events to postgres;
grant all privileges on table public.billing_events to service_role;

grant all privileges on table public.expenses to anon;
grant all privileges on table public.expenses to authenticated;
grant all privileges on table public.expenses to postgres;
grant all privileges on table public.expenses to service_role;

grant all privileges on table public.expenses_orphan_archive_002 to postgres;
grant all privileges on table public.expenses_orphan_archive_002 to service_role;

grant all privileges on table public.profiles to anon;
grant all privileges on table public.profiles to authenticated;
grant all privileges on table public.profiles to postgres;
grant all privileges on table public.profiles to service_role;

grant select on table public.tenant_billing_customers to authenticated;
grant all privileges on table public.tenant_billing_customers to postgres;
grant all privileges on table public.tenant_billing_customers to service_role;

grant all privileges on table public.tenant_memberships to anon;
grant all privileges on table public.tenant_memberships to authenticated;
grant all privileges on table public.tenant_memberships to postgres;
grant all privileges on table public.tenant_memberships to service_role;

grant select on table public.tenant_subscriptions to authenticated;
grant all privileges on table public.tenant_subscriptions to postgres;
grant all privileges on table public.tenant_subscriptions to service_role;

grant all privileges on table public.tenants to anon;
grant all privileges on table public.tenants to authenticated;
grant all privileges on table public.tenants to postgres;
grant all privileges on table public.tenants to service_role;

