/**
 * Feature-local types + DB shapes for expenses.
 * UI-wide Category / Expense remain in @/src/types for compatibility.
 * Persistence labels: LegacyExpenseCategoryLabel from the catalog.
 */
import type { Expense } from '@/src/types';

import type { CategoryCode } from './expenseCategoryCatalog';

export type { Expense } from '@/src/types';
export type { CategoryCode } from './expenseCategoryCatalog';

/**
 * Operational expense domain for this feature: shared Expense fields plus a
 * required machine identity (`categoryCode`). Legacy persistence labels stay
 * outside this type.
 */
export type ExpenseWithCategoryCode = Expense & {
  categoryCode: CategoryCode;
};

/** Form / modal draft. Companion identity is companionId, never a display name. */
export type ExpenseFormData = {
  amount?: number;
  categoryCode: CategoryCode;
  description: string;
  date: string;
  companionId: string | null;
};

export function emptyExpenseFormDraft(date: string): ExpenseFormData {
  return {
    amount: undefined,
    categoryCode: 'food',
    description: '',
    date,
    companionId: null,
  };
}

/** Payload from the add/edit form into mutations. Companion identity is companionId. */
export type SaveExpenseFormInput = {
  amount: number;
  categoryCode: CategoryCode;
  description: string;
  date: string;
  companionId: string | null;
  editingId: string | null;
};

/**
 * All-expenses companion filter.
 * all matches every loaded expense.
 * none matches companionId null.
 * companion matches that relational id exactly. displayName is not identity.
 */
export type ExpenseCompanionFilter =
  | { kind: 'all' }
  | { kind: 'none' }
  | { kind: 'companion'; companionId: string };

/** Named filter option for a companion id that current expenses actually reference. */
export type ExpenseCompanionFilterChoice = {
  companionId: string;
  displayName: string;
};

/**
 * Expense row fields the application reads from public.expenses.
 * The legacy text column is not part of this type.
 */
export type ExpenseDbRow = {
  id: string;
  amount: number;
  category: string;
  category_code?: string | null;
  description: string;
  date: string;
  tenant_id?: string;
  user_id?: string;
  owner_id?: string;
  companion_id: string | null;
  created_at?: string;
};
