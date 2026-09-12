import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronRight, Target, X } from 'lucide-react';

import { dailyRemainingAmount, deriveBudgetMetrics } from '@/src/features/budgets/monthlyBudgets';
import type { CurrentMonthlyBudgetStatus } from '@/src/features/budgets/useCurrentMonthlyBudget';

export type BudgetCardModel = {
  status: Exclude<CurrentMonthlyBudgetStatus, 'hidden'>;
  amount: number | null;
  canWrite: boolean;
};

type BudgetCardProps = {
  model: BudgetCardModel;
  spent: number;
  monthName: string;
  onSave: (amount: number) => Promise<{ ok: true } | { ok: false; message: string }>;
};

function formatEuroAmount(value: number): string {
  return `€${value.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatUtilizedPercent(value: number): string {
  return `${value.toLocaleString('it-IT', { maximumFractionDigits: 0 })}%`;
}

function parseBudgetAmountInput(raw: string): { ok: true; amount: number } | { ok: false; message: string } {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return { ok: false, message: 'Inserisci un importo.' };
  }

  const normalized = trimmed.replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    return { ok: false, message: 'Inserisci un importo valido con al massimo due decimali.' };
  }

  const amount = Number(normalized);
  if (!Number.isFinite(amount) || !(amount > 0)) {
    return { ok: false, message: "L'importo deve essere maggiore di zero." };
  }

  return { ok: true, amount };
}

function RemainingCaption({
  remaining,
  exceeded,
  daily,
  className,
}: {
  remaining: number;
  exceeded: boolean;
  daily: number | null;
  className: string;
}) {
  if (exceeded) {
    return (
      <p className={className}>
        {formatEuroAmount(Math.abs(remaining))} oltre il budget
      </p>
    );
  }

  return (
    <p className={className}>
      <span className="tabular-nums">{formatEuroAmount(remaining)}</span>{' '}
      <span className="font-normal">rimanenti</span>
      {daily != null ? (
        <span className="block font-normal">
          (<span className="font-semibold tabular-nums">{formatEuroAmount(daily)}</span>{' '}
          <span>al giorno</span>)
        </span>
      ) : null}
    </p>
  );
}

const CARD_TITLE = 'Budget mese';

export function BudgetCard({ model, spent, monthName, onSave }: BudgetCardProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="flex h-full min-w-0 w-full flex-col">
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        aria-label={`Budget ${monthName}`}
        className="card flex h-full min-w-0 w-full flex-col p-3 md:p-4"
      >
        <BudgetCardBody model={model} spent={spent} onConfigure={() => setDialogOpen(true)} />
      </motion.section>
      {model.canWrite && (model.status === 'unconfigured' || model.status === 'configured') ? (
        <BudgetDialog
          isOpen={dialogOpen}
          mode={model.status === 'configured' ? 'edit' : 'create'}
          monthName={monthName}
          initialAmount={model.status === 'configured' ? model.amount : null}
          onClose={() => setDialogOpen(false)}
          onSave={onSave}
        />
      ) : null}
    </div>
  );
}

function BudgetCardHeader({
  tone,
  trailing,
}: {
  tone: 'ok' | 'danger';
  trailing?: ReactNode;
}) {
  return (
    <>
      <BudgetIcon tone={tone} />
      <div className="flex min-w-0 items-start justify-between gap-1">
        <p className="text-sm font-medium text-zinc-500">{CARD_TITLE}</p>
        {trailing}
      </div>
    </>
  );
}

function BudgetCardShell({
  tone,
  trailing,
  children,
}: {
  tone: 'ok' | 'danger';
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid h-full min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-x-2 gap-y-1 md:gap-x-3">
      <BudgetCardHeader tone={tone} trailing={trailing} />
      <div className="col-span-2 min-w-0 md:col-span-1">{children}</div>
    </div>
  );
}

function BudgetCardBody({
  model,
  spent,
  onConfigure,
}: {
  model: BudgetCardModel;
  spent: number;
  onConfigure: () => void;
}) {
  if (model.status === 'loading') {
    return (
      <BudgetCardShell tone="ok">
        <p className="text-xs leading-snug text-zinc-500 md:text-sm" role="status" aria-live="polite">
          Caricamento budget…
        </p>
      </BudgetCardShell>
    );
  }

  if (model.status === 'error') {
    return (
      <BudgetCardShell tone="ok">
        <p className="text-xs leading-snug text-zinc-700 md:text-sm" role="status">
          Budget non disponibile
        </p>
      </BudgetCardShell>
    );
  }

  if (model.status === 'unconfigured') {
    return (
      <BudgetCardShell tone="ok">
        <p className="text-xs leading-snug text-zinc-700 md:text-sm">
          {model.canWrite
            ? 'Il budget non è ancora impostato per il mese corrente.'
            : 'Il budget del mese non è ancora configurato.'}
        </p>
        {model.canWrite ? (
          <button type="button" onClick={onConfigure} className="btn-primary mt-2 py-2 text-xs md:mt-3 md:py-2.5 md:text-sm">
            Imposta budget
          </button>
        ) : null}
      </BudgetCardShell>
    );
  }

  const budgetAmount = model.amount;
  if (budgetAmount == null) {
    return (
      <BudgetCardShell tone="ok">
        <p className="text-xs leading-snug text-zinc-700 md:text-sm" role="status">
          Budget non disponibile
        </p>
      </BudgetCardShell>
    );
  }

  const metrics = deriveBudgetMetrics(spent, budgetAmount);
  const tone = metrics.exceeded ? 'danger' : 'ok';
  const remainingClass = metrics.exceeded ? 'text-red-600' : 'text-zinc-500';
  const amountMutedClass = metrics.exceeded ? 'text-red-600' : 'text-zinc-500';

  return (
    <BudgetCardShell
      tone={tone}
      trailing={
        model.canWrite ? (
          <button
            type="button"
            onClick={onConfigure}
            aria-label="Modifica budget"
            className="-mr-1 shrink-0 rounded-md p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
          >
            <ChevronRight className="size-4 text-zinc-400 md:size-[18px]" aria-hidden="true" />
          </button>
        ) : null
      }
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-1.5 gap-y-0.5">
        <p
          className={`min-w-0 text-xs font-bold leading-snug tabular-nums md:text-sm ${
            metrics.exceeded ? 'text-red-700' : 'text-zinc-900'
          }`}
        >
          <span className="whitespace-nowrap">{formatEuroAmount(metrics.spent)}</span>
          <span className={`font-normal ${amountMutedClass}`}> di </span>
          <span className={`whitespace-nowrap font-semibold ${amountMutedClass}`}>
            {formatEuroAmount(metrics.budget)}
          </span>
        </p>
        <p
          className={`shrink-0 text-xs font-semibold tabular-nums md:text-sm ${
            metrics.exceeded ? 'text-red-600' : 'text-emerald-600'
          }`}
        >
          {formatUtilizedPercent(metrics.percentage)}
        </p>
      </div>
      <BudgetUtilizationBar progressWidth={metrics.progressWidth} exceeded={metrics.exceeded} />
      <RemainingCaption
        remaining={metrics.remaining}
        exceeded={metrics.exceeded}
        daily={dailyRemainingAmount(metrics.remaining, metrics.exceeded)}
        className={`mt-1 min-w-0 text-xs font-semibold leading-snug md:mt-1.5 md:text-sm ${remainingClass}`}
      />
    </BudgetCardShell>
  );
}

function BudgetUtilizationBar({ progressWidth, exceeded }: { progressWidth: number; exceeded: boolean }) {
  const fillSpectrumWidth = progressWidth > 0 ? `${(100 / progressWidth) * 100}%` : '100%';

  return (
    <div
      className={`mt-1.5 h-2.5 w-full overflow-hidden rounded-full md:h-3 ${exceeded ? 'bg-red-100' : 'bg-zinc-100'}`}
      role="progressbar"
      aria-label="Utilizzo del budget"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progressWidth)}
    >
      {progressWidth > 0 ? (
        <div className="relative h-full overflow-hidden rounded-full" style={{ width: `${progressWidth}%` }}>
          <div
            className={`h-full ${exceeded ? 'bg-red-500' : 'bg-gradient-to-r from-emerald-500 to-amber-500'}`}
            style={{ width: fillSpectrumWidth }}
          />
          <div aria-hidden="true" className="budget-progress-zebra pointer-events-none absolute inset-0" />
        </div>
      ) : null}
    </div>
  );
}

function BudgetIcon({ tone }: { tone: 'ok' | 'danger' }) {
  const toneClass = tone === 'danger' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600';

  return (
    <div
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg md:row-span-2 md:h-9 md:w-9 ${toneClass}`}
    >
      <Target className="size-4 md:size-[18px]" aria-hidden="true" />
    </div>
  );
}

