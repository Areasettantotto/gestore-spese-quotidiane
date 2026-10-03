import { useCallback, useEffect, useRef, useState } from 'react';

import type { TenantRole } from '@/src/features/tenancy/tenancy.types';

import {
  getCompanionsSettings,
  updateCompanionsEnabled,
  type CompanionsFeatureSetting,
} from './companionsSettings';

/**
 * unavailable — tenant context still loading, or no active tenant. No query.
 * unreadable — tenant present and role is not admin. No query; the setting was not read.
 * loading — admin read in flight, or the stored result belongs to another tenant.
 * enabled — row present and companions_enabled is true.
 * disabled — row present and companions_enabled is false.
 * missing — no settings row. Distinct from disabled.
 * error — request failed or the row shape was not usable.
 */
export type CompanionsSettingsStatus =
  | 'unavailable'
  | 'unreadable'
  | 'loading'
  | 'enabled'
  | 'disabled'
  | 'missing'
  | 'error';

export type UseCompanionsSettingsParams = {
  activeTenantId: string | null;
  membershipRole: TenantRole | null;
  isTenantContextLoading: boolean;
};

export type UseCompanionsSettingsResult = {
  status: CompanionsSettingsStatus;
  /** True or false only for status enabled or disabled. Null when the setting was not read. */
  companionsEnabled: boolean | null;
  /** True only while an update for the current tenant is in flight. */
  isUpdating: boolean;
  /** Local write failure. Distinct from a read status of error. */
  updateError: string | null;
  /**
   * Present only when an admin may update an existing enabled or disabled setting.
   * Null for unreadable, unavailable, loading, missing, and read error.
   */
  setCompanionsEnabled: ((next: boolean) => Promise<void>) | null;
};

type FetchedCompanionsSettings = {
  tenantId: string;
  result:
    | { kind: 'ready'; setting: CompanionsFeatureSetting }
    | { kind: 'missing' }
    | { kind: 'error' };
};

type CompanionsSettingsMutationUi = {
  isUpdating: boolean;
  updateError: string | null;
};

const UPDATE_ERROR_MESSAGE = 'Non è stato possibile aggiornare la funzione. Riprova.';

function canReadCompanionsSettings(role: TenantRole | null): role is 'admin' {
  return role === 'admin';
}

function closedResult(
  status: Exclude<CompanionsSettingsStatus, 'enabled' | 'disabled'>,
  companionsEnabled: boolean | null = null
): UseCompanionsSettingsResult {
  return {
    status,
    companionsEnabled,
    isUpdating: false,
    updateError: null,
    setCompanionsEnabled: null,
  };
}

