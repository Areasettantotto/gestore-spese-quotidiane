import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, Calendar, Filter, Search, User } from 'lucide-react';
import { ACCOMPAGNATORI, CATEGORIES, type Accompagnatore, type Category, type Expense } from '@/src/types';
import { DeleteExpenseConfirmDialog } from '@/src/components/app/DeleteExpenseConfirmDialog';
import { ExpenseListItem, useMobileSwipeViewport } from '@/src/components/app/ExpenseListItem';

const INITIAL_VISIBLE_EXPENSES = 30;
const VISIBLE_EXPENSES_STEP = 30;
const SENTINEL_ROOT_MARGIN = '0px 0px 280px 0px';

type FiltersState = {
  filterMonth: string;
  filterCategory: Category | 'Tutte';
  filterAccompagnatore: Accompagnatore | 'Tutte' | 'Senza';
  filterSearch: string;
};

type ProgressiveRenderState = {
  filterKey: string;
  visibleCount: number;
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
  const isMobileSwipe = useMobileSwipeViewport();
  const [openExpenseId, setOpenExpenseId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Expense | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const filterKey = JSON.stringify([
    filters.filterSearch,
    filters.filterMonth,
    filters.filterCategory,
    filters.filterAccompagnatore,
  ]);
  const [progressive, setProgressive] = useState<ProgressiveRenderState>({
    filterKey,
    visibleCount: INITIAL_VISIBLE_EXPENSES,
  });

  // Budget progressivo valido solo per la combinazione di filtri corrente:
  // al primo render di una nuova filterKey si riparte da INITIAL_VISIBLE_EXPENSES
  // senza attendere alcun effect.
  const visibleCount = progressive.filterKey === filterKey ? progressive.visibleCount : INITIAL_VISIBLE_EXPENSES;

  const visibleExpenses = filteredExpenses.slice(0, visibleCount);
  const shownCount = Math.min(visibleCount, filteredExpenses.length);
  const hasMore = shownCount < filteredExpenses.length;

  const loadMore = useCallback(() => {
    setProgressive((current) => {
      const base = current.filterKey === filterKey ? current.visibleCount : INITIAL_VISIBLE_EXPENSES;
      if (base >= filteredExpenses.length) {
        return current;
      }
      return { filterKey, visibleCount: base + VISIBLE_EXPENSES_STEP };
    });
  }, [filterKey, filteredExpenses.length]);

  useEffect(() => {
    if (!isMobileSwipe) {
      setOpenExpenseId(null);
    }
  }, [isMobileSwipe]);

  useEffect(() => {
    setOpenExpenseId(null);
    // Normalizza lo state al filtro corrente: il limite del primo render è già
    // garantito dalla derivazione sincrona di visibleCount; qui si scarta il budget
    // accumulato dal filtro precedente così che un ritorno a quella combinazione
    // riparta comunque da INITIAL_VISIBLE_EXPENSES.
    setProgressive((current) =>
      current.filterKey === filterKey && current.visibleCount === INITIAL_VISIBLE_EXPENSES
        ? current
        : { filterKey, visibleCount: INITIAL_VISIBLE_EXPENSES },
    );
  }, [filterKey]);

  useEffect(() => {
    if (openExpenseId && !filteredExpenses.some((expense) => expense.id === openExpenseId)) {
      setOpenExpenseId(null);
    }
  }, [filteredExpenses, openExpenseId]);

  useEffect(() => {
    if (!hasMore) {
      return;
    }

    const sentinel = sentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === 'undefined') {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadMore();
        }
      },
      {
        root: null,
        rootMargin: SENTINEL_ROOT_MARGIN,
        threshold: 0,
      },
    );

    observer.observe(sentinel);
    return () => {
      observer.disconnect();
    };
  }, [hasMore, loadMore, visibleCount]);

  const handleEdit = (expense: Expense) => {
    setOpenExpenseId(null);
    onEdit(expense);
  };

  const handleDeleteRequest = (expense: Expense) => {
    setOpenExpenseId(null);
    setPendingDelete(expense);
  };

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-surface-muted rounded-full transition-colors text-text-secondary">
            <ArrowLeft size={24} />
          </button>
          <h2 className="text-xl font-bold text-text-primary">Tutte le Spese</h2>
        </div>
        <div className="text-right">
          <p className="text-xs text-text-muted font-medium uppercase tracking-wider">Totale filtrato</p>
          <p className="text-lg font-bold text-primary">€{filteredTotal.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</p>
        </div>
      </div>

      <div className="card p-4 overflow-hidden min-w-0">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:grid-rows-2 md:items-center min-w-0">
          <div className="relative w-full min-w-0 flex items-center">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-faint shrink-0" size={18} />
            <input
              type="text"
              placeholder="Cerca descrizione..."
              className="input-field pl-10! flex-1 w-full min-w-0 max-w-full box-border"
              value={filters.filterSearch}
              onChange={(e) => onFiltersChange({ ...filters, filterSearch: e.target.value })}
            />
          </div>
          <div className="relative w-full min-w-0 md:min-w-30 flex items-center">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-text-faint shrink-0" size={18} />
            <input
              type="month"
              className="input-field pl-10! flex-1 w-full min-w-0 max-w-full box-border"
              value={filters.filterMonth}
              onChange={(e) => onFiltersChange({ ...filters, filterMonth: e.target.value })}
            />
          </div>
          <div className="relative w-full min-w-0 md:min-w-30 flex items-center">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-text-faint shrink-0 pointer-events-none" size={18} />
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
          <div className="relative w-full min-w-0 md:min-w-30 flex items-center">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 text-text-faint shrink-0 pointer-events-none" size={18} />
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
            visibleExpenses.map((expense) => (
              <motion.div
                key={expense.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
              >
                <ExpenseListItem
                  expense={expense}
                  dateFormat="d MMMM yyyy"
                  isMobileSwipe={isMobileSwipe}
                  isOpen={openExpenseId === expense.id}
                  onOpen={() => setOpenExpenseId(expense.id)}
                  onClose={() => setOpenExpenseId((current) => (current === expense.id ? null : current))}
                  onExclusiveSwipe={() =>
                    setOpenExpenseId((current) => (current && current !== expense.id ? null : current))
                  }
                  onEdit={() => handleEdit(expense)}
                  onDeleteRequest={() => handleDeleteRequest(expense)}
                />
              </motion.div>
            ))
          ) : (
            <div className="card p-12 flex flex-col items-center justify-center text-center space-y-4 border-dashed">
              <div className="w-16 h-16 bg-surface-muted rounded-full flex items-center justify-center text-text-faint">
                <Search size={32} />
              </div>
              <div>
                <p className="text-text-primary font-medium">Nessun risultato trovato</p>
                <p className="text-text-muted text-sm">Prova a modificare i filtri di ricerca.</p>
              </div>
            </div>
          )}
        </AnimatePresence>
        {filteredExpenses.length > 0 ? (
          <p className="sr-only" aria-live="polite">
            Mostrate {shownCount} di {filteredExpenses.length} spese
          </p>
        ) : null}
        {hasMore ? (
          <>
            <div ref={sentinelRef} aria-hidden="true" className="h-px w-full" />
            <button
              type="button"
              onClick={loadMore}
              className="w-full rounded-xl py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-muted"
            >
              Carica altre
            </button>
          </>
        ) : null}
      </div>

      <DeleteExpenseConfirmDialog
        expense={pendingDelete}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (!pendingDelete) return;
          const expense = pendingDelete;
          setPendingDelete(null);
          onDelete(expense);
        }}
      />
    </section>
  );
}
