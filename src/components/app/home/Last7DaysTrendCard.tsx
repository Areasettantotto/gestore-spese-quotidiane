import { useEffect, useMemo, useState } from 'react';
import { format, parse } from 'date-fns';
import { it } from 'date-fns/locale';
import { TrendingUp, X } from 'lucide-react';
import { motion } from 'motion/react';
import {
  Bar,
  BarChart,
  BarStack,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import {
  allocateIntegerPercents,
  ALTRE_CATEGORIE_LABEL,
  colorForCategorySegment,
} from '@/src/features/expenses/expenseDistribution';
import { listTrendDayExpenses, type Last7DaysTrendPoint } from '@/src/features/expenses/last7DaysTrend';
import { CATEGORIES, type Expense } from '@/src/types';
import {
  buildTrendYScale,
  cleanScaleNumber,
  decimalsForStep,
} from '@/src/components/app/home/last7DaysTrendYScale';

type Last7DaysTrendCardProps = {
  points: readonly Last7DaysTrendPoint[];
  expenses: readonly Expense[];
};

type DayDetailMode = 'categories' | 'expenses';

const EMERALD_BAR = '#10b981';
const STACK_CATEGORY_KEYS = [...CATEGORIES, ALTRE_CATEGORIE_LABEL] as const;
const FINE_HOVER_QUERY = '(hover: hover) and (pointer: fine)';

function formatTrendYTick(value: number, step: number): string {
  const cleaned = cleanScaleNumber(value);
  if (cleaned === 0) return '0';
  return cleaned.toLocaleString('it-IT', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimalsForStep(step),
  });
}

type DayBarRow = Last7DaysTrendPoint & {
  baseAmount: number;
} & { [K in (typeof STACK_CATEGORY_KEYS)[number]]: number };

