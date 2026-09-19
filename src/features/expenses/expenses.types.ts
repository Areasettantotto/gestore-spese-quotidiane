/**
 * Feature-local types + DB shapes for expenses.
 * UI-wide Category / Expense remain in @/src/types for compatibility.
 * Persistence labels: LegacyExpenseCategoryLabel from the catalog.
 */
import type { Accompagnatore, Expense } from '@/src/types';

import type { CategoryCode } from './expenseCategoryCatalog';

export type { Accompagnatore, Expense } from '@/src/types';
export type { CategoryCode } from './expenseCategoryCatalog';

/**
 * Operational expense domain for this feature: shared Expense fields plus a
 * required machine code. Extra field is structurally compatible with Expense
 * consumers (form, filters, charts) that still read the legacy label.
 */
export type ExpenseWithCategoryCode = Expense & {
  categoryCode: CategoryCode;
};

/** Form / modal draft: CategoryCode identity, no DB/legacy category fields. */
export type ExpenseFormData = {
  amount?: number;
  categoryCode: CategoryCode;
  description: string;
  date: string;
  accompagnatore?: Accompagnatore;
};

/** Payload from the add/edit form into mutations */
export type SaveExpenseFormInput = {
  amount: number;
  categoryCode: CategoryCode;
  description: string;
  date: string;
  accompagnatore?: Accompagnatore;
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
  created_at?: string;
};
