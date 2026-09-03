/**
 * Privileged EffectiveAccess persistence client factory (BILLING-99).
 *
 * Caller-supplied Supabase URL + service-role key → one createClient →
 * BILLING-98 adapter → { accessModeClient, stripeClient, complimentaryClient }.
 *
 * Transport wiring only. Does not read env, query, authorize, log, or
 * expose HTTP. The service-role key is an input only; it is not returned.
 */

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  adaptSupabaseClientToEffectiveAccessPersistenceClients,
  type EffectiveAccessPersistenceClients,
} from "./adaptSupabaseClientToEffectiveAccessPersistenceClients.ts";

export type PrivilegedEffectiveAccessPersistenceConfig = {
  supabaseUrl: string;
  serviceRoleKey: string;
};

export type PrivilegedSupabaseClientFactory = (
  supabaseUrl: string,
  serviceRoleKey: string,
) => SupabaseClient;

export type CreatePrivilegedEffectiveAccessPersistenceClientsDependencies = {
  createClient?: PrivilegedSupabaseClientFactory;
};

/**
 * Build the three EffectiveAccess SELECT ports from privileged credentials.
 * One createClient per invocation; then exclusive delegation to B98.
 */
export function createPrivilegedEffectiveAccessPersistenceClients(
  config: PrivilegedEffectiveAccessPersistenceConfig,
  dependencies: CreatePrivilegedEffectiveAccessPersistenceClientsDependencies =
    {},
): EffectiveAccessPersistenceClients {
  const createSupabaseClient = dependencies.createClient ?? createClient;
  const client = createSupabaseClient(
    config.supabaseUrl,
    config.serviceRoleKey,
  );
  return adaptSupabaseClientToEffectiveAccessPersistenceClients(client);
}
