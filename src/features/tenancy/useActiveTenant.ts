import { useCallback, useState } from 'react';

import { fetchProfileDefaultTenantId } from './tenancy.repository';

function normalizeTenantId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

export function useActiveTenant() {
  const [activeTenantId, setActiveTenantId] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  const resetTenantState = useCallback(() => {
    setActiveTenantId(null);
    setProfileError(null);
  }, []);

  /** Loads profile and returns default tenant id (for immediate use before React state commits). */
  const loadDefaultTenant = useCallback(async (uid: string): Promise<string | null> => {
    const { data, error } = await fetchProfileDefaultTenantId(uid);

    if (error) {
      console.error('Failed to load profile / default tenant', error);
      setActiveTenantId(null);
      setProfileError('Impossibile caricare il profilo o il workspace predefinito.');
      return null;
    }
    const tid = normalizeTenantId(data?.default_tenant_id);
    setActiveTenantId(tid);
    if (!tid) {
      setProfileError(
        'Nessun workspace predefinito sul profilo. Applica la migration SaaS su Supabase o riprova tra poco.'
      );
    } else {
      setProfileError(null);
    }
    return tid;
  }, []);

  /** Tenant id for Supabase mutations: prefers state, re-fetches profile if missing (avoids stale null). */
  const resolveTenantForMutation = useCallback(
    async (uid: string): Promise<string | null> => {
      if (activeTenantId) return activeTenantId;
      return loadDefaultTenant(uid);
    },
    [activeTenantId, loadDefaultTenant]
  );

  return {
    activeTenantId,
    profileError,
    loadDefaultTenant,
    resolveTenantForMutation,
    resetTenantState,
  };
}
