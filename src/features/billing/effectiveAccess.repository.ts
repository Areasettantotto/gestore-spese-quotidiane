import { FunctionsHttpError } from '@supabase/supabase-js';

import { supabase } from '@/src/lib/supabaseClient';

import type { EffectiveAccessRequestBody } from './effectiveAccess.types';

export type InvokeEffectiveAccessSuccess = {
  kind: 'success';
  body: unknown;
};

export type InvokeEffectiveAccessApplicationError = {
  kind: 'application_error';
  error: {
    code: unknown;
    message: unknown;
  };
};

export type InvokeEffectiveAccessTransportError = {
  kind: 'transport_error';
  message: string;
};

export type InvokeEffectiveAccessResult =
  | InvokeEffectiveAccessSuccess
  | InvokeEffectiveAccessApplicationError
  | InvokeEffectiveAccessTransportError;

/**
 * Tenant-first invoke of `effective-access`. Session JWT is left to supabase-js.
 * Distinguishes success body, public error envelope, and transport/invoke failure.
 */
export async function invokeEffectiveAccess(tenantId: string): Promise<InvokeEffectiveAccessResult> {
  const body: EffectiveAccessRequestBody = { tenant_id: tenantId };

  const { data, error } = await supabase.functions.invoke('effective-access', {
    body,
  });

  if (error) {
    if (error instanceof FunctionsHttpError) {
      const envelope = await readApplicationErrorEnvelope(error);
      if (envelope) {
        return { kind: 'application_error', error: envelope };
      }
    }

    return {
      kind: 'transport_error',
      message: 'EffectiveAccess request failed.',
    };
  }

  return { kind: 'success', body: data };
}

async function readApplicationErrorEnvelope(
  error: FunctionsHttpError
): Promise<{ code: unknown; message: unknown } | null> {
  try {
    const parsed = await readHttpErrorBody(error);
    if (!isRecord(parsed)) {
      return null;
    }
    if ('data' in parsed || !('error' in parsed) || !isRecord(parsed.error)) {
      return null;
    }

    return {
      code: parsed.error.code,
      message: parsed.error.message,
    };
  } catch {
    return null;
  }
}

async function readHttpErrorBody(error: FunctionsHttpError): Promise<unknown> {
  const context = error.context;
  if (context && typeof context.json === 'function') {
    return await context.json();
  }
  return context;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
