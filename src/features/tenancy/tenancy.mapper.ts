import type {
  ActiveTenantRow,
  ProfileTenantContextRow,
  ResolvedTenantContext,
  TenantPlanCode,
  TenantPlanSnapshot,
  TenantRole,
  TenantSubscriptionStatus,
} from './tenancy.types';

const TENANT_PLAN_CODES: readonly TenantPlanCode[] = [
  'free',
  'trial',
  'paid',
  'internal',
  'demo',
] as const;

const TENANT_SUBSCRIPTION_STATUSES: readonly TenantSubscriptionStatus[] = [
  'active',
  'trialing',
  'past_due',
  'canceled',
  'suspended',
] as const;

/** Matches DB defaults after migration 005 when no row is returned. */
export const DEFAULT_TENANT_PLAN_SNAPSHOT: TenantPlanSnapshot = {
  plan_code: 'free',
  subscription_status: 'active',
  is_demo: false,
  trial_ends_at: null,
};

function isTenantRole(value: unknown): value is TenantRole {
  return value === 'admin' || value === 'user' || value === 'billing';
}

function normalizeTenantId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

function parseTenantPlanCode(value: unknown): TenantPlanCode {
  return typeof value === 'string' && (TENANT_PLAN_CODES as readonly string[]).includes(value)
    ? (value as TenantPlanCode)
    : 'free';
}

function parseTenantSubscriptionStatus(value: unknown): TenantSubscriptionStatus {
  return typeof value === 'string' &&
    (TENANT_SUBSCRIPTION_STATUSES as readonly string[]).includes(value)
    ? (value as TenantSubscriptionStatus)
    : 'active';
}

/**
 * Maps a tenants row to a normalized snapshot (unknown DB values fall back to safe defaults).
 */
export function tenantRowToPlanSnapshot(row: ActiveTenantRow | null | undefined): TenantPlanSnapshot {
  if (!row) {
    return { ...DEFAULT_TENANT_PLAN_SNAPSHOT };
  }
  return {
    plan_code: parseTenantPlanCode(row.plan_code),
    subscription_status: parseTenantSubscriptionStatus(row.subscription_status),
    is_demo: row.is_demo === true,
    trial_ends_at:
      typeof row.trial_ends_at === 'string' && row.trial_ends_at.length > 0
        ? row.trial_ends_at
        : null,
  };
}

export function isDemoTenant(plan: TenantPlanSnapshot | null): boolean {
  return plan?.is_demo === true;
}

export function isFreePlan(plan: TenantPlanSnapshot | null): boolean {
  return plan?.plan_code === 'free';
}

export function isPaidPlan(plan: TenantPlanSnapshot | null): boolean {
  return plan?.plan_code === 'paid';
}

export function isTrialPlan(plan: TenantPlanSnapshot | null): boolean {
  return plan?.plan_code === 'trial';
}

/**
 * Derives default tenant id and matching membership role from one profiles+embed row.
 */
export function resolveTenantContextFromProfileRow(
  row: ProfileTenantContextRow | null | undefined
): ResolvedTenantContext {
  const defaultTenantId = normalizeTenantId(row?.default_tenant_id);
  if (!defaultTenantId) {
    return { defaultTenantId: null, membershipRole: null, activeTenantPlan: null };
  }

  const raw = row?.tenant_memberships;
  const list = Array.isArray(raw) ? raw : [];
  const match = list.find((m) => m.tenant_id === defaultTenantId);
  const membershipRole = match && isTenantRole(match.role) ? match.role : null;

  const activeTenantPlan = row?.active_tenant
    ? tenantRowToPlanSnapshot(row.active_tenant)
    : { ...DEFAULT_TENANT_PLAN_SNAPSHOT };

  return { defaultTenantId, membershipRole, activeTenantPlan };
}