function BudgetDialog({
  isOpen,
  mode,
  monthName,
  initialAmount,
  onClose,
  onSave,
}: {
  isOpen: boolean;
  mode: 'create' | 'edit';
  monthName: string;
  initialAmount: number | null;
  onClose: () => void;
  onSave: (amount: number) => Promise<{ ok: true } | { ok: false; message: string }>;
}) {
  const amountFieldId = useId();
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setDraft(initialAmount != null ? String(initialAmount) : '');
    setSubmitting(false);
    setErrorMessage(null);
  }, [isOpen, initialAmount]);

  const title = mode === 'edit' ? `Modifica budget di ${monthName}` : `Imposta budget di ${monthName}`;

  const handleClose = () => {
    if (submitting) return;
    onClose();
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = parseBudgetAmountInput(draft);
    if (parsed.ok === false) {
      setErrorMessage(parsed.message);
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    const result = await onSave(parsed.amount);
    if (result.ok === false) {
      setErrorMessage(result.message);
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen ? (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${amountFieldId}-title`}
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            className="fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-2xl rounded-t-4xl bg-white p-8 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-6 flex items-center justify-between gap-3">
              <h2 id={`${amountFieldId}-title`} className="text-xl font-bold text-zinc-900">
                {title}
              </h2>
              <button
                type="button"
                onClick={handleClose}
                disabled={submitting}
                aria-label="Chiudi"
                className="rounded-full p-2 transition-colors hover:bg-zinc-100 disabled:opacity-50"
              >
                <X size={24} aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={(event) => void handleSubmit(event)} className="space-y-6">
              <div className="space-y-2">
                <label htmlFor={amountFieldId} className="text-sm font-semibold text-zinc-700">
                  Importo (€)
                </label>
                <input
                  id={amountFieldId}
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  autoFocus
                  inputMode="decimal"
                  placeholder="0.00"
                  disabled={submitting}
                  className="input-field py-4 text-2xl font-bold"
                  value={draft}
                  onChange={(event) => {
                    setDraft(event.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                />
              </div>

              {errorMessage ? (
                <p className="text-sm text-red-600" role="alert">
                  {errorMessage}
                </p>
              ) : null}

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={submitting}
                  className="rounded-xl px-6 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
                >
                  Annulla
                </button>
                <button type="submit" disabled={submitting} className="btn-primary py-3">
                  {submitting ? 'Salvataggio…' : 'Salva budget'}
                </button>
              </div>
            </form>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
