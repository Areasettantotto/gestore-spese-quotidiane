import type React from 'react';
import { useEffect, useId, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { format } from 'date-fns';
import { Tag, User, X } from 'lucide-react';
import { ACCOMPAGNATORI, type Accompagnatore } from '@/src/types';
import {
  CATEGORY_CODES,
  expenseCategoryByCode,
  isCategoryCode,
} from '@/src/features/expenses/expenseCategoryCatalog';
import type { ExpenseFormData } from '@/src/features/expenses/expenses.types';

type ExpenseFormProps = {
  isOpen: boolean;
  editingId: string | null;
  newExpense: ExpenseFormData;
  onChange: (expense: ExpenseFormData) => void;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  isSubmitting: boolean;
};

export function ExpenseForm({ isOpen, editingId, newExpense, onChange, onClose, onSubmit, isSubmitting }: ExpenseFormProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    panelRef.current?.focus();
  }, [isOpen]);

  const resetAndClose = () => {
    onChange({
      amount: undefined,
      categoryCode: 'food',
      description: '',
      date: format(new Date(), 'yyyy-MM-dd'),
      accompagnatore: undefined,
    });
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={resetAndClose}
            className="fixed inset-0 bg-overlay backdrop-blur-sm z-40"
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            className="surface-elevated fixed bottom-0 left-0 right-0 rounded-t-4xl p-8 z-50 max-w-2xl mx-auto outline-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-6">
              <h2 id={titleId} className="text-xl font-bold text-text-primary">{editingId ? 'Modifica Spesa' : 'Nuova Spesa'}</h2>
              <button onClick={resetAndClose} className="p-2 hover:bg-surface-muted rounded-full transition-colors text-text-muted">
                <X size={24} />
              </button>
            </div>

            <form onSubmit={onSubmit} className="space-y-6" aria-busy={isSubmitting}>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-text-secondary">Importo (€)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="0.00"
                  className="input-field text-2xl font-bold py-4"
                  value={newExpense.amount ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    const parsed = v === '' ? undefined : Number(v.replace(',', '.'));
                    onChange({ ...newExpense, amount: parsed });
                  }}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-text-secondary">Descrizione</label>
                <input
                  type="text"
                  required
                  placeholder="Es. Spesa Esselunga"
                  className="input-field"
                  value={newExpense.description}
                  onChange={(e) => onChange({ ...newExpense, description: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-text-secondary">Categoria</label>
                  <div className="relative w-full min-w-0 flex items-center">
                    <Tag className="absolute left-3 top-1/2 -translate-y-1/2 text-text-faint shrink-0 pointer-events-none" size={18} />
                    <select
                      className="input-field pl-10! flex-1 w-full min-w-0 max-w-full appearance-none leading-normal box-border"
                      value={newExpense.categoryCode}
                      onChange={(e) => {
                        if (!isCategoryCode(e.target.value)) return;
                        onChange({ ...newExpense, categoryCode: e.target.value });
                      }}
                    >
                      {CATEGORY_CODES.map((code) => (
                        <option key={code} value={code}>
                          {expenseCategoryByCode(code).presentationLabel}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-text-secondary">Data</label>
                  <div className="relative w-full min-w-0 flex items-center">
                    <input
                      type="date"
                      required
                      className="input-field flex-1 w-full min-w-0 max-w-full box-border"
                      value={newExpense.date}
                      onChange={(e) => onChange({ ...newExpense, date: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-text-secondary">Accompagnatore</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-text-faint shrink-0 pointer-events-none" size={18} />
                  <select
                    className="input-field pl-10! w-full appearance-none leading-normal"
                    value={newExpense.accompagnatore ?? ''}
                    onChange={(e) =>
                      onChange({
                        ...newExpense,
                        accompagnatore: e.target.value ? (e.target.value as Accompagnatore) : undefined,
                      })
                    }
                  >
                    <option value="">Senza Accompagnatore</option>
                    {ACCOMPAGNATORI.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <button type="submit" disabled={isSubmitting} className="btn-primary w-full py-4 text-lg mt-4">
                {isSubmitting
                  ? editingId
                    ? 'Aggiornamento…'
                    : 'Salvataggio…'
                  : editingId
                    ? 'Aggiorna Spesa'
                    : 'Salva Spesa'}
              </button>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