export function useCompanionsSettings({
  activeTenantId,
  membershipRole,
  isTenantContextLoading,
}: UseCompanionsSettingsParams): UseCompanionsSettingsResult {
  const shouldRead =
    !isTenantContextLoading &&
    Boolean(activeTenantId) &&
    canReadCompanionsSettings(membershipRole);

  const [fetched, setFetched] = useState<FetchedCompanionsSettings | null>(null);
  const [inFlight, setInFlight] = useState(false);
  const [mutations, setMutations] = useState<Record<string, CompanionsSettingsMutationUi>>({});

  const activeTenantIdRef = useRef(activeTenantId);
  activeTenantIdRef.current = activeTenantId;
  const isMountedRef = useRef(true);
  const readGenerationRef = useRef(0);
  /**
   * At most one companions_enabled update in flight per tenant.
   * The value is that request's id. Another tenant gets its own entry and
   * cannot clear this one.
   */
  const inFlightByTenantRef = useRef<Map<string, number>>(new Map());
  const nextMutationIdRef = useRef(0);

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
    const generationAtStart = readGenerationRef.current;
    let cancelled = false;
    setInFlight(true);

    void getCompanionsSettings(tenantId).then((result) => {
      if (cancelled || !isMountedRef.current) return;
      if (readGenerationRef.current !== generationAtStart) {
        setInFlight(false);
        return;
      }

      if (result.kind === 'ready') {
        setFetched({ tenantId, result: { kind: 'ready', setting: result.setting } });
      } else if (result.kind === 'missing') {
        setFetched({ tenantId, result: { kind: 'missing' } });
      } else {
        setFetched({ tenantId, result: { kind: 'error' } });
      }

      setInFlight(false);
    });

    return () => {
      cancelled = true;
    };
  }, [activeTenantId, shouldRead]);

  const setCompanionsEnabled = useCallback(
    async (next: boolean) => {
      if (isTenantContextLoading || !activeTenantId) return;
      if (!canReadCompanionsSettings(membershipRole)) return;
      if (typeof next !== 'boolean') return;
      if (inFlight || fetched == null || fetched.tenantId !== activeTenantId) return;
      if (fetched.result.kind !== 'ready') return;
      if (inFlightByTenantRef.current.has(activeTenantId)) return;

      const requestTenantId = activeTenantId;
      const requestId = ++nextMutationIdRef.current;
      inFlightByTenantRef.current.set(requestTenantId, requestId);
      setMutations((current) => ({
        ...current,
        [requestTenantId]: { isUpdating: true, updateError: null },
      }));

      const settle = (patch: CompanionsSettingsMutationUi) => {
        setMutations((current) => ({
          ...current,
          [requestTenantId]: patch,
        }));
      };

      try {
        const result = await updateCompanionsEnabled({
          tenantId: requestTenantId,
          nextCompanionsEnabled: next,
        });

        if (!isMountedRef.current) return;
        if (inFlightByTenantRef.current.get(requestTenantId) !== requestId) return;

        const stillCurrent = activeTenantIdRef.current === requestTenantId;
        if (!stillCurrent) {
          settle({ isUpdating: false, updateError: null });
          return;
        }

        if (result.kind === 'updated') {
          readGenerationRef.current += 1;
          setFetched({
            tenantId: requestTenantId,
            result: { kind: 'ready', setting: result.setting },
          });
          settle({ isUpdating: false, updateError: null });
          return;
        }

        settle({ isUpdating: false, updateError: UPDATE_ERROR_MESSAGE });
      } catch (error) {
        console.error('Failed to update companions settings', error);
        if (!isMountedRef.current) return;
        if (inFlightByTenantRef.current.get(requestTenantId) !== requestId) return;
        if (activeTenantIdRef.current !== requestTenantId) {
          settle({ isUpdating: false, updateError: null });
          return;
        }
        settle({ isUpdating: false, updateError: UPDATE_ERROR_MESSAGE });
      } finally {
        if (inFlightByTenantRef.current.get(requestTenantId) === requestId) {
          inFlightByTenantRef.current.delete(requestTenantId);
        }
      }
    },
    [activeTenantId, fetched, inFlight, isTenantContextLoading, membershipRole]
  );

  const mutationForTenant = activeTenantId != null ? mutations[activeTenantId] : undefined;
  const isUpdating = mutationForTenant?.isUpdating === true;
  const updateError = mutationForTenant?.updateError ?? null;

  if (isTenantContextLoading || !activeTenantId) {
    return closedResult('unavailable');
  }

  if (!canReadCompanionsSettings(membershipRole)) {
    return closedResult('unreadable');
  }

  const fetchedMatches = fetched != null && fetched.tenantId === activeTenantId;

  if (inFlight || !fetchedMatches) {
    return closedResult('loading');
  }

  if (fetched.result.kind === 'missing') {
    return closedResult('missing');
  }

  if (fetched.result.kind === 'error') {
    return closedResult('error');
  }

  const companionsEnabled = fetched.result.setting.companionsEnabled;

  return {
    status: companionsEnabled ? 'enabled' : 'disabled',
    companionsEnabled,
    isUpdating,
    updateError,
    setCompanionsEnabled,
  };
}
