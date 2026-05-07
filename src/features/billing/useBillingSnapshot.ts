import { useMemo } from 'react';

import type { TenantPlanSnapshot, TenantRole } from '@/src/features/tenancy/tenancy.types';

import { canSeeBillingCtaPlaceholder, getPlanBadgeLabel, toBillingSnapshot } from './billing.mapper';

type UseBillingSnapshotParams = {
  activeTenantPlan: TenantPlanSnapshot | null;
  membershipRole: TenantRole | null;
};

export function useBillingSnapshot({ activeTenantPlan, membershipRole }: UseBillingSnapshotParams) {
  return useMemo(() => {
    const snapshot = toBillingSnapshot({
      plan: activeTenantPlan,
      membershipRole,
    });

    return {
      snapshot,
      planBadgeLabel: getPlanBadgeLabel(snapshot),
      billingNotice: 'Gestione abbonamento in arrivo',
      showCtaPlaceholder: canSeeBillingCtaPlaceholder(snapshot),
    };
  }, [activeTenantPlan, membershipRole]);
}
