import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { format, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Coffee, Heart, Home, Music, Pencil, ShoppingBag, Tag, Trash2, Truck, Wallet } from 'lucide-react';
import { CATEGORY_ICONS, type Expense } from '@/src/types';
import { DeleteExpenseConfirmDialog } from '@/src/components/app/DeleteExpenseConfirmDialog';

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

const MOBILE_SWIPE_QUERY = '(max-width: 639px) and (pointer: coarse) and (hover: none)';
const ACTION_PANEL_WIDTH = 68;
const REVEAL_WIDTH = ACTION_PANEL_WIDTH * 2;
const DIRECTION_LOCK_PX = 10;
const OPEN_RATIO = 0.35;

type RecentExpensesListProps = {
  expenses: Expense[];
  onViewAll: () => void;
  onEdit: (expense: Expense) => void;
  onDelete: (expense: Expense) => void;
};

function useMobileSwipeViewport(): boolean {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(MOBILE_SWIPE_QUERY).matches;
  });

  useEffect(() => {
    const media = window.matchMedia(MOBILE_SWIPE_QUERY);
    const sync = () => setIsMobile(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  return isMobile;
}

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
        <h2 className="text-lg font-semibold text-zinc-900">Attività Recente</h2>
        <button onClick={onViewAll} className="text-sm text-emerald-600 font-medium hover:underline">
          Vedi tutto
        </button>
      </div>

      <div className="space-y-3">
        <AnimatePresence mode="popLayout">
          {expenses.length > 0 ? (
            expenses.map((expense) =>
              isMobileSwipe ? (
                <motion.div
                  key={expense.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="card relative overflow-hidden"
                >
                  <SwipeableRecentExpenseCard
                    expense={expense}
                    isOpen={openExpenseId === expense.id}
                    onOpen={() => setOpenExpenseId(expense.id)}
                    onClose={() => setOpenExpenseId((current) => (current === expense.id ? null : current))}
                    onExclusiveSwipe={() =>
                      setOpenExpenseId((current) => (current && current !== expense.id ? null : current))
                    }
                    onEdit={() => handleEdit(expense)}
                    onDelete={() => handleDeleteRequest(expense)}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key={expense.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="card p-4 flex items-center justify-between group hover:border-emerald-200 transition-colors"
                >
                  <ExpenseCardBody
                    expense={expense}
                    showDesktopActions
                    onEdit={() => handleEdit(expense)}
                    onDelete={() => handleDeleteRequest(expense)}
                  />
                </motion.div>
              ),
            )
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

type SwipeableRecentExpenseCardProps = {
  expense: Expense;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onExclusiveSwipe: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

type DragAxis = 'x' | 'y' | null;

function SwipeableRecentExpenseCard({
  expense,
  isOpen,
  onOpen,
  onClose,
  onExclusiveSwipe,
  onEdit,
  onDelete,
}: SwipeableRecentExpenseCardProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startOffset: number;
    axis: DragAxis;
  } | null>(null);
  const [offset, setOffset] = useState(isOpen ? -REVEAL_WIDTH : 0);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (isDragging) return;
    setOffset(isOpen ? -REVEAL_WIDTH : 0);
  }, [isOpen, isDragging]);

  useEffect(() => {
    if (!isOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target)) return;
      onClose();
    };

    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [isOpen, onClose]);

  const settle = (nextOffset: number) => {
    const shouldOpen = nextOffset <= -REVEAL_WIDTH * OPEN_RATIO;
    setOffset(shouldOpen ? -REVEAL_WIDTH : 0);
    if (shouldOpen) onOpen();
    else onClose();
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'touch') return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startOffset: offset,
      axis: null,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;

    if (drag.axis === null) {
      if (Math.abs(dx) < DIRECTION_LOCK_PX && Math.abs(dy) < DIRECTION_LOCK_PX) return;
      if (Math.abs(dy) > Math.abs(dx)) {
        drag.axis = 'y';
        dragRef.current = null;
        return;
      }
      drag.axis = 'x';
      setIsDragging(true);
      onExclusiveSwipe();
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    if (drag.axis !== 'x') return;

    const next = Math.min(0, Math.max(-REVEAL_WIDTH, drag.startOffset + dx));
    setOffset(next);
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const axis = drag.axis;
    const totalDx = event.clientX - drag.startX;
    const totalDy = event.clientY - drag.startY;
    dragRef.current = null;
    setIsDragging(false);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (axis === 'x') {
      const next = Math.min(0, Math.max(-REVEAL_WIDTH, drag.startOffset + totalDx));
      settle(next);
      return;
    }

    if (axis === null && isOpen && Math.hypot(totalDx, totalDy) < DIRECTION_LOCK_PX) {
      onClose();
    }
  };

  const actionsRevealed = isOpen || offset < -8;

  return (
    <div ref={rootRef}>
      <div className="absolute inset-y-0 right-0 flex" aria-hidden={!actionsRevealed}>
        <button
          type="button"
          tabIndex={actionsRevealed ? 0 : -1}
          onClick={onEdit}
          aria-label="Modifica spesa"
          className="flex items-center justify-center bg-sky-100 text-sky-700 transition-colors hover:bg-sky-200"
          style={{ width: ACTION_PANEL_WIDTH }}
        >
          <Pencil size={20} aria-hidden="true" />
        </button>
        <button
          type="button"
          tabIndex={actionsRevealed ? 0 : -1}
          onClick={onDelete}
          aria-label="Elimina spesa"
          className="flex items-center justify-center bg-rose-100 text-rose-700 transition-colors hover:bg-rose-200"
          style={{ width: ACTION_PANEL_WIDTH }}
        >
          <Trash2 size={20} aria-hidden="true" />
        </button>
      </div>

      <div
        data-recent-expense-id={expense.id}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="relative z-10 flex items-center justify-between bg-white p-4 touch-pan-y select-none"
        style={{
          transform: `translate3d(${offset}px, 0, 0)`,
          transition: isDragging ? 'none' : 'transform 200ms ease-out',
        }}
      >
        <ExpenseCardBody expense={expense} showDesktopActions={false} onEdit={onEdit} onDelete={onDelete} />
      </div>
    </div>
  );
}

function ExpenseCardBody({
  expense,
  showDesktopActions,
  onEdit,
  onDelete,
}: {
  expense: Expense;
  showDesktopActions: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const Icon = ICON_COMPONENTS[CATEGORY_ICONS[expense.category]] ?? Tag;

  return (
    <>
      <div className="flex items-center gap-4">
        <div
          className={cn(
            'w-12 h-12 rounded-xl flex items-center justify-center',
            'bg-zinc-50 text-zinc-500 group-hover:bg-emerald-50 group-hover:text-emerald-600 transition-colors',
          )}
        >
          <Icon size={20} />
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
        <p className="font-bold text-zinc-900">
          €{expense.amount.toLocaleString('it-IT', { minimumFractionDigits: 2 })}
        </p>
        {showDesktopActions ? (
          <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity action-buttons">
            <button
              type="button"
              onClick={onEdit}
              aria-label="Modifica spesa"
              className="p-2 text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
            >
              <Pencil size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onDelete}
              aria-label="Elimina spesa"
              className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            >
              <Trash2 size={18} aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}
