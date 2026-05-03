import type { ProfileTenantContextRow, ResolvedTenantContext, TenantRole } from './tenancy.types';

function isTenantRole(value: unknown): value is TenantRole {
  return value === 'admin' || value === 'user' || value === 'billing';
}

function normalizeTenantId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

/**
 * Derives default tenant id and matching membership role from one profiles+embed row.
 */
export function resolveTenantContextFromProfileRow(
  row: ProfileTenantContextRow | null | undefined
): ResolvedTenantContext {
  const defaultTenantId = normalizeTenantId(row?.default_tenant_id);
  if (!defaultTenantId) {
    return { defaultTenantId: null, membershipRole: null };
  }

  const raw = row?.tenant_memberships;
  const list = Array.isArray(raw) ? raw : [];
  const match = list.find((m) => m.tenant_id === defaultTenantId);
  const membershipRole = match && isTenantRole(match.role) ? match.role : null;

  return { defaultTenantId, membershipRole };
}
