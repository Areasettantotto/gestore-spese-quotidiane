import { supabase } from '@/src/lib/supabaseClient';

import type { ExpenseCreateReplayCandidateRow } from './expenseCreateReplay';
import type { ExpenseInsertPayload, ExpenseUpdatePayload } from './expenses.mapper';

export type CreateExpenseInput = ExpenseInsertPayload;

export type UpdateExpenseInput = {
  tenantId: string;
  expenseId: string;
  payload: ExpenseUpdatePayload;
};

export type DeleteExpenseInput = {
  tenantId: string;
  expenseId: string;
};

export async function listExpensesByTenant(tenantId: string) {
  return supabase
    .from('expenses')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('date', { ascending: false });
}

export async function createExpense(input: CreateExpenseInput) {
  return supabase.from('expenses').insert(input);
}

export async function updateExpense(input: UpdateExpenseInput) {
  return supabase
    .from('expenses')
    .update(input.payload)
    .eq('id', input.expenseId)
    .eq('tenant_id', input.tenantId);
}

export async function deleteExpense(input: DeleteExpenseInput) {
  return supabase
    .from('expenses')
    .delete()
    .eq('id', input.expenseId)
    .eq('tenant_id', input.tenantId)
    .select();
}

const EXPENSE_CREATE_REPLAY_CANDIDATE_COLUMNS =
  'id, tenant_id, user_id, owner_id, amount, category_code, description, date, companion_id';

const CAPTURED_EXPENSE_IDENTITY =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export type FindExpenseCreateReplayCandidateInput = {
  expenseId: string;
  tenantId: string;
  userId: string;
  ownerId: string;
};

/**
 * One visible row, no visible row, or failure.
 * `candidate` is not a verified payload match and is not a successful save.
 */
export type ExpenseCreateReplayLookupResult =
  | {
      status: 'candidate';
      row: ExpenseCreateReplayCandidateRow;
    }
  | {
      status: 'absent';
    }
  | {
      status: 'error';
    };

function isCapturedExpenseIdentity(value: unknown): value is string {
  return typeof value === 'string' && CAPTURED_EXPENSE_IDENTITY.test(value);
}

function hasCreateReplayLookupIdentity(
  input: FindExpenseCreateReplayCandidateInput | null | undefined,
): input is FindExpenseCreateReplayCandidateInput {
  if (input == null || typeof input !== 'object') return false;
  if (!isCapturedExpenseIdentity(input.expenseId)) return false;
  if (!isCapturedExpenseIdentity(input.tenantId)) return false;
  if (!isCapturedExpenseIdentity(input.userId)) return false;
  if (!isCapturedExpenseIdentity(input.ownerId)) return false;
  return input.userId === input.ownerId;
}

/**
 * Read-only lookup of one expense create-replay candidate under the
 * authenticated Supabase client and existing RLS.
 * Identity values are explicit arguments. Invalid identity does not query.
 * The result does not authorize a save and does not include database error text.
 */
export async function findExpenseCreateReplayCandidate(
  input: FindExpenseCreateReplayCandidateInput,
): Promise<ExpenseCreateReplayLookupResult> {
  if (!hasCreateReplayLookupIdentity(input)) {
    return { status: 'error' };
  }

  try {
    const { data, error } = await supabase
      .from('expenses')
      .select(EXPENSE_CREATE_REPLAY_CANDIDATE_COLUMNS)
      .eq('id', input.expenseId)
      .eq('tenant_id', input.tenantId)
      .eq('user_id', input.userId)
      .eq('owner_id', input.ownerId)
      .maybeSingle<ExpenseCreateReplayCandidateRow>();

    if (error) return { status: 'error' };
    if (data == null) return { status: 'absent' };
    if (typeof data !== 'object' || Array.isArray(data)) return { status: 'error' };
    return { status: 'candidate', row: data };
  } catch {
    return { status: 'error' };
  }
}
