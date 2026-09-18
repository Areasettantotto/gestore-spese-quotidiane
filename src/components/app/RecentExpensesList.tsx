import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Wallet } from 'lucide-react';
import { type Expense } from '@/src/types';
import type { ExpenseWithCategoryCode } from '@/src/features/expenses/expenses.types';
import { DeleteExpenseConfirmDialog } from '@/src/components/app/DeleteExpenseConfirmDialog';
import { ExpenseListItem, useMobileSwipeViewport } from '@/src/components/app/ExpenseListItem';

type RecentExpensesListProps = {
  expenses: ExpenseWithCategoryCode[];
  onViewAll: () => void;
  onEdit: (expense: Expense) => void;
  onDelete: (expense: Expense) => void;
};

export function RecentExpensesList({ expenses, onViewAll, onEdit, onDelete }: RecentExpensesListProps) {
  const isMobileSwipe = useMobileSwipeViewport();
  const [openExpenseId, setOpenExpenseId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Expense | null>(null);

  useEffect(() => {
    if (!isMobileSwipe) {
      setOpenExpenseId(null);
    }
  }, [isMobileSwipe]);

  useEffect(() => {
    if (openExpenseId && !expenses.some((expense) => expense.id === openExpenseId)) {
      setOpenExpenseId(null);
    }
  }, [expenses, openExpenseId]);

  const handleEdit = (expense: Expense) => {
    setOpenExpenseId(null);
    onEdit(expense);
  };

  const handleDeleteRequest = (expense: Expense) => {
    setOpenExpenseId(null);
    setPendingDelete(expense);
  };

  return (
    <section className="space-y-4">
      <div className="flex justify-between items-end">
        <h2 className="text-lg font-semibold text-text-primary">Attività Recente</h2>
        <button onClick={onViewAll} className="text-sm text-primary font-medium hover:underline">
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
              >
                <ExpenseListItem
                  expense={expense}
                  dateFormat="d MMM"
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
                <Wallet size={32} />
              </div>
              <div>
                <p className="text-text-primary font-medium">Nessuna spesa registrata</p>
                <p className="text-text-muted text-sm">Inizia aggiungendo la tua prima spesa quotidiana.</p>
              </div>
            </div>
          )}
        </AnimatePresence>
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
