import type { Expense } from '@/src/types';

import {
  buildInsertPayload,
  buildUpdatePayload,
  mapDbRowToExpense,
} from './expenses.mapper';
import {
  deleteExpenseById,
  insertExpenses,
  listExpensesByTenant,
  updateExpenseById,
} from './expenses.repository';
import type { ExpenseDbRow } from './expenses.types';

export async function loadExpensesForTenant(tenantId: string): Promise<{
  expenses: Expense[];
  errorMessage: string | null;
}> {
  const { data, error } = await listExpensesByTenant(tenantId);

  if (error) {
    console.error('Failed to load expenses from Supabase', error);
    return { expenses: [], errorMessage: 'Impossibile caricare le spese per questo workspace.' };
  }

  const rows = (data ?? []) as ExpenseDbRow[];
  const expenses = rows.map((r) => mapDbRowToExpense(r));
  return { expenses, errorMessage: null };
}

export async function createExpenseInTenant(params: {
  expense: Expense;
  userId: string;
  tenantId: string;
}): Promise<{ error: Error | null }> {
  const row = buildInsertPayload(params);
  const { error } = await insertExpenses([row]);
  if (error) {
    console.error('Insert failed', error);
    return { error: new Error(error.message || JSON.stringify(error)) };
  }
  return { error: null };
}

export async function updateExpenseInTenant(params: {
  expenseId: string;
  userId: string;
  tenantId: string;
  amount: number;
  category: Expense['category'];
  description: string;
  date: string;
  accompagnatore: string | null | undefined;
}): Promise<{ error: Error | null }> {
  const payload = buildUpdatePayload({
    amount: params.amount,
    category: params.category,
    description: params.description,
    date: params.date,
    accompagnatore: params.accompagnatore,
    userId: params.userId,
    tenantId: params.tenantId,
  });
  const { error } = await updateExpenseById(params.tenantId, params.expenseId, payload);
  if (error) {
    console.error('Update failed', error);
    return { error: new Error(error.message || JSON.stringify(error)) };
  }
  return { error: null };
}

export async function deleteExpenseInTenant(params: {
  tenantId: string;
  expenseId: string;
}): Promise<{ error: Error | null; deletedRows: unknown[] | null }> {
  const { data, error } = await deleteExpenseById(params.tenantId, params.expenseId);
  if (error) {
    console.error('Delete failed', error);
    return { error: new Error(error.message || JSON.stringify(error)), deletedRows: null };
  }
  return { error: null, deletedRows: data ?? [] };
}
