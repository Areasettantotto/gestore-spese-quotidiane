/**
 * Client-side tenancy domain types (aligned with public.profiles / tenant_memberships).
 */

export type TenantRole = 'admin' | 'user' | 'billing';

/** Workspace row (public.tenants) — extend when UI needs name/plan. */
export type Tenant = {
  id: string;
  name?: string;
  is_personal?: boolean;
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

/**
 * Shape of `profiles` row plus embedded `tenant_memberships` from a single select.
 */
export type ProfileTenantContextRow = Profile & {
  tenant_memberships: TenantMembership[] | null;
};

/**
 * Resolved active context for the signed-in user (default tenant from profile + role).
 */
export type ResolvedTenantContext = {
  defaultTenantId: string | null;
  membershipRole: TenantRole | null;
};
