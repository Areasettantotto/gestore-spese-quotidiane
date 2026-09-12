import { supabase } from '@/src/lib/supabaseClient';

export type MonthlyBudget = {
  tenantId: string;
  periodMonth: string;
  amount: number;
};

export type BudgetMetrics = {
  spent: number;
  budget: number;
  percentage: number;
  remaining: number;
  exceeded: boolean;
  progressWidth: number;
};

export type BudgetMutationResult =
  | { ok: true; budget: MonthlyBudget }
  | { ok: false; message: string };

const LOAD_ERROR_MESSAGE = 'Impossibile caricare il budget.';
const SAVE_ERROR_MESSAGE = 'Impossibile salvare il budget. Riprova.';
const INVALID_ROW_MESSAGE = 'Budget non disponibile.';

/**
 * First calendar day of the month currently shown on Home, as YYYY-MM-01.
 * Uses the local date (same basis as Home). Server CURRENT_DATE remains
 * the write-permission authority.
 */
export function currentCalendarMonthStartDate(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}

/**
 * Inclusive local calendar days from `now` through the last day of that month.
 * Today is included. Uses calendar fields, not 24h/ms arithmetic.
 */
export function inclusiveRemainingCalendarDaysInMonth(now: Date = new Date()): number {
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return lastDay - now.getDate() + 1;
}

/**
 * Average remaining amount per inclusive remaining calendar day.
 * Null when the budget is exceeded or only one calendar day remains.
 */
export function dailyRemainingAmount(
  remaining: number,
  exceeded: boolean,
  now: Date = new Date()
): number | null {
  if (exceeded) return null;
  const inclusiveDays = inclusiveRemainingCalendarDaysInMonth(now);
  if (inclusiveDays <= 1) return null;
  return remaining / inclusiveDays;
}

export function deriveBudgetMetrics(spent: number, budget: number): BudgetMetrics {
  const spentCents = Math.round(spent * 100);
  const budgetCents = Math.round(budget * 100);
  const remainingCents = budgetCents - spentCents;
  const percentage = budget > 0 ? (spent / budget) * 100 : 0;
  const progressWidth = Math.min(100, Math.max(0, percentage));

  return {
    spent,
    budget,
    percentage,
    remaining: remainingCents / 100,
    exceeded: spentCents > budgetCents,
    progressWidth,
  };
}

export async function getCurrentMonthlyBudget(
  tenantId: string,
  periodMonth: string
): Promise<{ budget: MonthlyBudget | null; errorMessage: string | null }> {
  const { data, error } = await selectCurrentMonthlyBudget(tenantId, periodMonth);

  if (error) {
    console.error('Failed to load current monthly budget', error);
    return { budget: null, errorMessage: LOAD_ERROR_MESSAGE };
  }

  if (data == null) {
    return { budget: null, errorMessage: null };
  }

  const mapped = mapMonthlyBudgetRow(data);
  if (!mapped) {
    console.error('Current monthly budget row did not match the expected shape', data);
    return { budget: null, errorMessage: INVALID_ROW_MESSAGE };
  }

  return { budget: mapped, errorMessage: null };
}

export async function insertCurrentMonthlyBudget(params: {
  tenantId: string;
  periodMonth: string;
  amount: number;
}): Promise<BudgetMutationResult> {
  const { data, error } = await insertMonthlyBudgetRow(params);

  if (error) {
    console.error('Failed to insert current monthly budget', error);
    return { ok: false, message: SAVE_ERROR_MESSAGE };
  }

  const mapped = mapMonthlyBudgetRow(data);
  if (!mapped) {
    console.error('Inserted monthly budget row did not match the expected shape', data);
    return { ok: false, message: SAVE_ERROR_MESSAGE };
  }

  return { ok: true, budget: mapped };
}

export async function updateCurrentMonthlyBudgetAmount(params: {
  tenantId: string;
  periodMonth: string;
  amount: number;
}): Promise<BudgetMutationResult> {
  const { data, error } = await updateMonthlyBudgetAmountRow(params);

  if (error) {
    console.error('Failed to update current monthly budget amount', error);
    return { ok: false, message: SAVE_ERROR_MESSAGE };
  }

  const mapped = mapMonthlyBudgetRow(data);
  if (!mapped) {
    console.error('Updated monthly budget row missing or unexpected', data);
    return { ok: false, message: SAVE_ERROR_MESSAGE };
  }

  return { ok: true, budget: mapped };
}

async function selectCurrentMonthlyBudget(tenantId: string, periodMonth: string) {
  return supabase
    .from('tenant_monthly_budgets')
    .select('tenant_id, period_month, amount')
    .eq('tenant_id', tenantId)
    .eq('period_month', periodMonth)
    .maybeSingle();
}

async function insertMonthlyBudgetRow(params: {
  tenantId: string;
  periodMonth: string;
  amount: number;
}) {
  return supabase
    .from('tenant_monthly_budgets')
    .insert({
      tenant_id: params.tenantId,
      period_month: params.periodMonth,
      amount: params.amount,
    })
    .select('tenant_id, period_month, amount')
    .single();
}

async function updateMonthlyBudgetAmountRow(params: {
  tenantId: string;
  periodMonth: string;
  amount: number;
}) {
  // DATA-04: authenticated UPDATE privilege is amount-only.
  // Do not send tenant_id / period_month in the payload. Do not upsert.
  return supabase
    .from('tenant_monthly_budgets')
    .update({ amount: params.amount })
    .eq('tenant_id', params.tenantId)
    .eq('period_month', params.periodMonth)
    .select('tenant_id, period_month, amount')
    .maybeSingle();
}

function mapMonthlyBudgetRow(row: unknown): MonthlyBudget | null {
  if (!isRecord(row)) return null;

  const tenantId = row.tenant_id;
  const periodMonth = parsePeriodMonth(row.period_month);
  const amount = parseAmount(row.amount);

  if (typeof tenantId !== 'string' || tenantId.length === 0) return null;
  if (!periodMonth) return null;
  if (amount == null || !(amount > 0)) return null;

  return { tenantId, periodMonth, amount };
}

function parsePeriodMonth(value: unknown): string | null {
  if (typeof value !== 'string' || value.length < 10) return null;
  const day = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-01$/.test(day)) return null;
  return day;
}

function parseAmount(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
