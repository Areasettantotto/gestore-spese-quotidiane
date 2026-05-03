import { supabase } from '@/src/lib/supabaseClient';

import type {
  ActiveTenantRow,
  ProfileTenantContextRow,
  TenantMembership,
} from './tenancy.types';

/**
 * Loads profile default tenant and all memberships for the user.
 * Uses selects merged client-side; when `default_tenant_id` is set, loads the tenant row
 * for plan / demo readiness (public.tenants after migration 005).
 */
export async function fetchProfileTenantContext(userId: string) {
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, default_tenant_id')
    .eq('id', userId)
    .maybeSingle<Pick<ProfileTenantContextRow, 'id' | 'default_tenant_id'>>();

  if (profileError) {
    return { data: null as ProfileTenantContextRow | null, error: profileError };
  }

  const { data: membershipRows, error: membershipError } = await supabase
    .from('tenant_memberships')
    .select('tenant_id, role')
    .eq('user_id', userId);

  if (membershipError) {
    return { data: null as ProfileTenantContextRow | null, error: membershipError };
  }

  const defaultTenantId = profile?.default_tenant_id ?? null;
  let active_tenant: ActiveTenantRow | null = null;

  if (defaultTenantId) {
    const { data: tenantRow, error: tenantError } = await supabase
      .from('tenants')
      .select('id, name, is_personal, plan_code, subscription_status, is_demo, trial_ends_at')
      .eq('id', defaultTenantId)
      .maybeSingle<ActiveTenantRow>();

    if (tenantError) {
      console.error('Failed to load tenant row for plan readiness', tenantError);
    } else if (tenantRow) {
      active_tenant = tenantRow;
    }
  }

  const merged: ProfileTenantContextRow = {
    id: profile?.id ?? userId,
    default_tenant_id: profile?.default_tenant_id ?? null,
    tenant_memberships: (membershipRows ?? []) as TenantMembership[],
    active_tenant,
  };

  return { data: merged, error: null };
}
