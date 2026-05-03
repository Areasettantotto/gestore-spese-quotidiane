import { supabase } from '@/src/lib/supabaseClient';

import type { ProfileTenantContextRow, TenantMembership } from './tenancy.types';

/**
 * Loads profile default tenant and all memberships for the user.
 * Uses two selects (no FK from tenant_memberships → profiles in DB), merged client-side.
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

  const merged: ProfileTenantContextRow = {
    id: profile?.id ?? userId,
    default_tenant_id: profile?.default_tenant_id ?? null,
    tenant_memberships: (membershipRows ?? []) as TenantMembership[],
  };

  return { data: merged, error: null };
}
