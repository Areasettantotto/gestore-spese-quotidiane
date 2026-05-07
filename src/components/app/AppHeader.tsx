import { Plus, LogOut } from 'lucide-react';

type AppHeaderProps = {
  dateLabel: string;
  userEmail: string | null;
  addDisabled: boolean;
  billingPlanLabel: string | null;
  billingNotice: string | null;
  showBillingPlaceholder: boolean;
  onAdd: () => void;
  onSignOut: () => void;
};

export function AppHeader({
  dateLabel,
  userEmail,
  addDisabled,
  billingPlanLabel,
  billingNotice,
  showBillingPlaceholder,
  onAdd,
  onSignOut,
}: AppHeaderProps) {
  return (
    <header className="bg-white border-b border-zinc-200 sticky top-0 z-10">
      <div className="max-w-2xl mx-auto px-4 py-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Gestore Spese</h1>
          <p className="text-sm text-zinc-500">{dateLabel}</p>
          {billingPlanLabel ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">
                {billingPlanLabel}
              </span>
              {billingNotice ? <span className="text-xs text-zinc-500">{billingNotice}</span> : null}
              {showBillingPlaceholder ? (
                <span className="text-xs text-zinc-400 cursor-not-allowed">CTA billing disponibile a breve</span>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onAdd}
            disabled={addDisabled}
            className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
          >
            <Plus size={20} />
            <span>Aggiungi</span>
          </button>

          <div className="flex items-center gap-3">
            {userEmail ? <span className="text-sm text-zinc-600 hidden sm:inline">{userEmail}</span> : null}
            <button
              onClick={onSignOut}
              aria-label="Logout"
              title="Logout"
              className="p-2 rounded-full hover:bg-zinc-100 transition-colors"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
