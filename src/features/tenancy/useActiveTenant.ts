import { useCallback, useRef, useState } from 'react';

import { resolveTenantContextFromProfileRow } from './tenancy.mapper';
import { fetchProfileTenantContext } from './tenancy.repository';
import type { TenantRole } from './tenancy.types';

const NO_DEFAULT_TENANT_MESSAGE =
  'Il tuo profilo non ha un workspace predefinito (default_tenant_id). Verifica la configurazione dell’account o contatta chi gestisce il progetto.';

const PROFILE_LOAD_FAILED_MESSAGE =
  'Impossibile caricare il profilo o il workspace. Controlla la connessione e riprova.';

type TenantBootstrapResult = {
  defaultTenantId: string | null;
  membershipRole: TenantRole | null;
};

export function useActiveTenant() {
  const [activeTenantId, setActiveTenantId] = useState<string | null>(null);
  const [membershipRole, setMembershipRole] = useState<TenantRole | null>(null);
  const [isTenantContextLoading, setIsTenantContextLoading] = useState(false);
  const [tenantError, setTenantError] = useState<string | null>(null);

  /** In-flight bootstrap per userId: dedupes concurrent loadDefaultTenant calls. */
  const inflightByUser = useRef<Map<string, Promise<TenantBootstrapResult>>>(new Map());
  /** Bumped on reset so late fetch resolutions never repopulate state after logout. */
  const tenancyEpoch = useRef(0);

  const resetTenantState = useCallback(() => {
    tenancyEpoch.current += 1;
    inflightByUser.current.clear();
    setActiveTenantId(null);
    setMembershipRole(null);
    setTenantError(null);
    setIsTenantContextLoading(false);
  }, []);

  const applyBootstrapResult = useCallback((resolved: TenantBootstrapResult) => {
    const tid = resolved.defaultTenantId;
    setActiveTenantId(tid);
    setMembershipRole(resolved.membershipRole);

    if (!tid) {
      setTenantError(NO_DEFAULT_TENANT_MESSAGE);
    } else {
      setTenantError(null);
    }
  }, []);

  /** Loads profile + memberships; returns default tenant id once resolution completes. */
  const loadDefaultTenant = useCallback(async (uid: string): Promise<string | null> => {
    const inflight = inflightByUser.current;
    const existing = inflight.get(uid);
    if (existing) {
      const r = await existing;
      return r.defaultTenantId;
    }

    const epochAtStart = tenancyEpoch.current;

    const promise = (async (): Promise<TenantBootstrapResult> => {
      setIsTenantContextLoading(true);
      setTenantError(null);

      const { data, error } = await fetchProfileTenantContext(uid);

      if (epochAtStart !== tenancyEpoch.current) {
        return { defaultTenantId: null, membershipRole: null };
      }

      if (error) {
        console.error('Failed to load profile / tenant context', error);
        const failed: TenantBootstrapResult = { defaultTenantId: null, membershipRole: null };
        if (epochAtStart === tenancyEpoch.current) {
          setActiveTenantId(null);
          setMembershipRole(null);
          setTenantError(PROFILE_LOAD_FAILED_MESSAGE);
        }
        return failed;
      }

      const resolved = resolveTenantContextFromProfileRow(data ?? undefined);
      if (epochAtStart === tenancyEpoch.current) {
        applyBootstrapResult(resolved);
      }
      return resolved;
    })().finally(() => {
      inflight.delete(uid);

      if (epochAtStart === tenancyEpoch.current) {
        setIsTenantContextLoading(false);
      }
    });

    inflight.set(uid, promise);
    const result = await promise;
    return result.defaultTenantId;
  }, [applyBootstrapResult]);

  /** Tenant id for Supabase mutations: prefers state, re-fetches profile if missing (avoids stale null). */
  const resolveTenantForMutation = useCallback(
    async (uid: string): Promise<string | null> => {
      if (activeTenantId) return activeTenantId;
      const r = await loadDefaultTenant(uid);
      return r;
    },
    [activeTenantId, loadDefaultTenant]
  );

  return {
    /** Tenant currently used for data access (default workspace until a switcher exists). */
    activeTenantId,
    /** Same as activeTenantId in this phase; explicit name for callers that think in profile terms. */
    defaultTenantId: activeTenantId,
    membershipRole,
    isTenantContextLoading,
    tenantError,
    loadDefaultTenant,
    resolveTenantForMutation,
    resetTenantState,
  };
}
