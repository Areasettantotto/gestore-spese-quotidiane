import { useEffect, useId, useRef, useState } from 'react';
import { Home, MoreHorizontal, Plus, ReceiptText, Settings } from 'lucide-react';

type BottomNavigationView = 'home' | 'all' | 'settings';

type BottomNavigationProps = {
  activeView: BottomNavigationView;
  onHome: () => void;
  onExpenses: () => void;
  onSettings: () => void;
  onAdd: () => void;
  addDisabled: boolean;
};

const tabClassName = (isActive: boolean) =>
  [
    'flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-md px-2 py-1',
    'text-[11px] leading-none transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-focus/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
    isActive ? 'font-semibold text-primary' : 'font-medium text-text-muted',
  ].join(' ');

export function BottomNavigation({
  activeView,
  onHome,
  onExpenses,
  onSettings,
  onAdd,
  addDisabled,
}: BottomNavigationProps) {
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const moreTriggerRef = useRef<HTMLButtonElement>(null);
  const moreMenuId = useId();

  const homeActive = activeView === 'home';
  const expensesActive = activeView === 'all';
  const settingsActive = activeView === 'settings';

  useEffect(() => {
    if (!isMoreOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (moreRef.current?.contains(target)) return;
      setIsMoreOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setIsMoreOpen(false);
      moreTriggerRef.current?.focus();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMoreOpen]);

  const handleOpenSettings = () => {
    setIsMoreOpen(false);
    onSettings();
  };

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 overflow-visible border-t border-border bg-surface lg:hidden"
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
          className="fab-add"
        >
          <Plus size={26} aria-hidden="true" />
        </button>

        <div className="flex min-w-0 flex-1 items-center">
          <button
            type="button"
            className={tabClassName(expensesActive)}
            onClick={onExpenses}
            aria-current={expensesActive ? 'page' : undefined}
          >
            <ReceiptText size={20} aria-hidden="true" />
            <span>Spese</span>
          </button>

          <div ref={moreRef} className="relative flex min-w-0 flex-1">
            <button
              ref={moreTriggerRef}
              type="button"
              className={tabClassName(settingsActive)}
              onClick={() => setIsMoreOpen((current) => !current)}
              aria-expanded={isMoreOpen}
              aria-controls={moreMenuId}
              aria-current={settingsActive ? 'page' : undefined}
            >
              <MoreHorizontal size={20} aria-hidden="true" />
              <span>Altro</span>
            </button>

            {isMoreOpen ? (
              <div
                id={moreMenuId}
                className="absolute bottom-full right-0 z-30 mb-3 w-56 rounded-xl border border-border bg-surface py-2 shadow-lg"
              >
                <button
                  type="button"
                  onClick={handleOpenSettings}
                  aria-current={settingsActive ? 'page' : undefined}
                  className={[
                    'flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-focus/40 focus-visible:ring-inset',
                    settingsActive ? 'shell-nav-active' : 'font-medium text-text-secondary hover:bg-surface-muted',
                  ].join(' ')}
                >
                  <Settings size={16} className={settingsActive ? 'text-primary' : 'text-text-muted'} aria-hidden="true" />
                  Impostazioni
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </nav>
  );
}
