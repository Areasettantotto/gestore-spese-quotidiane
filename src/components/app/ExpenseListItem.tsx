import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Coffee, Heart, Home, Music, Pencil, ShoppingBag, Tag, Trash2, Truck } from 'lucide-react';
import { expenseCategoryByCode } from '@/src/features/expenses/expenseCategoryCatalog';
import type { ExpenseWithCategoryCode } from '@/src/features/expenses/expenses.types';

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

export type ExpenseDateFormat = 'd MMM' | 'd MMMM yyyy';

export type ExpenseListItemProps = {
  expense: ExpenseWithCategoryCode;
  dateFormat: ExpenseDateFormat;
  isMobileSwipe: boolean;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onExclusiveSwipe: () => void;
  onEdit: () => void;
  onDeleteRequest: () => void;
};

export function useMobileSwipeViewport(): boolean {
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

export function ExpenseListItem({
  expense,
  dateFormat,
  isMobileSwipe,
  isOpen,
  onOpen,
  onClose,
  onExclusiveSwipe,
  onEdit,
  onDeleteRequest,
}: ExpenseListItemProps) {
  if (isMobileSwipe) {
    return (
      <div className="card relative overflow-hidden">
        <SwipeableExpenseCard
          expense={expense}
          dateFormat={dateFormat}
          isOpen={isOpen}
          onOpen={onOpen}
          onClose={onClose}
          onExclusiveSwipe={onExclusiveSwipe}
          onEdit={onEdit}
          onDelete={onDeleteRequest}
        />
      </div>
    );
  }

  return (
    <div className="card card-interactive p-4 flex items-center justify-between group">
      <ExpenseCardBody
        expense={expense}
        dateFormat={dateFormat}
        showDesktopActions
        onEdit={onEdit}
        onDelete={onDeleteRequest}
      />
    </div>
  );
}

type SwipeableExpenseCardProps = {
  expense: ExpenseWithCategoryCode;
  dateFormat: ExpenseDateFormat;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onExclusiveSwipe: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

type DragAxis = 'x' | 'y' | null;

function SwipeableExpenseCard({
  expense,
  dateFormat,
  isOpen,
  onOpen,
  onClose,
  onExclusiveSwipe,
  onEdit,
  onDelete,
}: SwipeableExpenseCardProps) {
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
          className="swipe-action-edit"
          style={{ width: ACTION_PANEL_WIDTH }}
        >
          <Pencil size={20} aria-hidden="true" />
        </button>
        <button
          type="button"
          tabIndex={actionsRevealed ? 0 : -1}
          onClick={onDelete}
          aria-label="Elimina spesa"
          className="swipe-action-delete"
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
        className="relative z-10 flex items-center justify-between bg-surface p-4 touch-pan-y select-none"
        style={{
          transform: `translate3d(${offset}px, 0, 0)`,
          transition: isDragging ? 'none' : 'transform 200ms ease-out',
        }}
      >
        <ExpenseCardBody
          expense={expense}
          dateFormat={dateFormat}
          showDesktopActions={false}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      </div>
    </div>
  );
}

function ExpenseCardBody({
  expense,
  dateFormat,
  showDesktopActions,
  onEdit,
  onDelete,
}: {
  expense: ExpenseWithCategoryCode;
  dateFormat: ExpenseDateFormat;
  showDesktopActions: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const Icon = ICON_COMPONENTS[expenseCategoryByCode(expense.categoryCode).iconKey] ?? Tag;

  return (
    <>
      <div className="flex items-center gap-4">
        <div
          className={cn(
            'w-12 h-12 rounded-xl flex items-center justify-center',
            'bg-surface-muted text-text-muted group-hover:bg-primary-soft group-hover:text-primary transition-colors',
          )}
        >
          <Icon size={20} />
        </div>
        <div>
          <p className="font-semibold text-text-primary">{expense.description}</p>
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <span className="font-medium px-1.5 py-0.5 bg-surface-muted rounded text-text-secondary">
              {expense.accompagnatore ? expense.accompagnatore.charAt(0) : 'S'}
            </span>
            <span>•</span>
            <span>{format(parseISO(expense.date), dateFormat, { locale: it })}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <p className="font-bold text-text-primary">
          €{expense.amount.toLocaleString('it-IT', { minimumFractionDigits: 2 })}
        </p>
        {showDesktopActions ? (
          <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity action-buttons">
            <button
              type="button"
              onClick={onEdit}
              aria-label="Modifica spesa"
              className="p-2 text-text-faint hover:text-primary hover:bg-primary-soft rounded-lg transition-colors"
            >
              <Pencil size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onDelete}
              aria-label="Elimina spesa"
              className="p-2 text-text-faint hover:text-danger hover:bg-danger-soft rounded-lg transition-colors"
            >
              <Trash2 size={18} aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}
