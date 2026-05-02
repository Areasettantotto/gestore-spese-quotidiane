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
