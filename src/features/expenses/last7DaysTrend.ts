import { format, subDays } from 'date-fns';
import { it } from 'date-fns/locale';

import { ALTRE_CATEGORIE_LABEL, segmentKeyForCategory } from '@/src/features/expenses/expenseDistribution';
import { CATEGORIES, type Expense } from '@/src/types';

export type Last7DaysCategoryAmount = {
  category: string;
  amount: number;
};

export type Last7DaysTrendPoint = {
  dateKey: string;
  label: string;
  amount: number;
  categories: Last7DaysCategoryAmount[];
};

function buildDayCategories(totals: Map<string, number>): Last7DaysCategoryAmount[] {
  const categories: Last7DaysCategoryAmount[] = [];
  for (const category of CATEGORIES) {
    const amount = totals.get(category);
    if (amount != null && amount !== 0) {
      categories.push({ category, amount });
    }
  }
  const altreAmount = totals.get(ALTRE_CATEGORIE_LABEL);
  if (altreAmount != null && altreAmount !== 0) {
    categories.push({ category: ALTRE_CATEGORIE_LABEL, amount: altreAmount });
  }
  return categories;
}

/**
 * Daily totals + category breakdown for the rolling window today-6 → today
 * (7 consecutive days, today included). Source must be the full expense list:
 * the window can cross month/year boundaries. Future-dated rows (> today)
 * are outside the window and therefore excluded.
 */
export function buildLast7DaysTrend(
  expenses: readonly Expense[],
  today: Date = new Date()
): Last7DaysTrendPoint[] {
  const totalsByDate = new Map<string, number>();
  const categoriesByDate = new Map<string, Map<string, number>>();

  for (const expense of expenses) {
    totalsByDate.set(expense.date, (totalsByDate.get(expense.date) ?? 0) + expense.amount);

    const categoryKey = segmentKeyForCategory(String(expense.category ?? ''));
    let dayCategories = categoriesByDate.get(expense.date);
    if (!dayCategories) {
      dayCategories = new Map<string, number>();
      categoriesByDate.set(expense.date, dayCategories);
    }
    dayCategories.set(categoryKey, (dayCategories.get(categoryKey) ?? 0) + expense.amount);
  }

  const points: Last7DaysTrendPoint[] = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const day = subDays(today, offset);
    const dateKey = format(day, 'yyyy-MM-dd');
    points.push({
      dateKey,
      label: format(day, 'EEE d', { locale: it }),
      amount: totalsByDate.get(dateKey) ?? 0,
      categories: buildDayCategories(categoriesByDate.get(dateKey) ?? new Map()),
    });
  }
  return points;
}
