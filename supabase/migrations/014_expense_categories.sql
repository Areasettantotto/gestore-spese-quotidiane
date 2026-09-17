-- =============================================================================
-- DATA-11 — Expense category catalog EXPAND + temporary compatibility bridge
-- =============================================================================
-- Additive on top of 000_baseline_current_schema.sql and 007→013.
--
-- Introduces:
--   public.expense_categories          (global reference catalog; code PK)
--   public.expenses.category_code      (nullable FK during EXPAND)
--   temporary BEFORE INSERT OR UPDATE bridge:
--     expenses.category (legacy) → expenses.category_code
--   backfill from exact legacy labels (after the trigger is active)
--
-- Product contract (EXPAND only):
--   Catalog identity is the stable machine code (text PK). No surrogate id,
--   no tenant_id, no localized label, no icon/color/active flag.
--   Seeded codes: food, transport, home, leisure, health, personal, other.
--   Shopping is a legacy Italian label, not a code; it maps to personal.
--   Personale is a future UI label only; it is never written to category.
--
--   expenses.category (text NOT NULL) is unchanged.
--   expenses.category_code stays nullable. No CONTRACT, no DROP category.
--
--   Catalog RLS: SELECT for authenticated; no frontend writes.
--   expenses RLS/policies are not modified; the new column follows the row.
--
-- Temporary bridge (until a future CONTRACT migration):
--   Legacy category is the compatibility source of truth.
--   The trigger always derives category_code from NEW.category for the seven
--   known labels, including when category_code is already populated.
--   It is not a "fill only if NULL" trigger.
--
-- Explicitly out of scope:
--   SET NOT NULL, DROP/rename category, Shopping→Personale text rewrite,
--   frontend, tags, budgets, AI, baseline 000, expenses RLS, extra indexes.
-- =============================================================================

-- Fail-closed read-only precheck. Exact-set membership only: no trim, lower,
-- normalization, or remap-to-other. Runs before any schema/data mutation so a
-- drifted dataset cannot partially apply 014 even if the runner does not wrap
-- the whole file in a single transaction.
do $$
declare
  unmapped_count integer;
  unmapped_labels text;
begin
  select count(*)::integer
    into unmapped_count
  from public.expenses
  where category is null
     or category not in (
       'Alimentazione',
       'Trasporti',
       'Casa',
       'Svago',
       'Salute',
       'Shopping',
       'Altro'
     );

  if unmapped_count > 0 then
    select string_agg(distinct category, ', ' order by category)
      into unmapped_labels
    from public.expenses
    where category is null
       or category not in (
         'Alimentazione',
         'Trasporti',
         'Casa',
         'Svago',
         'Salute',
         'Shopping',
         'Altro'
       );

    raise exception
      '014 expense category precheck refused: % existing row(s) have legacy category value(s) outside the exact set {Alimentazione, Trasporti, Casa, Svago, Salute, Shopping, Altro}: %. Exact-match only; no trim, lower, or remap to other.',
      unmapped_count,
      unmapped_labels;
  end if;
end;
$$;

create table public.expense_categories (
  code text primary key
);

comment on table public.expense_categories is
  'Global system catalog of stable expense category codes. Not tenant-scoped. Presentation labels live in the frontend. Seeded and evolved only by migration.';

comment on column public.expense_categories.code is
  'Stable machine identity (PK/FK). Immutable by application clients.';

insert into public.expense_categories (code)
values
  ('food'),
  ('transport'),
  ('home'),
  ('leisure'),
  ('health'),
  ('personal'),
  ('other');

alter table public.expense_categories enable row level security;

revoke all on table public.expense_categories from anon;
revoke all on table public.expense_categories from authenticated;

grant select on table public.expense_categories to authenticated;

grant all privileges on table public.expense_categories to postgres;
grant all privileges on table public.expense_categories to service_role;

create policy expense_categories_select_authenticated
  on public.expense_categories
  for select
  to authenticated
  using (true);

alter table public.expenses
  add column category_code text null;

comment on column public.expenses.category_code is
  'Stable category identity. Nullable during EXPAND. FK to public.expense_categories(code). Backfilled and kept in sync from legacy category by a temporary trigger.';

alter table public.expenses
  add constraint expenses_category_code_fkey
    foreign key (category_code)
    references public.expense_categories (code)
    on update restrict
    on delete restrict;

-- SECURITY INVOKER: only assigns NEW.category_code. No table writes, no
-- catalog lookup (catalog has codes, not legacy labels). search_path is
-- pinned empty as defense in depth, consistent with 007/011.
create function public.sync_expense_category_code_from_legacy()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.category_code := case new.category
    when 'Alimentazione' then 'food'
    when 'Trasporti' then 'transport'
    when 'Casa' then 'home'
    when 'Svago' then 'leisure'
    when 'Salute' then 'health'
    when 'Shopping' then 'personal'
    when 'Altro' then 'other'
    else null
  end;

  return new;
end;
$$;

comment on function public.sync_expense_category_code_from_legacy() is
  'TEMPORARY EXPAND bridge. BEFORE INSERT OR UPDATE: derive expenses.category_code from exact legacy expenses.category. Not bidirectional. Drop at CONTRACT. Unknown labels leave category_code NULL; they are not mapped to other.';

-- Trigger function is not an RPC. PostgreSQL checks EXECUTE at CREATE TRIGGER
-- time (migration owner), not when DML fires the trigger. Repository pattern:
-- 003 revokes PUBLIC/anon/authenticated with no service_role grant; 007 grants
-- nothing. No application EXECUTE surface.
revoke execute on function public.sync_expense_category_code_from_legacy() from public;
revoke execute on function public.sync_expense_category_code_from_legacy() from anon;
revoke execute on function public.sync_expense_category_code_from_legacy() from authenticated;

create trigger trg_expenses_sync_category_code_from_legacy
  before insert or update on public.expenses
  for each row
  execute function public.sync_expense_category_code_from_legacy();

comment on trigger trg_expenses_sync_category_code_from_legacy on public.expenses is
  'TEMPORARY EXPAND bridge. Always resyncs category_code from legacy category, including when category_code is already populated.';

-- Exact-match only. Unknown values would become NULL and are not mapped to
-- other. Existing-row drift is refused by the read-only precheck above, so
-- this UPDATE cannot silently leave NULL gaps on a successful apply.
-- Must run after the trigger is already installed: concurrent writes during
-- apply are either synced by the trigger or collected by this backfill.
update public.expenses
set category_code = case category
  when 'Alimentazione' then 'food'
  when 'Trasporti' then 'transport'
  when 'Casa' then 'home'
  when 'Svago' then 'leisure'
  when 'Salute' then 'health'
  when 'Shopping' then 'personal'
  when 'Altro' then 'other'
  else null
end;
