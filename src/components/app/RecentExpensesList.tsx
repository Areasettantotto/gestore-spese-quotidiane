import type React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { format, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Coffee, Heart, Home, Music, Pencil, ShoppingBag, Tag, Trash2, Truck, Wallet } from 'lucide-react';
import { CATEGORY_ICONS, type Expense } from '@/src/types';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const ICON_COMPONENTS: Record<string, React.ComponentType<{ size?: number }>> = {
  Coffee,
  Truck,
  Home,
  Music,
  Heart,
  ShoppingBag,
  Tag,
};

type RecentExpensesListProps = {
  expenses: Expense[];
  onViewAll: () => void;
  onEdit: (expense: Expense) => void;
  onDelete: (expense: Expense) => void;
};

export function RecentExpensesList({ expenses, onViewAll, onEdit, onDelete }: RecentExpensesListProps) {
  return (
    <section className="space-y-4">
      <div className="flex justify-between items-end">
        <h2 className="text-lg font-semibold text-zinc-900">Attività Recente</h2>
        <button onClick={onViewAll} className="text-sm text-emerald-600 font-medium hover:underline">
          Vedi tutto
        </button>
      </div>

      <div className="space-y-3">
        <AnimatePresence mode="popLayout">
          {expenses.length > 0 ? (
            expenses.map((expense) => (
              <motion.div
                key={expense.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="card p-4 flex items-center justify-between group hover:border-emerald-200 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div
                    className={cn(
                      'w-12 h-12 rounded-xl flex items-center justify-center',
                      'bg-zinc-50 text-zinc-500 group-hover:bg-emerald-50 group-hover:text-emerald-600 transition-colors',
                    )}
                  >
                    {(() => {
                      const key = CATEGORY_ICONS[expense.category];
                      const Icon = ICON_COMPONENTS[key] ?? Tag;
                      return <Icon size={20} />;
                    })()}
                  </div>
                  <div>
                    <p className="font-semibold text-zinc-900">{expense.description}</p>
                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                      <span className="font-medium px-1.5 py-0.5 bg-zinc-100 rounded text-zinc-600">
                        {expense.accompagnatore ? expense.accompagnatore.charAt(0) : 'S'}
                      </span>
                      <span>•</span>
                      <span>{format(parseISO(expense.date), 'd MMM', { locale: it })}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <p className="font-bold text-zinc-900">€{expense.amount.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</p>
                  <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity action-buttons">
                    <button
                      onClick={() => onEdit(expense)}
                      className="p-2 text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                    >
                      <Pencil size={18} />
                    </button>
                    <button
                      onClick={() => onDelete(expense)}
                      className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))
          ) : (
            <div className="card p-12 flex flex-col items-center justify-center text-center space-y-4 border-dashed">
              <div className="w-16 h-16 bg-zinc-50 rounded-full flex items-center justify-center text-zinc-300">
                <Wallet size={32} />
              </div>
              <div>
                <p className="text-zinc-900 font-medium">Nessuna spesa registrata</p>
                <p className="text-zinc-500 text-sm">Inizia aggiungendo la tua prima spesa quotidiana.</p>
              </div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
