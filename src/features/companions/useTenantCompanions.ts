import { useEffect, useRef, useState } from 'react';

import type { TenantRole } from '@/src/features/tenancy/tenancy.types';

import type { CompanionsSettingsStatus } from './useCompanionsSettings';
import { listTenantCompanions, type TenantCompanion } from './tenantCompanions';

/**
 * unavailable — tenant context still loading, or no active tenant. No query.
 * unreadable — tenant present and role is not admin. No query.
 * suppressed — settings status is not enabled or disabled. No query.
 * loading — admin read in flight, or the stored result belongs to another tenant.
 * ready — query succeeded for the active tenant. items may be empty.
 * error — request failed or a row shape was not usable.
 */
export type TenantCompanionsStatus =
  | 'unavailable'
  | 'unreadable'
  | 'suppressed'
  | 'loading'
  | 'ready'
  | 'error';

export type UseTenantCompanionsParams = {
  activeTenantId: string | null;
  membershipRole: TenantRole | null;
  isTenantContextLoading: boolean;
  companionsSettingsStatus: CompanionsSettingsStatus;
};

export type UseTenantCompanionsResult = {
  status: TenantCompanionsStatus;
  /** Present only for status ready. Empty means a successful read with no rows. */
  items: readonly TenantCompanion[];
};

type FetchedTenantCompanions = {
  tenantId: string;
  result: { kind: 'ready'; items: TenantCompanion[] } | { kind: 'error' };
};

function canReadTenantCompanions(role: TenantRole | null): role is 'admin' {
  return role === 'admin';
}

function settingsAllowCatalogRead(status: CompanionsSettingsStatus): boolean {
  return status === 'enabled' || status === 'disabled';
}

function closedResult(status: Exclude<TenantCompanionsStatus, 'ready'>): UseTenantCompanionsResult {
  return { status, items: [] };
}

export function useTenantCompanions({
  activeTenantId,
  membershipRole,
  isTenantContextLoading,
  companionsSettingsStatus,
}: UseTenantCompanionsParams): UseTenantCompanionsResult {
  const shouldRead =
    !isTenantContextLoading &&
    Boolean(activeTenantId) &&
    canReadTenantCompanions(membershipRole) &&
    settingsAllowCatalogRead(companionsSettingsStatus);

  const [fetched, setFetched] = useState<FetchedTenantCompanions | null>(null);
  const [inFlight, setInFlight] = useState(false);

  const activeTenantIdRef = useRef(activeTenantId);
  activeTenantIdRef.current = activeTenantId;
  const isMountedRef = useRef(true);
  const readGenerationRef = useRef(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!shouldRead || !activeTenantId) {
      setFetched(null);
      setInFlight(false);
      return;
    }

    const tenantId = activeTenantId;
    const generationAtStart = ++readGenerationRef.current;
    let cancelled = false;
    setInFlight(true);

    const applyResult = (result: { kind: 'ready'; items: TenantCompanion[] } | { kind: 'error' }) => {
      if (cancelled || !isMountedRef.current) return;
      if (readGenerationRef.current !== generationAtStart) return;
      if (activeTenantIdRef.current !== tenantId) return;

      setFetched({ tenantId, result });
      setInFlight(false);
    };

    void listTenantCompanions(tenantId).then(applyResult, (error: unknown) => {
      console.error('Failed to load tenant companions', error);
      applyResult({ kind: 'error' });
    });

    return () => {
      cancelled = true;
    };
  }, [activeTenantId, shouldRead]);

  if (isTenantContextLoading || !activeTenantId) {
    return closedResult('unavailable');
  }

  if (!canReadTenantCompanions(membershipRole)) {
    return closedResult('unreadable');
  }

  if (!settingsAllowCatalogRead(companionsSettingsStatus)) {
    return closedResult('suppressed');
  }

  const fetchedMatches = fetched != null && fetched.tenantId === activeTenantId;

  if (inFlight || !fetchedMatches) {
    return closedResult('loading');
  }

  if (fetched.result.kind === 'error') {
    return closedResult('error');
  }

  return {
    status: 'ready',
    items: fetched.result.items,
  };
}
