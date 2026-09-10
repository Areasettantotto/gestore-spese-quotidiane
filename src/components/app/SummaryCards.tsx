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
  categoryData: CategoryDataPoint[];
  dailyData: DailyDataPoint[];
  onOpenCurrentMonthExpenses: () => void;
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
    return <p className="mt-1 text-xs leading-snug text-zinc-500 sm:text-sm">Nessuna spesa questo mese</p>;
  }

  if (!(previousComparablePeriodTotal > 0)) {
    return (
      <p className="mt-1 text-xs leading-snug text-zinc-500 sm:text-sm">
        Nessuna spesa nello stesso periodo di {previousMonthName}
      </p>
    );
  }

  const percentageChange = ((currentPeriodTotal - previousComparablePeriodTotal) / previousComparablePeriodTotal) * 100;
  const roundedChange = Number(percentageChange.toFixed(1));

  const periodLabel = `vs stesso periodo di ${previousMonthName}`;

  if (roundedChange === 0) {
    return (
      <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs leading-snug sm:text-sm">
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
      className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs leading-snug sm:text-sm"
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

export function SummaryCards({
  totalMonthly,
  currentPeriodTotal,
  previousComparablePeriodTotal,
  previousMonthName,
  categoryData,
  dailyData,
  onOpenCurrentMonthExpenses,
}: SummaryCardsProps) {
  return (
    <>
      <div className="grid grid-cols-1 items-start md:grid-cols-2 gap-4">
        <motion.button
          type="button"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={onOpenCurrentMonthExpenses}
          aria-label="Apri le spese del mese corrente"
          className="card w-full p-4 text-left hover:border-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <Wallet size={18} aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-zinc-500">Totale spese</p>
                <ChevronRight size={18} className="mt-0.5 shrink-0 text-zinc-400" aria-hidden="true" />
              </div>
              <p className="mt-0.5 break-words text-3xl font-bold tabular-nums tracking-tight text-zinc-900">
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

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="card p-6 flex flex-col justify-between"
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
