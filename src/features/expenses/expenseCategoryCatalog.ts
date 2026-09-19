/**
 * Frontend foundation for expense category machine codes.
 *
 * Canonical source of identity (`CategoryCode`), current presentation metadata,
 * and exact legacy DB labels used by the EXPAND compatibility bridge.
 *
 * Pure TypeScript: no React, no Supabase, no I/O. `personal` presentationLabel
 * is `Personale`; legacyLabel remains `Shopping` for EXPAND write compatibility.
 */

type ExpenseCategoryCatalogEntryShape = {
  readonly code: string;
  readonly legacyLabel: string;
  readonly presentationLabel: string;
  readonly iconKey: string;
  readonly color: string;
};

export const EXPENSE_CATEGORY_CATALOG = [
  {
    code: 'food',
    legacyLabel: 'Alimentazione',
    presentationLabel: 'Alimentazione',
    iconKey: 'Coffee',
    color: '#10b981',
  },
  {
    code: 'transport',
    legacyLabel: 'Trasporti',
    presentationLabel: 'Trasporti',
    iconKey: 'Truck',
    color: '#3b82f6',
  },
  {
    code: 'home',
    legacyLabel: 'Casa',
    presentationLabel: 'Casa',
    iconKey: 'Home',
    color: '#f59e0b',
  },
  {
    code: 'leisure',
    legacyLabel: 'Svago',
    presentationLabel: 'Svago',
    iconKey: 'Music',
    color: '#ef4444',
  },
  {
    code: 'health',
    legacyLabel: 'Salute',
    presentationLabel: 'Salute',
    iconKey: 'Heart',
    color: '#8b5cf6',
  },
  {
    code: 'personal',
    legacyLabel: 'Shopping',
    presentationLabel: 'Personale',
    iconKey: 'ShoppingBag',
    color: '#ec4899',
  },
  {
    code: 'other',
    legacyLabel: 'Altro',
    presentationLabel: 'Altro',
    iconKey: 'Tag',
    color: '#64748b',
  },
] as const satisfies readonly ExpenseCategoryCatalogEntryShape[];

export type ExpenseCategoryCatalogEntry = (typeof EXPENSE_CATEGORY_CATALOG)[number];
export type CategoryCode = ExpenseCategoryCatalogEntry['code'];

export const CATEGORY_CODES: readonly CategoryCode[] = EXPENSE_CATEGORY_CATALOG.map(
  (entry) => entry.code,
);

const CATEGORY_CODE_SET: ReadonlySet<string> = new Set(CATEGORY_CODES);

const EXPENSE_CATEGORY_BY_CODE = Object.fromEntries(
  EXPENSE_CATEGORY_CATALOG.map((entry) => [entry.code, entry]),
) as { [K in CategoryCode]: Extract<ExpenseCategoryCatalogEntry, { code: K }> };

const CATEGORY_CODE_BY_LEGACY_LABEL = new Map<string, CategoryCode>(
  EXPENSE_CATEGORY_CATALOG.map((entry) => [entry.legacyLabel, entry.code]),
);

export function isCategoryCode(value: unknown): value is CategoryCode {
  return typeof value === 'string' && CATEGORY_CODE_SET.has(value);
}

export function categoryCodeFromLegacyLabel(legacyLabel: unknown): CategoryCode | null {
  if (typeof legacyLabel !== 'string') return null;
  return CATEGORY_CODE_BY_LEGACY_LABEL.get(legacyLabel) ?? null;
}

export function legacyLabelForCategoryCode(code: CategoryCode): ExpenseCategoryCatalogEntry['legacyLabel'] {
  return EXPENSE_CATEGORY_BY_CODE[code].legacyLabel;
}

export function expenseCategoryByCode(code: CategoryCode): ExpenseCategoryCatalogEntry {
  return EXPENSE_CATEGORY_BY_CODE[code];
}

export function findExpenseCategoryByCode(value: unknown): ExpenseCategoryCatalogEntry | null {
  if (!isCategoryCode(value)) return null;
  return expenseCategoryByCode(value);
}
