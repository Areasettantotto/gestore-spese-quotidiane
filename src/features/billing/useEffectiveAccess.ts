import { useEffect, useState } from 'react';

import { useActiveTenant } from '@/src/features/tenancy/useActiveTenant';

import { fetchEffectiveAccess } from './effectiveAccess.service';
import type {
  EffectiveAccessFailure,
  EffectiveAccessPayload,
  FetchEffectiveAccessResult,
} from './effectiveAccess.types';

/**
 * Tenant slice already resolved by `useActiveTenant`.
 * Passed in (same pattern as `useExpenses`) because tenancy state is instance-local
 * and this hook must not bootstrap or choose a tenant on its own.
 */
export type UseEffectiveAccessParams = Pick<
  ReturnType<typeof useActiveTenant>,
  'activeTenantId' | 'isTenantContextLoading'
>;

export type UseEffectiveAccessResult =
  | {
      status: 'idle';
      isLoading: false;
      data: null;
      error: null;
      tenantId: null;
    }
  | {
      status: 'loading';
      isLoading: true;
      data: null;
      error: null;
      tenantId: string | null;
    }
  | {
      status: 'success';
      isLoading: false;
      data: EffectiveAccessPayload;
      error: null;
      tenantId: string;
    }
  | {
      status: 'error';
      isLoading: false;
      data: null;
      error: EffectiveAccessFailure;
      tenantId: string;
    };

type FetchedAccess = {
  tenantId: string;
  result: FetchEffectiveAccessResult;
};

function usableTenantId(value: string | null): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function toCaughtFailure(): FetchEffectiveAccessResult {
  return {
    ok: false,
    error: { code: null, message: 'EffectiveAccess request failed.' },
  };
}

/**
 * Local React consumer of `fetchEffectiveAccess`.
 * Exposes loading / payload / error only. Never maps a failure to an entitlement.
 */
export function useEffectiveAccess({
  activeTenantId,
  isTenantContextLoading,
}: UseEffectiveAccessParams): UseEffectiveAccessResult {
  const tenantId = usableTenantId(activeTenantId);
  const [fetched, setFetched] = useState<FetchedAccess | null>(null);
  const [inFlight, setInFlight] = useState(false);

  useEffect(() => {
    if (isTenantContextLoading) {
      setFetched(null);
      setInFlight(false);
      return;
    }

    if (!tenantId) {
      setFetched(null);
      setInFlight(false);
      return;
    }

    const requestedTenantId = tenantId;
    let cancelled = false;
    setInFlight(true);

    void fetchEffectiveAccess(requestedTenantId).then(
      (result) => {
        if (cancelled) return;
        setFetched({ tenantId: requestedTenantId, result });
        setInFlight(false);
      },
      () => {
        if (cancelled) return;
        setFetched({ tenantId: requestedTenantId, result: toCaughtFailure() });
        setInFlight(false);
      }
    );

    return () => {
      cancelled = true;
    };
  }, [tenantId, isTenantContextLoading]);

  if (isTenantContextLoading) {
    return {
      status: 'loading',
      isLoading: true,
      data: null,
      error: null,
      tenantId,
    };
  }

  if (!tenantId) {
    return {
      status: 'idle',
      isLoading: false,
      data: null,
      error: null,
      tenantId: null,
    };
  }

  if (inFlight || !fetched || fetched.tenantId !== tenantId) {
    return {
      status: 'loading',
      isLoading: true,
      data: null,
      error: null,
      tenantId,
    };
  }

  if (fetched.result.ok) {
    return {
      status: 'success',
      isLoading: false,
      data: fetched.result.data,
      error: null,
      tenantId,
    };
  }

  return {
    status: 'error',
    isLoading: false,
    data: null,
    error: fetched.result.error,
    tenantId,
  };
}
