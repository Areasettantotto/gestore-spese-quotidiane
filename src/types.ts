export type Accompagnatore = 'Marco' | 'Veronica' | 'Angela';

/**
 * Point-in-time text stored in expenses.accompagnatore.
 * A custom Companion display name is valid here. This field is not relational identity.
 */
export type ExpenseAccompagnatoreCompatibility = string;

export interface Expense {
  id: string;
  amount: number;
  description: string;
  date: string;
  accompagnatore?: ExpenseAccompagnatoreCompatibility;
  companionId?: string | null;
}

export const ACCOMPAGNATORI: Accompagnatore[] = ['Marco', 'Veronica', 'Angela'];
