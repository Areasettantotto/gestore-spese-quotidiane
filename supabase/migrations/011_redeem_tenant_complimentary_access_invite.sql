-- =============================================================================
-- Tenant complimentary access invite redemption (additive)
-- =============================================================================
-- Additive on top of 000_baseline_current_schema.sql,
-- 007_billing_subscription_sync_concurrency.sql,
-- 008_tenant_subscriptions_product_tier.sql,
-- 009_tenant_complimentary_access_grant.sql, and
-- 010_tenant_complimentary_access_invites.sql.
--
-- Introduces:
--   public.redeem_tenant_complimentary_access_invite(text)
--   Atomic consume of a one-time invite (010) plus apply of its pinned
--   tenant/tier as the current complimentary grant (009).
--
-- CASO A: existing-tenant commercial activation. Server-only
-- (postgres / service_role). No browser EXECUTE.
--
-- Explicitly out of scope:
--   raw token, membership/IAM, Stripe, operator allowlist, redeemer identity,
--   table/policy/trigger changes, Edge/HTTP wrapper.
-- =============================================================================

create function public.redeem_tenant_complimentary_access_invite(p_token_hash text)
returns table (
  ok boolean,
  reason text,
  invite_id uuid,
  tenant_id uuid,
  product_tier text,
  redeemed_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_found boolean;
  v_now timestamptz;
  v_invite_id uuid;
  v_tenant_id uuid;
  v_product_tier text;
  v_redeemed_at timestamptz;
  v_revoked_at timestamptz;
  v_expires_at timestamptz;
  v_written_redeemed_at timestamptz;
  v_updated_count integer;
begin
  select
    i.id,
    i.tenant_id,
    i.product_tier,
    i.redeemed_at,
    i.revoked_at,
    i.expires_at
    into
      v_invite_id,
      v_tenant_id,
      v_product_tier,
      v_redeemed_at,
      v_revoked_at,
      v_expires_at
    from public.tenant_complimentary_access_invites as i
   where i.token_hash = p_token_hash
     for update;

  v_found := found;
  v_now := pg_catalog.now();

  if not v_found then
    return query
    select
      false,
      'token_not_found'::text,
      null::uuid,
      null::uuid,
      null::text,
      null::timestamptz;
    return;
  end if;

  if v_redeemed_at is not null then
    return query
    select
      false,
      'invite_already_redeemed'::text,
      null::uuid,
      null::uuid,
      null::text,
      null::timestamptz;
    return;
  end if;

  if v_revoked_at is not null then
    return query
    select
      false,
      'invite_revoked'::text,
      null::uuid,
      null::uuid,
      null::text,
      null::timestamptz;
    return;
  end if;

  if v_expires_at <= v_now then
    return query
    select
      false,
      'invite_expired'::text,
      null::uuid,
      null::uuid,
      null::text,
      null::timestamptz;
    return;
  end if;

  insert into public.tenant_complimentary_access_grants (
    tenant_id,
    product_tier
  )
  values (
    v_tenant_id,
    v_product_tier
  )
  on conflict (tenant_id) do update
    set product_tier = excluded.product_tier;

  update public.tenant_complimentary_access_invites as i
     set redeemed_at = v_now
   where i.id = v_invite_id
     and i.redeemed_at is null
     and i.revoked_at is null
     and i.expires_at > v_now
  returning i.redeemed_at
    into v_written_redeemed_at;

  get diagnostics v_updated_count = row_count;

  if v_updated_count <> 1 or v_written_redeemed_at is null then
    raise exception
      'redeem_tenant_complimentary_access_invite: consume update did not modify the expected invite row';
  end if;

  return query
  select
    true,
    null::text,
    v_invite_id,
    v_tenant_id,
    v_product_tier,
    v_written_redeemed_at;
end;
$$;

comment on function public.redeem_tenant_complimentary_access_invite(text) is
  'CASO A existing-tenant commercial activation: atomically consume a one-time complimentary invite and apply its pinned tenant/tier as the current complimentary grant. Input is token_hash only; raw bearer token is never accepted or stored. Grant insert-if-absent or update-tier-if-present; consume and grant share one DB call. Not membership, IAM, Stripe, or browser-callable; server-only (service_role / postgres).';

revoke execute on function public.redeem_tenant_complimentary_access_invite(text) from public;
revoke execute on function public.redeem_tenant_complimentary_access_invite(text) from anon;
revoke execute on function public.redeem_tenant_complimentary_access_invite(text) from authenticated;

grant execute on function public.redeem_tenant_complimentary_access_invite(text) to service_role;
grant execute on function public.redeem_tenant_complimentary_access_invite(text) to postgres;
