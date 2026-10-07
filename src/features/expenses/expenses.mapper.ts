import type { Expense } from '@/src/types';
import type { ExpenseCompanionReadStatus } from '@/src/features/companions/useExpenseCompanionRead';

import {
  categoryCodeFromLegacyLabel,
  findExpenseCategoryByCode,
  type CategoryCode,
} from './expenseCategoryCatalog';
import type { ExpenseDbRow, ExpenseWithCategoryCode } from './expenses.types';

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
  /** undefined leaves the legacy accompagnatore column unchanged. */
  accompagnatore: string | null | undefined;
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
    accompagnatore: row.accompagnatore ?? undefined,
    companionId: row.companion_id ?? null,
  };
}

export type ExpenseInsertPayload = {
  id: string;
  amount: number;
  category_code: CategoryCode;
  description: string;
  date: string;
  accompagnatore: string | null;
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
    accompagnatore: expense.accompagnatore ?? null,
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
  accompagnatore?: string | null;
  owner_id: string;
  tenant_id: string;
};

export function buildUpdatePayload(params: {
  amount: number;
  categoryCode: CategoryCode;
  description: string;
  date: string;
  companionId: string | null;
  accompagnatore: string | null | undefined;
  userId: string;
  tenantId: string;
}): ExpenseUpdatePayload {
  const { amount, categoryCode, description, date, companionId, accompagnatore, userId, tenantId } = params;
  const payload: ExpenseUpdatePayload = {
    amount,
    category_code: categoryCode,
    description,
    date,
    companion_id: companionId,
    owner_id: userId,
    tenant_id: tenantId,
  };

  if (accompagnatore !== undefined) {
    payload.accompagnatore = accompagnatore;
  }

  return payload;
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
      accompagnatore: payload.accompagnatore ?? undefined,
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
  accompagnatore: string | null | undefined;
}): ExpenseWithCategoryCode {
  return expenseWithCategoryCode(
    {
      id: params.id,
      amount: params.amount,
      description: params.description,
      date: params.date,
      accompagnatore: params.accompagnatore ?? undefined,
      companionId: params.companionId,
    },
    params.categoryCode,
  );
}

/**
 * Keep the previous compatibility text only when this update did not write it.
 * companionId always comes from the submitted local expense.
 */
export function applyLocalExpenseUpdate(params: {
  previous: ExpenseWithCategoryCode;
  updated: ExpenseWithCategoryCode;
  accompagnatore: string | null | undefined;
}): ExpenseWithCategoryCode {
  if (params.accompagnatore !== undefined) return params.updated;
  return {
    ...params.updated,
    accompagnatore: params.previous.accompagnatore,
  };
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
 * Decide the relational id and whether the legacy snapshot is written.
 * Identity changes are id comparisons. displayName is copied only for an explicit assign.
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
      return { companionId: null, accompagnatore: null };
    }

    const selected = params.options.find((option) => option.id === params.draftCompanionId);
    if (!selected) return null;
    return { companionId: selected.id, accompagnatore: selected.displayName };
  }

  const submittedId = params.writable ? params.draftCompanionId : params.originalCompanionId;

  if (submittedId === params.originalCompanionId) {
    return { companionId: submittedId, accompagnatore: undefined };
  }

  if (submittedId == null) {
    return { companionId: null, accompagnatore: null };
  }

  const selected = params.options.find((option) => option.id === submittedId);
  if (!selected) return null;
  return { companionId: selected.id, accompagnatore: selected.displayName };
}
