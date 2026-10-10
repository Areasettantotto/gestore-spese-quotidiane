import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { PieChart as PieChartIcon } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

import {
  buildExpenseDistribution,
  type DistributionCompanion,
  type DistributionMode,
  type DistributionSlice,
} from '@/src/features/expenses/expenseDistribution';
import type { ExpenseWithCategoryCode } from '@/src/features/expenses/expenses.types';

const NO_DISTRIBUTION_COMPANIONS: readonly DistributionCompanion[] = [];

type ExpenseDistributionCardProps = {
  expenses: readonly ExpenseWithCategoryCode[];
  totalMonthly: number;
  companionModeAvailable: boolean;
  companions: readonly DistributionCompanion[];
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
    <div className="rounded-xl border border-border bg-surface px-3 py-2 text-sm shadow-sm">
      <p className="font-medium text-text-primary">{slice.label}</p>
      <p className="tabular-nums text-text-secondary">
        {formatEuroAmount(slice.amount)}
        <span className="text-text-muted"> · {slice.percent}%</span>
      </p>
    </div>
  );
}

function ModeToggle({
  mode,
  companionModeAvailable,
  onChange,
}: {
  mode: DistributionMode;
  companionModeAvailable: boolean;
  onChange: (next: DistributionMode) => void;
}) {
  const categoriesRef = useRef<HTMLButtonElement>(null);
  const companionHadFocusRef = useRef(false);

  useLayoutEffect(() => {
    if (companionModeAvailable || !companionHadFocusRef.current) return;
    companionHadFocusRef.current = false;
    categoriesRef.current?.focus();
  }, [companionModeAvailable]);

  return (
    <div role="group" aria-label="Modalità distribuzione" className="home-view-toggle">
      <button
        ref={categoriesRef}
        type="button"
        aria-pressed={mode === 'categories'}
        onClick={() => onChange('categories')}
        className={`home-view-toggle-option${mode === 'categories' ? ' home-view-toggle-option--active' : ''}`}
      >
        Categorie
      </button>
      <button
        type="button"
        aria-pressed={mode === 'expenses'}
        onClick={() => onChange('expenses')}
        className={`home-view-toggle-option${mode === 'expenses' ? ' home-view-toggle-option--active' : ''}`}
      >
        Spese
      </button>
      {companionModeAvailable ? (
        <button
          type="button"
          aria-pressed={mode === 'companions'}
          onClick={() => onChange('companions')}
          onFocus={() => {
            companionHadFocusRef.current = true;
          }}
          onBlur={(event) => {
            if (event.currentTarget.isConnected) {
              companionHadFocusRef.current = false;
            }
          }}
          className={`home-view-toggle-option${mode === 'companions' ? ' home-view-toggle-option--active' : ''}`}
        >
          Accompagnatori
        </button>
      ) : null}
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
          <span className="min-w-0 truncate text-sm text-text-secondary" title={slice.label}>
            {slice.label}
          </span>
          <span className="whitespace-nowrap text-left text-sm font-medium tabular-nums text-text-primary">
            {formatEuroAmount(slice.amount)}
          </span>
          <span className="whitespace-nowrap pl-3 text-left text-xs tabular-nums text-text-muted">
            {slice.percent}%
          </span>
        </li>
      ))}
    </ul>
  );
}

export const ExpenseDistributionCard = memo(function ExpenseDistributionCard({
  expenses,
  totalMonthly,
  companionModeAvailable,
  companions,
}: ExpenseDistributionCardProps) {
  const [mode, setMode] = useState<DistributionMode>('categories');
  const activeMode: DistributionMode =
    mode === 'companions' && !companionModeAvailable ? 'categories' : mode;
  const companionCatalog = activeMode === 'companions' ? companions : NO_DISTRIBUTION_COMPANIONS;

  useLayoutEffect(() => {
    if (companionModeAvailable || mode !== 'companions') return;
    setMode('categories');
  }, [companionModeAvailable, mode]);

  const slices = useMemo(() => {
    if (activeMode === 'companions') {
      return buildExpenseDistribution({
        mode: 'companions',
        expenses,
        totalMonthly,
        companions: companionCatalog,
      });
    }
    return buildExpenseDistribution({ mode: activeMode, expenses, totalMonthly });
  }, [activeMode, expenses, totalMonthly, companionCatalog]);
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
          <h2 className="min-w-0 truncate text-sm font-medium text-text-muted">Distribuzione spese</h2>
        </div>
        <ModeToggle mode={activeMode} companionModeAvailable={companionModeAvailable} onChange={setMode} />
      </div>

      {isEmpty ? (
        <p className="flex min-h-[8.75rem] items-center justify-center text-sm text-text-muted">
          Nessuna spesa questo mese
        </p>
      ) : (
        <div className="mt-3 flex min-w-0 items-center gap-3 md:gap-5">
          <div className="relative isolate h-[132px] w-[132px] shrink-0 sm:h-[148px] sm:w-[148px]">
            <div className="pointer-events-none absolute inset-0 z-0 flex flex-col items-center justify-center">
              <p className="text-sm font-bold tabular-nums tracking-tight text-text-primary sm:text-base">
                {formatEuroAmount(totalMonthly)}
              </p>
              <p className="text-[10px] font-medium text-text-muted sm:text-xs">Totale</p>
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
});
