import type { Accompagnatore, Category, Expense } from '@/src/types';

import {
  categoryCodeFromLegacyLabel,
  findExpenseCategoryByCode,
  legacyLabelForCategoryCode,
  type CategoryCode,
} from './expenseCategoryCatalog';
import type { ExpenseDbRow, ExpenseWithCategoryCode } from './expenses.types';

function resolveCategoryIdentityFromDbRow(row: ExpenseDbRow): {
  categoryCode: CategoryCode;
  category: Category;
} {
  const categoryCode =
    findExpenseCategoryByCode(row.category_code)?.code ??
    categoryCodeFromLegacyLabel(row.category);

  if (!categoryCode) {
    throw new Error(
      `Unable to map expense category: unknown category_code and unknown legacy category (expense id: ${row.id})`,
    );
  }

  return {
    categoryCode,
    category: legacyLabelForCategoryCode(categoryCode),
  };
}

/** Fail-closed: a typed Category must resolve to a catalog code. */
export function categoryCodeFromCategory(category: Category): CategoryCode {
  const categoryCode = categoryCodeFromLegacyLabel(category);
  if (!categoryCode) {
    throw new Error(`Invariant violation: unknown legacy category (${String(category)})`);
  }
  return categoryCode;
}

/** Hydrate a legacy-shaped Expense into the feature domain (code + presentation). */
export function expenseWithCategoryCode(expense: Expense): ExpenseWithCategoryCode {
  return {
    ...expense,
    categoryCode: categoryCodeFromCategory(expense.category),
  };
}

export function mapDbRowToExpense(row: ExpenseDbRow): ExpenseWithCategoryCode {
  const { categoryCode, category } = resolveCategoryIdentityFromDbRow(row);
  return {
    id: row.id,
    amount: row.amount,
    category,
    categoryCode,
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

/** Fields safe to merge onto local state after update. Write payload is unchanged. */
export function expenseFromUpdatePayload(
  expenseId: string,
  payload: Omit<ExpenseUpdatePayload, 'owner_id' | 'tenant_id'>
): ExpenseWithCategoryCode {
  return expenseWithCategoryCode({
    id: expenseId,
    amount: payload.amount,
    category: payload.category,
    description: payload.description,
    date: payload.date,
    accompagnatore: (payload.accompagnatore ?? undefined) as Accompagnatore | undefined,
  });
}
