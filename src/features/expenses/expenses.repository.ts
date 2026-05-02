import { supabase } from '@/src/lib/supabaseClient';

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
