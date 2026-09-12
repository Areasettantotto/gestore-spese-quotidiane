import { useEffect, useMemo, useState } from 'react';
import { format, parse } from 'date-fns';
import { it } from 'date-fns/locale';
import { TrendingUp } from 'lucide-react';
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
import type { Last7DaysTrendPoint } from '@/src/features/expenses/last7DaysTrend';
import { CATEGORIES } from '@/src/types';

type Last7DaysTrendCardProps = {
  points: readonly Last7DaysTrendPoint[];
};

const EMERALD_BAR = '#10b981';
const STACK_CATEGORY_KEYS = [...CATEGORIES, ALTRE_CATEGORIE_LABEL] as const;
const FINE_HOVER_QUERY = '(hover: hover) and (pointer: fine)';

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

function toBarRow(point: Last7DaysTrendPoint, activeDateKey: string | null): DayBarRow {
  const isActive = activeDateKey === point.dateKey;
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

function TrendDetail({ point }: { point: Last7DaysTrendPoint }) {
  const percents =
    point.amount > 0 ? allocateIntegerPercents(
      point.categories.map((item) => item.amount),
      point.amount
    ) : [];

  return (
    <div className="rounded-xl border-none bg-white px-3 py-2 text-sm shadow-[0_4px_12px_rgba(0,0,0,0.1)]">
      <p className="font-medium text-zinc-900">{formatTooltipDate(point.dateKey)}</p>
      <p className="tabular-nums text-zinc-600">{formatEuroAmount(point.amount)}</p>
      {point.categories.length > 0 ? (
        <ul className="mt-1.5 space-y-1">
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
      ) : null}
    </div>
  );
}

function TrendTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: Last7DaysTrendPoint }>;
}) {
  if (!active || !payload?.[0]) return null;
  return <TrendDetail point={payload[0].payload} />;
}

export function Last7DaysTrendCard({ points }: Last7DaysTrendCardProps) {
  const isEmpty = points.reduce((sum, point) => sum + point.amount, 0) === 0;
  const fineHover = useFineHover();
  const [hoveredDateKey, setHoveredDateKey] = useState<string | null>(null);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);

  const activeDateKey = fineHover ? hoveredDateKey : selectedDateKey;
  const selectedPoint = selectedDateKey ? (points.find((point) => point.dateKey === selectedDateKey) ?? null) : null;

  const chartData = useMemo(
    () => points.map((point) => toBarRow(point, activeDateKey)),
    [points, activeDateKey]
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

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      aria-label="Andamento spese ultimi 7 giorni"
      className="card min-w-0 w-full p-3 md:p-4"
    >
      <div className="flex min-w-0 items-center gap-2 md:gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 md:h-9 md:w-9">
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
          <div className="mt-3 h-48 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 8, right: 12, left: 4, bottom: 0 }}
                onMouseMove={(state) => {
                  if (!fineHover) return;
                  activateIndex(state.activeIndex);
                }}
                onMouseLeave={() => {
                  setHoveredDateKey(null);
                }}
                onClick={(state) => {
                  if (fineHover) return;
                  toggleIndex(state.activeIndex);
                }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f4f4f5" />
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  interval={0}
                  minTickGap={0}
                  tick={{ fontSize: 10, fill: '#71717a' }}
                />
                <YAxis hide />
                {fineHover ? (
                  <Tooltip
                    content={TrendTooltip}
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
          {!fineHover && selectedPoint ? (
            <div className="mt-2">
              <TrendDetail point={selectedPoint} />
            </div>
          ) : null}
        </>
      )}
    </motion.section>
  );
}
