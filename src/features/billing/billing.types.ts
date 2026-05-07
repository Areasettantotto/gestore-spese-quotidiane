import type { TenantPlanCode, TenantRole, TenantSubscriptionStatus } from '@/src/features/tenancy/tenancy.types';

/**
 * Safe billing snapshot exposed to UI only.
 * No provider payloads, no events, no customer/subscription private fields.
 */
export type BillingSnapshot = {
  plan_code: TenantPlanCode;
  subscription_status: TenantSubscriptionStatus;
  is_demo: boolean;
  trial_ends_at: string | null;
  membershipRole: TenantRole | null;
};

export type BillingSnapshotInput = {
  plan: {
    plan_code: TenantPlanCode;
    subscription_status: TenantSubscriptionStatus;
    is_demo: boolean;
    trial_ends_at: string | null;
  } | null;
  membershipRole: TenantRole | null;
};
