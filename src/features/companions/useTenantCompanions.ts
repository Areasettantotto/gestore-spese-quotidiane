import { useCallback, useEffect, useRef, useState } from 'react';

import type { TenantRole } from '@/src/features/tenancy/tenancy.types';

import type { CompanionsSettingsStatus } from './useCompanionsSettings';
import {
  COMPANION_CREATE_FAILED_MESSAGE,
  COMPANION_DEACTIVATE_FAILED_MESSAGE,
  MAX_ACTIVE_TENANT_COMPANIONS,
  countActiveTenantCompanions,
  createTenantCompanion,
  deactivateTenantCompanion,
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
  /**
   * Called only after this request still owns a server-confirmed create or
   * deactivation. The argument is the tenant id captured by that request.
   * Not called for a rejected call, a failed write, or a response superseded
   * by a newer catalog mutation. Also called when the hook has unmounted or
   * the active tenant has changed: the caller scopes the refresh so another
   * tenant does not receive this catalog. The new row is not passed.
   */
  onCompanionCatalogChanged?: (tenantId: string) => void;
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

/**
 * deactivated — the row is inactive in the current tenant catalog.
 * rejected — a client guard refused the call. No update.
 * failed — the write did not produce a usable inactive row for the current tenant.
 * detached — the active tenant changed, or this hook unmounted, before the
 *   outcome could be applied. A successful write is not reported as a failure
 *   and is not copied onto another tenant. writeSucceeded records the server
 *   outcome when it is already known.
 */
export type TenantCompanionDeactivateUiResult =
  | { kind: 'deactivated' }
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
   * Id of the companion being deactivated for the current tenant.
   * Null when this tenant has no deactivation in flight.
   */
  deactivatingCompanionId: string | null;
  /**
   * Present only when an admin may create for the current tenant:
   * settings enabled, catalog ready, and fewer than 20 active companions.
   * Null does not cancel a create that is already in flight.
   */
  createCompanion: ((displayName: string) => Promise<TenantCompanionCreateUiResult>) | null;
  /**
   * Present when an admin may deactivate for the current tenant:
   * settings enabled or disabled, and catalog ready.
   * The callback refuses a row that is not active, and refuses to start
   * while another catalog mutation for this tenant is in flight.
   * Null does not cancel a deactivation that is already in flight.
   */
  deactivateCompanion:
    | ((companionId: string) => Promise<TenantCompanionDeactivateUiResult>)
    | null;
};

type FetchedTenantCompanions = {
  tenantId: string;
  result: { kind: 'ready'; items: TenantCompanion[] } | { kind: 'error' };
};

type CompanionCatalogMutationUi = {
  isCreating: boolean;
  deactivatingCompanionId: string | null;
};

const IDLE_CATALOG_MUTATION: CompanionCatalogMutationUi = {
  isCreating: false,
  deactivatingCompanionId: null,
};

function canReadTenantCompanions(role: TenantRole | null): role is 'admin' {
  return role === 'admin';
}

function settingsAllowCatalogRead(status: CompanionsSettingsStatus): boolean {
  return status === 'enabled' || status === 'disabled';
}

function closedResult(
  status: Exclude<TenantCompanionsStatus, 'ready'>,
  mutation: { isCreating?: boolean; deactivatingCompanionId?: string | null } = {}
): UseTenantCompanionsResult {
  return {
    status,
    items: [],
    isCreating: mutation.isCreating === true,
    deactivatingCompanionId: mutation.deactivatingCompanionId ?? null,
    createCompanion: null,
    deactivateCompanion: null,
  };
}

function catalogWithCreatedCompanion(
  items: readonly TenantCompanion[],
  created: TenantCompanion
): TenantCompanion[] {
  const next = items.filter((item) => item.id !== created.id);
  next.push(created);
  return orderTenantCompanions(next);
}

function catalogWithDeactivatedCompanion(
  items: readonly TenantCompanion[],
  deactivated: TenantCompanion
): TenantCompanion[] {
  let found = false;
  const next = items.map((item) => {
    if (item.id !== deactivated.id) return item;
    found = true;
    return deactivated;
  });
  if (!found) next.push(deactivated);
  return orderTenantCompanions(next);
}

