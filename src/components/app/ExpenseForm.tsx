import type React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { format } from 'date-fns';
import { Tag, User, X } from 'lucide-react';
import { ACCOMPAGNATORI, CATEGORIES, type Accompagnatore, type Category, type Expense } from '@/src/types';

type ExpenseFormProps = {
  isOpen: boolean;
  editingId: string | null;
  newExpense: Partial<Expense>;
  onChange: (expense: Partial<Expense>) => void;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
};

export function ExpenseForm({ isOpen, editingId, newExpense, onChange, onClose, onSubmit }: ExpenseFormProps) {
  const resetAndClose = () => {
    onChange({
      amount: undefined,
      category: 'Alimentazione',
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
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
          />
          <motion.div
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            className="fixed bottom-0 left-0 right-0 bg-white rounded-t-4xl p-8 z-50 shadow-2xl max-w-2xl mx-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-zinc-900">{editingId ? 'Modifica Spesa' : 'Nuova Spesa'}</h2>
              <button onClick={resetAndClose} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
                <X size={24} />
              </button>
            </div>

            <form onSubmit={onSubmit} className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-zinc-700">Importo (€)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  autoFocus
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
                <label className="text-sm font-semibold text-zinc-700">Descrizione</label>
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
                  <label className="text-sm font-semibold text-zinc-700">Categoria</label>
                  <div className="relative w-full min-w-0 overflow-hidden flex items-center">
                    <Tag className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 shrink-0 pointer-events-none" size={18} />
                    <select
                      className="input-field pl-10! flex-1 w-full min-w-0 max-w-full appearance-none leading-normal box-border"
                      value={newExpense.category}
                      onChange={(e) => onChange({ ...newExpense, category: e.target.value as Category })}
                    >
                      {CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-zinc-700">Data</label>
                  <div className="relative w-full min-w-0 overflow-hidden flex items-center">
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
                <label className="text-sm font-semibold text-zinc-700">Accompagnatore</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 shrink-0 pointer-events-none" size={18} />
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

              <button type="submit" className="btn-primary w-full py-4 text-lg mt-4">
                {editingId ? 'Aggiorna Spesa' : 'Salva Spesa'}
              </button>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
