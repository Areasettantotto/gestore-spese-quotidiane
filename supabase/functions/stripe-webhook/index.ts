// @ts-expect-error Deno runtime import resolved at edge deploy/runtime.
import Stripe from "https://esm.sh/stripe@14.25.0?target=denonext";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  extractStripeSubscriptionEventBootstrap,
  type StripeSubscriptionEventLike,
} from "../_shared/extractStripeSubscriptionEventBootstrap.ts";
import { fetchNormalizedStripeSubscriptionFromRuntimeConfig } from "../_shared/fetchNormalizedStripeSubscriptionFromRuntimeConfig.ts";
import {
  type BillingCustomerTenantLookupClient,
  resolveBillingCustomerTenant,
} from "../_shared/resolveBillingCustomerTenant.ts";
import {
  readTenantSubscriptionObservation,
  type TenantSubscriptionObservationLookupClient,
} from "../_shared/readTenantSubscriptionObservation.ts";
import { classifySubscriptionEventAdmission } from "../_shared/classifySubscriptionEventAdmission.ts";
import {
  persistTenantSubscriptionCandidate,
  type PersistTenantSubscriptionCandidateOperation,
  type PersistTenantSubscriptionCandidateParams,
  type TenantSubscriptionInsertWriteValues,
  type TenantSubscriptionPersistenceClient,
  type TenantSubscriptionPersistenceFilterBuilder,
  type TenantSubscriptionUpdateWriteValues,
} from "../_shared/persistTenantSubscriptionCandidate.ts";
import {
  badRequest,
  methodNotAllowed,
  jsonResponse,
  serviceUnavailable,
  upstreamError,
} from "../_shared/http.ts";

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
  env: {
    get: (key: string) => string | undefined;
  };
};

function createWebhookSupabaseClient(
  supabaseUrl: string,
  supabaseServiceRoleKey: string,
) {
  return createClient(supabaseUrl, supabaseServiceRoleKey);
}

type SupabaseClient = ReturnType<typeof createWebhookSupabaseClient>;

type BillingEventRow = {
  id: string;
  processed_at: string | null;
  tenant_id: string | null;
  processing_error: string | null;
};

type TenantBillingCustomerRow = {
  id: string;
  tenant_id: string;
  provider_customer_id: string;
};

const WEBHOOK_NOT_CONFIGURED_MESSAGE = "Stripe webhook is not configured.";
const SUBSCRIPTION_PROCESSING_FAILURE_MESSAGE =
  "Failed to process Stripe subscription event.";
const PROVIDER = "stripe";
const MAX_PROCESSING_ERROR_LENGTH = 500;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ALLOWED_EVENT_TYPES = new Set<string>([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
]);

