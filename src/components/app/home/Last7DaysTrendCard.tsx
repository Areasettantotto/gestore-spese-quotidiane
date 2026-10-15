import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { format, parse } from 'date-fns';
import { it } from 'date-fns/locale';
import { ChevronDown, TrendingUp, X } from 'lucide-react';
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

import { ExpenseCompanionBadge } from '@/src/components/app/ExpenseCompanionBadge';
import {
  buildTrendYScale,
  cleanScaleNumber,
  decimalsForStep,
} from '@/src/components/app/home/last7DaysTrendYScale';
import { resolveExpenseCompanionPresentation } from '@/src/features/companions/expenseCompanionPresentation';
import {
  CATEGORY_CODES,
  expenseCategoryByCode,
  isCategoryCode,
} from '@/src/features/expenses/expenseCategoryCatalog';
import {
  allocateIntegerPercents,
  ALTRE_CATEGORIE_LABEL,
} from '@/src/features/expenses/expenseDistribution';
import type { ExpenseWithCategoryCode } from '@/src/features/expenses/expenses.types';
import {
  ALTRE_CATEGORIE_KEY,
  listTrendDayExpenses,
  type Last7DaysCategoryKey,
  type Last7DaysTrendPoint,
} from '@/src/features/expenses/last7DaysTrend';

type Last7DaysTrendCardProps = {
  points: readonly Last7DaysTrendPoint[];
  expenses: readonly ExpenseWithCategoryCode[];
  companionDisplayNamesById: ReadonlyMap<string, string> | null;
};

type DayDetailMode = 'categories' | 'expenses';

const EMERALD_BAR = '#10b981';
const ALTRE_CATEGORIE_COLOR = '#94a3b8';
const STACK_CATEGORY_KEYS = [...CATEGORY_CODES, ALTRE_CATEGORIE_KEY] as const;
const FINE_HOVER_QUERY = '(hover: hover) and (pointer: fine)';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
/** Ignore subpixel rounding so a title that fits does not start a reveal. */
const TITLE_OVERFLOW_TOLERANCE_PX = 1;
/**
 * Hairline between expense rows only. `divide-y` paints a 1px bottom border
 * on every row except the last, so nothing sits above the first expense and
 * nothing trails the last.
 */
const EXPENSE_LIST_DIVIDERS = 'divide-y divide-border';

/**
 * 12px on the inner side of that hairline. The border is the row's bottom
 * edge, so this padding is what separates it from the previous expense
 * (including a Companion badge) and from the next one. `space-y` is not
 * combined with it: that margin would sit below the border and stack a
 * second gap. The first row keeps no top padding and the last no bottom padding.
 */
const EXPENSE_ROW_CLASS = 'flex min-w-0 items-start gap-2 py-3 first:pt-0 last:pb-0';

/**
 * Desktop inspector scroller only. The list otherwise uses the native
 * scrollbar. Standard properties cover engines that ignore WebKit pseudos
 * (`thin` is their narrowest usable width). The pseudos ask for a 6px thumb
 * where the browser honors them. The thumb uses the faint text token.
 */
const INSPECTOR_EXPENSE_SCROLLBAR_CLASS =
  '[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-text-faint [&::-webkit-scrollbar-thumb:hover]:bg-text-muted';

const INSPECTOR_EXPENSE_SCROLLBAR_STYLE = {
  scrollbarWidth: 'thin' as const,
  scrollbarColor: 'var(--color-text-faint) transparent',
};

function presentationLabelForCategoryKey(key: Last7DaysCategoryKey): string {
  if (key === ALTRE_CATEGORIE_KEY || !isCategoryCode(key)) return ALTRE_CATEGORIE_LABEL;
  return expenseCategoryByCode(key).presentationLabel;
}

function colorForCategoryKey(key: Last7DaysCategoryKey): string {
  if (key === ALTRE_CATEGORIE_KEY || !isCategoryCode(key)) return ALTRE_CATEGORIE_COLOR;
  return expenseCategoryByCode(key).color;
}

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

function usePrefersReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(REDUCED_MOTION_QUERY).matches;
  });

  useEffect(() => {
    const media = window.matchMedia(REDUCED_MOTION_QUERY);
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  return reducedMotion;
}

function titleRevealDurationMs(overflowPx: number): number {
  return Math.min(900, Math.max(280, overflowPx * 7));
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
      if (item.key in segments) {
        segments[item.key] += item.amount;
      } else {
        segments[ALTRE_CATEGORIE_KEY] += item.amount;
      }
    }
  }

  return {
    ...point,
    baseAmount: isActive ? 0 : point.amount,
    ...segments,
  };
}

function expenseRowLabel(expense: ExpenseWithCategoryCode): string {
  const trimmed = expense.description.trim();
  if (trimmed.length > 0) return trimmed;
  return expenseCategoryByCode(expense.categoryCode).presentationLabel;
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
      {point.categories.map((item, index) => {
        const label = presentationLabelForCategoryKey(item.key);
        return (
          <li key={item.key} className="flex min-w-0 items-center gap-2">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: colorForCategoryKey(item.key) }}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 truncate text-text-secondary">{label}</span>
            <span className="whitespace-nowrap tabular-nums text-zinc-600 dark:text-text-secondary">
              {formatEuroAmount(item.amount)}
              {percents[index] != null ? (
                <span className="text-text-faint"> · {percents[index]}%</span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function DayExpenseList({
  expenses,
  companionDisplayNamesById,
}: {
  expenses: readonly ExpenseWithCategoryCode[];
  companionDisplayNamesById: ReadonlyMap<string, string> | null;
}) {
  if (expenses.length === 0) return null;

  return (
    <ul className={`min-w-0 ${EXPENSE_LIST_DIVIDERS}`}>
      {expenses.map((expense) => {
        const catalog = expenseCategoryByCode(expense.categoryCode);
        return (
          <li key={expense.id} className={EXPENSE_ROW_CLASS}>
            <span
              className="mt-1.5 size-2 shrink-0 rounded-full"
              style={{ backgroundColor: catalog.color }}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1">
              <span className="block break-words text-text-secondary">{expenseRowLabel(expense)}</span>
              <span className="block text-xs text-text-muted">{catalog.presentationLabel}</span>
              <ExpenseCompanionBadge
                presentation={resolveExpenseCompanionPresentation(
                  expense.companionId,
                  companionDisplayNamesById,
                )}
              />
            </span>
            <span className="shrink-0 whitespace-nowrap tabular-nums text-zinc-600 dark:text-text-secondary">
              {formatEuroAmount(expense.amount)}
            </span>
          </li>
        );
      })}
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
    <div role="group" aria-label="Dettaglio giornaliero" className="home-view-toggle">
      <button
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
    </div>
  );
}

function TrendDetail({ point }: { point: Last7DaysTrendPoint }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2 text-sm shadow-sm">
      <p className="font-medium text-text-primary">{formatTooltipDate(point.dateKey)}</p>
      <p className="tabular-nums text-text-secondary">{formatEuroAmount(point.amount)}</p>
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
  companionDisplayNamesById,
  detailMode,
  onDetailModeChange,
}: {
  point: Last7DaysTrendPoint;
  dayExpenses: readonly ExpenseWithCategoryCode[];
  companionDisplayNamesById: ReadonlyMap<string, string> | null;
  detailMode: DayDetailMode;
  onDetailModeChange: (next: DayDetailMode) => void;
}) {
  return (
    <div className="home-trend-day-detail mt-2 px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-text-primary">{formatTooltipDate(point.dateKey)}</p>
          <p className="tabular-nums text-text-secondary">{formatEuroAmount(point.amount)}</p>
        </div>
        <DayDetailModeToggle mode={detailMode} onChange={onDetailModeChange} />
      </div>
      <div className="mt-2">
        {detailMode === 'categories' ? (
          <CategoryBreakdownList point={point} />
        ) : (
          <DayExpenseList
            expenses={dayExpenses}
            companionDisplayNamesById={companionDisplayNamesById}
          />
        )}
      </div>
    </div>
  );
}

const INSPECTOR_SECTION_TITLE = 'text-[11px] font-semibold uppercase tracking-wider text-text-faint';
const INSPECTOR_EMPTY = 'mt-2 text-xs text-text-faint';

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
        const color = colorForCategoryKey(item.key);
        const label = presentationLabelForCategoryKey(item.key);
        const percent = percents[index] ?? 0;
        return (
          <li
            key={item.key}
            className="min-w-0"
            aria-label={`${label}: ${formatEuroAmount(item.amount)}, ${percent}%`}
          >
            <div className="flex min-w-0 items-center gap-2">
              <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-text-secondary" title={label}>
                {label}
              </span>
              <span className="whitespace-nowrap font-medium tabular-nums text-text-primary">
                {formatEuroAmount(item.amount)}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2 pl-4" aria-hidden="true">
              <span className="home-trend-progress-track">
                <span className="block h-full rounded-full" style={{ width: `${percent}%`, backgroundColor: color }} />
              </span>
              <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-text-faint">{percent}%</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

const DESKTOP_TITLE_CLASS =
  'block min-w-0 rounded-sm text-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring-focus/40 dark:text-text-primary';

/**
 * Desktop inspector title. Stays truncated until the rendered text actually
 * overflows. A fine pointer slides that text once, by the measured overflow,
 * and holds there. Keyboard focus wraps the full description, and reduced
 * motion uses that same wrap instead of sliding. The title box does not
 * change width, so the slide leaves the amount, category, and badge put.
 */
function DesktopExpenseTitle({
  label,
  fineHover,
  reducedMotion,
}: {
  label: string;
  fineHover: boolean;
  reducedMotion: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const fullWidthRef = useRef(0);
  const slideRef = useRef(false);
  const wrapRef = useRef(false);
  const fineHoverRef = useRef(fineHover);
  const suppressFocusRevealRef = useRef(false);
  const [overflowPx, setOverflowPx] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  const canReveal = overflowPx > 0;
  // Hover slides without reflow. Focus wraps the whole description; reduced
  // motion uses that wrap for hover as well, with no text movement.
  const slideReveal = hovered && !focused && canReveal && fineHover && !reducedMotion;
  const wrapReveal = canReveal && (focused || (hovered && (reducedMotion || !fineHover)));

  fineHoverRef.current = fineHover;
  slideRef.current = slideReveal;
  wrapRef.current = wrapReveal;

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;

    const measure = () => {
      if (wrapRef.current) return;
      const visible = node.clientWidth;
      if (visible <= 0) {
        setOverflowPx((current) => (current === 0 ? current : 0));
        return;
      }

      const full = slideRef.current ? fullWidthRef.current : node.scrollWidth;
      if (!slideRef.current) fullWidthRef.current = node.scrollWidth;
      const next = full - visible > TITLE_OVERFLOW_TOLERANCE_PX ? full - visible : 0;
      setOverflowPx((current) => (current === next ? current : next));
      if (next > 0 && fineHoverRef.current && node.matches(':hover')) {
        setHovered(true);
      }
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    let cancelled = false;
    const fontsReady = document.fonts?.ready;
    if (fontsReady) {
      void fontsReady.then(() => {
        if (!cancelled) measure();
      });
    }
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [label]);

  return (
    <span
      ref={ref}
      className={wrapReveal ? `${DESKTOP_TITLE_CLASS} break-words` : `${DESKTOP_TITLE_CLASS} truncate`}
      style={
        !wrapReveal && canReveal && fineHover && !reducedMotion
          ? {
              textIndent: slideReveal ? `-${overflowPx}px` : '0px',
              textOverflow: slideReveal ? 'clip' : undefined,
              transition: `text-indent ${titleRevealDurationMs(overflowPx)}ms ease-out`,
            }
          : undefined
      }
      tabIndex={canReveal ? 0 : undefined}
      onPointerEnter={() => {
        if (!fineHover || overflowPx === 0) return;
        setHovered(true);
      }}
      onPointerLeave={() => setHovered(false)}
      onPointerDown={(event) => {
        // Pointer clicks must not pin the reveal. Keyboard focus still slides or wraps it.
        if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
        suppressFocusRevealRef.current = true;
        event.preventDefault();
      }}
      onPointerUp={() => {
        suppressFocusRevealRef.current = false;
      }}
      onFocus={() => {
        if (overflowPx === 0 || suppressFocusRevealRef.current) {
          suppressFocusRevealRef.current = false;
          return;
        }
        setFocused(true);
      }}
      onBlur={() => {
        suppressFocusRevealRef.current = false;
        setFocused(false);
      }}
    >
      {label}
    </span>
  );
}

function InspectorExpenseList({
  expenses,
  companionDisplayNamesById,
}: {
  expenses: readonly ExpenseWithCategoryCode[];
  companionDisplayNamesById: ReadonlyMap<string, string> | null;
}) {
  const fineHover = useFineHover();
  const reducedMotion = usePrefersReducedMotion();

  if (expenses.length === 0) {
    return <p className={INSPECTOR_EMPTY}>Nessuna spesa</p>;
  }

  return (
    <ul
      className={`-mr-1 mt-2 max-h-56 min-h-0 min-w-0 flex-1 overflow-y-auto pb-1 pr-1 md:max-h-none ${EXPENSE_LIST_DIVIDERS} ${INSPECTOR_EXPENSE_SCROLLBAR_CLASS}`}
      style={INSPECTOR_EXPENSE_SCROLLBAR_STYLE}
    >
      {expenses.map((expense) => {
        const label = expenseRowLabel(expense);
        const catalog = expenseCategoryByCode(expense.categoryCode);
        return (
          <li key={expense.id} className={EXPENSE_ROW_CLASS}>
            <span
              className="mt-1.5 size-2 shrink-0 rounded-full"
              style={{ backgroundColor: catalog.color }}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1">
              <DesktopExpenseTitle label={label} fineHover={fineHover} reducedMotion={reducedMotion} />
              <span className="block text-xs text-text-muted">{catalog.presentationLabel}</span>
              <ExpenseCompanionBadge
                presentation={resolveExpenseCompanionPresentation(
                  expense.companionId,
                  companionDisplayNamesById,
                )}
              />
            </span>
            <span className="shrink-0 whitespace-nowrap font-medium tabular-nums text-text-primary">
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
 * Categorie starts expanded and can collapse. The Spese list takes the remaining
 * height and scrolls, including the space freed when Categorie is collapsed.
 */
function DesktopDayInspector({
  point,
  dayExpenses,
  companionDisplayNamesById,
  onClose,
}: {
  point: Last7DaysTrendPoint;
  dayExpenses: readonly ExpenseWithCategoryCode[];
  companionDisplayNamesById: ReadonlyMap<string, string> | null;
  onClose: () => void;
}) {
  const [categoriesExpanded, setCategoriesExpanded] = useState(true);
  const categoriesPanelId = useId();

  return (
    <aside
      aria-label={`Dettaglio giorno ${point.label}`}
      className="home-trend-inspector flex min-w-0 flex-col p-3 text-sm md:absolute md:inset-0 md:overflow-hidden"
    >
      <div className="flex shrink-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-zinc-800 dark:text-text-primary">{point.label}</p>
          <p className="mt-0.5 text-lg font-bold tabular-nums tracking-tight text-text-primary">
            {formatEuroAmount(point.amount)}
          </p>
          <p className="text-[11px] text-text-muted">Totale giorno</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Chiudi dettaglio giorno"
          className="-mr-1 -mt-1 shrink-0 rounded-full p-1.5 text-text-faint transition-colors hover:bg-zinc-200/60 hover:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-focus/40 dark:hover:bg-zinc-800"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      <section className="mt-3 shrink-0 border-t border-zinc-200/70 pt-3 dark:border-border">
        <h3>
          <button
            type="button"
            aria-expanded={categoriesExpanded}
            aria-controls={categoriesPanelId}
            onClick={() => setCategoriesExpanded((current) => !current)}
            className={`${INSPECTOR_SECTION_TITLE} flex w-full items-center justify-between gap-2 rounded-md text-left hover:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring-focus/40`}
          >
            <span>Categorie</span>
            <ChevronDown
              size={14}
              aria-hidden="true"
              className={`shrink-0 transition-transform duration-150 ${categoriesExpanded ? '' : '-rotate-90'}`}
            />
          </button>
        </h3>
        <div id={categoriesPanelId} hidden={!categoriesExpanded}>
          <InspectorCategoryList point={point} />
        </div>
      </section>

      <section className="mt-3 flex min-h-0 min-w-0 flex-1 flex-col border-t border-zinc-200/70 pt-3 dark:border-border">
        <h3 className={`${INSPECTOR_SECTION_TITLE} shrink-0`}>Spese</h3>
        <InspectorExpenseList
          expenses={dayExpenses}
          companionDisplayNamesById={companionDisplayNamesById}
        />
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
  expenses: readonly ExpenseWithCategoryCode[]
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
    <div className="home-trend-stat-tile">
      <dt className="truncate text-[11px] font-medium text-text-muted">
        {labelHighlight ? (
          <>
            {label}: <span className="font-semibold text-text-secondary">{labelHighlight}</span>
          </>
        ) : (
          label
        )}
      </dt>
      <dd className="mt-2 min-w-0">
        <span className="block truncate text-xl font-semibold tabular-nums tracking-tight text-text-primary">
          {value}
        </span>
      </dd>
    </div>
  );
}

function TrendWindowSummaryPanel({ summary }: { summary: TrendWindowSummary }) {
  return (
    <section aria-label="Riepilogo 7 giorni" className="mt-3 border-t border-border-subtle pt-3">
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

export function Last7DaysTrendCard({
  points,
  expenses,
  companionDisplayNamesById,
}: Last7DaysTrendCardProps) {
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
        <h2 className="min-w-0 truncate text-sm font-medium text-text-muted">Ultimi 7 giorni</h2>
      </div>

      {isEmpty ? (
        <p className="mt-3 flex min-h-[12rem] items-center justify-center text-sm text-text-muted">
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
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="var(--home-trend-grid-stroke, #e4e4e7)"
                    />
                    <XAxis
                      dataKey="label"
                      axisLine={false}
                      tickLine={false}
                      interval={0}
                      minTickGap={0}
                      tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }}
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
                      tick={{ fontSize: 10, fill: 'var(--color-text-faint)' }}
                      tickFormatter={(value: number) => formatTrendYTick(value, yScale.step)}
                    />
                    {fineHover ? (
                      <Tooltip
                        content={(props) => <TrendTooltip {...props} hiddenDateKey={selectedDateKey} />}
                        cursor={{ fill: 'var(--home-trend-cursor-fill, #f4f4f5)' }}
                        wrapperStyle={{ zIndex: 20, pointerEvents: 'none' }}
                        isAnimationActive={false}
                        allowEscapeViewBox={{ x: true, y: true }}
                      />
                    ) : (
                      <Tooltip
                        content={() => null}
                        cursor={{ fill: 'var(--home-trend-cursor-fill, #f4f4f5)' }}
                        isAnimationActive={false}
                      />
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
                          fill={colorForCategoryKey(key)}
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
                  companionDisplayNamesById={companionDisplayNamesById}
                  onClose={() => setSelectedDateKey(null)}
                />
              </div>
            ) : null}
          </div>
          {showMobileDetail && selectedPoint ? (
            <MobileDayDetail
              point={selectedPoint}
              dayExpenses={selectedDayExpenses}
              companionDisplayNamesById={companionDisplayNamesById}
              detailMode={detailMode}
              onDetailModeChange={setDetailMode}
            />
          ) : null}
        </>
      )}
    </motion.section>
  );
}
