import { DEFAULT_TENANT_PLAN_SNAPSHOT } from '@/src/features/tenancy/tenancy.mapper';

import type { BillingSnapshot, BillingSnapshotInput } from './billing.types';

export function toBillingSnapshot(input: BillingSnapshotInput): BillingSnapshot {
  const plan = input.plan ?? DEFAULT_TENANT_PLAN_SNAPSHOT;

  return {
    plan_code: plan.plan_code,
    subscription_status: plan.subscription_status,
    is_demo: plan.is_demo,
    trial_ends_at: plan.trial_ends_at,
    membershipRole: input.membershipRole,
  };
}

export function getPlanBadgeLabel(snapshot: BillingSnapshot): string {
  if (snapshot.is_demo || snapshot.plan_code === 'demo') {
    return 'Piano demo';
  }

  switch (snapshot.plan_code) {
    case 'paid':
      return 'Piano paid';
    case 'trial':
      return 'Piano trial';
    case 'internal':
      return 'Piano internal';
    case 'free':
    default:
      return 'Piano free';
  }
}

export function canSeeBillingCtaPlaceholder(snapshot: BillingSnapshot): boolean {
  return snapshot.membershipRole === 'admin' || snapshot.membershipRole === 'billing';
}
