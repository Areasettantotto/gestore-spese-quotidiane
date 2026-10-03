import { supabase } from '@/src/lib/supabaseClient';

/**
 * Columns selected from public.tenant_companions.
 * delegated_auth_user_id is intentionally absent.
 */
type TenantCompanionRaw = {
  id: string;
  tenant_id: string;
  display_name: string;
  is_active: boolean;
};

export type TenantCompanion = {
  id: string;
  displayName: string;
  isActive: boolean;
};

/**
 * ready — query succeeded. items is empty when the tenant has no companions.
 * error — request failed, or at least one row did not match the expected shape.
 * An invalid row fails the whole read. It is not dropped or rewritten.
 */
export type TenantCompanionsReadResult =
  | { kind: 'ready'; items: TenantCompanion[] }
  | { kind: 'error' };

/**
 * Read the companion catalog for one tenant.
 * Callers must already know the reader is an admin and that companions
 * settings are enabled or disabled. This function does not widen access.
 * It never inserts, updates, or deletes.
 */
export async function listTenantCompanions(
  tenantId: string
): Promise<TenantCompanionsReadResult> {
  if (tenantId.length === 0) {
    return { kind: 'error' };
  }

  const { data, error } = await selectTenantCompanions(tenantId);

  if (error) {
    console.error('Failed to load tenant companions', error);
    return { kind: 'error' };
  }

  const rows = readCompanionRows(data);
  if (!rows) {
    console.error('Tenant companions response did not match the expected shape');
    return { kind: 'error' };
  }

  const items: TenantCompanion[] = [];
  for (const row of rows) {
    const companion = mapTenantCompanionRow(row, tenantId);
    if (!companion) {
      console.error('Tenant companions row did not match the expected shape');
      return { kind: 'error' };
    }
    items.push(companion);
  }

  items.sort(compareTenantCompanions);
  return { kind: 'ready', items };
}

async function selectTenantCompanions(tenantId: string) {
  return supabase
    .from('tenant_companions')
    .select('id, tenant_id, display_name, is_active')
    .eq('tenant_id', tenantId)
    .order('is_active', { ascending: false })
    .order('display_name', { ascending: true })
    .order('id', { ascending: true });
}

function readCompanionRows(data: unknown): readonly unknown[] | null {
  if (!Array.isArray(data)) return null;
  return data;
}

function mapTenantCompanionRow(row: unknown, tenantId: string): TenantCompanion | null {
  if (!isTenantCompanionRaw(row)) return null;
  if (row.tenant_id !== tenantId) return null;

  return {
    id: row.id,
    displayName: row.display_name,
    isActive: row.is_active,
  };
}

function isTenantCompanionRaw(row: unknown): row is TenantCompanionRaw {
  if (!isRecord(row)) return false;

  return (
    typeof row.id === 'string' &&
    row.id.length > 0 &&
    typeof row.tenant_id === 'string' &&
    row.tenant_id.length > 0 &&
    typeof row.display_name === 'string' &&
    row.display_name.trim().length > 0 &&
    typeof row.is_active === 'boolean'
  );
}

function compareTenantCompanions(left: TenantCompanion, right: TenantCompanion): number {
  if (left.isActive !== right.isActive) {
    return left.isActive ? -1 : 1;
  }

  const byName = left.displayName.localeCompare(right.displayName, 'it', {
    sensitivity: 'base',
  });
  if (byName !== 0) return byName;

  if (left.id < right.id) return -1;
  if (left.id > right.id) return 1;
  return 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
