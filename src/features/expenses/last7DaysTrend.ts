import { format, subDays } from 'date-fns';
import { it } from 'date-fns/locale';

import { CATEGORY_CODES, isCategoryCode, type CategoryCode } from '@/src/features/expenses/expenseCategoryCatalog';
import type { ExpenseWithCategoryCode } from '@/src/features/expenses/expenses.types';

export const ALTRE_CATEGORIE_KEY = 'altre-categorie' as const;

export type Last7DaysCategoryKey = CategoryCode | typeof ALTRE_CATEGORIE_KEY;

export type Last7DaysCategoryAmount = {
  key: Last7DaysCategoryKey;
  amount: number;
};

export type Last7DaysTrendPoint = {
  dateKey: string;
  label: string;
  amount: number;
  categories: Last7DaysCategoryAmount[];
};

function stackKeyForExpense(expense: ExpenseWithCategoryCode): Last7DaysCategoryKey {
  return isCategoryCode(expense.categoryCode) ? expense.categoryCode : ALTRE_CATEGORIE_KEY;
}

function buildDayCategories(totals: Map<string, number>): Last7DaysCategoryAmount[] {
  const categories: Last7DaysCategoryAmount[] = [];
  for (const code of CATEGORY_CODES) {
    const amount = totals.get(code);
    if (amount != null && amount !== 0) {
      categories.push({ key: code, amount });
    }
  }
  const altreAmount = totals.get(ALTRE_CATEGORIE_KEY);
  if (altreAmount != null && altreAmount !== 0) {
    categories.push({ key: ALTRE_CATEGORIE_KEY, amount: altreAmount });
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
  expenses: readonly ExpenseWithCategoryCode[],
  today: Date = new Date()
): Last7DaysTrendPoint[] {
  const totalsByDate = new Map<string, number>();
  const categoriesByDate = new Map<string, Map<string, number>>();

  for (const expense of expenses) {
    totalsByDate.set(expense.date, (totalsByDate.get(expense.date) ?? 0) + expense.amount);

    const categoryKey = stackKeyForExpense(expense);
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

function compareTrendDayExpenses(a: ExpenseWithCategoryCode, b: ExpenseWithCategoryCode): number {
  if (b.amount !== a.amount) return b.amount - a.amount;
  if (a.date !== b.date) return b.date.localeCompare(a.date);
  return a.id.localeCompare(b.id);
}

/**
 * Real expenses for one chart day. Date-key match is the same as
 * `buildLast7DaysTrend`: `expense.date === dateKey` (`yyyy-MM-dd`).
 * Order: amount DESC, date DESC, id ASC.
 */
export function listTrendDayExpenses(
  expenses: readonly ExpenseWithCategoryCode[],
  dateKey: string
): ExpenseWithCategoryCode[] {
  return expenses.filter((expense) => expense.date === dateKey).sort(compareTrendDayExpenses);
}
