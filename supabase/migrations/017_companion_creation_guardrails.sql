-- =============================================================================
-- DATA-51 — Companion creation server guardrails (additive)
-- =============================================================================
-- Additive on top of 016_companions_core_authorization.sql.
-- Does not modify 000_baseline_current_schema.sql or 016.
--
-- Server prerequisites for a future direct authenticated admin INSERT.
-- No RPC, no Edge Function, no RLS redesign, no delegation, no DELETE.
--
-- Invariants:
--   1. Create and reactivation serialize on the target tenant_settings row
--      (SELECT ... FOR UPDATE). Missing settings row fails closed.
--   2. INSERT requires companions_enabled = true.
--      Reactivation (is_active false → true) requires companions_enabled = true.
--      Deactivation (true → false) stays allowed when the feature is off.
--      Display-name-only UPDATE does not fire this guard.
--   3. After a committed create or reactivation, active companions
--      (tenant_id + is_active = true) are at most 20. Inactive rows do not
--      consume a slot.
--   4. display_name must contain a non-space character:
--      char_length(btrim(display_name)) > 0.
--      No uniqueness, max length, case fold, or persisted trim.
--   5. authenticated INSERT is limited to (tenant_id, display_name).
--      id, is_active, delegated_auth_user_id, created_at, updated_at stay
--      on server defaults.
--   6. authenticated UPDATE no longer includes delegated_auth_user_id.
--      display_name and is_active remain. postgres / service_role ALL from
--      016 is unchanged.
--
-- Lock correctness assumes READ COMMITTED (PostgreSQL and PostgREST default):
-- the count statement takes a new snapshot after FOR UPDATE returns, so it
-- sees a peer create/reactivation that committed while this transaction waited.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) display_name nonblank
-- -----------------------------------------------------------------------------
-- Validates existing rows at apply time. Apply fails if an existing
-- display_name is empty after btrim. btrim removes the space character
-- (U+0020) only. This migration does not rewrite data.

alter table public.tenant_companions
  add constraint tenant_companions_display_name_nonblank
  check (char_length(btrim(display_name)) > 0);

comment on constraint tenant_companions_display_name_nonblank
  on public.tenant_companions is
  'DATA-51: char_length(btrim(display_name)) > 0. Rejects a name with no non-space character. Does not trim, normalize, cap length, or enforce uniqueness.';

-- -----------------------------------------------------------------------------
-- 2) Narrow authenticated INSERT; drop delegated_auth_user_id UPDATE
-- -----------------------------------------------------------------------------
-- 016 granted table-level INSERT and UPDATE
-- (display_name, is_active, delegated_auth_user_id).
-- Inverse of that table INSERT, then column INSERT only.
-- Column UPDATE on delegated_auth_user_id is revoked; the two catalog columns
-- are re-granted so the authenticated end state is explicit in this file.
-- SELECT is untouched. No DELETE grant. anon remains revoked from 016.
-- postgres and service_role keep ALL from 016, including delegated_auth_user_id.

revoke insert on table public.tenant_companions from authenticated;

revoke update (delegated_auth_user_id)
  on table public.tenant_companions
  from authenticated;

grant insert (tenant_id, display_name)
  on table public.tenant_companions
  to authenticated;

grant update (display_name, is_active)
  on table public.tenant_companions
  to authenticated;

-- -----------------------------------------------------------------------------
-- 3) Activation guard
-- -----------------------------------------------------------------------------
-- SECURITY INVOKER. 016 already grants authenticated
-- UPDATE (companions_enabled) on public.tenant_settings. SELECT ... FOR
-- UPDATE needs SELECT plus UPDATE on at least one column of the table. It
-- does not need table-level UPDATE.
--
-- Which settings row can be locked is decided by the existing RLS policies
-- tenant_settings_select_admin and tenant_settings_update_admin. This
-- function does not bypass RLS and does not check auth.uid() or tenant role.
-- A caller who cannot see the settings row gets zero rows and fails closed.
--
-- EXECUTE stays revoked from public, anon, and authenticated. PostgreSQL
-- checks EXECUTE at CREATE TRIGGER time, not when DML fires the trigger.
-- This function is not an RPC.

create function public.enforce_tenant_companion_creation_guardrails()
returns trigger
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_companions_enabled boolean;
  v_active_count bigint;
begin
  -- Deactivation and is_active no-ops are not feature-gated and do not
  -- consume capacity. Display-name-only UPDATE does not fire this trigger.
  if tg_op = 'UPDATE'
     and not (old.is_active = false and new.is_active = true) then
    return new;
  end if;

  -- Serializes create/reactivation for this tenant until commit/rollback.
  select ts.companions_enabled
    into v_companions_enabled
  from public.tenant_settings ts
  where ts.tenant_id = new.tenant_id
  for update;

  if not found then
    raise exception
      'tenant_companions requires a tenant_settings row for the target tenant (DATA-51)';
  end if;

  if v_companions_enabled is not true then
    if tg_op = 'INSERT' then
      raise exception
        'companion creation is disabled while companions_enabled is false (DATA-51)';
    end if;

    raise exception
      'companion reactivation is disabled while companions_enabled is false (DATA-51)';
  end if;

  -- Inactive INSERT is feature-gated and serialized, but does not take a slot.
  if tg_op = 'INSERT' and new.is_active is distinct from true then
    return new;
  end if;

  -- BEFORE INSERT does not yet see this candidate row. Rows already processed
  -- by the same command are visible because this function is VOLATILE.
  -- Reactivation excludes NEW.id so the current inactive row is not counted.
  select count(*)
    into v_active_count
  from public.tenant_companions tc
  where tc.tenant_id = new.tenant_id
    and tc.is_active = true
    and tc.id is distinct from new.id;

  if v_active_count >= 20 then
    raise exception
      'active companion limit of 20 per tenant was reached (DATA-51)';
  end if;

  return new;
end;
$$;

comment on function public.enforce_tenant_companion_creation_guardrails() is
  'DATA-52: BEFORE INSERT or UPDATE OF is_active. SECURITY INVOKER. Locks public.tenant_settings for NEW.tenant_id under existing tenant_settings SELECT and UPDATE admin RLS. authenticated already has UPDATE(companions_enabled), so FOR UPDATE does not need table-level UPDATE. Requires companions_enabled for create and reactivation, and refuses a 21st active companion. Deactivation stays allowed while the feature is off. No RLS bypass. Not an RPC.';

revoke execute on function public.enforce_tenant_companion_creation_guardrails() from public;
revoke execute on function public.enforce_tenant_companion_creation_guardrails() from anon;
revoke execute on function public.enforce_tenant_companion_creation_guardrails() from authenticated;

drop trigger if exists trg_tenant_companions_enforce_creation_guardrails
  on public.tenant_companions;

create trigger trg_tenant_companions_enforce_creation_guardrails
  before insert or update of is_active
  on public.tenant_companions
  for each row
  execute function public.enforce_tenant_companion_creation_guardrails();

comment on trigger trg_tenant_companions_enforce_creation_guardrails
  on public.tenant_companions is
  'DATA-51: creation and reactivation guard. Fires BEFORE INSERT and BEFORE UPDATE OF is_active. Does not fire for display_name-only UPDATE. No DELETE path.';
