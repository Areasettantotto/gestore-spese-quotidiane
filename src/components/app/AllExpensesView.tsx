import type React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { format, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ArrowLeft, Calendar, Coffee, Filter, Heart, Home, Music, Pencil, Search, ShoppingBag, Tag, Trash2, Truck, User } from 'lucide-react';
import { ACCOMPAGNATORI, CATEGORIES, CATEGORY_ICONS, type Accompagnatore, type Category, type Expense } from '@/src/types';

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

type FiltersState = {
  filterMonth: string;
  filterCategory: Category | 'Tutte';
  filterAccompagnatore: Accompagnatore | 'Tutte' | 'Senza';
  filterSearch: string;
};

type AllExpensesViewProps = {
  filteredTotal: number;
  filteredExpenses: Expense[];
  filters: FiltersState;
  onFiltersChange: (next: FiltersState) => void;
  onBack: () => void;
  onEdit: (expense: Expense) => void;
  onDelete: (expense: Expense) => void;
};

export function AllExpensesView({
  filteredTotal,
  filteredExpenses,
  filters,
  onFiltersChange,
  onBack,
  onEdit,
  onDelete,
}: AllExpensesViewProps) {
  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-zinc-100 rounded-full transition-colors text-zinc-600">
            <ArrowLeft size={24} />
          </button>
          <h2 className="text-xl font-bold text-zinc-900">Tutte le Spese</h2>
        </div>
        <div className="text-right">
          <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Totale filtrato</p>
          <p className="text-lg font-bold text-emerald-600">€{filteredTotal.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</p>
        </div>
      </div>

      <div className="card p-4 overflow-hidden min-w-0">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:grid-rows-2 md:items-center min-w-0">
          <div className="relative w-full min-w-0 overflow-hidden flex items-center">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 shrink-0" size={18} />
            <input
              type="text"
              placeholder="Cerca descrizione..."
              className="input-field pl-10! flex-1 w-full min-w-0 max-w-full box-border"
              value={filters.filterSearch}
              onChange={(e) => onFiltersChange({ ...filters, filterSearch: e.target.value })}
            />
          </div>
          <div className="relative w-full min-w-0 md:min-w-30 overflow-hidden flex items-center">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 shrink-0" size={18} />
            <input
              type="month"
              className="input-field pl-10! flex-1 w-full min-w-0 max-w-full box-border"
              value={filters.filterMonth}
              onChange={(e) => onFiltersChange({ ...filters, filterMonth: e.target.value })}
            />
          </div>
          <div className="relative w-full min-w-0 md:min-w-30 overflow-hidden flex items-center">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 shrink-0 pointer-events-none" size={18} />
            <select
              className="input-field pl-10! flex-1 w-full min-w-0 max-w-full appearance-none leading-normal box-border"
              value={filters.filterCategory}
              onChange={(e) => onFiltersChange({ ...filters, filterCategory: e.target.value as Category | 'Tutte' })}
            >
              <option value="Tutte">Tutte</option>
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
          <div className="relative w-full min-w-0 md:min-w-30 overflow-hidden flex items-center">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 shrink-0 pointer-events-none" size={18} />
            <select
              className="input-field pl-10! flex-1 w-full min-w-0 max-w-full appearance-none leading-normal box-border"
              value={filters.filterAccompagnatore}
              onChange={(e) =>
                onFiltersChange({ ...filters, filterAccompagnatore: e.target.value as Accompagnatore | 'Tutte' | 'Senza' })
              }
            >
              <option value="Tutte">Tutte</option>
              <option value="Senza">Senza Accompagnatore</option>
              {ACCOMPAGNATORI.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <AnimatePresence mode="popLayout">
          {filteredExpenses.length > 0 ? (
            filteredExpenses.map((expense) => (
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
                      <span>{format(parseISO(expense.date), 'd MMMM yyyy', { locale: it })}</span>
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
                <Search size={32} />
              </div>
              <div>
                <p className="text-zinc-900 font-medium">Nessun risultato trovato</p>
                <p className="text-zinc-500 text-sm">Prova a modificare i filtri di ricerca.</p>
              </div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
