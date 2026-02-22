export type Category = 'Alimentazione' | 'Trasporti' | 'Casa' | 'Svago' | 'Salute' | 'Shopping' | 'Altro';

export type Accompagnatore = 'Marco' | 'Veronica' | 'Angela';

export interface Expense {
  id: string;
  amount: number;
  category: Category;
  description: string;
  date: string;
  accompagnatore?: Accompagnatore;
}

export const CATEGORIES: Category[] = [
  'Alimentazione',
  'Trasporti',
  'Casa',
  'Svago',
  'Salute',
  'Shopping',
  'Altro'
];

export const ACCOMPAGNATORI: Accompagnatore[] = ['Marco', 'Veronica', 'Angela'];

// Icon keys for categories. Keep values as simple identifiers so UI layer
// can map them to actual icon components (lucide-react) without importing
// UI libraries into this types file.
export const CATEGORY_ICONS: Record<Category, string> = {
  Alimentazione: 'Coffee',
  Trasporti: 'Truck',
  Casa: 'Home',
  Svago: 'Music',
  Salute: 'Heart',
  Shopping: 'ShoppingBag',
  Altro: 'Tag'
};
