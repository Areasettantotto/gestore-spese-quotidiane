/**
 * Feature-local types + DB shapes for expenses.
 * UI-wide Category / Expense remain in @/src/types for compatibility.
 * Persistence labels: LegacyExpenseCategoryLabel from the catalog.
 */
import type { Expense } from '@/src/types';

import type { CategoryCode } from './expenseCategoryCatalog';

export type { Accompagnatore, Expense } from '@/src/types';
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

/**
 * Payload from the add/edit form into mutations.
 * accompagnatore is a compatibility snapshot, not identity:
 * undefined leaves the legacy column unchanged;
 * null writes SQL null;
 * string is the selected display name at submit time.
 */
export type SaveExpenseFormInput = {
  amount: number;
  categoryCode: CategoryCode;
  description: string;
  date: string;
  companionId: string | null;
  accompagnatore?: string | null;
  editingId: string | null;
};

/**
 * Expense row as stored / returned by Supabase (public.expenses).
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
  accompagnatore?: string | null;
  companion_id: string | null;
  created_at?: string;
};
