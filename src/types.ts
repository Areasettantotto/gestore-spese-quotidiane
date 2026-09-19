export const CATEGORIES = [
  'Alimentazione',
  'Trasporti',
  'Casa',
  'Svago',
  'Salute',
  'Shopping',
  'Altro',
] as const;

export type Category = (typeof CATEGORIES)[number];

export type Accompagnatore = 'Marco' | 'Veronica' | 'Angela';

export interface Expense {
  id: string;
  amount: number;
  category: Category;
  description: string;
  date: string;
  accompagnatore?: Accompagnatore;
}

export const ACCOMPAGNATORI: Accompagnatore[] = ['Marco', 'Veronica', 'Angela'];