function formatEuroAmount(value: number): string {
  return `€${value.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatTooltipDate(dateKey: string): string {
  const parsed = parse(dateKey, 'yyyy-MM-dd', new Date());
  const formatted = format(parsed, 'EEEE d MMMM yyyy', { locale: it });
  if (formatted.length === 0) return formatted;
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function useFineHover(): boolean {
  const [fineHover, setFineHover] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(FINE_HOVER_QUERY).matches;
  });

  useEffect(() => {
    const media = window.matchMedia(FINE_HOVER_QUERY);
    const sync = () => setFineHover(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  return fineHover;
}

function chartIndexFromState(activeIndex: unknown): number | null {
  const index = typeof activeIndex === 'number' ? activeIndex : Number(activeIndex);
  return Number.isInteger(index) && index >= 0 ? index : null;
}

/** `isActive` = show the stacked category breakdown instead of the flat emerald bar. */
function toBarRow(point: Last7DaysTrendPoint, isActive: boolean): DayBarRow {
  const segments = Object.fromEntries(STACK_CATEGORY_KEYS.map((key) => [key, 0])) as {
    [K in (typeof STACK_CATEGORY_KEYS)[number]]: number;
  };

  if (isActive) {
    for (const item of point.categories) {
      if (item.category in segments) {
        segments[item.category as (typeof STACK_CATEGORY_KEYS)[number]] += item.amount;
      } else {
        segments[ALTRE_CATEGORIE_LABEL] += item.amount;
      }
    }
  }

  return {
    ...point,
    baseAmount: isActive ? 0 : point.amount,
    ...segments,
  };
}

function expenseRowLabel(expense: Expense): string {
  const trimmed = expense.description.trim();
  return trimmed.length > 0 ? trimmed : expense.category;
}

function CategoryBreakdownList({ point }: { point: Last7DaysTrendPoint }) {
  const percents =
    point.amount > 0
      ? allocateIntegerPercents(
          point.categories.map((item) => item.amount),
          point.amount
        )
      : [];

  if (point.categories.length === 0) return null;

  return (
    <ul className="space-y-1">
      {point.categories.map((item, index) => (
        <li key={item.category} className="flex min-w-0 items-center gap-2">
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: colorForCategorySegment(item.category) }}
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1 truncate text-zinc-700">{item.category}</span>
          <span className="whitespace-nowrap tabular-nums text-zinc-600">
            {formatEuroAmount(item.amount)}
            {percents[index] != null ? (
              <span className="text-zinc-400"> · {percents[index]}%</span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

function DayExpenseList({ expenses }: { expenses: readonly Expense[] }) {
  if (expenses.length === 0) return null;

  return (
    <ul className="space-y-1.5">
      {expenses.map((expense) => (
        <li key={expense.id} className="flex min-w-0 items-start gap-2">
          <span
            className="mt-1.5 size-2 shrink-0 rounded-full"
            style={{ backgroundColor: colorForCategorySegment(expense.category) }}
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1">
            <span className="block break-words text-zinc-700">{expenseRowLabel(expense)}</span>
            <span className="block text-xs text-zinc-500">{expense.category}</span>
          </span>
          <span className="whitespace-nowrap tabular-nums text-zinc-600">
            {formatEuroAmount(expense.amount)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function DayDetailModeToggle({
  mode,
  onChange,
}: {
  mode: DayDetailMode;
  onChange: (next: DayDetailMode) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Dettaglio giornaliero"
      className="inline-flex shrink-0 rounded-lg bg-zinc-100 p-0.5"
    >
      <button
        type="button"
        aria-pressed={mode === 'categories'}
        onClick={() => onChange('categories')}
        className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 ${
          mode === 'categories' ? 'bg-white text-emerald-700 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
        }`}
      >
        Categorie
      </button>
      <button
        type="button"
        aria-pressed={mode === 'expenses'}
        onClick={() => onChange('expenses')}
        className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 ${
          mode === 'expenses' ? 'bg-white text-emerald-700 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
        }`}
      >
        Spese
      </button>
    </div>
  );
}

function TrendDetail({ point }: { point: Last7DaysTrendPoint }) {
  return (
    <div className="rounded-xl border-none bg-white px-3 py-2 text-sm shadow-[0_4px_12px_rgba(0,0,0,0.1)]">
      <p className="font-medium text-zinc-900">{formatTooltipDate(point.dateKey)}</p>
      <p className="tabular-nums text-zinc-600">{formatEuroAmount(point.amount)}</p>
      {point.categories.length > 0 ? (
        <div className="mt-1.5">
          <CategoryBreakdownList point={point} />
        </div>
      ) : null}
    </div>
  );
}

/** Touch / coarse-pointer detail (approved UI-35 mobile version — keep as is). */
function MobileDayDetail({
  point,
  dayExpenses,
  detailMode,
  onDetailModeChange,
}: {
  point: Last7DaysTrendPoint;
  dayExpenses: readonly Expense[];
  detailMode: DayDetailMode;
  onDetailModeChange: (next: DayDetailMode) => void;
}) {
  return (
    <div className="mt-2 rounded-xl border-none bg-white px-3 py-2 text-sm shadow-[0_4px_12px_rgba(0,0,0,0.1)]">
      <p className="font-medium text-zinc-900">{formatTooltipDate(point.dateKey)}</p>
      <p className="tabular-nums text-zinc-600">{formatEuroAmount(point.amount)}</p>
      <div className="mt-2">
        <DayDetailModeToggle mode={detailMode} onChange={onDetailModeChange} />
      </div>
      <div className="mt-2">
        {detailMode === 'categories' ? (
          <CategoryBreakdownList point={point} />
        ) : (
          <DayExpenseList expenses={dayExpenses} />
        )}
      </div>
    </div>
  );
}

const INSPECTOR_SECTION_TITLE = 'text-[11px] font-semibold uppercase tracking-wider text-zinc-400';
const INSPECTOR_EMPTY = 'mt-2 text-xs text-zinc-400';

function InspectorCategoryList({ point }: { point: Last7DaysTrendPoint }) {
  if (point.categories.length === 0) {
    return <p className={INSPECTOR_EMPTY}>Nessuna spesa</p>;
  }

  const percents =
    point.amount > 0
      ? allocateIntegerPercents(
          point.categories.map((item) => item.amount),
          point.amount
        )
      : point.categories.map(() => 0);

  return (
    <ul className="mt-2 space-y-2">
      {point.categories.map((item, index) => {
        const color = colorForCategorySegment(item.category);
        const percent = percents[index] ?? 0;
        return (
          <li
            key={item.category}
            className="min-w-0"
            aria-label={`${item.category}: ${formatEuroAmount(item.amount)}, ${percent}%`}
          >
            <div className="flex min-w-0 items-center gap-2">
              <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-zinc-700" title={item.category}>
                {item.category}
              </span>
              <span className="whitespace-nowrap font-medium tabular-nums text-zinc-900">
                {formatEuroAmount(item.amount)}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2 pl-4" aria-hidden="true">
              <span className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-zinc-200/70">
                <span className="block h-full rounded-full" style={{ width: `${percent}%`, backgroundColor: color }} />
              </span>
              <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-zinc-400">{percent}%</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function InspectorExpenseList({ expenses }: { expenses: readonly Expense[] }) {
  if (expenses.length === 0) {
    return <p className={INSPECTOR_EMPTY}>Nessuna spesa</p>;
  }

  return (
    <ul className="-mr-1 mt-2 max-h-56 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 md:max-h-none">
      {expenses.map((expense) => {
        const label = expenseRowLabel(expense);
        return (
          <li key={expense.id} className="flex min-w-0 items-start gap-2">
            <span
              className="mt-1.5 size-2 shrink-0 rounded-full"
              style={{ backgroundColor: colorForCategorySegment(expense.category) }}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-zinc-800" title={label}>
                {label}
              </span>
              <span className="block text-xs text-zinc-500">{expense.category}</span>
            </span>
            <span className="whitespace-nowrap font-medium tabular-nums text-zinc-900">
              {formatEuroAmount(expense.amount)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Fine-pointer side inspector for the pinned day. Lives inside the card, next to the chart.
 * From `md` up it fills its grid cell absolutely: the row height is dictated by the left
 * column only, so the box ends exactly where chart + summary end and never grows past it.
 * Header and Categorie stay fixed; the Spese list takes the remaining height and scrolls.
 */
function DesktopDayInspector({
  point,
  dayExpenses,
  onClose,
}: {
  point: Last7DaysTrendPoint;
  dayExpenses: readonly Expense[];
  onClose: () => void;
}) {
  return (
    <aside
      aria-label={`Dettaglio giorno ${point.label}`}
      className="flex min-w-0 flex-col rounded-xl border border-zinc-100 bg-zinc-50/70 p-3 text-sm md:absolute md:inset-0 md:overflow-hidden"
    >
      <div className="flex shrink-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-zinc-800">{point.label}</p>
          <p className="mt-0.5 text-lg font-bold tabular-nums tracking-tight text-zinc-900">
            {formatEuroAmount(point.amount)}
          </p>
          <p className="text-[11px] text-zinc-500">Totale giorno</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Chiudi dettaglio giorno"
          className="-mr-1 -mt-1 shrink-0 rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-zinc-200/60 hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      <section className="mt-3 shrink-0 border-t border-zinc-200/70 pt-3">
        <h3 className={INSPECTOR_SECTION_TITLE}>Categorie</h3>
        <InspectorCategoryList point={point} />
      </section>

      <section className="mt-3 flex min-h-0 flex-1 flex-col border-t border-zinc-200/70 pt-3">
        <h3 className={`${INSPECTOR_SECTION_TITLE} shrink-0`}>Spese</h3>
        <InspectorExpenseList expenses={dayExpenses} />
      </section>
    </aside>
  );
}

function TrendTooltip({
  active,
  payload,
  hiddenDateKey,
}: {
  active?: boolean;
  payload?: Array<{ payload: Last7DaysTrendPoint }>;
  /** Desktop: the pinned day is already detailed in the inspector, so its tooltip is redundant. */
  hiddenDateKey?: string | null;
}) {
  if (!active || !payload?.[0]) return null;
  const point = payload[0].payload;
  if (hiddenDateKey != null && point.dateKey === hiddenDateKey) return null;
  return <TrendDetail point={point} />;
}

type TrendWindowSummary = {
  total: number;
  average: number;
  peak: Last7DaysTrendPoint | null;
  expenseCount: number;
};

/**
 * Period context for the desktop layout. Average divides by the calendar
 * window (7 points, zero days included). Peak tie-break = most recent day.
 */
function buildTrendWindowSummary(
  points: readonly Last7DaysTrendPoint[],
  expenses: readonly Expense[]
): TrendWindowSummary {
  const total = points.reduce((sum, point) => sum + point.amount, 0);
  let peak: Last7DaysTrendPoint | null = null;
  for (const point of points) {
    if (point.amount > 0 && (peak == null || point.amount >= peak.amount)) {
      peak = point;
    }
  }
  return {
    total,
    average: points.length > 0 ? total / points.length : 0,
    peak,
    expenseCount: expenses.length,
  };
}

/** Passive stat tile: small muted label on top (optional inline emphasis), large value below. */
function SummaryStatTile({
  label,
  labelHighlight,
  value,
}: {
  label: string;
  /** Rendered inline after `label:` in semibold — secondary context, never as large as the value. */
  labelHighlight?: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 flex-col rounded-xl border border-zinc-200/70 bg-zinc-50/70 p-3.5">
      <dt className="truncate text-[11px] font-medium text-zinc-500">
        {labelHighlight ? (
          <>
            {label}: <span className="font-semibold text-zinc-700">{labelHighlight}</span>
          </>
        ) : (
          label
        )}
      </dt>
      <dd className="mt-2 min-w-0">
        <span className="block truncate text-xl font-semibold tabular-nums tracking-tight text-zinc-900">
          {value}
        </span>
      </dd>
    </div>
  );
}

function TrendWindowSummaryPanel({ summary }: { summary: TrendWindowSummary }) {
  return (
    <section aria-label="Riepilogo 7 giorni" className="mt-3 border-t border-zinc-100 pt-3">
      <h3 className={INSPECTOR_SECTION_TITLE}>Riepilogo 7 giorni</h3>
      <dl className="mt-3 grid grid-cols-2 gap-3">
        <SummaryStatTile label="Totale 7 giorni" value={formatEuroAmount(summary.total)} />
        <SummaryStatTile label="Media giornaliera" value={formatEuroAmount(summary.average)} />
        <SummaryStatTile
          label="Giorno più alto"
          labelHighlight={summary.peak?.label}
          value={summary.peak ? formatEuroAmount(summary.peak.amount) : '—'}
        />
        <SummaryStatTile label="N. spese totali" value={String(summary.expenseCount)} />
      </dl>
    </section>
  );
}

export function Last7DaysTrendCard({ points, expenses }: Last7DaysTrendCardProps) {
  const isEmpty = points.reduce((sum, point) => sum + point.amount, 0) === 0;
  const fineHover = useFineHover();
  const [hoveredDateKey, setHoveredDateKey] = useState<string | null>(null);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [detailMode, setDetailMode] = useState<DayDetailMode>('categories');

  const selectedPoint = selectedDateKey ? (points.find((point) => point.dateKey === selectedDateKey) ?? null) : null;
  const selectedDayExpenses = useMemo(
    () => (selectedDateKey ? listTrendDayExpenses(expenses, selectedDateKey) : []),
    [expenses, selectedDateKey]
  );

  // Stacked breakdown: the pinned day (persistent) and, on fine pointer, the
  // hovered day (temporary). Both may be stacked at once while hovering.
  // hoveredDateKey is never set on coarse pointer, so mobile = selected only.
  const chartData = useMemo(
    () =>
      points.map((point) =>
        toBarRow(point, point.dateKey === selectedDateKey || point.dateKey === hoveredDateKey)
      ),
    [points, selectedDateKey, hoveredDateKey]
  );

  const yScale = useMemo(
    () => buildTrendYScale(points.map((point) => point.amount)),
    [points]
  );

  const activateIndex = (activeIndex: unknown) => {
    const index = chartIndexFromState(activeIndex);
    if (index == null || index >= points.length) return;
    setHoveredDateKey(points[index].dateKey);
  };

  const toggleIndex = (activeIndex: unknown) => {
    const index = chartIndexFromState(activeIndex);
    if (index == null || index >= points.length) return;
    const dateKey = points[index].dateKey;
    setSelectedDateKey((current) => (current === dateKey ? null : dateKey));
  };

  // Desktop: pinned day opens a side inspector; the chart keeps its height and
  // yields ~35% of the card width from `md` up (vertical fallback below).
  const showDesktopInspector = fineHover && selectedPoint != null;
  const showMobileDetail = !fineHover && selectedPoint != null;
  const windowSummary = useMemo(
    () => (showDesktopInspector ? buildTrendWindowSummary(points, expenses) : null),
    [showDesktopInspector, points, expenses]
  );

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      aria-label="Andamento spese ultimi 7 giorni"
      className="card min-w-0 w-full p-3 md:p-4"
    >
      <div className="flex min-w-0 items-center gap-2 md:gap-3">
        <div className="home-card-icon">
          <TrendingUp className="size-4 md:size-[18px]" aria-hidden="true" />
        </div>
        <h2 className="min-w-0 truncate text-sm font-medium text-zinc-500">Ultimi 7 giorni</h2>
      </div>

      {isEmpty ? (
        <p className="mt-3 flex min-h-[12rem] items-center justify-center text-sm text-zinc-500">
          Nessuna spesa negli ultimi 7 giorni
        </p>
      ) : (
        <>
          <div
            className={
              showDesktopInspector
                ? 'mt-3 grid min-w-0 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(13rem,35%)] md:items-stretch'
                : 'mt-3 min-w-0'
            }
          >
            <div className="min-w-0">
              <div className="h-48 w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                    onMouseMove={(state) => {
                      if (!fineHover) return;
                      activateIndex(state.activeIndex);
                    }}
                    onMouseLeave={() => {
                      setHoveredDateKey(null);
                    }}
                    onClick={(state) => {
                      toggleIndex(state.activeIndex);
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4e4e7" />
                    <XAxis
                      dataKey="label"
                      axisLine={false}
                      tickLine={false}
                      interval={0}
                      minTickGap={0}
                      tick={{ fontSize: 10, fill: '#71717a' }}
                    />
                    <YAxis
                      type="number"
                      domain={[0, yScale.max]}
                      ticks={yScale.ticks}
                      interval={0}
                      width="auto"
                      axisLine={false}
                      tickLine={false}
                      tickMargin={4}
                      tick={{ fontSize: 10, fill: '#a1a1aa' }}
                      tickFormatter={(value: number) => formatTrendYTick(value, yScale.step)}
                    />
                    {fineHover ? (
                      <Tooltip
                        content={(props) => <TrendTooltip {...props} hiddenDateKey={selectedDateKey} />}
                        cursor={{ fill: '#f4f4f5' }}
                        wrapperStyle={{ zIndex: 20, pointerEvents: 'none' }}
                        isAnimationActive={false}
                        allowEscapeViewBox={{ x: true, y: true }}
                      />
                    ) : (
                      <Tooltip content={() => null} cursor={{ fill: '#f4f4f5' }} isAnimationActive={false} />
                    )}
                    <BarStack radius={[4, 4, 0, 0]}>
                      <Bar
                        dataKey="baseAmount"
                        fill={EMERALD_BAR}
                        maxBarSize={36}
                        isAnimationActive={false}
                        legendType="none"
                      />
                      {STACK_CATEGORY_KEYS.map((key) => (
                        <Bar
                          key={key}
                          dataKey={key}
                          fill={colorForCategorySegment(key)}
                          maxBarSize={36}
                          isAnimationActive={false}
                          legendType="none"
                        />
                      ))}
                    </BarStack>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {windowSummary ? <TrendWindowSummaryPanel summary={windowSummary} /> : null}
            </div>
            {showDesktopInspector && selectedPoint ? (
              <div className="relative min-w-0">
                <DesktopDayInspector
                  point={selectedPoint}
                  dayExpenses={selectedDayExpenses}
                  onClose={() => setSelectedDateKey(null)}
                />
              </div>
            ) : null}
          </div>
          {showMobileDetail && selectedPoint ? (
            <MobileDayDetail
              point={selectedPoint}
              dayExpenses={selectedDayExpenses}
              detailMode={detailMode}
              onDetailModeChange={setDetailMode}
            />
          ) : null}
        </>
      )}
    </motion.section>
  );
}
