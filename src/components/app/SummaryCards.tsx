import { motion } from 'motion/react';
import { ArrowDownRight, ArrowUpRight, ChevronRight, TrendingUp, Wallet } from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';

import { BudgetCard, type BudgetCardModel } from '@/src/components/app/home/BudgetCard';
import type { CurrentMonthlyBudgetStatus } from '@/src/features/budgets/useCurrentMonthlyBudget';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#64748b'];

type CategoryDataPoint = {
  name: string;
  value: number;
};

type DailyDataPoint = {
  date: string;
  amount: number;
};

type SummaryCardsProps = {
  totalMonthly: number;
  currentPeriodTotal: number;
  previousComparablePeriodTotal: number;
  previousMonthName: string;
  currentMonthName: string;
  budgetStatus: CurrentMonthlyBudgetStatus;
  budgetAmount: number | null;
  budgetCanWrite: boolean;
  categoryData: CategoryDataPoint[];
  dailyData: DailyDataPoint[];
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
    return <p className="mt-1 text-xs leading-snug text-zinc-500 md:text-sm">Nessuna spesa questo mese</p>;
  }

  if (!(previousComparablePeriodTotal > 0)) {
    return (
      <p className="mt-1 text-xs leading-snug text-zinc-500 md:text-sm">
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
        <span className="font-semibold text-zinc-500">0%</span>
        <span className="font-normal text-zinc-500">{periodLabel}</span>
      </p>
    );
  }

  const isDown = roundedChange < 0;
  const percentLabel = formatSignedPercent(roundedChange);
  const toneClass = isDown ? 'text-emerald-600' : 'text-amber-600';

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
      <span className="font-normal text-zinc-500">{periodLabel}</span>
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
  categoryData,
  dailyData,
  onOpenCurrentMonthExpenses,
  onSaveBudget,
}: SummaryCardsProps) {
  const budgetModel = toBudgetCardModel(budgetStatus, budgetAmount, budgetCanWrite);

  return (
    <>
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
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 md:row-span-2 md:h-9 md:w-9">
              <Wallet className="size-4 md:size-[18px]" aria-hidden="true" />
            </div>
            <div className="flex min-w-0 items-start justify-between gap-1">
              <p className="text-sm font-medium text-zinc-500">Totale spese</p>
              <ChevronRight className="mt-0.5 size-4 shrink-0 text-zinc-400 md:size-[18px]" aria-hidden="true" />
            </div>
            <div className="col-span-2 min-w-0 md:col-span-1">
              <p className="break-words text-xl font-bold tabular-nums tracking-tight text-zinc-900 md:text-3xl">
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

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="card col-span-2 flex flex-col justify-between p-6 md:col-span-1"
        >
          <div className="flex justify-between items-start">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <TrendingUp size={24} />
            </div>
            <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded-full">Distribuzione</span>
          </div>
          <div className="mt-4 h-24">
            {categoryData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={categoryData} cx="50%" cy="50%" innerRadius={30} outerRadius={45} paddingAngle={5} dataKey="value">
                    {categoryData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => `€${value.toFixed(2)}`}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-zinc-400 text-xs italic">Nessun dato disponibile</div>
            )}
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="card p-6">
          <h3 className="text-sm font-semibold text-zinc-900 mb-4">Andamento ultimi 7 giorni</h3>
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f4f4f5" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#71717a' }} />
                <YAxis hide />
                <Tooltip
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  formatter={(value: number) => [`€${value.toFixed(2)}`, 'Spesa']}
                />
                <Bar dataKey="amount" fill="#10b981" radius={[4, 4, 0, 0]} barSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>
    </>
  );
}
