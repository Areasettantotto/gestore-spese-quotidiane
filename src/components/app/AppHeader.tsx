import { Badge, Crown, Gift, Plus } from 'lucide-react';
import { AccountMenu } from '@/src/components/app/AccountMenu';
import { Skeleton } from '@/src/components/app/Skeleton';

type AccountTier = 'base' | 'pro';

type AppHeaderProps = {
  dateLabel: string;
  userEmail: string | null;
  addDisabled: boolean;
  isAccessLoading: boolean;
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
  isAccessLoading,
  accessBadgeLabel,
  accountTier,
  giftLabel,
  onAdd,
  onSignOut,
}: AppHeaderProps) {
  const showAccessRow = Boolean(accessBadgeLabel) || Boolean(giftLabel);

  return (
    <header className="bg-surface border-b border-border sticky top-0 z-30">
      <div className="max-w-2xl mx-auto px-4 py-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Gestore Spese</h1>
          <p className="text-sm text-text-muted">{dateLabel}</p>
          {isAccessLoading ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          ) : showAccessRow ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {accessBadgeLabel ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-muted px-2 py-0.5 text-xs font-medium text-text-secondary">
                  <PlanTierIcon accountTier={accountTier} />
                  {accessBadgeLabel}
                </span>
              ) : null}
              {giftLabel ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5 text-xs font-medium text-text-muted">
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
