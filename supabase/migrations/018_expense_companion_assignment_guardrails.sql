-- =============================================================================
-- DATA-53 — Expense companion assignment guardrails (additive)
-- =============================================================================
-- Additive on top of 016_companions_core_authorization.sql and
-- 017_companion_creation_guardrails.sql.
-- Does not modify 000_baseline_current_schema.sql, 016, or 017.
--
-- Closes the admin expense-assignment gap left by 016:
--   expenses_insert_admin allows an active same-tenant companion without
--     reading tenant_settings.companions_enabled.
--   expenses_update_admin allows any same-tenant companion, including an
--     inactive one, and does not freeze the relationship while the feature
--     is off.
--
-- This migration does not rewrite those policies. RLS stays the
-- authorization layer. The composite FK
-- expenses(tenant_id, companion_id) → tenant_companions(tenant_id, id)
-- stays the tenant-isolation constraint. This trigger adds the assignment
-- invariant those two protections do not express:
--   unchanged companion_id is preserved (historical inactive link, feature
--     off, explicit same-value write);
--   a changed or new non-null companion_id requires companions_enabled and
--     an active companion in NEW.tenant_id;
--   a changed clear to null requires companions_enabled;
--   INSERT companion_id NULL stays valid for this guard.
--
-- expenses.accompagnatore is not read or written.
-- No RPC, no Edge Function, no DELETE, no delegation grant.
--
-- SECURITY INVOKER. An admin expense writer can already SELECT
-- public.tenant_settings and public.tenant_companions, including inactive
-- companions. The function does not bypass RLS and does not lock.
--
-- A delegated writer (membership role=user) cannot SELECT tenant_settings.
-- Rejecting every hidden settings row would false-reject an insert that
-- 016 already authorizes. When the settings row is not visible, the only
-- success path is NEW.companion_id = public.current_delegated_companion_id,
-- which is already fail-closed (feature on, active, same tenant, role=user,
-- Auth link). Any other hidden-row write is rejected. That branch does not
-- grant a new delegated assignment.
--
-- postgres / service_role bypass RLS, so they see the real settings row and
-- take the same feature and active checks. No service_role exemption.
--
-- Cross-tenant ids are not confirmed. The companion lookup is filtered by
-- NEW.tenant_id. Under invoker RLS a foreign companion is invisible. A
-- missing row and an inactive row raise the same exception and the message
-- contains no companion or tenant id.
--
-- EXECUTE stays revoked from public, anon, and authenticated. PostgreSQL
-- checks EXECUTE at CREATE TRIGGER time, not when DML fires the trigger.
-- This function is not an RPC.
-- =============================================================================

create function public.enforce_expenses_companion_assignment()
returns trigger
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_companions_enabled boolean;
  v_companion_active boolean;
begin
  -- Same value, including NULL → NULL. Do not revalidate active status and
  -- do not clear a historical link because the feature is off.
  if tg_op = 'UPDATE'
     and new.companion_id is not distinct from old.companion_id then
    return new;
  end if;

  -- INSERT NULL is valid for this guard even when the feature is off.
  -- A later UPDATE that changes a real id to NULL is not this case.
  if tg_op = 'INSERT' and new.companion_id is null then
    return new;
  end if;

  select ts.companions_enabled
    into v_companions_enabled
  from public.tenant_settings ts
  where ts.tenant_id = new.tenant_id;

  if not found then
    -- Settings row absent, or hidden by RLS. Preserve only the assignment
    -- the existing delegated helper already proves.
    if new.companion_id is not null
       and new.companion_id
         = public.current_delegated_companion_id(new.tenant_id) then
      return new;
    end if;

    raise exception
      'expense companion assignment requires companions_enabled for the target tenant (DATA-53)';
  end if;

  if v_companions_enabled is not true then
    raise exception
      'expense companion assignment is disabled while companions_enabled is false (DATA-53)';
  end if;

  -- Feature is on. Explicit clear of a changed relationship is valid.
  if new.companion_id is null then
    return new;
  end if;

  -- Same message for an invisible id and an inactive row so a cross-tenant
  -- id is not distinguished from a missing one.
  select tc.is_active
    into v_companion_active
  from public.tenant_companions tc
  where tc.tenant_id = new.tenant_id
    and tc.id = new.companion_id;

  if v_companion_active is not true then
    raise exception
      'expense companion assignment requires an active companion in the same tenant (DATA-53)';
  end if;

  return new;
end;
$$;

comment on function public.enforce_expenses_companion_assignment() is
  'DATA-53: BEFORE INSERT or UPDATE OF companion_id. SECURITY INVOKER. Unchanged companion_id returns immediately. INSERT NULL is allowed. A changed relationship requires companions_enabled; a non-null target must be an active companion in NEW.tenant_id. When tenant_settings is not visible, the only allow is equality with current_delegated_companion_id. Does not read expenses.accompagnatore. No RLS bypass. Not an RPC.';

revoke execute on function public.enforce_expenses_companion_assignment() from public;
revoke execute on function public.enforce_expenses_companion_assignment() from anon;
revoke execute on function public.enforce_expenses_companion_assignment() from authenticated;

drop trigger if exists trg_expenses_enforce_companion_assignment
  on public.expenses;

create trigger trg_expenses_enforce_companion_assignment
  before insert or update of companion_id
  on public.expenses
  for each row
  execute function public.enforce_expenses_companion_assignment();

comment on trigger trg_expenses_enforce_companion_assignment
  on public.expenses is
  'DATA-53: assignment invariant. Fires BEFORE INSERT and BEFORE UPDATE OF companion_id. Does not fire when an UPDATE omits companion_id. Unchanged values are allowed inside the function. No DELETE path.';
