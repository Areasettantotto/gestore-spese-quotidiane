import { useEffect, useRef, useState } from 'react';

import type { TenantRole } from '@/src/features/tenancy/tenancy.types';

import { getCompanionsSettings } from './companionsSettings';
import { listTenantCompanions, type TenantCompanion } from './tenantCompanions';

/**
 * unavailable — tenant context still loading, or no active tenant. No query.
 * unreadable — tenant present and role is not admin. No query.
 * loading — admin read for the current tenant is in flight. No published catalog.
 * ready — settings and catalog both succeeded. companionsEnabled false is ready.
 *   items may be empty. Inactive rows are kept.
 * missing — settings read returned missing. Not feature-off. No catalog rows.
 * error — either read failed, or the reader threw. No catalog rows.
 */
export type ExpenseCompanionReadStatus =
  | 'unavailable'
  | 'unreadable'
  | 'loading'
  | 'ready'
  | 'missing'
  | 'error';

export type UseExpenseCompanionReadParams = {
  activeTenantId: string | null;
  membershipRole: TenantRole | null;
  isTenantContextLoading: boolean;
};

export type UseExpenseCompanionReadResult = {
  status: ExpenseCompanionReadStatus;
  /** True or false only for status ready. Null for every other status. */
  companionsEnabled: boolean | null;
  /** Catalog rows only for status ready. Empty for every other status, and for a ready catalog with zero rows. */
  items: readonly TenantCompanion[];
};

type ExpenseCompanionReadSnapshot =
  | {
      tenantId: string;
      kind: 'ready';
      companionsEnabled: boolean;
      items: readonly TenantCompanion[];
    }
  | {
      tenantId: string;
      kind: 'missing';
    }
  | {
      tenantId: string;
      kind: 'error';
    };

function canReadExpenseCompanions(role: TenantRole | null): role is 'admin' {
  return role === 'admin';
}

function closedResult(
  status: Exclude<ExpenseCompanionReadStatus, 'ready'>
): UseExpenseCompanionReadResult {
  return {
    status,
    companionsEnabled: null,
    items: [],
  };
}

export function useExpenseCompanionRead({
  activeTenantId,
  membershipRole,
  isTenantContextLoading,
}: UseExpenseCompanionReadParams): UseExpenseCompanionReadResult {
  const shouldRead =
    !isTenantContextLoading &&
    Boolean(activeTenantId) &&
    canReadExpenseCompanions(membershipRole);

  const [fetched, setFetched] = useState<ExpenseCompanionReadSnapshot | null>(null);
  const [inFlight, setInFlight] = useState(false);

  const isMountedRef = useRef(true);
  const readGenerationRef = useRef(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const generationAtStart = ++readGenerationRef.current;

    if (!shouldRead || !activeTenantId) {
      setFetched(null);
      setInFlight(false);
      return;
    }

    const tenantId = activeTenantId;
    let cancelled = false;
    setInFlight(true);

    const applySnapshot = (snapshot: ExpenseCompanionReadSnapshot) => {
      if (cancelled || !isMountedRef.current) return;
      if (readGenerationRef.current !== generationAtStart) return;

      setFetched(snapshot);
      setInFlight(false);
    };

    void Promise.all([
      getCompanionsSettings(tenantId),
      listTenantCompanions(tenantId),
    ]).then(
      ([settingsResult, catalogResult]) => {
        if (settingsResult.kind === 'error' || catalogResult.kind === 'error') {
          applySnapshot({ tenantId, kind: 'error' });
          return;
        }

        if (settingsResult.kind === 'missing') {
          applySnapshot({ tenantId, kind: 'missing' });
          return;
        }

        applySnapshot({
          tenantId,
          kind: 'ready',
          companionsEnabled: settingsResult.setting.companionsEnabled,
          items: catalogResult.items,
        });
      },
      (error: unknown) => {
        console.error('Failed to load expense companions', error);
        applySnapshot({ tenantId, kind: 'error' });
      }
    );

    return () => {
      cancelled = true;
    };
  }, [activeTenantId, shouldRead]);

  if (isTenantContextLoading || !activeTenantId) {
    return closedResult('unavailable');
  }

  if (!canReadExpenseCompanions(membershipRole)) {
    return closedResult('unreadable');
  }

  if (inFlight || fetched == null || fetched.tenantId !== activeTenantId) {
    return closedResult('loading');
  }

  if (fetched.kind === 'missing') {
    return closedResult('missing');
  }

  if (fetched.kind === 'error') {
    return closedResult('error');
  }

  return {
    status: 'ready',
    companionsEnabled: fetched.companionsEnabled,
    items: fetched.items,
  };
}
