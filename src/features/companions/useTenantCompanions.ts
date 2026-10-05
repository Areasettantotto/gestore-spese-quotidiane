import { useCallback, useEffect, useRef, useState } from 'react';

import type { TenantRole } from '@/src/features/tenancy/tenancy.types';

import type { CompanionsSettingsStatus } from './useCompanionsSettings';
import {
  COMPANION_CREATE_FAILED_MESSAGE,
  MAX_ACTIVE_TENANT_COMPANIONS,
  countActiveTenantCompanions,
  createTenantCompanion,
  listTenantCompanions,
  orderTenantCompanions,
  type TenantCompanion,
} from './tenantCompanions';

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

/**
 * created — the row is in the current tenant catalog.
 * rejected — a client guard refused the call. No insert.
 * failed — the write did not produce a usable row for the current tenant.
 * detached — the active tenant changed, or this hook unmounted, before the
 *   outcome could be applied. A successful write is not reported as a failure
 *   and is not copied onto another tenant. writeSucceeded records the server
 *   outcome when it is already known.
 */
export type TenantCompanionCreateUiResult =
  | { kind: 'created' }
  | { kind: 'rejected' }
  | { kind: 'failed'; message: string }
  | { kind: 'detached'; writeSucceeded: boolean };

export type UseTenantCompanionsResult = {
  status: TenantCompanionsStatus;
  /** Present only for status ready. Empty means a successful read with no rows. */
  items: readonly TenantCompanion[];
  /** True only while a create for the current tenant is in flight. */
  isCreating: boolean;
  /**
   * Present only when an admin may create for the current tenant:
   * settings enabled, catalog ready, and fewer than 20 active companions.
   * Null does not cancel a create that is already in flight.
   */
  createCompanion: ((displayName: string) => Promise<TenantCompanionCreateUiResult>) | null;
};

type FetchedTenantCompanions = {
  tenantId: string;
  result: { kind: 'ready'; items: TenantCompanion[] } | { kind: 'error' };
};

type CompanionCreateUi = {
  isCreating: boolean;
};

function canReadTenantCompanions(role: TenantRole | null): role is 'admin' {
  return role === 'admin';
}

function settingsAllowCatalogRead(status: CompanionsSettingsStatus): boolean {
  return status === 'enabled' || status === 'disabled';
}

function closedResult(
  status: Exclude<TenantCompanionsStatus, 'ready'>,
  isCreating = false
): UseTenantCompanionsResult {
  return { status, items: [], isCreating, createCompanion: null };
}

