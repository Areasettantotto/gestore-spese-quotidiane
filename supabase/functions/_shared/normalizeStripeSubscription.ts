/**
 * Pure Stripe Subscription → domain normalization (I4.3BE).
 *
 * No DB, Supabase, Deno.env, Stripe API, HTTP, or wall-clock.
 * Does not resolve tenants, touch W_sub, or derive Snapshot(S).
 */

import type { ProductTier } from "./resolveEffectiveAccess.ts";
import {
  type CommercialPriceSelection,
  type KnownStripePrice,
  resolveKnownStripePrice,
} from "./resolveKnownStripePrice.ts";

export type SupportedStripeSubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "incomplete"
  | "incomplete_expired"
  | "paused";

/** Commercial Stripe product signal → DB tier `paid` (NP-A). */
export type NormalizedStripeSubscriptionPlanCode = "paid";

export type NormalizedStripeSubscription = {
  provider_subscription_id: string;
  provider_customer_id: string;
  plan_code: NormalizedStripeSubscriptionPlanCode;
  /** Catalog ProductTier. Distinct from plan_code; never derived from it. */
  productTier: ProductTier;
  status: SupportedStripeSubscriptionStatus;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  trial_ends_at: string | null;
};

export type NormalizeStripeSubscriptionFailureReason =
  | "invalid_config"
  | "invalid_subscription_id"
  | "invalid_customer"
  | "unsupported_status"
  | "unsupported_price"
  | "incompatible_plan_metadata"
  | "invalid_items"
  | "invalid_timestamp"
  | "missing_trial_end"
  | "invalid_trial_end"
  | "invalid_cancel_at_period_end";

export type NormalizeStripeSubscriptionResult =
  | { ok: true; value: NormalizedStripeSubscription }
  | { ok: false; reason: NormalizeStripeSubscriptionFailureReason };

/**
 * Structural Subscription shape (string or expanded customer/price).
 * Intentionally loose — validation is fail-closed inside the mapper.
 */
export type StripeSubscriptionLike = {
  id?: unknown;
  customer?: unknown;
  status?: unknown;
  current_period_start?: unknown;
  current_period_end?: unknown;
  cancel_at_period_end?: unknown;
  trial_end?: unknown;
  metadata?: unknown;
  items?: unknown;
};

export type NormalizeStripeSubscriptionConfig = {
  /**
   * Caller-supplied known Stripe Price catalog. This module never reads
   * env/secrets and does not construct the catalog.
   */
  catalog: readonly KnownStripePrice[];
};

const SUPPORTED_STATUSES = new Set<SupportedStripeSubscriptionStatus>([
  "active",
  "trialing",
  "past_due",
  "canceled",
  "unpaid",
  "incomplete",
  "incomplete_expired",
  "paused",
]);

/**
 * Canonical commercial slots written on Subscription by create-checkout-session.
 * Request alias `pro` is normalized to `pro_monthly` only at the checkout input
 * boundary; this mapper accepts the exact four-slot metadata values and never
 * invents aliases. Present metadata is a commercial-selection signal only:
 * persisted plan_code stays `paid`, and ProductTier stays catalog-authoritative.
 */
function isCanonicalCommercialPlanMetadata(
  value: string,
): value is CommercialPriceSelection {
  return value === "base_monthly" || value === "base_annual" ||
    value === "pro_monthly" || value === "pro_annual";
}

function commercialSlotForKnownPrice(
  price: KnownStripePrice,
): CommercialPriceSelection {
  return `${price.tier}_${price.interval}`;
}

const MAX_SAFE_UNIX_SECONDS = Math.floor(Number.MAX_SAFE_INTEGER / 1000);

function fail(
  reason: NormalizeStripeSubscriptionFailureReason,
): NormalizeStripeSubscriptionResult {
  return { ok: false, reason };
}

function nonEmptyTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Same structural forms as stripe-webhook `extractStripeCustomerIdString`:
 * customer as string id, or expanded object with string `id`.
 */
