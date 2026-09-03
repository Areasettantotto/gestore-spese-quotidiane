/**
 * Typed adapter: real SupabaseClient → EffectiveAccess persistence lookup
 * ports (BILLING-98).
 *
 * Builds explicit method-level adapters so the PostgrestFilterBuilder
 * generic chain is never assigned to the SELECT lookup interfaces
 * (TS2589). Each terminal awaits the real client and returns `{ data, error }`.
 *
 * Transport only: table, columns, and filters are forwarded unchanged.
 * No query at construction. No privilege, env, auth, or HTTP.
 */

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { CreateEffectiveAccessResolverDependencies } from "./createEffectiveAccessResolver.ts";
import type {
  ComplimentaryAccessGrantLookupClient,
  ComplimentaryAccessGrantRow,
} from "./readTenantComplimentaryAccessCandidate.ts";
import type {
  TenantAccessModeLookupClient,
  TenantAccessModeRow,
} from "./readTenantAccessMode.ts";
import type {
  TenantStripeSubscriptionObservationLookupClient,
  TenantStripeSubscriptionObservationRow,
} from "./readTenantStripeSubscriptionObservations.ts";

export type EffectiveAccessPersistenceClients = Pick<
  CreateEffectiveAccessResolverDependencies,
  "accessModeClient" | "stripeClient" | "complimentaryClient"
>;

function adaptAccessModeClient(
  client: SupabaseClient,
): TenantAccessModeLookupClient {
  return {
    from(table: string) {
      return {
        select(columns: string) {
          return {
            eq(column: string, value: string) {
              return {
                async maybeSingle() {
                  const result = await client
                    .from(table)
                    .select(columns)
                    .eq(column, value)
                    .returns<TenantAccessModeRow>()
                    .maybeSingle();
                  return {
                    data: result.data,
                    error: result.error,
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

function adaptStripeClient(
  client: SupabaseClient,
): TenantStripeSubscriptionObservationLookupClient {
  return {
    from(table: string) {
      return {
        select(columns: string) {
          return {
            eq(column1: string, value1: string) {
              return {
                async eq(column2: string, value2: string) {
                  const result = await client
                    .from(table)
                    .select(columns)
                    .eq(column1, value1)
                    .eq(column2, value2)
                    .returns<TenantStripeSubscriptionObservationRow[]>();
                  return {
                    data: result.data,
                    error: result.error,
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

function adaptComplimentaryClient(
  client: SupabaseClient,
): ComplimentaryAccessGrantLookupClient {
  return {
    from(table: string) {
      return {
        select(columns: string) {
          return {
            eq(column: string, value: string) {
              return {
                async maybeSingle() {
                  const result = await client
                    .from(table)
                    .select(columns)
                    .eq(column, value)
                    .returns<ComplimentaryAccessGrantRow>()
                    .maybeSingle();
                  return {
                    data: result.data,
                    error: result.error,
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

/**
 * Adapt a real SupabaseClient to the three EffectiveAccess SELECT ports.
 * Does not query, authorize, or inspect the client's credentials.
 */
export function adaptSupabaseClientToEffectiveAccessPersistenceClients(
  client: SupabaseClient,
): EffectiveAccessPersistenceClients {
  return {
    accessModeClient: adaptAccessModeClient(client),
    stripeClient: adaptStripeClient(client),
    complimentaryClient: adaptComplimentaryClient(client),
  };
}
