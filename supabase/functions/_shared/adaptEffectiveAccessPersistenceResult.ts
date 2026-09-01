/**
 * Pure adapter: persistence result → HTTP-safe EffectiveAccess | Response
 * (BILLING-92).
 *
 * Maps an already-obtained ResolveTenantEffectiveAccessFromPersistenceResult
 * to the resolver contract used by handleEffectiveAccessRequest:
 *   success → EffectiveAccess unchanged (domain, not HTTP)
 *   invalid_tenant_id → 422 UNPROCESSABLE_ENTITY (transport-neutral)
 *   other known persistence failures → opaque internalError()
 *
 * Does NOT persist, authorize, authenticate, serialize, or emit {data}.
 * No clients, env, network, Stripe, or Supabase.
 */

import { internalError, unprocessableEntity } from "./http.ts";
import type { EffectiveAccess } from "./resolveEffectiveAccess.ts";
import type {
  ResolveTenantEffectiveAccessFromPersistenceFailureReason,
  ResolveTenantEffectiveAccessFromPersistenceResult,
} from "./resolveTenantEffectiveAccessFromPersistence.ts";

const INVALID_TENANT_IDENTIFIER_MESSAGE = "Invalid tenant identifier.";

const FAILURE_HTTP_KIND: {
  readonly [K in ResolveTenantEffectiveAccessFromPersistenceFailureReason]:
    | "unprocessable_entity"
    | "internal_error";
} = {
  invalid_tenant_id: "unprocessable_entity",
  tenant_not_found: "internal_error",
  tenant_lookup_failed: "internal_error",
  invalid_tenant_access_mode: "internal_error",
  stripe_subscription_lookup_failed: "internal_error",
  stripe_subscription_observation_invalid: "internal_error",
  complimentary_access_grant_lookup_failed: "internal_error",
  complimentary_access_grant_invalid: "internal_error",
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isKnownFailureReason(
  reason: unknown,
): reason is ResolveTenantEffectiveAccessFromPersistenceFailureReason {
  return (
    typeof reason === "string" &&
    Object.prototype.hasOwnProperty.call(FAILURE_HTTP_KIND, reason)
  );
}

function mapKnownFailureReason(
  reason: ResolveTenantEffectiveAccessFromPersistenceFailureReason,
): Response {
  if (FAILURE_HTTP_KIND[reason] === "unprocessable_entity") {
    return unprocessableEntity(INVALID_TENANT_IDENTIFIER_MESSAGE);
  }
  return internalError();
}

/**
 * Convert a persistence result into EffectiveAccess or an HTTP-safe
 * failure Response. Unknown or malformed input is fail-closed.
 */
export function adaptEffectiveAccessPersistenceResult(
  result: ResolveTenantEffectiveAccessFromPersistenceResult,
): EffectiveAccess | Response {
  const value: unknown = result;

  if (!isPlainObject(value)) {
    return internalError();
  }

  if (value.ok === true) {
    if (!isPlainObject(value.effectiveAccess)) {
      return internalError();
    }
    return value.effectiveAccess as EffectiveAccess;
  }

  if (value.ok === false) {
    if (!isKnownFailureReason(value.reason)) {
      return internalError();
    }
    return mapKnownFailureReason(value.reason);
  }

  return internalError();
}