export function extractStripeCustomerId(customer: unknown): string | null {
  if (typeof customer === "string") {
    return nonEmptyTrimmedString(customer);
  }
  if (customer !== null && typeof customer === "object" && "id" in customer) {
    return nonEmptyTrimmedString((customer as { id: unknown }).id);
  }
  return null;
}

/**
 * Extract the item Price ID without trim-repair. Exact-ID validation belongs
 * to resolveKnownStripePrice; padding/empty strings are passed through raw.
 * Missing or non-string forms return null (invalid_items at extraction).
 */
function extractPriceIdFromItem(item: unknown): string | null {
  if (item === null || typeof item !== "object") {
    return null;
  }
  const price = (item as { price?: unknown }).price;
  if (typeof price === "string") {
    return price;
  }
  if (price !== null && typeof price === "object" && "id" in price) {
    const id = (price as { id: unknown }).id;
    if (typeof id === "string") {
      return id;
    }
    return null;
  }
  return null;
}

/**
 * Mono-item only: checkout is single line-item; multi-item is NormalizationFailClosed.
 * Returns null for zero items, malformed items/data, or more than one item.
 */
function collectSingleSubscriptionPriceId(items: unknown): string | null {
  if (items === null || typeof items !== "object") {
    return null;
  }
  const data = (items as { data?: unknown }).data;
  if (!Array.isArray(data) || data.length !== 1) {
    return null;
  }

  return extractPriceIdFromItem(data[0]);
}

/**
 * Deterministic Unix seconds → UTC ISO-8601 timestamptz-compatible string.
 * Does not use Date.now() / local timezone / wall-clock.
 * Fail-closed for integers outside the representable JavaScript Date range
 * (MAX_SAFE alone does not guarantee Date.toISOString() is valid).
 */
export function unixSecondsToTimestamptz(
  value: unknown,
): { ok: true; value: string } | { ok: false } {
  if (
    typeof value !== "number" || !Number.isFinite(value) ||
    !Number.isInteger(value)
  ) {
    return { ok: false };
  }
  if (value < 0 || value > MAX_SAFE_UNIX_SECONDS) {
    return { ok: false };
  }

  const date = new Date(value * 1000);
  if (!Number.isFinite(date.getTime())) {
    return { ok: false };
  }

  const iso = date.toISOString();
  const roundTripSeconds = Math.floor(Date.parse(iso) / 1000);
  if (!Number.isFinite(roundTripSeconds) || roundTripSeconds !== value) {
    return { ok: false };
  }
  return { ok: true, value: iso };
}

function optionalUnixSecondsToTimestamptz(
  value: unknown,
): { ok: true; value: string | null } | { ok: false } {
  if (value === null || value === undefined) {
    return { ok: true, value: null };
  }
  const converted = unixSecondsToTimestamptz(value);
  if (!converted.ok) {
    return { ok: false };
  }
  return { ok: true, value: converted.value };
}

function readMetadataPlanCode(
  metadata: unknown,
):
  | { kind: "absent" }
  | { kind: "present"; value: string }
  | { kind: "invalid" } {
  if (metadata === null || metadata === undefined) {
    return { kind: "absent" };
  }
  if (typeof metadata !== "object" || Array.isArray(metadata)) {
    return { kind: "invalid" };
  }
  const planCode = (metadata as { plan_code?: unknown }).plan_code;
  if (planCode === undefined || planCode === null) {
    return { kind: "absent" };
  }
  if (typeof planCode !== "string") {
    return { kind: "invalid" };
  }
  // Exact provider metadata value — no trim / toLowerCase canonicalization.
  return { kind: "present", value: planCode };
}

