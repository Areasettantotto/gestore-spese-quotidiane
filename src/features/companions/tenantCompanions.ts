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

/** Inactive rows do not consume a slot. The server trigger remains authoritative. */
export const MAX_ACTIVE_TENANT_COMPANIONS = 20;

export const COMPANION_CREATE_BLANK_NAME_MESSAGE = "Inserisci un nome per l'accompagnatore.";
export const COMPANION_CREATE_ACTIVE_LIMIT_MESSAGE = 'Limite di 20 accompagnatori attivi raggiunto.';
export const COMPANION_CREATE_FEATURE_DISABLED_MESSAGE =
  'Attiva la funzione per aggiungere un accompagnatore.';
export const COMPANION_CREATE_FAILED_MESSAGE =
  "Non è stato possibile aggiungere l'accompagnatore. Riprova.";

/**
 * created — insert succeeded and the returned row matched the catalog mapper.
 * failed — no usable row. message is local copy, never a raw database error.
 */
export type TenantCompanionCreateResult =
  | { kind: 'created'; companion: TenantCompanion }
  | { kind: 'failed'; message: string };

const SERVER_ACTIVE_LIMIT_REACHED = 'active companion limit of 20 per tenant was reached (DATA-51)';
const SERVER_CREATION_DISABLED =
  'companion creation is disabled while companions_enabled is false (DATA-51)';
const SERVER_DISPLAY_NAME_NONBLANK =
  'new row for relation "tenant_companions" violates check constraint "tenant_companions_display_name_nonblank"';

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

  return { kind: 'ready', items: orderTenantCompanions(items) };
}

/**
 * Insert one companion for the tenant.
 * Payload is tenant_id + display_name only. id, is_active, delegated_auth_user_id,
 * created_at, and updated_at stay on server defaults and are not sent.
 * trim() is used only to refuse a whitespace-only name. The stored value is
 * the string the caller passed, with no length, uniqueness, or trim rewrite.
 */
export async function createTenantCompanion(
  tenantId: string,
  displayName: string
): Promise<TenantCompanionCreateResult> {
  if (tenantId.length === 0 || typeof displayName !== 'string') {
    return { kind: 'failed', message: COMPANION_CREATE_FAILED_MESSAGE };
  }

  if (displayName.trim().length === 0) {
    return { kind: 'failed', message: COMPANION_CREATE_BLANK_NAME_MESSAGE };
  }

  try {
    const { data, error } = await insertTenantCompanion(tenantId, displayName);

    if (error) {
      console.error('Failed to create tenant companion', error);
      return { kind: 'failed', message: mapTenantCompanionCreateError(error) };
    }

    const companion = mapTenantCompanionRow(data, tenantId);
    if (!companion) {
      console.error('Created tenant companion row did not match the expected shape');
      return { kind: 'failed', message: COMPANION_CREATE_FAILED_MESSAGE };
    }

    return { kind: 'created', companion };
  } catch (error) {
    console.error('Failed to create tenant companion', error);
    return { kind: 'failed', message: COMPANION_CREATE_FAILED_MESSAGE };
  }
}

export function countActiveTenantCompanions(items: readonly TenantCompanion[]): number {
  let count = 0;
  for (const item of items) {
    if (item.isActive) count += 1;
  }
  return count;
}

export function orderTenantCompanions(items: readonly TenantCompanion[]): TenantCompanion[] {
  return [...items].sort(compareTenantCompanions);
}

async function insertTenantCompanion(tenantId: string, displayName: string) {
  const payload: { tenant_id: string; display_name: string } = {
    tenant_id: tenantId,
    display_name: displayName,
  };

  return supabase
    .from('tenant_companions')
    .insert(payload)
    .select('id, tenant_id, display_name, is_active')
    .single();
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

function mapTenantCompanionCreateError(error: unknown): string {
  const known = readWriteError(error);
  if (!known) return COMPANION_CREATE_FAILED_MESSAGE;

  if (known.code === '23514' && known.message === SERVER_DISPLAY_NAME_NONBLANK) {
    return COMPANION_CREATE_BLANK_NAME_MESSAGE;
  }

  if (known.code === 'P0001' && known.message === SERVER_ACTIVE_LIMIT_REACHED) {
    return COMPANION_CREATE_ACTIVE_LIMIT_MESSAGE;
  }

  if (known.code === 'P0001' && known.message === SERVER_CREATION_DISABLED) {
    return COMPANION_CREATE_FEATURE_DISABLED_MESSAGE;
  }

  return COMPANION_CREATE_FAILED_MESSAGE;
}

function readWriteError(error: unknown): { code: string; message: string } | null {
  if (!isRecord(error)) return null;
  if (typeof error.code !== 'string' || typeof error.message !== 'string') return null;
  return { code: error.code, message: error.message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
