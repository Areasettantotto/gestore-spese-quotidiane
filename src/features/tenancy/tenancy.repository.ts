import { supabase } from '@/src/lib/supabaseClient';

import type { ProfileDefaultTenantRow } from './tenancy.types';

export async function fetchProfileDefaultTenantId(userId: string) {
  return supabase
    .from('profiles')
    .select('default_tenant_id')
    .eq('id', userId)
    .maybeSingle<ProfileDefaultTenantRow>();
}
