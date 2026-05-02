import { supabase } from '@/src/lib/supabaseClient';

import type { ExpenseInsertPayload, ExpenseUpdatePayload } from './expenses.mapper';

export async function listExpensesByTenant(tenantId: string) {
  return supabase
    .from('expenses')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('date', { ascending: false });
}

export async function insertExpenses(rows: ExpenseInsertPayload[]) {
  return supabase.from('expenses').insert(rows);
}

export async function updateExpenseById(tenantId: string, expenseId: string, payload: ExpenseUpdatePayload) {
  return supabase.from('expenses').update(payload).eq('id', expenseId).eq('tenant_id', tenantId);
}

export async function deleteExpenseById(tenantId: string, expenseId: string) {
  return supabase.from('expenses').delete().eq('id', expenseId).eq('tenant_id', tenantId).select();
}
