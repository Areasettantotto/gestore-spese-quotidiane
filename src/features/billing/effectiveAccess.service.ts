import { invokeEffectiveAccess } from './effectiveAccess.repository';
import type {
  AccessMode,
  Capability,
  CommercialAccessSource,
  EffectiveAccessErrorCode,
  EffectiveAccessFailure,
  EffectiveAccessPayload,
  FetchEffectiveAccessResult,
  ProductTier,
} from './effectiveAccess.types';

const PUBLIC_ERROR_CODES: readonly EffectiveAccessErrorCode[] = [
  'METHOD_NOT_ALLOWED',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'INVALID_JSON',
  'INVALID_REQUEST',
  'UNPROCESSABLE_ENTITY',
  'SERVICE_UNAVAILABLE',
  'UPSTREAM_ERROR',
  'NOT_IMPLEMENTED',
  'INTERNAL_ERROR',
];

/**
 * Semantic frontend boundary over the EffectiveAccess invoke.
 * Success returns the public payload as-is. Failure is failure — never an entitlement.
 */
export async function fetchEffectiveAccess(tenantId: string): Promise<FetchEffectiveAccessResult> {
  const invoked = await invokeEffectiveAccess(tenantId);

  if (invoked.kind === 'transport_error') {
    return fail(null, 'EffectiveAccess request failed.');
  }

  if (invoked.kind === 'application_error') {
    return failFromEnvelope(invoked.error);
  }

  const classified = classifyExclusiveEnvelope(invoked.body);
  if (classified.kind === 'application_error') {
    return failFromEnvelope(classified.error);
  }
  if (classified.kind === 'invalid') {
    return fail(null, 'EffectiveAccess response did not match the public contract.');
  }

  const payload = parseEffectiveAccessPayload(classified.data);
  if (!payload) {
    return fail(null, 'EffectiveAccess response did not match the public contract.');
  }

  return { ok: true, data: payload };
}

function fail(code: EffectiveAccessFailure['code'], message: string): FetchEffectiveAccessResult {
  return { ok: false, error: { code, message } };
}

function failFromEnvelope(error: { code: unknown; message: unknown }): FetchEffectiveAccessResult {
  const message =
    typeof error.message === 'string' && error.message.length > 0
      ? error.message
      : 'EffectiveAccess request failed.';

  if (isPublicErrorCode(error.code)) {
    return fail(error.code, message);
  }

  if (typeof error.code === 'string' && error.code.length > 0) {
    return fail(error.code, message);
  }

  return fail(null, message);
}

type ExclusiveEnvelope =
  | { kind: 'success'; data: Record<string, unknown> }
  | { kind: 'application_error'; error: { code: unknown; message: unknown } }
  | { kind: 'invalid' };

function classifyExclusiveEnvelope(body: unknown): ExclusiveEnvelope {
  if (!isRecord(body)) {
    return { kind: 'invalid' };
  }

  const hasData = 'data' in body;
  const hasError = 'error' in body;

  if (hasData && hasError) {
    return { kind: 'invalid' };
  }

  if (hasError) {
    if (!isRecord(body.error)) {
      return { kind: 'invalid' };
    }
    return {
      kind: 'application_error',
      error: { code: body.error.code, message: body.error.message },
    };
  }

  if (hasData) {
    if (!isRecord(body.data)) {
      return { kind: 'invalid' };
    }
    return { kind: 'success', data: body.data };
  }

  return { kind: 'invalid' };
}

function parseEffectiveAccessPayload(value: Record<string, unknown>): EffectiveAccessPayload | null {
  if (
    !('status' in value) ||
    !('mode' in value) ||
    !('tier' in value) ||
    !('source' in value) ||
    !('expiresAt' in value) ||
    !('capabilities' in value)
  ) {
    return null;
  }

  const { status, mode, tier, source, expiresAt, capabilities } = value;

  if (status === 'granted' && mode === 'standard') {
    if (!isProductTier(tier) || !isCommercialAccessSource(source) || !isExpiresAt(expiresAt)) {
      return null;
    }
    if (!isCapabilityList(capabilities)) {
      return null;
    }
    return {
      status: 'granted',
      mode: 'standard',
      tier,
      source,
      expiresAt,
      capabilities: freezeCapabilities(capabilities),
    };
  }

  if (status === 'granted' && (mode === 'demo' || mode === 'internal')) {
    if (tier !== null || source !== null || expiresAt !== null) {
      return null;
    }
    if (!isCapabilityList(capabilities)) {
      return null;
    }
    return {
      status: 'granted',
      mode,
      tier: null,
      source: null,
      expiresAt: null,
      capabilities: freezeCapabilities(capabilities),
    };
  }

  if (status === 'unentitled') {
    if (mode !== 'standard' || tier !== null || source !== null || expiresAt !== null) {
      return null;
    }
    if (!isEmptyCapabilities(capabilities)) {
      return null;
    }
    return {
      status: 'unentitled',
      mode: 'standard',
      tier: null,
      source: null,
      expiresAt: null,
      capabilities: EMPTY_CAPABILITIES,
    };
  }

  if (status === 'invalid') {
    if (!isAccessMode(mode) || tier !== null || source !== null || expiresAt !== null) {
      return null;
    }
    if (!isEmptyCapabilities(capabilities)) {
      return null;
    }
    return {
      status: 'invalid',
      mode,
      tier: null,
      source: null,
      expiresAt: null,
      capabilities: EMPTY_CAPABILITIES,
    };
  }

  return null;
}

const EMPTY_CAPABILITIES: readonly [] = Object.freeze([]);

function freezeCapabilities(capabilities: readonly Capability[]): readonly Capability[] {
  return Object.freeze(capabilities.slice());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isProductTier(value: unknown): value is ProductTier {
  return value === 'base' || value === 'pro';
}

function isAccessMode(value: unknown): value is AccessMode {
  return value === 'standard' || value === 'demo' || value === 'internal';
}

function isCommercialAccessSource(value: unknown): value is CommercialAccessSource {
  return value === 'stripe' || value === 'complimentary';
}

function isCapability(value: unknown): value is Capability {
  return (
    value === 'expense_management' ||
    value === 'standard_dashboard' ||
    value === 'ai_categorization' ||
    value === 'ai_insights' ||
    value === 'ai_assistant'
  );
}

function isCapabilityList(value: unknown): value is readonly Capability[] {
  return Array.isArray(value) && value.every(isCapability);
}

function isEmptyCapabilities(value: unknown): value is readonly [] {
  return Array.isArray(value) && value.length === 0;
}

function isExpiresAt(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isPublicErrorCode(value: unknown): value is EffectiveAccessErrorCode {
  return typeof value === 'string' && (PUBLIC_ERROR_CODES as readonly string[]).includes(value);
}