function normalizePlanCodeFromSignals(
  metadata: unknown,
  knownPrice: KnownStripePrice,
):
  | { ok: true; plan_code: NormalizedStripeSubscriptionPlanCode }
  | { ok: false; reason: NormalizeStripeSubscriptionFailureReason } {
  const metaPlan = readMetadataPlanCode(metadata);
  if (metaPlan.kind === "invalid") {
    return { ok: false, reason: "incompatible_plan_metadata" };
  }
  if (metaPlan.kind === "absent") {
    // Catalog Price match alone is sufficient when metadata plan_code is absent.
    return { ok: true, plan_code: "paid" };
  }

  // Present metadata must be an exact four-slot checkout value.
  // Alias `pro`, casing/whitespace variants, paid/free/trial/demo/internal,
  // and unknown values all fail closed.
  if (!isCanonicalCommercialPlanMetadata(metaPlan.value)) {
    return { ok: false, reason: "incompatible_plan_metadata" };
  }

  // Metadata is a commercial-selection signal, not ProductTier authority.
  // When both Price and metadata are present, they must name the same slot.
  if (metaPlan.value !== commercialSlotForKnownPrice(knownPrice)) {
    return { ok: false, reason: "incompatible_plan_metadata" };
  }

  return { ok: true, plan_code: "paid" };
}

/**
 * Normalize a Stripe Subscription object into a persistence-ready commercial row shape.
 * Fail-closed: on any unreliable signal returns `{ ok: false, reason }` with no partial value.
 */
export function normalizeStripeSubscription(
  subscription: StripeSubscriptionLike,
  config: NormalizeStripeSubscriptionConfig,
): NormalizeStripeSubscriptionResult {
  const providerSubscriptionId = nonEmptyTrimmedString(subscription.id);
  if (providerSubscriptionId === null) {
    return fail("invalid_subscription_id");
  }

  const providerCustomerId = extractStripeCustomerId(subscription.customer);
  if (providerCustomerId === null) {
    return fail("invalid_customer");
  }

  if (
    typeof subscription.status !== "string" || !SUPPORTED_STATUSES.has(
      subscription.status as SupportedStripeSubscriptionStatus,
    )
  ) {
    return fail("unsupported_status");
  }
  const status = subscription.status as SupportedStripeSubscriptionStatus;

  const priceId = collectSingleSubscriptionPriceId(subscription.items);
  if (priceId === null) {
    return fail("invalid_items");
  }

  const knownPriceResult = resolveKnownStripePrice({
    priceId,
    catalog: config.catalog,
  });
  if (knownPriceResult.ok === false) {
    switch (knownPriceResult.reason) {
      case "unknown_price":
        return fail("unsupported_price");
      case "invalid_catalog_entry":
      case "duplicate_price_id":
        return fail("invalid_config");
      case "invalid_price_id":
        return fail("invalid_items");
    }
  }

  const planResult = normalizePlanCodeFromSignals(
    subscription.metadata,
    knownPriceResult.value,
  );
  if (planResult.ok === false) {
    return planResult;
  }

  const periodStart = optionalUnixSecondsToTimestamptz(
    subscription.current_period_start,
  );
  if (!periodStart.ok) {
    return fail("invalid_timestamp");
  }

  const periodEnd = optionalUnixSecondsToTimestamptz(
    subscription.current_period_end,
  );
  if (!periodEnd.ok) {
    return fail("invalid_timestamp");
  }

  if (typeof subscription.cancel_at_period_end !== "boolean") {
    return fail("invalid_cancel_at_period_end");
  }

  let trialEndsAt: string | null = null;
  if (status === "trialing") {
    if (
      subscription.trial_end === null || subscription.trial_end === undefined
    ) {
      return fail("missing_trial_end");
    }
    const trialEnd = unixSecondsToTimestamptz(subscription.trial_end);
    if (!trialEnd.ok) {
      return fail("invalid_trial_end");
    }
    trialEndsAt = trialEnd.value;
  } else if (
    subscription.trial_end !== null && subscription.trial_end !== undefined
  ) {
    const trialEnd = unixSecondsToTimestamptz(subscription.trial_end);
    if (!trialEnd.ok) {
      return fail("invalid_trial_end");
    }
    trialEndsAt = trialEnd.value;
  }

  return {
    ok: true,
    value: {
      provider_subscription_id: providerSubscriptionId,
      provider_customer_id: providerCustomerId,
      plan_code: planResult.plan_code,
      productTier: knownPriceResult.value.tier,
      status,
      current_period_start: periodStart.value,
      current_period_end: periodEnd.value,
      cancel_at_period_end: subscription.cancel_at_period_end,
      trial_ends_at: trialEndsAt,
    },
  };
}