function catalogWithCreatedCompanion(
  items: readonly TenantCompanion[],
  created: TenantCompanion
): TenantCompanion[] {
  const next = items.filter((item) => item.id !== created.id);
  next.push(created);
  return orderTenantCompanions(next);
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
  const [creates, setCreates] = useState<Record<string, CompanionCreateUi>>({});

  const activeTenantIdRef = useRef(activeTenantId);
  activeTenantIdRef.current = activeTenantId;
  const fetchedRef = useRef(fetched);
  fetchedRef.current = fetched;
  const isMountedRef = useRef(true);
  const readGenerationRef = useRef(0);
  /**
   * At most one companion create in flight per tenant.
   * The value is that request's id. Another tenant gets its own entry and
   * cannot clear this one.
   */
  const inFlightByTenantRef = useRef<Map<string, number>>(new Map());
  const nextCreateIdRef = useRef(0);

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

  const createCompanion = useCallback(
    async (displayName: string): Promise<TenantCompanionCreateUiResult> => {
      if (isTenantContextLoading || !activeTenantId) return { kind: 'rejected' };
      if (!canReadTenantCompanions(membershipRole)) return { kind: 'rejected' };
      if (companionsSettingsStatus !== 'enabled') return { kind: 'rejected' };
      if (typeof displayName !== 'string' || displayName.trim().length === 0) {
        return { kind: 'rejected' };
      }
      if (inFlight || fetched == null || fetched.tenantId !== activeTenantId) {
        return { kind: 'rejected' };
      }
      if (fetched.result.kind !== 'ready') return { kind: 'rejected' };
      if (countActiveTenantCompanions(fetched.result.items) >= MAX_ACTIVE_TENANT_COMPANIONS) {
        return { kind: 'rejected' };
      }
      if (inFlightByTenantRef.current.has(activeTenantId)) return { kind: 'rejected' };

      const requestTenantId = activeTenantId;
      const requestId = ++nextCreateIdRef.current;
      const snapshotItems = fetched.result.items.slice();
      inFlightByTenantRef.current.set(requestTenantId, requestId);
      setCreates((current) => ({
        ...current,
        [requestTenantId]: { isCreating: true },
      }));

      const settleIdle = () => {
        if (!isMountedRef.current) return;
        setCreates((current) => ({
          ...current,
          [requestTenantId]: { isCreating: false },
        }));
      };

      const detached = (writeSucceeded: boolean): TenantCompanionCreateUiResult => {
        settleIdle();
        return { kind: 'detached', writeSucceeded };
      };

      try {
        const result = await createTenantCompanion(requestTenantId, displayName);

        if (!isMountedRef.current) {
          return { kind: 'detached', writeSucceeded: result.kind === 'created' };
        }
        if (inFlightByTenantRef.current.get(requestTenantId) !== requestId) {
          return { kind: 'detached', writeSucceeded: result.kind === 'created' };
        }
        if (activeTenantIdRef.current !== requestTenantId) {
          return detached(result.kind === 'created');
        }

        if (result.kind !== 'created') {
          settleIdle();
          return { kind: 'failed', message: result.message };
        }

        const created = result.companion;
        const latest = fetchedRef.current;
        if (latest != null && latest.tenantId !== requestTenantId) {
          return detached(true);
        }

        // A catalog read that started before this write must not replace the
        // list with its pre-create snapshot. Bump only while this tenant is
        // still current so another tenant's read keeps its own generation.
        readGenerationRef.current += 1;
        setFetched((current) => {
          if (current != null && current.tenantId !== requestTenantId) return current;
          const base =
            current != null && current.tenantId === requestTenantId && current.result.kind === 'ready'
              ? current.result.items
              : snapshotItems;
          return {
            tenantId: requestTenantId,
            result: {
              kind: 'ready',
              items: catalogWithCreatedCompanion(base, created),
            },
          };
        });
        setInFlight(false);
        settleIdle();
        return { kind: 'created' };
      } catch (error) {
        console.error('Failed to create tenant companion', error);
        if (!isMountedRef.current) return { kind: 'detached', writeSucceeded: false };
        if (inFlightByTenantRef.current.get(requestTenantId) !== requestId) {
          return { kind: 'detached', writeSucceeded: false };
        }
        if (activeTenantIdRef.current !== requestTenantId) return detached(false);
        settleIdle();
        return { kind: 'failed', message: COMPANION_CREATE_FAILED_MESSAGE };
      } finally {
        if (inFlightByTenantRef.current.get(requestTenantId) === requestId) {
          inFlightByTenantRef.current.delete(requestTenantId);
        }
      }
    },
    [activeTenantId, companionsSettingsStatus, fetched, inFlight, isTenantContextLoading, membershipRole]
  );

  const isCreating = activeTenantId != null && creates[activeTenantId]?.isCreating === true;

  if (isTenantContextLoading || !activeTenantId) {
    return closedResult('unavailable');
  }

  if (!canReadTenantCompanions(membershipRole)) {
    return closedResult('unreadable');
  }

  if (!settingsAllowCatalogRead(companionsSettingsStatus)) {
    return closedResult('suppressed', isCreating);
  }

  const fetchedMatches = fetched != null && fetched.tenantId === activeTenantId;
  const readyItems =
    fetchedMatches && fetched.result.kind === 'ready' ? fetched.result.items : null;
  const canCreate =
    companionsSettingsStatus === 'enabled' &&
    readyItems != null &&
    countActiveTenantCompanions(readyItems) < MAX_ACTIVE_TENANT_COMPANIONS;

  if (inFlight || !fetchedMatches) {
    return closedResult('loading', isCreating);
  }

  if (fetched.result.kind === 'error') {
    return closedResult('error', isCreating);
  }

  return {
    status: 'ready',
    items: fetched.result.items,
    isCreating,
    createCompanion: canCreate ? createCompanion : null,
  };
}
