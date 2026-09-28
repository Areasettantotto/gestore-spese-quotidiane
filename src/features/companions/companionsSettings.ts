import { supabase } from '@/src/lib/supabaseClient';

/**
 * Minimal raw shape for the companions feature setting.
 * Columns match the explicit tenant_settings select.
 */
export type TenantSettingsCompanionsRaw = {
  tenant_id: string;
  companions_enabled: boolean;
};

export type CompanionsFeatureSetting = {
  tenantId: string;
  companionsEnabled: boolean;
};

/**
 * missing — query succeeded and returned no row. Invariant failure:
 * migration 016 seeds one tenant_settings row per tenant. Not feature-off.
 * error — request failed, or the row did not match the expected shape.
 */
export type CompanionsSettingsReadResult =
  | { kind: 'ready'; setting: CompanionsFeatureSetting }
  | { kind: 'missing' }
  | { kind: 'error' };

/**
 * Read-only companions feature setting for one tenant.
 * Callers must already know the reader is an admin; this function does not
 * widen access. It never inserts or updates.
 */
export async function getCompanionsSettings(
  tenantId: string
): Promise<CompanionsSettingsReadResult> {
  if (tenantId.length === 0) {
    return { kind: 'error' };
  }

  const { data, error } = await selectCompanionsSettings(tenantId);

  if (error) {
    console.error('Failed to load companions settings', error);
    return { kind: 'error' };
  }

  if (data == null) {
    console.error('Companions settings row is missing for the active tenant');
    return { kind: 'missing' };
  }

  const setting = mapCompanionsSettingsRow(data, tenantId);
  if (!setting) {
    console.error('Companions settings row did not match the expected shape');
    return { kind: 'error' };
  }

  return { kind: 'ready', setting };
}

async function selectCompanionsSettings(tenantId: string) {
  return supabase
    .from('tenant_settings')
    .select('tenant_id, companions_enabled')
    .eq('tenant_id', tenantId)
    .maybeSingle();
}

function mapCompanionsSettingsRow(
  row: unknown,
  tenantId: string
): CompanionsFeatureSetting | null {
  if (!isTenantSettingsCompanionsRaw(row)) return null;
  if (row.tenant_id !== tenantId) return null;

  return {
    tenantId: row.tenant_id,
    companionsEnabled: row.companions_enabled,
  };
}

function isTenantSettingsCompanionsRaw(row: unknown): row is TenantSettingsCompanionsRaw {
  if (!isRecord(row)) return false;

  return (
    typeof row.tenant_id === 'string' &&
    row.tenant_id.length > 0 &&
    typeof row.companions_enabled === 'boolean'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
