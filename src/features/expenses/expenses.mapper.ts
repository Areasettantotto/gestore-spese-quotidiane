import type { Expense } from '@/src/types';
import type { ExpenseCompanionReadStatus } from '@/src/features/companions/useExpenseCompanionRead';

import {
  categoryCodeFromLegacyLabel,
  findExpenseCategoryByCode,
  type CategoryCode,
} from './expenseCategoryCatalog';
import type {
  ExpenseCompanionFilter,
  ExpenseCompanionFilterChoice,
  ExpenseDbRow,
  ExpenseWithCategoryCode,
} from './expenses.types';

export type ExpenseCompanionChoice = {
  id: string;
  displayName: string;
};

/**
 * Writable selector, frozen existing relationship, or no Companion control.
 * options are empty unless writable. displayName is never used as identity.
 */
export type ExpenseCompanionSelectorModel = {
  writable: boolean;
  options: readonly ExpenseCompanionChoice[];
  frozenDisplayName: string | null;
  preserveExisting: boolean;
};

export type ExpenseCompanionPersistence = {
  companionId: string | null;
};

type ExpenseCompanionCatalogRow = {
  id: string;
  displayName: string;
  isActive: boolean;
};

const NO_COMPANION_CHOICES: readonly ExpenseCompanionChoice[] = [];

function resolveCategoryIdentityFromDbRow(row: ExpenseDbRow): CategoryCode {
  const categoryCode =
    findExpenseCategoryByCode(row.category_code)?.code ??
    categoryCodeFromLegacyLabel(row.category);

  if (!categoryCode) {
    throw new Error(
      `Unable to map expense category: unknown category_code and unknown legacy category (expense id: ${row.id})`,
    );
  }

  return categoryCode;
}

/** Attach an already-known machine identity. */
export function expenseWithCategoryCode(
  expense: Expense,
  categoryCode: CategoryCode,
): ExpenseWithCategoryCode {
  return {
    ...expense,
    categoryCode,
  };
}

export function mapDbRowToExpense(row: ExpenseDbRow): ExpenseWithCategoryCode {
  const categoryCode = resolveCategoryIdentityFromDbRow(row);
  return {
    id: row.id,
    amount: row.amount,
    categoryCode,
    description: row.description,
    date: row.date,
    companionId: row.companion_id ?? null,
  };
}

export type ExpenseInsertPayload = {
  id: string;
  amount: number;
  category_code: CategoryCode;
  description: string;
  date: string;
  companion_id: string | null;
  user_id: string;
  owner_id: string;
  tenant_id: string;
};

export function buildInsertPayload(params: {
  expense: ExpenseWithCategoryCode;
  userId: string;
  tenantId: string;
}): ExpenseInsertPayload {
  const { expense, userId, tenantId } = params;
  return {
    id: expense.id,
    amount: expense.amount,
    category_code: expense.categoryCode,
    description: expense.description,
    date: expense.date,
    companion_id: expense.companionId ?? null,
    user_id: userId,
    owner_id: userId,
    tenant_id: tenantId,
  };
}

export type ExpenseUpdatePayload = {
  amount: number;
  category_code: CategoryCode;
  description: string;
  date: string;
  companion_id: string | null;
  owner_id: string;
  tenant_id: string;
};

export function buildUpdatePayload(params: {
  amount: number;
  categoryCode: CategoryCode;
  description: string;
  date: string;
  companionId: string | null;
  userId: string;
  tenantId: string;
}): ExpenseUpdatePayload {
  const { amount, categoryCode, description, date, companionId, userId, tenantId } = params;
  return {
    amount,
    category_code: categoryCode,
    description,
    date,
    companion_id: companionId,
    owner_id: userId,
    tenant_id: tenantId,
  };
}

/** Fields safe to merge onto local state after update. Write payload is unchanged. */
export function expenseFromUpdatePayload(
  expenseId: string,
  payload: Omit<ExpenseUpdatePayload, 'owner_id' | 'tenant_id'>,
  categoryCode: CategoryCode,
): ExpenseWithCategoryCode {
  return expenseWithCategoryCode(
    {
      id: expenseId,
      amount: payload.amount,
      description: payload.description,
      date: payload.date,
      companionId: payload.companion_id,
    },
    categoryCode,
  );
}

