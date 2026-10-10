import {
  CATEGORY_CODES,
  expenseCategoryByCode,
  type CategoryCode,
} from '@/src/features/expenses/expenseCategoryCatalog';
import type { ExpenseWithCategoryCode } from '@/src/features/expenses/expenses.types';

export type DistributionMode = 'categories' | 'expenses' | 'companions';

export type DistributionSlice = {
  key: string;
  label: string;
  amount: number;
  percent: number;
  color: string;
};

/** Catalog row already loaded for the active tenant. Identity is `id`, never the label. */
export type DistributionCompanion = {
  id: string;
  displayName: string;
};

const TOP_N = 4;

const ALTRE_CATEGORIE_COLOR = '#94a3b8';
const ALTRE_SPESE_COLOR = '#a1a1aa';
const EXPENSE_RANK_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6'] as const;

export const ALTRE_CATEGORIE_LABEL = 'Altre categorie';
const ALTRE_SPESE_LABEL = 'Altre spese';
const SENZA_ACCOMPAGNATORE_LABEL = 'Senza accompagnatore';
const ACCOMPAGNATORE_NON_DISPONIBILE_LABEL = 'Accompagnatore non disponibile';

/** Synthetic keys cannot collide with `companion-id:${id}`. */
const COMPANION_NONE_KEY = 'companion-none';
const COMPANION_UNAVAILABLE_KEY = 'companion-unavailable';
const COMPANION_REMAINDER_KEY = 'companion-remainder';

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

type CompanionGroup = {
  key: string;
  label: string;
  amount: number;
};

function companionDistributionKey(companionId: string): string {
  return `companion-id:${companionId}`;
}

function compareCompanionGroups(a: CompanionGroup, b: CompanionGroup): number {
  if (b.amount !== a.amount) return b.amount - a.amount;
  const byLabel = a.label.localeCompare(b.label, 'it', { sensitivity: 'base' });
  if (byLabel !== 0) return byLabel;
  if (a.key < b.key) return -1;
  if (a.key > b.key) return 1;
  return 0;
}

/**
 * Positive amounts grouped by companion id.
 * A null id is one group. Every id missing from the current catalog shares one group.
 * Labels come from that catalog. Raw ids are never labels.
 * Inactive catalog rows stay eligible.
 */
function buildCompanionSlices(
  expenses: readonly ExpenseWithCategoryCode[],
  totalMonthly: number,
  companions: readonly DistributionCompanion[]
): DistributionSlice[] {
  const labelsById = new Map<string, string>();
  for (const companion of companions) {
    if (!labelsById.has(companion.id)) {
      labelsById.set(companion.id, companion.displayName);
    }
  }

  const groups = new Map<string, CompanionGroup>();
  const addAmount = (key: string, label: string, amount: number) => {
    const existing = groups.get(key);
    if (existing) {
      existing.amount += amount;
      return;
    }
    groups.set(key, { key, label, amount });
  };

  for (const expense of expenses) {
    if (!isPositiveAmount(expense.amount)) continue;
    const companionId = expense.companionId ?? null;
    if (companionId == null) {
      addAmount(COMPANION_NONE_KEY, SENZA_ACCOMPAGNATORE_LABEL, expense.amount);
      continue;
    }
    const label = labelsById.get(companionId);
    if (label == null) {
      addAmount(COMPANION_UNAVAILABLE_KEY, ACCOMPAGNATORE_NON_DISPONIBILE_LABEL, expense.amount);
      continue;
    }
    addAmount(companionDistributionKey(companionId), label, expense.amount);
  }

  const ranked = [...groups.values()].filter((group) => isPositiveAmount(group.amount)).sort(compareCompanionGroups);
  const top = ranked.slice(0, TOP_N);
  const leftover = ranked.slice(TOP_N).reduce((sum, group) => sum + group.amount, 0);

  const slices: Omit<DistributionSlice, 'percent'>[] = top.map((group, index) => ({
    key: group.key,
    label: group.label,
    amount: group.amount,
    color: EXPENSE_RANK_COLORS[index] ?? ALTRE_SPESE_COLOR,
  }));

  if (ranked.length > TOP_N && isPositiveAmount(leftover)) {
    slices.push({
      key: COMPANION_REMAINDER_KEY,
      label: ALTRE_SPESE_LABEL,
      amount: leftover,
      color: ALTRE_SPESE_COLOR,
    });
  }

  if (slices.length === 0 && isPositiveAmount(totalMonthly)) {
    slices.push({
      key: COMPANION_REMAINDER_KEY,
      label: ALTRE_SPESE_LABEL,
      amount: totalMonthly,
      color: ALTRE_SPESE_COLOR,
    });
  }

  return withIntegerPercents(slices, totalMonthly);
}

export function buildExpenseDistribution(
  params: {
    expenses: readonly ExpenseWithCategoryCode[];
    totalMonthly: number;
  } & (
    | { mode: 'categories' | 'expenses' }
    | { mode: 'companions'; companions: readonly DistributionCompanion[] }
  )
): DistributionSlice[] {
  const { mode, expenses, totalMonthly } = params;
  if (!(totalMonthly > 0)) return [];
  if (mode === 'expenses') return buildExpenseSlices(expenses, totalMonthly);
  if (mode === 'companions') return buildCompanionSlices(expenses, totalMonthly, params.companions);
  return buildCategorySlices(expenses, totalMonthly);
}
