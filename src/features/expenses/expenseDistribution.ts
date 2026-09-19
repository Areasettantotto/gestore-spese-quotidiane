import {
  CATEGORY_CODES,
  expenseCategoryByCode,
  type CategoryCode,
} from '@/src/features/expenses/expenseCategoryCatalog';
import type { ExpenseWithCategoryCode } from '@/src/features/expenses/expenses.types';

export type DistributionMode = 'categories' | 'expenses';

export type DistributionSlice = {
  key: string;
  label: string;
  amount: number;
  percent: number;
  color: string;
};

const TOP_N = 4;

const ALTRE_CATEGORIE_COLOR = '#94a3b8';
const ALTRE_SPESE_COLOR = '#a1a1aa';
const EXPENSE_RANK_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6'] as const;

export const ALTRE_CATEGORIE_LABEL = 'Altre categorie';
const ALTRE_SPESE_LABEL = 'Altre spese';

function isPositiveAmount(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function canonicalCategoryCodeIndex(code: CategoryCode): number {
  const index = CATEGORY_CODES.indexOf(code);
  return index === -1 ? CATEGORY_CODES.length : index;
}

/**
 * Largest remainder: floor exact percents, then give leftover integer
 * points to the largest fractional parts. Tie-break = slice order.
 */
export function allocateIntegerPercents(amounts: readonly number[], total: number): number[] {
  if (!(total > 0) || amounts.length === 0) {
    return amounts.map(() => 0);
  }

  const exact = amounts.map((amount) => {
    if (!isPositiveAmount(amount)) return 0;
    return (amount / total) * 100;
  });
  const floors = exact.map((value) => Math.floor(value));
  let remainder = 100 - floors.reduce((sum, value) => sum + value, 0);

  const order = exact
    .map((value, index) => ({ index, frac: value - floors[index] }))
    .sort((a, b) => {
      if (b.frac !== a.frac) return b.frac - a.frac;
      return a.index - b.index;
    });

  const percents = [...floors];
  for (let i = 0; remainder > 0 && i < order.length; i += 1) {
    percents[order[i].index] += 1;
    remainder -= 1;
  }

  return percents;
}

function withIntegerPercents(slices: Omit<DistributionSlice, 'percent'>[], totalMonthly: number): DistributionSlice[] {
  const percents = allocateIntegerPercents(
    slices.map((slice) => slice.amount),
    totalMonthly
  );
  return slices.map((slice, index) => ({ ...slice, percent: percents[index] ?? 0 }));
}

function expenseVisualLabel(expense: ExpenseWithCategoryCode): string {
  const trimmed = expense.description.trim();
  if (trimmed !== '') return trimmed;
  return expenseCategoryByCode(expense.categoryCode).presentationLabel;
}

function compareExpensesForDistribution(a: ExpenseWithCategoryCode, b: ExpenseWithCategoryCode): number {
  if (b.amount !== a.amount) return b.amount - a.amount;
  if (a.date !== b.date) return b.date.localeCompare(a.date);
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

function buildCategorySlices(
  expenses: readonly ExpenseWithCategoryCode[],
  totalMonthly: number
): DistributionSlice[] {
  const canonicalTotals = new Map<CategoryCode, number>();
  let uncategorizedRemainder = 0;

  for (const expense of expenses) {
    if (!isPositiveAmount(expense.amount)) continue;
    const code = expense.categoryCode;
    if (CATEGORY_CODES.includes(code)) {
      canonicalTotals.set(code, (canonicalTotals.get(code) ?? 0) + expense.amount);
    } else {
      uncategorizedRemainder += expense.amount;
    }
  }

  const ranked = [...canonicalTotals.entries()]
    .filter(([, amount]) => isPositiveAmount(amount))
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return canonicalCategoryCodeIndex(a[0]) - canonicalCategoryCodeIndex(b[0]);
    });

  const top = ranked.slice(0, TOP_N);
  const leftoverCanonical = ranked.slice(TOP_N).reduce((sum, [, amount]) => sum + amount, 0);
  const altreAmount = leftoverCanonical + uncategorizedRemainder;

  const slices: Omit<DistributionSlice, 'percent'>[] = top.map(([code, amount]) => {
    const catalog = expenseCategoryByCode(code);
    return {
      key: code,
      label: catalog.presentationLabel,
      amount,
      color: catalog.color,
    };
  });

  if (isPositiveAmount(altreAmount)) {
    slices.push({
      key: 'altre-categorie',
      label: ALTRE_CATEGORIE_LABEL,
      amount: altreAmount,
      color: ALTRE_CATEGORIE_COLOR,
    });
  }

  if (slices.length === 0 && isPositiveAmount(totalMonthly)) {
    slices.push({
      key: 'altre-categorie',
      label: ALTRE_CATEGORIE_LABEL,
      amount: totalMonthly,
      color: ALTRE_CATEGORIE_COLOR,
    });
  }

  return withIntegerPercents(slices, totalMonthly);
}

function buildExpenseSlices(expenses: readonly ExpenseWithCategoryCode[], totalMonthly: number): DistributionSlice[] {
  const ranked = expenses.filter((expense) => isPositiveAmount(expense.amount)).sort(compareExpensesForDistribution);
  const top = ranked.slice(0, TOP_N);
  const displayedSum = top.reduce((sum, expense) => sum + expense.amount, 0);
  const hasFurther = ranked.length > TOP_N;
  const altreAmount = totalMonthly - displayedSum;

  const slices: Omit<DistributionSlice, 'percent'>[] = top.map((expense, index) => ({
    key: expense.id,
    label: expenseVisualLabel(expense),
    amount: expense.amount,
    color: EXPENSE_RANK_COLORS[index] ?? ALTRE_SPESE_COLOR,
  }));

  if (hasFurther && isPositiveAmount(altreAmount)) {
    slices.push({
      key: 'altre-spese',
      label: ALTRE_SPESE_LABEL,
      amount: altreAmount,
      color: ALTRE_SPESE_COLOR,
    });
  }

  if (slices.length === 0 && isPositiveAmount(totalMonthly)) {
    slices.push({
      key: 'altre-spese',
      label: ALTRE_SPESE_LABEL,
      amount: totalMonthly,
      color: ALTRE_SPESE_COLOR,
    });
  }

  return withIntegerPercents(slices, totalMonthly);
}

export function buildExpenseDistribution(params: {
  mode: DistributionMode;
  expenses: readonly ExpenseWithCategoryCode[];
  totalMonthly: number;
}): DistributionSlice[] {
  const { mode, expenses, totalMonthly } = params;
  if (!(totalMonthly > 0)) return [];
  return mode === 'expenses' ? buildExpenseSlices(expenses, totalMonthly) : buildCategorySlices(expenses, totalMonthly);
}
