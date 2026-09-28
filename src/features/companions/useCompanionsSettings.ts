import { useEffect, useState } from 'react';

import type { TenantRole } from '@/src/features/tenancy/tenancy.types';

import { getCompanionsSettings, type CompanionsFeatureSetting } from './companionsSettings';

/**
 * unavailable — tenant context still loading, or no active tenant. No query.
 * unreadable — tenant present and role is not admin. No query; the setting was not read.
 * loading — admin read in flight, or the stored result belongs to another tenant.
 * enabled — row present and companions_enabled is true.
 * disabled — row present and companions_enabled is false.
 * missing — no settings row. Distinct from disabled.
 * error — request failed or the row shape was not usable.
 */
export type CompanionsSettingsStatus =
  | 'unavailable'
  | 'unreadable'
  | 'loading'
  | 'enabled'
  | 'disabled'
  | 'missing'
  | 'error';

export type UseCompanionsSettingsParams = {
  activeTenantId: string | null;
  membershipRole: TenantRole | null;
  isTenantContextLoading: boolean;
};

export type UseCompanionsSettingsResult = {
  status: CompanionsSettingsStatus;
  /** True or false only for status enabled or disabled. Null when the setting was not read. */
  companionsEnabled: boolean | null;
};

type FetchedCompanionsSettings = {
  tenantId: string;
  result:
    | { kind: 'ready'; setting: CompanionsFeatureSetting }
    | { kind: 'missing' }
    | { kind: 'error' };
};

function canReadCompanionsSettings(role: TenantRole | null): role is 'admin' {
  return role === 'admin';
}

export function useCompanionsSettings({
  activeTenantId,
  membershipRole,
  isTenantContextLoading,
}: UseCompanionsSettingsParams): UseCompanionsSettingsResult {
  const shouldRead =
    !isTenantContextLoading &&
    Boolean(activeTenantId) &&
    canReadCompanionsSettings(membershipRole);

  const [fetched, setFetched] = useState<FetchedCompanionsSettings | null>(null);
  const [inFlight, setInFlight] = useState(false);

  useEffect(() => {
    if (!shouldRead || !activeTenantId) {
      setFetched(null);
      setInFlight(false);
      return;
    }

    const tenantId = activeTenantId;
    let cancelled = false;
    setInFlight(true);

    void getCompanionsSettings(tenantId).then((result) => {
      if (cancelled) return;

      if (result.kind === 'ready') {
        setFetched({ tenantId, result: { kind: 'ready', setting: result.setting } });
      } else if (result.kind === 'missing') {
        setFetched({ tenantId, result: { kind: 'missing' } });
      } else {
        setFetched({ tenantId, result: { kind: 'error' } });
      }

      setInFlight(false);
    });

    return () => {
      cancelled = true;
    };
  }, [activeTenantId, shouldRead]);

  if (isTenantContextLoading || !activeTenantId) {
    return { status: 'unavailable', companionsEnabled: null };
  }

  if (!canReadCompanionsSettings(membershipRole)) {
    return { status: 'unreadable', companionsEnabled: null };
  }

  const fetchedMatches = fetched != null && fetched.tenantId === activeTenantId;

  if (inFlight || !fetchedMatches) {
    return { status: 'loading', companionsEnabled: null };
  }

  if (fetched.result.kind === 'missing') {
    return { status: 'missing', companionsEnabled: null };
  }

  if (fetched.result.kind === 'error') {
    return { status: 'error', companionsEnabled: null };
  }

  if (fetched.result.setting.companionsEnabled) {
    return { status: 'enabled', companionsEnabled: true };
  }

  return { status: 'disabled', companionsEnabled: false };
}
