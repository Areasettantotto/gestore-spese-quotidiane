/**
 * Local consumer contract for the public HTTP DTO of Edge Function `effective-access`.
 * Field names, unions and nullability match the serialized payload.
 * Not derived from plan_code / billing legacy. Demo/Internal keep server nullability.
 */

export type ProductTier = 'base' | 'pro';

export type AccessMode = 'standard' | 'demo' | 'internal';

export type CommercialAccessSource = 'stripe' | 'complimentary';

export type Capability =
  | 'expense_management'
  | 'standard_dashboard'
  | 'ai_categorization'
  | 'ai_insights'
  | 'ai_assistant';

/** Public error codes from the EffectiveAccess HTTP envelope. */
export type EffectiveAccessErrorCode =
  | 'METHOD_NOT_ALLOWED'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'INVALID_JSON'
  | 'INVALID_REQUEST'
  | 'UNPROCESSABLE_ENTITY'
  | 'SERVICE_UNAVAILABLE'
  | 'UPSTREAM_ERROR'
  | 'NOT_IMPLEMENTED'
  | 'INTERNAL_ERROR';

export type EffectiveAccessPayload =
  | {
      status: 'granted';
      mode: 'standard';
      tier: ProductTier;
      source: CommercialAccessSource;
      expiresAt: string | null;
      capabilities: readonly Capability[];
    }
  | {
      status: 'granted';
      mode: 'demo' | 'internal';
      tier: null;
      source: null;
      expiresAt: null;
      capabilities: readonly Capability[];
    }
  | {
      status: 'unentitled';
      mode: 'standard';
      tier: null;
      source: null;
      expiresAt: null;
      capabilities: readonly [];
    }
  | {
      status: 'invalid';
      mode: AccessMode;
      tier: null;
      source: null;
      expiresAt: null;
      capabilities: readonly [];
    };

export type EffectiveAccessSuccessEnvelope = {
  data: EffectiveAccessPayload;
};

export type EffectiveAccessErrorEnvelope = {
  error: {
    code: EffectiveAccessErrorCode;
    message: string;
  };
};

export type EffectiveAccessRequestBody = {
  tenant_id: string;
};

/**
 * Failure surfaced to a future hook.
 * `code` is the public envelope code when present; otherwise null (transport / unreadable body).
 * Never an entitlement fallback.
 */
export type EffectiveAccessFailure = {
  code: EffectiveAccessErrorCode | string | null;
  message: string;
};

export type FetchEffectiveAccessResult =
  | { ok: true; data: EffectiveAccessPayload }
  | { ok: false; error: EffectiveAccessFailure };
