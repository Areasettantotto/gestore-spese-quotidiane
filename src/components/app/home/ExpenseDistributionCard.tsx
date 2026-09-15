import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { PieChart as PieChartIcon } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

import {
  buildExpenseDistribution,
  type DistributionMode,
  type DistributionSlice,
} from '@/src/features/expenses/expenseDistribution';
import type { Expense } from '@/src/types';

type ExpenseDistributionCardProps = {
  expenses: readonly Expense[];
  totalMonthly: number;
};

function formatEuroAmount(value: number): string {
  return `€${value.toLocaleString('it-IT', { minimumFractionDigits: 2 })}`;
}

function DistributionTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: DistributionSlice }>;
}) {
  if (!active || !payload?.[0]) return null;
  const slice = payload[0].payload;
  return (
    <div className="rounded-xl border-none bg-white px-3 py-2 text-sm shadow-[0_4px_12px_rgba(0,0,0,0.1)]">
      <p className="font-medium text-zinc-900">{slice.label}</p>
      <p className="tabular-nums text-zinc-600">
        {formatEuroAmount(slice.amount)}
        <span className="text-zinc-400"> · {slice.percent}%</span>
      </p>
    </div>
  );
}

function ModeToggle({
  mode,
  onChange,
}: {
  mode: DistributionMode;
  onChange: (next: DistributionMode) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Modalità distribuzione"
      className="inline-flex shrink-0 rounded-lg bg-zinc-100 p-0.5"
    >
      <button
        type="button"
        aria-pressed={mode === 'categories'}
        onClick={() => onChange('categories')}
        className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
          mode === 'categories' ? 'bg-white text-emerald-700 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
        }`}
      >
        Categorie
      </button>
      <button
        type="button"
        aria-pressed={mode === 'expenses'}
        onClick={() => onChange('expenses')}
        className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
          mode === 'expenses' ? 'bg-white text-emerald-700 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
        }`}
      >
        Spese
      </button>
    </div>
  );
}

function DistributionLegend({ slices }: { slices: DistributionSlice[] }) {
  return (
    <ul className="grid min-h-[8.75rem] min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)_auto_auto] content-center gap-x-2 gap-y-2">
      {slices.map((slice) => (
        <li
          key={slice.key}
          className="col-span-4 grid min-w-0 grid-cols-subgrid items-center"
          aria-label={`${slice.label}: ${formatEuroAmount(slice.amount)}, ${slice.percent}%`}
        >
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: slice.color }}
            aria-hidden="true"
          />
          <span className="min-w-0 truncate text-sm text-zinc-700" title={slice.label}>
            {slice.label}
          </span>
          <span className="whitespace-nowrap text-left text-sm font-medium tabular-nums text-zinc-900">
            {formatEuroAmount(slice.amount)}
          </span>
          <span className="whitespace-nowrap pl-3 text-left text-xs tabular-nums text-zinc-500">
            {slice.percent}%
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ExpenseDistributionCard({ expenses, totalMonthly }: ExpenseDistributionCardProps) {
  const [mode, setMode] = useState<DistributionMode>('categories');
  const slices = useMemo(
    () => buildExpenseDistribution({ mode, expenses, totalMonthly }),
    [mode, expenses, totalMonthly]
  );
  const isEmpty = !(totalMonthly > 0);

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      aria-label="Distribuzione spese"
      className="card col-span-2 flex min-w-0 w-full flex-col p-3 md:p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 md:gap-3">
          <div className="home-card-icon">
            <PieChartIcon className="size-4 md:size-[18px]" aria-hidden="true" />
          </div>
          <h2 className="min-w-0 truncate text-sm font-medium text-zinc-500">Distribuzione spese</h2>
        </div>
        <ModeToggle mode={mode} onChange={setMode} />
      </div>

      {isEmpty ? (
        <p className="flex min-h-[8.75rem] items-center justify-center text-sm text-zinc-500">
          Nessuna spesa questo mese
        </p>
      ) : (
        <div className="mt-3 flex min-w-0 items-center gap-3 md:gap-5">
          <div className="relative isolate h-[132px] w-[132px] shrink-0 sm:h-[148px] sm:w-[148px]">
            <div className="pointer-events-none absolute inset-0 z-0 flex flex-col items-center justify-center">
              <p className="text-sm font-bold tabular-nums tracking-tight text-zinc-900 sm:text-base">
                {formatEuroAmount(totalMonthly)}
              </p>
              <p className="text-[10px] font-medium text-zinc-500 sm:text-xs">Totale</p>
            </div>
            <div className="relative z-10 h-full w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={slices}
                    dataKey="amount"
                    nameKey="key"
                    cx="50%"
                    cy="50%"
                    innerRadius="62%"
                    outerRadius="92%"
                    paddingAngle={slices.length > 1 ? 2 : 0}
                    startAngle={90}
                    endAngle={-270}
                    stroke="none"
                  >
                    {slices.map((slice) => (
                      <Cell key={slice.key} fill={slice.color} />
                    ))}
                  </Pie>
                  <Tooltip content={DistributionTooltip} wrapperStyle={{ zIndex: 20 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          <DistributionLegend slices={slices} />
        </div>
      )}
    </motion.section>
  );
}
