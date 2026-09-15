import { motion } from 'motion/react';
import { ArrowDownRight, ArrowUpRight, ChevronRight, Wallet } from 'lucide-react';

import { BudgetCard, type BudgetCardModel } from '@/src/components/app/home/BudgetCard';
import { ExpenseDistributionCard } from '@/src/components/app/home/ExpenseDistributionCard';
import { Last7DaysTrendCard } from '@/src/components/app/home/Last7DaysTrendCard';
import type { CurrentMonthlyBudgetStatus } from '@/src/features/budgets/useCurrentMonthlyBudget';
import type { Last7DaysTrendPoint } from '@/src/features/expenses/last7DaysTrend';
import type { Expense } from '@/src/types';

type SummaryCardsProps = {
  totalMonthly: number;
  currentPeriodTotal: number;
  previousComparablePeriodTotal: number;
  previousMonthName: string;
  currentMonthName: string;
  budgetStatus: CurrentMonthlyBudgetStatus;
  budgetAmount: number | null;
  budgetCanWrite: boolean;
  currentMonthExpenses: Expense[];
  last7DaysTrend: readonly Last7DaysTrendPoint[];
  last7DaysExpenses: readonly Expense[];
  onOpenCurrentMonthExpenses: () => void;
  onSaveBudget: (amount: number) => Promise<{ ok: true } | { ok: false; message: string }>;
};

function formatEuroAmount(value: number): string {
  return `€${value.toLocaleString('it-IT', { minimumFractionDigits: 2 })}`;
}

function formatSignedPercent(value: number): string {
  const abs = Math.abs(value).toLocaleString('it-IT', { maximumFractionDigits: 1, minimumFractionDigits: 0 });
  if (value > 0) return `+${abs}%`;
  if (value < 0) return `-${abs}%`;
  return '0%';
}

function MonthToDateHint({
  currentPeriodTotal,
  previousComparablePeriodTotal,
  previousMonthName,
}: {
  currentPeriodTotal: number;
  previousComparablePeriodTotal: number;
  previousMonthName: string;
}) {
  if (currentPeriodTotal === 0 && previousComparablePeriodTotal === 0) {
    return <p className="mt-1 text-xs leading-snug text-text-muted md:text-sm">Nessuna spesa questo mese</p>;
  }

  if (!(previousComparablePeriodTotal > 0)) {
    return (
      <p className="mt-1 text-xs leading-snug text-text-muted md:text-sm">
        Nessuna spesa nello stesso periodo di {previousMonthName}
      </p>
    );
  }

  const percentageChange = ((currentPeriodTotal - previousComparablePeriodTotal) / previousComparablePeriodTotal) * 100;
  const roundedChange = Number(percentageChange.toFixed(1));

  const periodLabel = `vs ${previousMonthName}`;

  if (roundedChange === 0) {
    return (
      <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs leading-snug md:text-sm">
        <span className="font-semibold text-text-muted">0%</span>
        <span className="font-normal text-text-muted">{periodLabel}</span>
      </p>
    );
  }

  const isDown = roundedChange < 0;
  const percentLabel = formatSignedPercent(roundedChange);
  const toneClass = isDown ? 'text-primary' : 'text-warning';

  return (
    <p
      className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs leading-snug md:text-sm"
      aria-label={
        isDown
          ? `Spesa in calo del ${percentLabel} rispetto allo stesso periodo di ${previousMonthName}`
          : `Spesa in aumento del ${percentLabel} rispetto allo stesso periodo di ${previousMonthName}`
      }
    >
      <span className={`inline-flex items-center gap-0.5 font-semibold ${toneClass}`}>
        {isDown ? (
          <ArrowDownRight size={14} className="shrink-0" aria-hidden="true" />
        ) : (
          <ArrowUpRight size={14} className="shrink-0" aria-hidden="true" />
        )}
        {percentLabel}
      </span>
      <span className="font-normal text-text-muted">{periodLabel}</span>
    </p>
  );
}

function toBudgetCardModel(
  status: CurrentMonthlyBudgetStatus,
  amount: number | null,
  canWrite: boolean
): BudgetCardModel | null {
  if (status === 'hidden') return null;
  return { status, amount, canWrite };
}

export function SummaryCards({
  totalMonthly,
  currentPeriodTotal,
  previousComparablePeriodTotal,
  previousMonthName,
  currentMonthName,
  budgetStatus,
  budgetAmount,
  budgetCanWrite,
  currentMonthExpenses,
  last7DaysTrend,
  last7DaysExpenses,
  onOpenCurrentMonthExpenses,
  onSaveBudget,
}: SummaryCardsProps) {
  const budgetModel = toBudgetCardModel(budgetStatus, budgetAmount, budgetCanWrite);

  return (
    <div className="space-y-3 md:space-y-4">
      <div className="grid grid-cols-2 items-stretch gap-3 md:gap-4">
        <motion.button
          type="button"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={onOpenCurrentMonthExpenses}
          aria-label="Apri le spese del mese corrente"
          className={`card flex h-full min-w-0 w-full flex-col p-3 text-left hover:border-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 md:p-4 ${
            budgetModel ? '' : 'col-span-2 md:col-span-1'
          }`}
        >
          <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-2 gap-y-1 md:gap-x-3">
            <div className="home-card-icon md:row-span-2">
              <Wallet className="size-4 md:size-[18px]" aria-hidden="true" />
            </div>
            <div className="flex min-w-0 items-start justify-between gap-1">
              <p className="text-sm font-medium text-text-muted">Totale spese</p>
              <ChevronRight className="mt-0.5 size-4 shrink-0 text-text-faint md:size-[18px]" aria-hidden="true" />
            </div>
            <div className="col-span-2 min-w-0 md:col-span-1">
              <p className="break-words text-xl font-bold tabular-nums tracking-tight text-text-primary md:text-3xl">
                {formatEuroAmount(totalMonthly)}
              </p>
              <MonthToDateHint
                currentPeriodTotal={currentPeriodTotal}
                previousComparablePeriodTotal={previousComparablePeriodTotal}
                previousMonthName={previousMonthName}
              />
            </div>
          </div>
        </motion.button>

        {budgetModel ? (
          <BudgetCard
            model={budgetModel}
            spent={totalMonthly}
            monthName={currentMonthName}
            onSave={onSaveBudget}
          />
        ) : null}

        <ExpenseDistributionCard expenses={currentMonthExpenses} totalMonthly={totalMonthly} />
      </div>

      <Last7DaysTrendCard points={last7DaysTrend} expenses={last7DaysExpenses} />
    </div>
  );
}
