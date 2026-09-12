import type { ReactNode } from 'react';
import { Home, ReceiptText } from 'lucide-react';

type DesktopSidebarView = 'home' | 'all';

type DesktopSidebarProps = {
  activeView: DesktopSidebarView;
  onHome: () => void;
  onExpenses: () => void;
  bottomSlot?: ReactNode;
};

const itemClassName = (isActive: boolean) =>
  [
    'flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm',
    'transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:ring-offset-2',
    isActive
      ? 'bg-emerald-50 font-semibold text-emerald-800'
      : 'font-medium text-zinc-600 hover:bg-zinc-50 hover:text-zinc-800',
  ].join(' ');

export function DesktopSidebar({ activeView, onHome, onExpenses, bottomSlot }: DesktopSidebarProps) {
  const homeActive = activeView === 'home';
  const expensesActive = activeView === 'all';

  return (
    <aside className="fixed inset-y-0 left-0 z-10 hidden h-screen w-64 flex-col border-r border-zinc-200 bg-white lg:flex">
      <div className="px-5 py-6">
        <p className="text-lg font-semibold text-zinc-950">Gestore Spese</p>
      </div>

      <nav className="flex flex-col gap-1 px-3" aria-label="Navigazione principale">
        <button
          type="button"
          className={itemClassName(homeActive)}
          onClick={onHome}
          aria-current={homeActive ? 'page' : undefined}
        >
          <Home size={20} className={homeActive ? 'text-emerald-600' : 'text-zinc-500'} aria-hidden="true" />
          <span>Home</span>
        </button>

        <button
          type="button"
          className={itemClassName(expensesActive)}
          onClick={onExpenses}
          aria-current={expensesActive ? 'page' : undefined}
        >
          <ReceiptText size={20} className={expensesActive ? 'text-emerald-600' : 'text-zinc-500'} aria-hidden="true" />
          <span>Spese</span>
        </button>
      </nav>

      <div className="mt-auto min-h-16 border-t border-zinc-100 px-3 py-4">{bottomSlot}</div>
    </aside>
  );
}
