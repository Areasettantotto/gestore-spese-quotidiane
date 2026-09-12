import { Home, Plus, ReceiptText } from 'lucide-react';

type BottomNavigationView = 'home' | 'all';

type BottomNavigationProps = {
  activeView: BottomNavigationView;
  onHome: () => void;
  onExpenses: () => void;
  onAdd: () => void;
  addDisabled: boolean;
};

const tabClassName = (isActive: boolean) =>
  [
    'flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-md px-2 py-1',
    'text-[11px] leading-none transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:ring-offset-2',
    isActive ? 'font-semibold text-emerald-600' : 'font-medium text-zinc-500',
  ].join(' ');

export function BottomNavigation({ activeView, onHome, onExpenses, onAdd, addDisabled }: BottomNavigationProps) {
  const homeActive = activeView === 'home';
  const expensesActive = activeView === 'all';

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 overflow-visible border-t border-zinc-200 bg-white lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      aria-label="Navigazione principale"
    >
      <div className="flex h-14 items-center px-2">
        <button
          type="button"
          className={tabClassName(homeActive)}
          onClick={onHome}
          aria-current={homeActive ? 'page' : undefined}
        >
          <Home size={20} aria-hidden="true" />
          <span>Home</span>
        </button>

        <button
          type="button"
          onClick={onAdd}
          disabled={addDisabled}
          aria-label="Aggiungi spesa"
          className="relative -top-5 mx-1 flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-4 border-white bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:pointer-events-none disabled:opacity-50"
        >
          <Plus size={26} aria-hidden="true" />
        </button>

        <button
          type="button"
          className={tabClassName(expensesActive)}
          onClick={onExpenses}
          aria-current={expensesActive ? 'page' : undefined}
        >
          <ReceiptText size={20} aria-hidden="true" />
          <span>Spese</span>
        </button>
      </div>
    </nav>
  );
}
