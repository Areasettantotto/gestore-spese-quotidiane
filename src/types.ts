export type Accompagnatore = 'Marco' | 'Veronica' | 'Angela';

export interface Expense {
  id: string;
  amount: number;
  description: string;
  date: string;
  accompagnatore?: Accompagnatore;
  companionId?: string | null;
}

export const ACCOMPAGNATORI: Accompagnatore[] = ['Marco', 'Veronica', 'Angela'];
