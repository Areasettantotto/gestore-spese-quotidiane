export interface Expense {
  id: string;
  amount: number;
  description: string;
  date: string;
  /** Relational companion identity. Absent or null means no companion. */
  companionId?: string | null;
}