export function useTenantCompanions({
  activeTenantId,
  membershipRole,
  isTenantContextLoading,
  companionsSettingsStatus,
  onCompanionCatalogChanged,
}: UseTenantCompanionsParams): UseTenantCompanionsResult {
  const shouldRead =
    !isTenantContextLoading &&
    Boolean(activeTenantId) &&
    canReadTenantCompanions(membershipRole) &&
    settingsAllowCatalogRead(companionsSettingsStatus);

  const [fetched, setFetched] = useState<FetchedTenantCompanions | null>(null);
  const [inFlight, setInFlight] = useState(false);
  const [catalogMutations, setCatalogMutations] = useState<
    Record<string, CompanionCatalogMutationUi>
  >({});

  const activeTenantIdRef = useRef(activeTenantId);
  activeTenantIdRef.current = activeTenantId;
  const onCompanionCatalogChangedRef = useRef(onCompanionCatalogChanged);
  onCompanionCatalogChangedRef.current = onCompanionCatalogChanged;
  const fetchedRef = useRef(fetched);
  fetchedRef.current = fetched;
  const isMountedRef = useRef(true);
  const readGenerationRef = useRef(0);
  /**
   * At most one companion catalog mutation (create or deactivate) in flight
   * per tenant. The value is that request's id. Another tenant gets its own
   * entry and cannot clear this one.
   */
  const inFlightByTenantRef = useRef<Map<string, number>>(new Map());
  const nextCatalogMutationIdRef = useRef(0);

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
      const requestId = ++nextCatalogMutationIdRef.current;
      const snapshotItems = fetched.result.items.slice();
      inFlightByTenantRef.current.set(requestTenantId, requestId);
      setCatalogMutations((current) => ({
        ...current,
        [requestTenantId]: { isCreating: true, deactivatingCompanionId: null },
      }));

      const settleIdle = () => {
        if (!isMountedRef.current) return;
        setCatalogMutations((current) => ({
          ...current,
          [requestTenantId]: IDLE_CATALOG_MUTATION,
        }));
      };

      const detached = (writeSucceeded: boolean): TenantCompanionCreateUiResult => {
        settleIdle();
        return { kind: 'detached', writeSucceeded };
      };

      try {
        const result = await createTenantCompanion(requestTenantId, displayName);

        if (inFlightByTenantRef.current.get(requestTenantId) !== requestId) {
          return { kind: 'detached', writeSucceeded: result.kind === 'created' };
        }

        // Request tenant, not the tenant that happens to be active now.
        // A superseded response already returned. Unmount and tenant change
        // still return detached below and do not merge this row elsewhere.
        if (result.kind === 'created') {
          onCompanionCatalogChangedRef.current?.(requestTenantId);
        }

        if (!isMountedRef.current) {
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

  const deactivateCompanion = useCallback(
    async (companionId: string): Promise<TenantCompanionDeactivateUiResult> => {
      if (isTenantContextLoading || !activeTenantId) return { kind: 'rejected' };
      if (!canReadTenantCompanions(membershipRole)) return { kind: 'rejected' };
      if (!settingsAllowCatalogRead(companionsSettingsStatus)) return { kind: 'rejected' };
      if (typeof companionId !== 'string' || companionId.length === 0) return { kind: 'rejected' };
      if (inFlight || fetched == null || fetched.tenantId !== activeTenantId) {
        return { kind: 'rejected' };
      }
      if (fetched.result.kind !== 'ready') return { kind: 'rejected' };
      const target = fetched.result.items.find((item) => item.id === companionId);
      if (target == null || !target.isActive) return { kind: 'rejected' };
      if (inFlightByTenantRef.current.has(activeTenantId)) return { kind: 'rejected' };

      const requestTenantId = activeTenantId;
      const requestId = ++nextCatalogMutationIdRef.current;
      const snapshotItems = fetched.result.items.slice();
      inFlightByTenantRef.current.set(requestTenantId, requestId);
      setCatalogMutations((current) => ({
        ...current,
        [requestTenantId]: { isCreating: false, deactivatingCompanionId: companionId },
      }));

      const settleIdle = () => {
        if (!isMountedRef.current) return;
        setCatalogMutations((current) => ({
          ...current,
          [requestTenantId]: IDLE_CATALOG_MUTATION,
        }));
      };

      const detached = (writeSucceeded: boolean): TenantCompanionDeactivateUiResult => {
        settleIdle();
        return { kind: 'detached', writeSucceeded };
      };

      try {
        const result = await deactivateTenantCompanion(requestTenantId, companionId);

        if (inFlightByTenantRef.current.get(requestTenantId) !== requestId) {
          return { kind: 'detached', writeSucceeded: result.kind === 'deactivated' };
        }

        // Request tenant, not the tenant that happens to be active now.
        // A superseded response already returned. Unmount and tenant change
        // still return detached below and do not merge this row elsewhere.
        if (result.kind === 'deactivated') {
          onCompanionCatalogChangedRef.current?.(requestTenantId);
        }

        if (!isMountedRef.current) {
          return { kind: 'detached', writeSucceeded: result.kind === 'deactivated' };
        }
        if (activeTenantIdRef.current !== requestTenantId) {
          return detached(result.kind === 'deactivated');
        }

        if (result.kind !== 'deactivated') {
          settleIdle();
          return { kind: 'failed', message: result.message };
        }

        const deactivated = result.companion;
        const latest = fetchedRef.current;
        if (latest != null && latest.tenantId !== requestTenantId) {
          return detached(true);
        }

        // A catalog read that started before this write must not replace the
        // list with its pre-deactivate snapshot. Bump only while this tenant
        // is still current so another tenant's read keeps its own generation.
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
              items: catalogWithDeactivatedCompanion(base, deactivated),
            },
          };
        });
        setInFlight(false);
        settleIdle();
        return { kind: 'deactivated' };
      } catch (error) {
        console.error('Failed to deactivate tenant companion', error);
        if (!isMountedRef.current) return { kind: 'detached', writeSucceeded: false };
        if (inFlightByTenantRef.current.get(requestTenantId) !== requestId) {
          return { kind: 'detached', writeSucceeded: false };
        }
        if (activeTenantIdRef.current !== requestTenantId) return detached(false);
        settleIdle();
        return { kind: 'failed', message: COMPANION_DEACTIVATE_FAILED_MESSAGE };
      } finally {
        if (inFlightByTenantRef.current.get(requestTenantId) === requestId) {
          inFlightByTenantRef.current.delete(requestTenantId);
        }
      }
    },
    [activeTenantId, companionsSettingsStatus, fetched, inFlight, isTenantContextLoading, membershipRole]
  );

  const currentMutation = activeTenantId != null ? catalogMutations[activeTenantId] : undefined;
  const isCreating = currentMutation?.isCreating === true;
  const deactivatingCompanionId = currentMutation?.deactivatingCompanionId ?? null;

  if (isTenantContextLoading || !activeTenantId) {
    return closedResult('unavailable');
  }

  if (!canReadTenantCompanions(membershipRole)) {
    return closedResult('unreadable');
  }

  if (!settingsAllowCatalogRead(companionsSettingsStatus)) {
    return closedResult('suppressed', { isCreating, deactivatingCompanionId });
  }

  const fetchedMatches = fetched != null && fetched.tenantId === activeTenantId;
  const readyItems =
    fetchedMatches && fetched.result.kind === 'ready' ? fetched.result.items : null;
  const canCreate =
    companionsSettingsStatus === 'enabled' &&
    readyItems != null &&
    countActiveTenantCompanions(readyItems) < MAX_ACTIVE_TENANT_COMPANIONS;

  if (inFlight || !fetchedMatches) {
    return closedResult('loading', { isCreating, deactivatingCompanionId });
  }

  if (fetched.result.kind === 'error') {
    return closedResult('error', { isCreating, deactivatingCompanionId });
  }

  return {
    status: 'ready',
    items: fetched.result.items,
    isCreating,
    deactivatingCompanionId,
    createCompanion: canCreate ? createCompanion : null,
    deactivateCompanion,
  };
}
