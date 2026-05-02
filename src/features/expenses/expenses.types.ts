/**
 * Feature-local types + DB shapes for expenses.
 * UI-wide Category / Expense remain in @/src/types for compatibility.
 */
import type { Accompagnatore, Category, Expense } from '@/src/types';

export type { Accompagnatore, Category, Expense } from '@/src/types';

/** Form / modal state aligned with App expense fields */
export type ExpenseFormData = Partial<Expense>;

/** Payload from the add/edit form into mutations */
export type SaveExpenseFormInput = {
  amount: number;
  category: Category;
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
  description: string;
  date: string;
  tenant_id?: string;
  user_id?: string;
  owner_id?: string;
  accompagnatore?: string | null;
  created_at?: string;
};