const SUBSCRIPTION_EVENT_TYPES = new Set<string>([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

const DEFERRED_EVENT_TYPES = new Set<string>([
  "invoice.payment_succeeded",
  "invoice.payment_failed",
]);

function receivedOk(event: { id: string; type: string }): Response {
  return jsonResponse(
    {
      data: {
        received: true,
        event_id: event.id,
        event_type: event.type,
      },
    },
    200,
  );
}

function sanitizeProcessingError(message: string): string {
  return message.replace(/\s+/g, " ").trim().slice(0, MAX_PROCESSING_ERROR_LENGTH);
}

function isUniqueViolation(error: { code?: string } | null | undefined): boolean {
  return error?.code === "23505";
}

function extractStripeCustomerIdString(customer: unknown): string | null {
  if (typeof customer === "string") {
    const trimmed = customer.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (customer !== null && typeof customer === "object" && "id" in customer) {
    const id = (customer as { id: unknown }).id;
    if (typeof id === "string") {
      const trimmed = id.trim();
      return trimmed.length > 0 ? trimmed : null;
    }
  }
  return null;
}

function extractCheckoutTenantId(session: Stripe.Checkout.Session): string | null {
  const metaTenantId = session.metadata?.tenant_id;
  if (typeof metaTenantId === "string" && metaTenantId.trim().length > 0) {
    const trimmed = metaTenantId.trim();
    return UUID_RE.test(trimmed) ? trimmed : null;
  }
  return null;
}

async function fetchBillingEventByProviderEventId(
  supabase: SupabaseClient,
  providerEventId: string,
): Promise<{ row: BillingEventRow | null; error: { code?: string; message?: string } | null }> {
  const { data, error } = await supabase
    .from("billing_events")
    .select("id, processed_at, tenant_id, processing_error")
    .eq("provider", PROVIDER)
    .eq("provider_event_id", providerEventId)
    .maybeSingle();

  if (error) {
    return { row: null, error };
  }

  return { row: (data as BillingEventRow | null) ?? null, error: null };
}

async function ensureBillingEventRow(
  supabase: SupabaseClient,
  event: Stripe.Event,
): Promise<
  | { ok: true; row: BillingEventRow }
  | { ok: false; response: Response }
> {
  const { data: inserted, error: insertError } = await supabase
    .from("billing_events")
    .insert({
      provider: PROVIDER,
      provider_event_id: event.id,
      event_type: event.type,
      tenant_id: null,
      processed_at: null,
      processing_error: null,
      payload: event,
    })
    .select("id, processed_at, tenant_id, processing_error")
    .maybeSingle();

  if (!insertError && inserted) {
    return { ok: true, row: inserted as BillingEventRow };
  }

  if (insertError && !isUniqueViolation(insertError)) {
    console.error("[stripe-webhook] billing_events insert failed", {
      event_id: event.id,
      event_type: event.type,
      error_code: insertError.code,
    });
    return {
      ok: false,
      response: upstreamError("Failed to persist billing event."),
    };
  }

  const fetched = await fetchBillingEventByProviderEventId(supabase, event.id);
  if (fetched.error || !fetched.row) {
    console.error("[stripe-webhook] billing_events fetch after conflict failed", {
      event_id: event.id,
      event_type: event.type,
      error_code: fetched.error?.code,
    });
    return {
      ok: false,
      response: upstreamError("Failed to load persisted billing event."),
    };
  }

  return { ok: true, row: fetched.row };
}

type RecordProcessingErrorResult =
  | { status: "recorded" }
  | { status: "already_completed" }
  | { status: "db_error" };

type RecordProcessingErrorFn = (
  billingEventId: string,
  reason: string,
  tenantId: string | null,
) => Promise<RecordProcessingErrorResult>;

async function fetchBillingEventById(
  supabase: SupabaseClient,
  billingEventId: string,
): Promise<{ row: BillingEventRow | null; error: { code?: string; message?: string } | null }> {
  const { data, error } = await supabase
    .from("billing_events")
    .select("id, processed_at, tenant_id, processing_error")
    .eq("id", billingEventId)
    .maybeSingle();

  if (error) {
    return { row: null, error };
  }

  return { row: (data as BillingEventRow | null) ?? null, error: null };
}

function isProcessedCompatible(
  row: BillingEventRow,
  tenantId: string,
): boolean {
  return (
    row.processed_at !== null &&
    row.tenant_id === tenantId &&
    row.processing_error === null
  );
}

async function recordProcessingError(
  supabase: SupabaseClient,
  billingEventId: string,
  message: string,
  tenantId: string | null,
): Promise<RecordProcessingErrorResult> {
  const sanitized = sanitizeProcessingError(message);

  // When tenantId is known, recorded/already_completed require matching tenant_id.
  const tenantCompatible = (row: BillingEventRow): boolean => {
    if (tenantId === null) return true;
    return row.tenant_id === tenantId;
  };

  const refuseIncompatibleTenant = (context: string): RecordProcessingErrorResult => {
    console.error(`[stripe-webhook] processing_error refused: ${context}`, {
      billing_event_id: billingEventId,
    });
    return { status: "db_error" };
  };

  const current = await fetchBillingEventById(supabase, billingEventId);
  if (current.error || !current.row) {
    console.error("[stripe-webhook] failed to load billing event before processing_error", {
      billing_event_id: billingEventId,
      error_code: current.error?.code,
    });
    return { status: "db_error" };
  }

  if (current.row.processed_at !== null) {
    if (!tenantCompatible(current.row)) {
      return refuseIncompatibleTenant("completed with incompatible or missing tenant_id");
    }
    return { status: "already_completed" };
  }

  // Refuse to mutate when a non-null tenantId conflicts with an existing tenant_id.
  if (
    tenantId !== null &&
    current.row.tenant_id !== null &&
    current.row.tenant_id !== tenantId
  ) {
    return refuseIncompatibleTenant("incompatible tenant_id");
  }

  const patch: { processing_error: string; tenant_id?: string } = {
    processing_error: sanitized,
  };
  // Never assign processed_at. Only fill tenant_id when still null; never remap.
  if (tenantId && current.row.tenant_id === null) {
    patch.tenant_id = tenantId;
  }

  let updateQuery = supabase
    .from("billing_events")
    .update(patch)
    .eq("id", billingEventId)
    .is("processed_at", null);

  // Pin observed tenant state: IS NULL when filling, else eq when already known.
  if (patch.tenant_id) {
    updateQuery = updateQuery.is("tenant_id", null);
  } else if (tenantId !== null) {
    updateQuery = updateQuery.eq("tenant_id", tenantId);
  }

  const { data: updatedRaw, error: updateError } = await updateQuery
    .select("id, processed_at, tenant_id, processing_error")
    .maybeSingle();

  if (updateError) {
    console.error("[stripe-webhook] failed to persist processing_error", {
      billing_event_id: billingEventId,
      error_code: updateError.code,
    });
    return { status: "db_error" };
  }

  const updated = updatedRaw as BillingEventRow | null;
  const firstUpdateRecorded =
    updated !== null &&
    updated.processed_at === null &&
    updated.processing_error === sanitized &&
    tenantCompatible(updated);

  if (firstUpdateRecorded) {
    return { status: "recorded" };
  }

  // Update matched no row (or unexpected shape): concurrent completion, or
  // tenant_id filled concurrently while we tried to set it.
  const readback = await fetchBillingEventById(supabase, billingEventId);
  if (readback.error || !readback.row) {
    console.error("[stripe-webhook] processing_error readback failed", {
      billing_event_id: billingEventId,
      error_code: readback.error?.code,
    });
    return { status: "db_error" };
  }

  if (readback.row.processed_at !== null) {
    if (!tenantCompatible(readback.row)) {
      return refuseIncompatibleTenant("completed with incompatible or missing tenant_id after race");
    }
    return { status: "already_completed" };
  }

  if (patch.tenant_id && readback.row.tenant_id !== null) {
    if (readback.row.tenant_id !== patch.tenant_id) {
      return refuseIncompatibleTenant("incompatible tenant_id after race");
    }

    // Retry error-only update without touching tenant_id; pin expected tenant.
    const { data: retryRaw, error: retryError } = await supabase
      .from("billing_events")
      .update({ processing_error: sanitized })
      .eq("id", billingEventId)
      .eq("tenant_id", patch.tenant_id)
      .is("processed_at", null)
      .select("id, processed_at, tenant_id, processing_error")
      .maybeSingle();

    if (retryError) {
      console.error("[stripe-webhook] failed to persist processing_error (retry)", {
        billing_event_id: billingEventId,
        error_code: retryError.code,
      });
      return { status: "db_error" };
    }

    const retry = retryRaw as BillingEventRow | null;
    if (
      retry !== null &&
      retry.processed_at === null &&
      retry.processing_error === sanitized &&
      retry.tenant_id === patch.tenant_id
    ) {
      return { status: "recorded" };
    }

    // Decision must use the post-retry state only — never the pre-retry readback.
    const retryReadback = await fetchBillingEventById(supabase, billingEventId);
    if (retryReadback.error || !retryReadback.row) {
      console.error("[stripe-webhook] processing_error retry readback failed", {
        billing_event_id: billingEventId,
        error_code: retryReadback.error?.code,
      });
      return { status: "db_error" };
    }

    if (retryReadback.row.processed_at !== null) {
      if (!tenantCompatible(retryReadback.row)) {
        return refuseIncompatibleTenant(
          "completed with incompatible or missing tenant_id on retry readback",
        );
      }
      return { status: "already_completed" };
    }

    if (
      retryReadback.row.processing_error === sanitized &&
      tenantCompatible(retryReadback.row)
    ) {
      return { status: "recorded" };
    }

    if (!tenantCompatible(retryReadback.row)) {
      return refuseIncompatibleTenant("incompatible or missing tenant_id on retry readback");
    }

    return { status: "db_error" };
  }

  if (readback.row.processing_error === sanitized) {
    if (!tenantCompatible(readback.row)) {
      return refuseIncompatibleTenant("recorded with incompatible or missing tenant_id");
    }
    return { status: "recorded" };
  }

  return { status: "db_error" };
}

async function markBillingEventProcessed(
  supabase: SupabaseClient,
  billingEventId: string,
  tenantId: string,
): Promise<{ ok: true } | { ok: false }> {
  const { data: updatedRaw, error } = await supabase
    .from("billing_events")
    .update({
      processed_at: new Date().toISOString(),
      processing_error: null,
    })
    .eq("id", billingEventId)
    .eq("tenant_id", tenantId)
    .is("processed_at", null)
    .select("id, processed_at, tenant_id, processing_error")
    .maybeSingle();

  if (error) {
    console.error("[stripe-webhook] billing_events processed_at update failed", {
      billing_event_id: billingEventId,
      tenant_id: tenantId,
      error_code: error.code,
    });
    return { ok: false };
  }

  const updated = updatedRaw as BillingEventRow | null;
  if (updated && isProcessedCompatible(updated, tenantId)) {
    return { ok: true };
  }

  const readback = await fetchBillingEventById(supabase, billingEventId);
  if (readback.error || !readback.row) {
    console.error("[stripe-webhook] billing_events processed_at readback failed", {
      billing_event_id: billingEventId,
      tenant_id: tenantId,
      error_code: readback.error?.code,
    });
    return { ok: false };
  }

  // Concurrent worker completed compatibly — treat as success.
  if (isProcessedCompatible(readback.row, tenantId)) {
    return { ok: true };
  }

  console.error("[stripe-webhook] billing_events processed_at not verified", {
    billing_event_id: billingEventId,
    tenant_id: tenantId,
    readback_tenant_id: readback.row.tenant_id,
    readback_processed_at: readback.row.processed_at,
  });
  return { ok: false };
}

async function resolveVerifiedTenantId(
  supabase: SupabaseClient,
  candidateTenantId: string,
): Promise<{ ok: true; tenantId: string } | { ok: false; reason: string }> {
  const { data, error } = await supabase
    .from("tenants")
    .select("id")
    .eq("id", candidateTenantId)
    .maybeSingle();

  if (error) {
    console.error("[stripe-webhook] tenant lookup failed", {
      tenant_id: candidateTenantId,
      error_code: error.code,
    });
    return { ok: false, reason: "Failed to verify tenant existence." };
  }

  if (!data?.id) {
    return { ok: false, reason: "Resolved tenant_id does not exist." };
  }

  return { ok: true, tenantId: data.id as string };
}

async function ensureTenantIdOnBillingEvent(
  supabase: SupabaseClient,
  billingEvent: BillingEventRow,
  tenantId: string,
): Promise<{ ok: true } | { ok: false; conflict?: boolean; reason: string }> {
  if (billingEvent.tenant_id === tenantId) {
    return { ok: true };
  }

  if (billingEvent.tenant_id !== null && billingEvent.tenant_id !== tenantId) {
    return {
      ok: false,
      conflict: true,
      reason: "billing_events.tenant_id already set to a different tenant.",
    };
  }

  const { data: updatedRaw, error } = await supabase
    .from("billing_events")
    .update({ tenant_id: tenantId })
    .eq("id", billingEvent.id)
    .is("tenant_id", null)
    .select("id, processed_at, tenant_id, processing_error")
    .maybeSingle();

  if (error) {
    console.error("[stripe-webhook] billing_events tenant_id update failed", {
      billing_event_id: billingEvent.id,
      tenant_id: tenantId,
      error_code: error.code,
    });
    return { ok: false, reason: "Failed to persist billing_events.tenant_id." };
  }

  const updated = updatedRaw as BillingEventRow | null;
  if (updated && updated.tenant_id === tenantId) {
    return { ok: true };
  }

  const readback = await fetchBillingEventById(supabase, billingEvent.id);
  if (readback.error || !readback.row) {
    console.error("[stripe-webhook] billing_events tenant_id readback failed", {
      billing_event_id: billingEvent.id,
      tenant_id: tenantId,
      error_code: readback.error?.code,
    });
    return { ok: false, reason: "Failed to verify billing_events.tenant_id update." };
  }

  if (readback.row.tenant_id === tenantId) {
    return { ok: true };
  }

  if (readback.row.tenant_id !== null && readback.row.tenant_id !== tenantId) {
    return {
      ok: false,
      conflict: true,
      reason: "billing_events.tenant_id already set to a different tenant.",
    };
  }

  return { ok: false, reason: "Failed to verify billing_events.tenant_id update." };
}

async function lookupTenantBillingCustomerMappings(
  supabase: SupabaseClient,
  params: { eventId: string; tenantId: string; customerId: string },
): Promise<
  | {
      ok: true;
      byCustomer: TenantBillingCustomerRow | null;
      byTenant: TenantBillingCustomerRow | null;
    }
  | { ok: false; reason: string }
> {
  const { eventId, tenantId, customerId } = params;

  const { data: byCustomerRaw, error: byCustomerError } = await supabase
    .from("tenant_billing_customers")
    .select("id, tenant_id, provider_customer_id")
    .eq("provider", PROVIDER)
    .eq("provider_customer_id", customerId)
    .maybeSingle();

  if (byCustomerError) {
    console.error("[stripe-webhook] lookup by provider_customer_id failed", {
      event_id: eventId,
      error_code: byCustomerError.code,
    });
    return { ok: false, reason: "Failed to load billing customer by provider id." };
  }

  const { data: byTenantRaw, error: byTenantError } = await supabase
    .from("tenant_billing_customers")
    .select("id, tenant_id, provider_customer_id")
    .eq("provider", PROVIDER)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (byTenantError) {
    console.error("[stripe-webhook] lookup by tenant_id failed", {
      event_id: eventId,
      error_code: byTenantError.code,
    });
    return { ok: false, reason: "Failed to load billing customer by tenant." };
  }

  return {
    ok: true,
    byCustomer: (byCustomerRaw as TenantBillingCustomerRow | null) ?? null,
    byTenant: (byTenantRaw as TenantBillingCustomerRow | null) ?? null,
  };
}

function evaluateTenantBillingCustomerMappings(
  byCustomer: TenantBillingCustomerRow | null,
  byTenant: TenantBillingCustomerRow | null,
  tenantId: string,
  customerId: string,
):
  | { kind: "absent" }
  | { kind: "match" }
  | { kind: "conflict"; reason: string }
  | { kind: "inconclusive" } {
  if (byCustomer && byCustomer.tenant_id !== tenantId) {
    return {
      kind: "conflict",
      reason: "provider_customer_id already linked to a different tenant.",
    };
  }

  if (byTenant && byTenant.provider_customer_id !== customerId) {
    return {
      kind: "conflict",
      reason: "tenant already linked to a different provider_customer_id.",
    };
  }

  if (byCustomer && byTenant && byCustomer.id !== byTenant.id) {
    return {
      kind: "conflict",
      reason: "inconsistent tenant billing customer mappings.",
    };
  }

  if (!byCustomer && !byTenant) {
    return { kind: "absent" };
  }

  const existing = (byCustomer ?? byTenant)!;
  if (
    existing.tenant_id === tenantId &&
    existing.provider_customer_id === customerId
  ) {
    return { kind: "match" };
  }

  return { kind: "inconclusive" };
}

async function correlateTenantBillingCustomer(
  supabase: SupabaseClient,
  params: {
    eventId: string;
    tenantId: string;
    customerId: string;
  },
): Promise<{ ok: true } | { ok: false; reason: string; conflict?: boolean }> {
  const { eventId, tenantId, customerId } = params;

  const lookups = await lookupTenantBillingCustomerMappings(supabase, params);
  if (lookups.ok === false) {
    return { ok: false, reason: lookups.reason };
  }

  const evaluated = evaluateTenantBillingCustomerMappings(
    lookups.byCustomer,
    lookups.byTenant,
    tenantId,
    customerId,
  );

  if (evaluated.kind === "conflict") {
    return { ok: false, conflict: true, reason: evaluated.reason };
  }

  if (evaluated.kind === "match") {
    // Existing identical correlation — no updated_at touch (avoids unverified races).
    return { ok: true };
  }

  if (evaluated.kind === "inconclusive") {
    return {
      ok: false,
      reason: "Unable to safely conclude tenant billing customer correlation state.",
    };
  }

  const { error: insertError } = await supabase.from("tenant_billing_customers").insert({
    tenant_id: tenantId,
    provider: PROVIDER,
    provider_customer_id: customerId,
    updated_at: new Date().toISOString(),
  });

  if (!insertError) {
    return { ok: true };
  }

  if (!isUniqueViolation(insertError)) {
    console.error("[stripe-webhook] tenant_billing_customers insert failed", {
      event_id: eventId,
      tenant_id: tenantId,
      error_code: insertError.code,
    });
    return { ok: false, reason: "Failed to persist tenant billing customer correlation." };
  }

  // Concurrent insert raced on unique constraint — re-read before classifying conflict.
  const recheck = await lookupTenantBillingCustomerMappings(supabase, params);
  if (recheck.ok === false) {
    return { ok: false, reason: recheck.reason };
  }

  const reEvaluated = evaluateTenantBillingCustomerMappings(
    recheck.byCustomer,
    recheck.byTenant,
    tenantId,
    customerId,
  );

  if (
    reEvaluated.kind === "match" &&
    recheck.byCustomer &&
    recheck.byTenant &&
    recheck.byCustomer.id === recheck.byTenant.id &&
    recheck.byCustomer.tenant_id === tenantId &&
    recheck.byCustomer.provider_customer_id === customerId
  ) {
    return { ok: true };
  }

  if (reEvaluated.kind === "conflict") {
    return { ok: false, conflict: true, reason: reEvaluated.reason };
  }

  return {
    ok: false,
    reason: "Concurrent tenant billing customer correlation could not be verified.",
  };
}

async function processCheckoutSessionCompleted(
  supabase: SupabaseClient,
  event: Stripe.Event,
  billingEvent: BillingEventRow,
): Promise<Response> {
  const session = event.data.object as Stripe.Checkout.Session;
  const customerId = extractStripeCustomerIdString(session.customer);
  const candidateTenantId = extractCheckoutTenantId(session);

  const respondAfterError = async (
    message: string,
    response: Response,
    tenantIdForError: string | null,
  ): Promise<Response> => {
    const recorded = await recordProcessingError(
      supabase,
      billingEvent.id,
      message,
      tenantIdForError,
    );
    if (recorded.status === "already_completed") {
      return receivedOk(event);
    }
    return response;
  };

  if (!customerId) {
    return await respondAfterError(
      "checkout.session.completed missing Stripe customer id.",
      upstreamError("Checkout session missing Stripe customer id."),
      null,
    );
  }

  if (!candidateTenantId) {
    return await respondAfterError(
      "checkout.session.completed missing or invalid tenant_id metadata.",
      upstreamError("Checkout session missing or invalid tenant_id."),
      null,
    );
  }

  const tenantResult = await resolveVerifiedTenantId(supabase, candidateTenantId);
  if (tenantResult.ok === false) {
    return await respondAfterError(
      tenantResult.reason,
      upstreamError(tenantResult.reason),
      null,
    );
  }

  const tenantId = tenantResult.tenantId;
  const tenantPersist = await ensureTenantIdOnBillingEvent(
    supabase,
    billingEvent,
    tenantId,
  );
  if (tenantPersist.ok === false) {
    return await respondAfterError(
      tenantPersist.reason,
      upstreamError(tenantPersist.reason),
      tenantPersist.conflict ? null : tenantId,
    );
  }

  const correlation = await correlateTenantBillingCustomer(supabase, {
    eventId: event.id,
    tenantId,
    customerId,
  });
  if (correlation.ok === false) {
    return await respondAfterError(
      correlation.reason,
      upstreamError(correlation.reason),
      tenantId,
    );
  }

  const marked = await markBillingEventProcessed(supabase, billingEvent.id, tenantId);
  if (marked.ok === false) {
    return await respondAfterError(
      "Failed to mark billing event as processed.",
      upstreamError("Failed to mark billing event as processed."),
      tenantId,
    );
  }

  return receivedOk(event);
}

type CustomerSubscriptionProcessorEvent = StripeSubscriptionEventLike & {
  id: string;
  type: string;
  created: unknown;
};

type FetchNormalizedFromRuntimeConfigFn = (
  params: Parameters<
    typeof fetchNormalizedStripeSubscriptionFromRuntimeConfig
  >[0],
) => ReturnType<
  typeof fetchNormalizedStripeSubscriptionFromRuntimeConfig
>;

type ResolveBillingCustomerTenantFn = (
  providerCustomerId: string,
) => ReturnType<typeof resolveBillingCustomerTenant>;

function createBillingCustomerTenantLookupClient(
  supabase: SupabaseClient,
): BillingCustomerTenantLookupClient {
  return {
    from(_table: string) {
      return {
        select(_columns: string) {
          return {
            eq(column1: string, value1: string) {
              return {
                async eq(column2: string, value2: string) {
                  const { data, error } = await supabase
                    .from("tenant_billing_customers")
                    .select("tenant_id")
                    .eq(column1, value1)
                    .eq(column2, value2);
                  return {
                    data: Array.isArray(data) ? data : null,
                    error: error ?? null,
                  };
                },
              };
            },
          };
        },
      };
    },
  };
}

function createTenantSubscriptionObservationLookupClient(
  supabase: SupabaseClient,
): TenantSubscriptionObservationLookupClient {
  return {
    from(_table: string) {
      return {
        select(_columns: string) {
          return {
            eq(column1: string, value1: string) {
              return {
                async eq(column2: string, value2: string) {
                  const { data, error } = await supabase
                    .from("tenant_subscriptions")
                    .select(
                      "tenant_id,last_applied_provider_event_created_at,last_applied_provider_event_id",
                    )
                    .eq(column1, value1)
                    .eq(column2, value2);
                  return {
                    data: Array.isArray(data) ? data : null,
                    error: error ?? null,
                  };
                },
              };
            },
          };
        },
      };
    },
  };
}

function createTenantSubscriptionPersistenceClient(
  supabase: SupabaseClient,
): TenantSubscriptionPersistenceClient {
  return {
    from(_table: string) {
      return {
        insert(values: TenantSubscriptionInsertWriteValues) {
          return {
            select(columns: string) {
              return {
                async maybeSingle() {
                  const { data, error } = await supabase
                    .from("tenant_subscriptions")
                    .insert(values)
                    .select(columns)
                    .maybeSingle();
                  return {
                    data: (data as { id?: unknown } | null) ?? null,
                    error: error ?? null,
                  };
                },
              };
            },
          };
        },
        update(values: TenantSubscriptionUpdateWriteValues) {
          const filters: Array<
            | { op: "eq"; column: string; value: string | number }
            | { op: "is"; column: string; value: null }
          > = [];
          const builder: TenantSubscriptionPersistenceFilterBuilder = {
            eq(column: string, value: string | number) {
              filters.push({ op: "eq", column, value });
              return builder;
            },
            is(column: string, value: null) {
              filters.push({ op: "is", column, value });
              return builder;
            },
            select(columns: string) {
              return {
                async maybeSingle() {
                  let query = supabase
                    .from("tenant_subscriptions")
                    .update(values);
                  for (const filter of filters) {
                    query = filter.op === "eq"
                      ? query.eq(filter.column, filter.value)
                      : query.is(filter.column, filter.value);
                  }
                  const { data, error } = await query
                    .select(columns)
                    .maybeSingle();
                  return {
                    data: (data as { id?: unknown } | null) ?? null,
                    error: error ?? null,
                  };
                },
              };
            },
          };
          return builder;
        },
      };
    },
  };
}

type ReadTenantSubscriptionObservationFn = (params: {
  provider: string;
  provider_subscription_id: string;
}) => ReturnType<typeof readTenantSubscriptionObservation>;

type ClassifySubscriptionEventAdmissionFn =
  typeof classifySubscriptionEventAdmission;

type PersistTenantSubscriptionCandidateFn = (
  params: Omit<PersistTenantSubscriptionCandidateParams, "client">,
) => ReturnType<typeof persistTenantSubscriptionCandidate>;

type EnsureBillingEventTenantParams = {
  billingEventId: string;
  tenantId: string;
};

type EnsureBillingEventTenantResult =
  | { ok: true }
  | { ok: false; reason: string };

type EnsureBillingEventTenantFn = (
  params: EnsureBillingEventTenantParams,
) => Promise<EnsureBillingEventTenantResult>;

async function ensureBillingEventTenant(
  supabase: SupabaseClient,
  params: EnsureBillingEventTenantParams,
): Promise<EnsureBillingEventTenantResult> {
  const loaded = await fetchBillingEventById(supabase, params.billingEventId);
  if (loaded.error || !loaded.row) {
    console.error("[stripe-webhook] billing_events tenant-stamp load failed", {
      billing_event_id: params.billingEventId,
      tenant_id: params.tenantId,
      error_code: loaded.error?.code,
    });
    return { ok: false, reason: "Failed to load billing_events row." };
  }
  return await ensureTenantIdOnBillingEvent(
    supabase,
    loaded.row,
    params.tenantId,
  );
}

export async function processCustomerSubscriptionEvent(
  event: CustomerSubscriptionProcessorEvent,
  billingEvent: Pick<BillingEventRow, "id">,
  recordProcessingErrorFn: RecordProcessingErrorFn,
  resolveBillingCustomerTenantFn: ResolveBillingCustomerTenantFn,
  readTenantSubscriptionObservationFn: ReadTenantSubscriptionObservationFn,
  fetchNormalizedFromRuntimeConfig: FetchNormalizedFromRuntimeConfigFn =
    fetchNormalizedStripeSubscriptionFromRuntimeConfig,
  classifySubscriptionEventAdmissionFn: ClassifySubscriptionEventAdmissionFn =
    classifySubscriptionEventAdmission,
  persistTenantSubscriptionCandidateFn: PersistTenantSubscriptionCandidateFn,
  ensureBillingEventTenantFn: EnsureBillingEventTenantFn,
): Promise<Response> {
  const respondAfterError = async (reason: string): Promise<Response> => {
    const recorded = await recordProcessingErrorFn(
      billingEvent.id,
      reason,
      null,
    );
    if (recorded.status === "already_completed") {
      return receivedOk(event);
    }
    return upstreamError(SUBSCRIPTION_PROCESSING_FAILURE_MESSAGE);
  };

  const bootstrapResult = extractStripeSubscriptionEventBootstrap(event);
  if (bootstrapResult.ok === false) {
    return await respondAfterError(bootstrapResult.reason);
  }

  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
  const supportedProMonthlyPriceId = Deno.env.get(
    "STRIPE_PRICE_ID_PRO_MONTHLY",
  );

  const result = await fetchNormalizedFromRuntimeConfig({
    provider_subscription_id: bootstrapResult.provider_subscription_id,
    stripeSecretKey,
    supportedProMonthlyPriceId,
  });

  if (result.ok === false) {
    return await respondAfterError(result.reason);
  }

  if (
    result.value.provider_subscription_id !==
      bootstrapResult.provider_subscription_id
  ) {
    return await respondAfterError("subscription_identity_mismatch");
  }

  const tenantResolutionResult = await resolveBillingCustomerTenantFn(
    result.value.provider_customer_id,
  );

  if (tenantResolutionResult.ok === false) {
    return await respondAfterError(tenantResolutionResult.reason);
  }

  const observationResult = await readTenantSubscriptionObservationFn({
    provider: PROVIDER,
    provider_subscription_id: result.value.provider_subscription_id,
  });

  if (observationResult.ok === false) {
    return await respondAfterError(observationResult.reason);
  }

  if (
    observationResult.observation.kind === "row_present" &&
    observationResult.observation.tenant_id !==
      tenantResolutionResult.tenant_id
  ) {
    return await respondAfterError("subscription_ownership_mismatch");
  }

  const observation = observationResult.observation;
  const tenantSubscriptionRow = observation.kind === "row_absent"
    ? { presence: "absent" as const }
    : {
      presence: "present" as const,
      last_applied_provider_event_created_at:
        observation.last_applied_provider_event_created_at,
      last_applied_provider_event_id:
        observation.last_applied_provider_event_id,
    };

  // Handler already ACKs processed_at !== null before this processor.
  const admissionResult = classifySubscriptionEventAdmissionFn({
    provider_event_created_at: event.created,
    provider_event_id: event.id,
    billing_event_processed: false,
    tenant_subscription_row: tenantSubscriptionRow,
  });

  if (admissionResult.ok === false) {
    return await respondAfterError(admissionResult.reason);
  }

  switch (admissionResult.kind) {
    case "already_applied":
      return receivedOk(event);
    case "stale_event":
    case "partial_retry": {
      const tenantStampResult = await ensureBillingEventTenantFn({
        billingEventId: billingEvent.id,
        tenantId: tenantResolutionResult.tenant_id,
      });
      if (tenantStampResult.ok === false) {
        return await respondAfterError(tenantStampResult.reason);
      }
      return receivedOk(event);
    }
    case "candidate_row_absent":
    case "candidate_row_present_uninitialized":
    case "candidate_newer_event":
    case "candidate_equal_timestamp_distinct_event":
      break;
    default: {
      const _exhaustive: never = admissionResult.kind;
      return _exhaustive;
    }
  }

  const providerEventCreatedAt = event.created;
  if (typeof providerEventCreatedAt !== "number") {
    return await respondAfterError("invalid_provider_event_created_at");
  }

  let operation: PersistTenantSubscriptionCandidateOperation;
  if (admissionResult.kind === "candidate_row_absent") {
    operation = { kind: "insert" };
  } else if (admissionResult.kind === "candidate_row_present_uninitialized") {
    if (observation.kind !== "row_present") {
      return await respondAfterError("invalid_watermark");
    }
    operation = {
      kind: "update",
      expected_watermark: { kind: "uninitialized" },
    };
  } else if (
    observation.kind !== "row_present" ||
    observation.last_applied_provider_event_created_at === null ||
    observation.last_applied_provider_event_id === null
  ) {
    return await respondAfterError("invalid_watermark");
  } else {
    operation = {
      kind: "update",
      expected_watermark: {
        kind: "initialized",
        last_applied_provider_event_created_at:
          observation.last_applied_provider_event_created_at,
        last_applied_provider_event_id:
          observation.last_applied_provider_event_id,
      },
    };
  }

  const persistResult = await persistTenantSubscriptionCandidateFn({
    tenant_id: tenantResolutionResult.tenant_id,
    snapshot: result.value,
    provider_event_created_at: providerEventCreatedAt,
    provider_event_id: event.id,
    operation,
  });

  if (persistResult.ok === false) {
    return await respondAfterError(persistResult.reason);
  }

  const tenantStampResult = await ensureBillingEventTenantFn({
    billingEventId: billingEvent.id,
    tenantId: tenantResolutionResult.tenant_id,
  });
  if (tenantStampResult.ok === false) {
    return await respondAfterError(tenantStampResult.reason);
  }

  return receivedOk(event);
}

function getStripeWebhookSecret(): string | Response {
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!secret) {
    console.error("[stripe-webhook] Missing STRIPE_WEBHOOK_SECRET.");
    return serviceUnavailable(WEBHOOK_NOT_CONFIGURED_MESSAGE);
  }
  return secret;
}

async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return jsonResponse({ data: { ok: true } }, 200);
  }

  if (req.method !== "POST") {
    return methodNotAllowed(req.method);
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return badRequest("Missing Stripe-Signature header.");
  }

  const webhookSecret = getStripeWebhookSecret();
  if (webhookSecret instanceof Response) {
    return webhookSecret;
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    const stripe = new Stripe("sk_test_placeholder", {
      apiVersion: "2024-06-20",
      httpClient: Stripe.createFetchHttpClient(),
    });

    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      webhookSecret,
    ) as Stripe.Event;

    console.info("[stripe-webhook] Event verified.", {
      event_id: event.id,
      event_type: event.type,
      livemode: event.livemode,
      created: event.created,
    });
  } catch {
    console.error("[stripe-webhook] Invalid signature.");
    return badRequest("Invalid Stripe signature.");
  }

  if (event.livemode === true) {
    return badRequest("Live mode events are not accepted in this environment.");
  }

  if (!ALLOWED_EVENT_TYPES.has(event.type)) {
    return jsonResponse(
      {
        data: {
          received: true,
          ignored: true,
          event_type: event.type,
        },
      },
      200,
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error("[stripe-webhook] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
    return serviceUnavailable("Billing event persistence is not configured.");
  }

  const supabase = createWebhookSupabaseClient(
    supabaseUrl,
    supabaseServiceRoleKey,
  );

  const ensured = await ensureBillingEventRow(supabase, event);
  if (ensured.ok === false) {
    return ensured.response;
  }

  const billingEvent = ensured.row;

  console.info("[stripe-webhook] billing_events ready", {
    event_id: event.id,
    event_type: event.type,
    billing_event_id: billingEvent.id,
    already_processed: billingEvent.processed_at !== null,
  });

  if (billingEvent.processed_at !== null) {
    return receivedOk(event);
  }

  if (SUBSCRIPTION_EVENT_TYPES.has(event.type)) {
    return await processCustomerSubscriptionEvent(
      event,
      billingEvent,
      (billingEventId, reason, tenantId) =>
        recordProcessingError(
          supabase,
          billingEventId,
          reason,
          tenantId,
        ),
      (providerCustomerId) =>
        resolveBillingCustomerTenant({
          provider: PROVIDER,
          provider_customer_id: providerCustomerId,
          client: createBillingCustomerTenantLookupClient(supabase),
        }),
      (params) =>
        readTenantSubscriptionObservation({
          provider: params.provider,
          provider_subscription_id: params.provider_subscription_id,
          client: createTenantSubscriptionObservationLookupClient(supabase),
        }),
      fetchNormalizedStripeSubscriptionFromRuntimeConfig,
      classifySubscriptionEventAdmission,
      (params) =>
        persistTenantSubscriptionCandidate({
          ...params,
          client: createTenantSubscriptionPersistenceClient(supabase),
        }),
      (params) => ensureBillingEventTenant(supabase, params),
    );
  }

  if (DEFERRED_EVENT_TYPES.has(event.type)) {
    // I4.3B: intentionally deferred. Persist only; do not mark processed_at.
    return receivedOk(event);
  }

  if (event.type === "checkout.session.completed") {
    return await processCheckoutSessionCompleted(supabase, event, billingEvent);
  }

  return receivedOk(event);
}

Deno.serve(handler);
