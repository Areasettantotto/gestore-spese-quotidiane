import { Badge, Crown, Gift, Plus } from 'lucide-react';
import { AccountMenu } from '@/src/components/app/AccountMenu';

type AccountTier = 'base' | 'pro';

type AppHeaderProps = {
  dateLabel: string;
  userEmail: string | null;
  addDisabled: boolean;
  accessBadgeLabel: string | null;
  accountTier: AccountTier | null;
  giftLabel: 'Gift' | null;
  onAdd: () => void;
  onSignOut: () => void;
};

function PlanTierIcon({ accountTier }: { accountTier: AccountTier | null }) {
  if (accountTier === 'pro') {
    return <Crown size={12} className="shrink-0" aria-hidden="true" />;
  }
  if (accountTier === 'base') {
    return <Badge size={12} className="shrink-0" aria-hidden="true" />;
  }
  return null;
}

export function AppHeader({
  dateLabel,
  userEmail,
  addDisabled,
  accessBadgeLabel,
  accountTier,
  giftLabel,
  onAdd,
  onSignOut,
}: AppHeaderProps) {
  const showAccessRow = Boolean(accessBadgeLabel) || Boolean(giftLabel);

  return (
    <header className="bg-white border-b border-zinc-200 sticky top-0 z-10">
      <div className="max-w-2xl mx-auto px-4 py-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Gestore Spese</h1>
          <p className="text-sm text-zinc-500">{dateLabel}</p>
          {showAccessRow ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {accessBadgeLabel ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">
                  <PlanTierIcon accountTier={accountTier} />
                  {accessBadgeLabel}
                </span>
              ) : null}
              {giftLabel ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-xs font-medium text-zinc-500">
                  <Gift size={12} className="shrink-0" aria-hidden="true" />
                  {giftLabel}
                </span>
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
