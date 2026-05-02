import type { Accompagnatore, Category, Expense } from '@/src/types';

import type { ExpenseDbRow } from './expenses.types';

export function mapDbRowToExpense(row: ExpenseDbRow): Expense {
  return {
    id: row.id,
    amount: row.amount,
    category: row.category as Category,
    description: row.description,
    date: row.date,
    accompagnatore: (row.accompagnatore ?? undefined) as Accompagnatore | undefined,
  };
}

export type ExpenseInsertPayload = {
  id: string;
  amount: number;
  category: Category;
  description: string;
  date: string;
  accompagnatore: string | null;
  user_id: string;
  owner_id: string;
  tenant_id: string;
};

export function buildInsertPayload(params: {
  expense: Expense;
  userId: string;
  tenantId: string;
}): ExpenseInsertPayload {
  const { expense, userId, tenantId } = params;
  return {
    id: expense.id,
    amount: expense.amount,
    category: expense.category,
    description: expense.description,
    date: expense.date,
    accompagnatore: expense.accompagnatore ?? null,
    user_id: userId,
    owner_id: userId,
    tenant_id: tenantId,
  };
}

export type ExpenseUpdatePayload = {
  amount: number;
  category: Category;
  description: string;
  date: string;
  accompagnatore: string | null;
  owner_id: string;
  tenant_id: string;
};

export function buildUpdatePayload(params: {
  amount: number;
  category: Category;
  description: string;
  date: string;
  accompagnatore: string | null | undefined;
  userId: string;
  tenantId: string;
}): ExpenseUpdatePayload {
  const { amount, category, description, date, accompagnatore, userId, tenantId } = params;
  return {
    amount,
    category,
    description,
    date,
    accompagnatore: accompagnatore || null,
    owner_id: userId,
    tenant_id: tenantId,
  };
}

/** Fields safe to merge onto an Expense in local state after update. */
export function expenseFromUpdatePayload(
  expenseId: string,
  payload: Omit<ExpenseUpdatePayload, 'owner_id' | 'tenant_id'>
): Expense {
  return {
    id: expenseId,
    amount: payload.amount,
    category: payload.category,
    description: payload.description,
    date: payload.date,
    accompagnatore: (payload.accompagnatore ?? undefined) as Accompagnatore | undefined,
  };
}
