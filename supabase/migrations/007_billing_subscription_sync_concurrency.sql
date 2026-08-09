-- =============================================================================
-- I4.3BD / M2 — subscription sync concurrency schema (additive)
-- =============================================================================
-- Additive on top of supabase/migrations/000_baseline_current_schema.sql.
-- Does NOT rewrite the baseline. Does NOT require archive migrations 001–006.
--
-- Introduces:
--   1) W_sub columns on public.tenant_subscriptions
--   2) public.tenants.billing_state_revision
--   3) Trigger G1: bump billing_state_revision on tenant_subscriptions mutations
--
-- Explicitly out of scope:
--   Snapshot H2, webhook wiring, mappers, RLS/GRANT changes, SECURITY DEFINER.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- W_sub on public.tenant_subscriptions
-- last_applied_provider_event_created_at = Event admission watermark (NOT Stripe
--   subscription version / provider snapshot freshness / DB clock).
-- last_applied_provider_event_id = applied Event id + local CAS token (NOT a
--   chronological clock / lexicographic freshness tie-break).
-- Both start NULL on existing rows; no unique/index/FK/default/not-null.
-- -----------------------------------------------------------------------------

alter table public.tenant_subscriptions
  add column last_applied_provider_event_created_at bigint null;

alter table public.tenant_subscriptions
  add column last_applied_provider_event_id text null;

comment on column public.tenant_subscriptions.last_applied_provider_event_created_at is
  'W_sub: admission watermark of the provider Event applied to this subscription row (event.created). Not Stripe subscription version, not provider snapshot freshness, not DB updated_at.';

comment on column public.tenant_subscriptions.last_applied_provider_event_id is
  'W_sub: id of the provider Event applied to this subscription row; local CAS token. Not a chronological clock.';

-- -----------------------------------------------------------------------------
-- billing_state_revision on public.tenants
-- Local monotone generation of the tenant_subscriptions SET for the tenant.
-- NOT provider event watermark / Stripe timestamp / snapshot-write counter /
-- current subscription version. Existing rows initialize to 0 via DEFAULT.
-- -----------------------------------------------------------------------------

alter table public.tenants
  add column billing_state_revision bigint not null default 0;

comment on column public.tenants.billing_state_revision is
  'Local monotone generation of the tenant_subscriptions set for this tenant. Advanced by trigger G1 on subscription INSERT/UPDATE/DELETE. Snapshot H2 writes must not bump this column.';

-- -----------------------------------------------------------------------------
-- Trigger G1 function — SECURITY INVOKER (default least privilege)
-- Writers of tenant_subscriptions are server-side (service_role / postgres) with
-- UPDATE privilege on public.tenants and RLS bypass. Authenticated clients have
-- SELECT-only on tenant_subscriptions and no UPDATE policy path that would make
-- this trigger fire under a restricted role. INVOKER is therefore sufficient;
-- SECURITY DEFINER is intentionally not used.
-- -----------------------------------------------------------------------------

create function public.bump_tenant_billing_state_revision()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.tenants
       set billing_state_revision = billing_state_revision + 1
     where id = new.tenant_id;
    return new;
  end if;

  if tg_op = 'DELETE' then
    update public.tenants
       set billing_state_revision = billing_state_revision + 1
     where id = old.tenant_id;
    return old;
  end if;

  -- UPDATE: conservative bump on every executed row update (including logical
  -- no-ops). If tenant_id changes (not authorized by app policy, but possible
  -- at SQL level), bump both OLD and NEW tenants once each.
  if old.tenant_id = new.tenant_id then
    update public.tenants
       set billing_state_revision = billing_state_revision + 1
     where id = new.tenant_id;
  else
    update public.tenants
       set billing_state_revision = billing_state_revision + 1
     where id = old.tenant_id;

    update public.tenants
       set billing_state_revision = billing_state_revision + 1
     where id = new.tenant_id;
  end if;

  return new;
end;
$$;

comment on function public.bump_tenant_billing_state_revision() is
  'G1: AFTER row trigger helper. Increments public.tenants.billing_state_revision for the tenant(s) whose tenant_subscriptions set changed. Runs as SECURITY INVOKER in the same transaction as the subscription mutation.';

-- -----------------------------------------------------------------------------
-- Trigger G1 on public.tenant_subscriptions
-- -----------------------------------------------------------------------------

create trigger trg_tenant_subscriptions_billing_state_revision
  after insert or update or delete on public.tenant_subscriptions
  for each row
  execute function public.bump_tenant_billing_state_revision();
