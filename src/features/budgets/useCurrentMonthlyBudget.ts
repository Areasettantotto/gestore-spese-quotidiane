import { useCallback, useEffect, useState } from 'react';

import type { TenantRole } from '@/src/features/tenancy/tenancy.types';

import {
  getCurrentMonthlyBudget,
  insertCurrentMonthlyBudget,
  updateCurrentMonthlyBudgetAmount,
  type BudgetMutationResult,
  type MonthlyBudget,
} from './monthlyBudgets';

export type CurrentMonthlyBudgetStatus = 'hidden' | 'loading' | 'error' | 'unconfigured' | 'configured';

export type UseCurrentMonthlyBudgetParams = {
  activeTenantId: string | null;
  isTenantContextLoading: boolean;
  membershipRole: TenantRole | null;
  periodMonth: string;
};

export type UseCurrentMonthlyBudgetResult = {
  status: CurrentMonthlyBudgetStatus;
  amount: number | null;
  canWrite: boolean;
  saveCurrentMonthlyBudget: (amount: number) => Promise<BudgetMutationResult>;
};

type FetchedBudget = {
  tenantId: string;
  periodMonth: string;
  result:
    | { kind: 'error' }
    | { kind: 'unconfigured' }
    | { kind: 'configured'; budget: MonthlyBudget };
};

function canReadBudget(role: TenantRole | null): role is 'admin' | 'user' {
  return role === 'admin' || role === 'user';
}

export function useCurrentMonthlyBudget({
  activeTenantId,
  isTenantContextLoading,
  membershipRole,
  periodMonth,
}: UseCurrentMonthlyBudgetParams): UseCurrentMonthlyBudgetResult {
  const canWrite = membershipRole === 'admin';
  const shouldRead =
    !isTenantContextLoading && Boolean(activeTenantId) && canReadBudget(membershipRole);

  const [fetched, setFetched] = useState<FetchedBudget | null>(null);
  const [inFlight, setInFlight] = useState(false);

  useEffect(() => {
    if (!shouldRead || !activeTenantId) {
      setFetched(null);
      setInFlight(false);
      return;
    }

    const tenantId = activeTenantId;
    const requestedPeriod = periodMonth;
    let cancelled = false;
    setInFlight(true);

    void getCurrentMonthlyBudget(tenantId, requestedPeriod).then((result) => {
      if (cancelled) return;

      if (result.errorMessage) {
        setFetched({ tenantId, periodMonth: requestedPeriod, result: { kind: 'error' } });
      } else if (result.budget) {
        setFetched({
          tenantId,
          periodMonth: requestedPeriod,
          result: { kind: 'configured', budget: result.budget },
        });
      } else {
        setFetched({ tenantId, periodMonth: requestedPeriod, result: { kind: 'unconfigured' } });
      }

      setInFlight(false);
    });

    return () => {
      cancelled = true;
    };
  }, [activeTenantId, periodMonth, shouldRead]);

  const saveCurrentMonthlyBudget = useCallback(
    async (amount: number): Promise<BudgetMutationResult> => {
      if (!canWrite || !activeTenantId || !canReadBudget(membershipRole)) {
        return { ok: false, message: 'Impossibile salvare il budget. Riprova.' };
      }

      const hasRow =
        fetched?.tenantId === activeTenantId &&
        fetched.periodMonth === periodMonth &&
        fetched.result.kind === 'configured';

      const result = hasRow
        ? await updateCurrentMonthlyBudgetAmount({
            tenantId: activeTenantId,
            periodMonth,
            amount,
          })
        : await insertCurrentMonthlyBudget({
            tenantId: activeTenantId,
            periodMonth,
            amount,
          });

      if (result.ok) {
        setFetched({
          tenantId: activeTenantId,
          periodMonth,
          result: { kind: 'configured', budget: result.budget },
        });
      }

      return result;
    },
    [activeTenantId, canWrite, fetched, membershipRole, periodMonth]
  );

  if (!shouldRead) {
    return {
      status: 'hidden',
      amount: null,
      canWrite: false,
      saveCurrentMonthlyBudget,
    };
  }

  const fetchedMatches =
    fetched != null && fetched.tenantId === activeTenantId && fetched.periodMonth === periodMonth;

  if (inFlight || !fetchedMatches) {
    return {
      status: 'loading',
      amount: null,
      canWrite,
      saveCurrentMonthlyBudget,
    };
  }

  if (fetched.result.kind === 'error') {
    return {
      status: 'error',
      amount: null,
      canWrite,
      saveCurrentMonthlyBudget,
    };
  }

  if (fetched.result.kind === 'unconfigured') {
    return {
      status: 'unconfigured',
      amount: null,
      canWrite,
      saveCurrentMonthlyBudget,
    };
  }

  return {
    status: 'configured',
    amount: fetched.result.budget.amount,
    canWrite,
    saveCurrentMonthlyBudget,
  };
}
