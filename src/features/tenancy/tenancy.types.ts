/**
 * Client-side tenancy domain types (aligned with public.profiles / tenant_memberships).
 */

export type TenantRole = 'admin' | 'user' | 'billing';

/** Aligned with supabase/migrations/005_tenant_plan_readiness.sql check constraint. */
export type TenantPlanCode = 'free' | 'trial' | 'paid' | 'internal' | 'demo';

/** Aligned with supabase/migrations/005_tenant_plan_readiness.sql check constraint. */
export type TenantSubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'suspended';

/**
 * Plan/subscription fields for the active workspace (from public.tenants).
 * Billing provider (Stripe/Paddle) is not implemented yet; these are readiness fields only.
 */
export type TenantPlanSnapshot = {
  plan_code: TenantPlanCode;
  subscription_status: TenantSubscriptionStatus;
  is_demo: boolean;
  trial_ends_at: string | null;
};

/** Alias for callers that prefer “billing readiness” wording over “plan snapshot”. */
export type TenantBillingReadiness = TenantPlanSnapshot;

/** Workspace row (public.tenants) — subset used by the client after migration 005. */
export type Tenant = {
  id: string;
  name?: string;
  is_personal?: boolean;
  plan_code?: TenantPlanCode;
  subscription_status?: TenantSubscriptionStatus;
  is_demo?: boolean;
  trial_ends_at?: string | null;
};

export type Profile = {
  id: string;
  default_tenant_id: string | null;
};

/** Membership row as returned by Supabase embeds on profiles. */
export type TenantMembership = {
  tenant_id: string;
  role: TenantRole;
};

/** Row shape for the default workspace from public.tenants (repository select). */
export type ActiveTenantRow = {
  id: string;
  name: string;
  is_personal: boolean;
  plan_code: string;
  subscription_status: string;
  is_demo: boolean;
  trial_ends_at: string | null;
};

/**
 * Shape of `profiles` row plus embedded `tenant_memberships` from a single select.
 */
export type ProfileTenantContextRow = Profile & {
  tenant_memberships: TenantMembership[] | null;
  /** Populated when default_tenant_id is set and tenants select succeeds. */
  active_tenant?: ActiveTenantRow | null;
};

/**
 * Resolved active context for the signed-in user (default tenant from profile + role).
 */
export type ResolvedTenantContext = {
  defaultTenantId: string | null;
  membershipRole: TenantRole | null;
  /** Plan fields for the active (default) tenant; null when no default tenant. */
  activeTenantPlan: TenantPlanSnapshot | null;
};
