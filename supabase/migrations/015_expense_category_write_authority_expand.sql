-- =============================================================================
-- DATA-40 — EXPAND conditional category write authority
-- =============================================================================
-- Additive evolution of the 014 temporary compatibility bridge function.
--
-- CURRENT (014):
--   BEFORE INSERT OR UPDATE always derives category_code from legacy category.
--   Unknown legacy → category_code NULL (fail-open).
--   Non-category UPDATEs clobber category_code from NEW.category.
--
-- TARGET (this migration):
--   Conditional authority for the seven canonical pairs only:
--     Alimentazione ↔ food
--     Trasporti     ↔ transport
--     Casa          ↔ home
--     Svago         ↔ leisure
--     Salute        ↔ health
--     Shopping      ↔ personal
--     Altro         ↔ other
--   INSERT: legacy-only, code-only, or coherent dual → accept; else reject.
--   UPDATE: change only the field(s) that changed; no-op when neither changes.
--   Unknown / divergent / NULL-invalid → fail-closed (check_violation).
--
-- Preserved:
--   expenses.category text NOT NULL
--   expenses.category_code text NULL (FK unchanged)
--   trigger name trg_expenses_sync_category_code_from_legacy
--   function name/signature public.sync_expense_category_code_from_legacy()
--   SECURITY INVOKER + search_path = ''
--   EXECUTE revoked from PUBLIC / anon / authenticated
--
-- Explicitly out of scope:
--   CONTRACT, DROP category, category_code NOT NULL, catalog DML, expenses DML,
--   RLS/tenancy, frontend, tags, dual-write application logic, new public helpers.
-- =============================================================================

-- CREATE OR REPLACE on the same signature preserves existing ACLs; REVOKE below
-- reasserts the 014 privilege hardening idempotently (no new grants).
create or replace function public.sync_expense_category_code_from_legacy()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_code_from_legacy text;
  v_legacy_from_code text;
  category_changed boolean;
  category_code_changed boolean;
begin
  -- Exact seven-pair mapping only. No trim, lower, fuzzy, alias, or catalog lookup.
  v_code_from_legacy := case new.category
    when 'Alimentazione' then 'food'
    when 'Trasporti' then 'transport'
    when 'Casa' then 'home'
    when 'Svago' then 'leisure'
    when 'Salute' then 'health'
    when 'Shopping' then 'personal'
    when 'Altro' then 'other'
    else null
  end;

  v_legacy_from_code := case new.category_code
    when 'food' then 'Alimentazione'
    when 'transport' then 'Trasporti'
    when 'home' then 'Casa'
    when 'leisure' then 'Svago'
    when 'health' then 'Salute'
    when 'personal' then 'Shopping'
    when 'other' then 'Altro'
    else null
  end;

  if tg_op = 'INSERT' then
    if new.category is null and new.category_code is null then
      raise exception
        '015 expense category write authority: INSERT requires canonical category or category_code'
        using errcode = 'check_violation';
    end if;

    -- A. canonical legacy + NULL code → legacy authoritative
    if new.category is not null and new.category_code is null then
      if v_code_from_legacy is null then
        raise exception
          '015 expense category write authority: unknown legacy category on INSERT'
          using errcode = 'check_violation';
      end if;
      new.category_code := v_code_from_legacy;
      return new;
    end if;

    -- B. NULL legacy + canonical code → code authoritative (reverse-fill before NOT NULL)
    if new.category is null and new.category_code is not null then
      if v_legacy_from_code is null then
        raise exception
          '015 expense category write authority: unknown category_code on INSERT'
          using errcode = 'check_violation';
      end if;
      new.category := v_legacy_from_code;
      return new;
    end if;

    -- C/D/E/F. both present: require exact canonical coherence
    if v_code_from_legacy is null then
      raise exception
        '015 expense category write authority: unknown legacy category on INSERT'
        using errcode = 'check_violation';
    end if;

    if v_legacy_from_code is null then
      raise exception
        '015 expense category write authority: unknown category_code on INSERT'
        using errcode = 'check_violation';
    end if;

    if v_code_from_legacy is distinct from new.category_code then
      raise exception
        '015 expense category write authority: divergent category and category_code on INSERT'
        using errcode = 'check_violation';
    end if;

    return new;
  end if;

  if tg_op = 'UPDATE' then
    category_changed := new.category is distinct from old.category;
    category_code_changed := new.category_code is distinct from old.category_code;

    -- E. neither category field changed → no-op (preserve values; no clobber)
    if not category_changed and not category_code_changed then
      return new;
    end if;

    -- A. category changed only → legacy authoritative
    if category_changed and not category_code_changed then
      if new.category is null or v_code_from_legacy is null then
        raise exception
          '015 expense category write authority: invalid or unknown legacy category on UPDATE'
          using errcode = 'check_violation';
      end if;
      new.category_code := v_code_from_legacy;
      return new;
    end if;

    -- B. category_code changed only → code authoritative
    if category_code_changed and not category_changed then
      if new.category_code is null or v_legacy_from_code is null then
        raise exception
          '015 expense category write authority: invalid or unknown category_code on UPDATE'
          using errcode = 'check_violation';
      end if;
      new.category := v_legacy_from_code;
      return new;
    end if;

    -- C/D/F/G. both changed: require exact canonical coherence
    if new.category is null or v_code_from_legacy is null then
      raise exception
        '015 expense category write authority: invalid or unknown legacy category on UPDATE'
        using errcode = 'check_violation';
    end if;

    if new.category_code is null or v_legacy_from_code is null then
      raise exception
        '015 expense category write authority: invalid or unknown category_code on UPDATE'
        using errcode = 'check_violation';
    end if;

    if v_code_from_legacy is distinct from new.category_code then
      raise exception
        '015 expense category write authority: divergent category and category_code on UPDATE'
        using errcode = 'check_violation';
    end if;

    return new;
  end if;

  return new;
end;
$$;

comment on function public.sync_expense_category_code_from_legacy() is
  'EXPAND conditional write-authority bridge. BEFORE INSERT OR UPDATE: one semantic authority per operation among the seven canonical pairs. Legacy-only or code-only sync; coherent dual accept; unknown/divergent/NULL-invalid fail-closed. Non-category UPDATEs are no-op on category fields. Drop at CONTRACT.';

comment on trigger trg_expenses_sync_category_code_from_legacy on public.expenses is
  'EXPAND conditional write-authority bridge. Fires BEFORE INSERT OR UPDATE; function decides legacy vs code authority without always clobbering category_code.';

-- Privilege hardening reassert (idempotent). No EXECUTE grants to PUBLIC/anon/authenticated.
revoke execute on function public.sync_expense_category_code_from_legacy() from public;
revoke execute on function public.sync_expense_category_code_from_legacy() from anon;
revoke execute on function public.sync_expense_category_code_from_legacy() from authenticated;
