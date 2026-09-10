-- =============================================================================
-- DATA-03 — Tenant monthly budgets (additive)
-- DATA-04 — Identity immutability for authenticated (column-level UPDATE)
-- =============================================================================
-- Additive on top of 000_baseline_current_schema.sql and 007→012.
--
-- Introduces:
--   public.tenant_monthly_budgets
--   One planned monthly budget amount per tenant per calendar month.
--
-- Product contract (DATA-03 + DATA-04):
--   SELECT  : membership roles admin | user (historical months included)
--   INSERT  : admin, current and future months only
--   UPDATE  : admin, current and future months only; authenticated may
--             UPDATE only column amount (tenant_id and period_month
--             are immutable after INSERT for the normal client)
--   DELETE  : admin, current and future months only
--   billing : no SELECT / INSERT / UPDATE / DELETE
--   ProductTier does not gate Budget access or write authority.
--   Natural key (tenant_id, period_month) is not mutated in place;
--   changing month is a new row or authorized delete+insert.
--
-- Current-month boundary is server-authoritative PostgreSQL:
--   (date_trunc('month', CURRENT_DATE))::date
-- Session TimeZone (Supabase default UTC). No tenant timezone column.
--
-- Explicitly out of scope:
--   UI, Settings, repository/hooks, RPC/upsert function, Edge, Realtime,
--   ProductTier gating, expense RLS, membership invite, onboarding,
--   derived spent/remaining/percentage columns, seed, surrogate id.
-- =============================================================================

create table public.tenant_monthly_budgets (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  period_month date not null,
  amount numeric(12, 2) not null,
  constraint tenant_monthly_budgets_pkey
    primary key (tenant_id, period_month),
  constraint tenant_monthly_budgets_amount_positive_check
    check (amount > 0),
  constraint tenant_monthly_budgets_period_month_first_day_check
    check (period_month = (date_trunc('month', period_month))::date)
);

comment on table public.tenant_monthly_budgets is
  'Tenant-scoped planned monthly budget. Natural key (tenant_id, period_month). Absence of a row means budget is not configured for that month. Amount is the planned figure only; spent/remaining/percentage are derived. Distinct from ProductTier and from expenses.';

comment on column public.tenant_monthly_budgets.tenant_id is
  'Owning workspace. Cascades with public.tenants. Immutable after INSERT for authenticated (no column UPDATE privilege).';

comment on column public.tenant_monthly_budgets.period_month is
  'Calendar month as the first day of that month (date). Not a YYYY-MM string. Immutable after INSERT for authenticated (no column UPDATE privilege). Historical months are also immutable via RLS write policies.';

comment on column public.tenant_monthly_budgets.amount is
  'Planned budget amount for the month. Same money type as expenses.amount (numeric(12,2)). Must be strictly greater than zero; zero is not a valid configured budget.';

alter table public.tenant_monthly_budgets enable row level security;

-- Privileges: authenticated needs DML so RLS can authorize per-role.
-- Column-level UPDATE (amount) makes tenant_id and period_month immutable
-- for the normal client even when the same admin belongs to two tenants.
-- anon has no Budget access. RLS remains the row-level authority.
revoke all on table public.tenant_monthly_budgets from anon;
revoke all on table public.tenant_monthly_budgets from authenticated;

grant select, insert, delete on table public.tenant_monthly_budgets
  to authenticated;
grant update (amount) on table public.tenant_monthly_budgets
  to authenticated;

grant all privileges on table public.tenant_monthly_budgets to postgres;
grant all privileges on table public.tenant_monthly_budgets to service_role;

create policy tenant_monthly_budgets_select_admin_user
  on public.tenant_monthly_budgets
  for select
  to authenticated
  using (
    public.has_tenant_role(
      tenant_monthly_budgets.tenant_id,
      array['admin', 'user']::text[]
    )
  );

create policy tenant_monthly_budgets_insert_admin_current_future
  on public.tenant_monthly_budgets
  for insert
  to authenticated
  with check (
    public.has_tenant_role(
      tenant_monthly_budgets.tenant_id,
      array['admin']::text[]
    )
    and tenant_monthly_budgets.period_month
      >= (date_trunc('month', CURRENT_DATE))::date
  );

create policy tenant_monthly_budgets_update_admin_current_future
  on public.tenant_monthly_budgets
  for update
  to authenticated
  using (
    public.has_tenant_role(
      tenant_monthly_budgets.tenant_id,
      array['admin']::text[]
    )
    and tenant_monthly_budgets.period_month
      >= (date_trunc('month', CURRENT_DATE))::date
  )
  with check (
    public.has_tenant_role(
      tenant_monthly_budgets.tenant_id,
      array['admin']::text[]
    )
    and tenant_monthly_budgets.period_month
      >= (date_trunc('month', CURRENT_DATE))::date
  );

create policy tenant_monthly_budgets_delete_admin_current_future
  on public.tenant_monthly_budgets
  for delete
  to authenticated
  using (
    public.has_tenant_role(
      tenant_monthly_budgets.tenant_id,
      array['admin']::text[]
    )
    and tenant_monthly_budgets.period_month
      >= (date_trunc('month', CURRENT_DATE))::date
  );