export function localExpenseForCreate(params: {
  id: string;
  amount: number;
  categoryCode: CategoryCode;
  description: string;
  date: string;
  companionId: string | null;
}): ExpenseWithCategoryCode {
  return expenseWithCategoryCode(
    {
      id: params.id,
      amount: params.amount,
      description: params.description,
      date: params.date,
      companionId: params.companionId,
    },
    params.categoryCode,
  );
}

export function deriveExpenseCompanionSelector(params: {
  status: ExpenseCompanionReadStatus;
  companionsEnabled: boolean | null;
  items: readonly ExpenseCompanionCatalogRow[];
  existingCompanionId: string | null;
}): ExpenseCompanionSelectorModel {
  const catalog: readonly ExpenseCompanionCatalogRow[] = params.status === 'ready' ? params.items : [];
  const writable = params.status === 'ready' && params.companionsEnabled === true;

  if (!writable) {
    if (params.existingCompanionId == null) {
      return {
        writable: false,
        options: NO_COMPANION_CHOICES,
        frozenDisplayName: null,
        preserveExisting: false,
      };
    }

    const linked = catalog.find((item) => item.id === params.existingCompanionId) ?? null;
    return {
      writable: false,
      options: NO_COMPANION_CHOICES,
      frozenDisplayName: linked?.displayName ?? null,
      preserveExisting: true,
    };
  }

  const options: ExpenseCompanionChoice[] = [];
  let currentInactive: ExpenseCompanionChoice | null = null;

  for (const item of catalog) {
    if (item.isActive) {
      options.push({ id: item.id, displayName: item.displayName });
      continue;
    }

    if (params.existingCompanionId != null && item.id === params.existingCompanionId) {
      currentInactive = { id: item.id, displayName: item.displayName };
    }
  }

  if (currentInactive) options.push(currentInactive);

  return {
    writable: true,
    options,
    frozenDisplayName: null,
    preserveExisting: false,
  };
}

/**
 * Relational companion id for create or update.
 * Returns null when a changed id is outside the writable option set.
 * displayName is never identity and is never written.
 */
export function resolveSubmittedExpenseCompanion(params: {
  mode: 'create' | 'update';
  writable: boolean;
  options: readonly ExpenseCompanionChoice[];
  draftCompanionId: string | null;
  originalCompanionId: string | null;
}): ExpenseCompanionPersistence | null {
  if (params.mode === 'create') {
    if (!params.writable || params.draftCompanionId == null) {
      return { companionId: null };
    }

    const selected = params.options.find((option) => option.id === params.draftCompanionId);
    if (!selected) return null;
    return { companionId: selected.id };
  }

  const submittedId = params.writable ? params.draftCompanionId : params.originalCompanionId;

  if (submittedId === params.originalCompanionId) {
    return { companionId: submittedId };
  }

  if (submittedId == null) {
    return { companionId: null };
  }

  const selected = params.options.find((option) => option.id === submittedId);
  if (!selected) return null;
  return { companionId: selected.id };
}

/**
 * Named companion filter options for ids referenced by the loaded expenses.
 * A null catalog means the reader is not ready: no specific names are invented.
 * Active and inactive catalog rows are both eligible when referenced.
 */
export function expenseCompanionFilterChoices(params: {
  expenses: readonly { companionId?: string | null }[];
  catalog: readonly { id: string; displayName: string }[] | null;
}): ExpenseCompanionFilterChoice[] {
  if (params.catalog == null) return [];

  const referenced = new Set<string>();
  for (const expense of params.expenses) {
    if (expense.companionId) referenced.add(expense.companionId);
  }

  const choices: ExpenseCompanionFilterChoice[] = [];
  const seen = new Set<string>();
  for (const companion of params.catalog) {
    if (!referenced.has(companion.id) || seen.has(companion.id)) continue;
    seen.add(companion.id);
    choices.push({ companionId: companion.id, displayName: companion.displayName });
  }
  return choices;
}

/** Companion filter identity is all, none, or an exact companion id. */
export function expenseMatchesCompanionFilter(
  companionId: string | null | undefined,
  filter: ExpenseCompanionFilter,
): boolean {
  if (filter.kind === 'all') return true;
  const id = companionId ?? null;
  if (filter.kind === 'none') return id == null;
  return id === filter.companionId;
}
