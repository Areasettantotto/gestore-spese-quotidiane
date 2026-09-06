import { Plus } from 'lucide-react';
import { AccountMenu } from '@/src/components/app/AccountMenu';

type AppHeaderProps = {
  dateLabel: string;
  userEmail: string | null;
  addDisabled: boolean;
  accessBadgeLabel: string | null;
  accountTier: 'base' | 'pro' | null;
  billingNotice: string | null;
  showBillingPlaceholder: boolean;
  onAdd: () => void;
  onSignOut: () => void;
};

export function AppHeader({
  dateLabel,
  userEmail,
  addDisabled,
  accessBadgeLabel,
  accountTier,
  billingNotice,
  showBillingPlaceholder,
  onAdd,
  onSignOut,
}: AppHeaderProps) {
  const showAccessRow = Boolean(accessBadgeLabel) || Boolean(billingNotice) || showBillingPlaceholder;

  return (
    <header className="bg-white border-b border-zinc-200 sticky top-0 z-10">
      <div className="max-w-2xl mx-auto px-4 py-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Gestore Spese</h1>
          <p className="text-sm text-zinc-500">{dateLabel}</p>
          {showAccessRow ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {accessBadgeLabel ? (
                <span className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">
                  {accessBadgeLabel}
                </span>
              ) : null}
              {billingNotice ? <span className="text-xs text-zinc-500">{billingNotice}</span> : null}
              {showBillingPlaceholder ? (
                <span className="text-xs text-zinc-400 cursor-not-allowed">CTA billing disponibile a breve</span>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-3 sm:gap-4">
          <button
            type="button"
            onClick={onAdd}
            disabled={addDisabled}
            className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
          >
            <Plus size={20} />
            <span>Aggiungi</span>
          </button>

          <AccountMenu userEmail={userEmail} accountTier={accountTier} onSignOut={onSignOut} />
        </div>
      </div>
    </header>
  );
}
