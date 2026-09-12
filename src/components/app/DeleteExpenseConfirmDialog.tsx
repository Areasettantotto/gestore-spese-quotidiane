import { useEffect, useId, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { format, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';
import { Trash2 } from 'lucide-react';
import type { Expense } from '@/src/types';

type DeleteExpenseConfirmDialogProps = {
  expense: Expense | null;
  onCancel: () => void;
  onConfirm: () => void;
};

function formatExpenseSummary(expense: Expense): string {
  const name = expense.description.trim() || 'Spesa senza nome';
  const amount = `€${expense.amount.toLocaleString('it-IT', { minimumFractionDigits: 2 })}`;
  const dateLabel = format(parseISO(expense.date), 'd MMM', { locale: it });
  return `${name} · ${amount} · ${dateLabel}`;
}

export function DeleteExpenseConfirmDialog({ expense, onCancel, onConfirm }: DeleteExpenseConfirmDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const isOpen = expense !== null;

  useEffect(() => {
    if (!isOpen) return;
    panelRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onCancel]);

  return (
    <AnimatePresence>
      {isOpen && expense ? (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCancel}
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
          />
          <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              aria-describedby={descriptionId}
              tabIndex={-1}
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              className="pointer-events-auto w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl outline-none"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start gap-3">
                <div
                  className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-700"
                  aria-hidden="true"
                >
                  <Trash2 size={20} />
                </div>
                <div className="min-w-0 space-y-1">
                  <h2 id={titleId} className="text-base font-semibold text-zinc-900">
                    Eliminare questa spesa?
                  </h2>
                  <p id={descriptionId} className="text-sm text-zinc-500">
                    {formatExpenseSummary(expense)}
                  </p>
                </div>
              </div>

              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={onConfirm}
                  className="flex-1 rounded-xl bg-rose-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-rose-700 active:scale-95"
                >
                  Elimina
                </button>
                <button
                  type="button"
                  onClick={onCancel}
                  className="flex-1 rounded-xl px-4 py-3 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100"
                >
                  Annulla
                </button>
              </div>
            </motion.div>
          </div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
