import { Skeleton } from '@/src/components/app/Skeleton';
import type { CompanionsSettingsStatus } from '@/src/features/companions/useCompanionsSettings';

type CompanionsSettingsSectionProps = {
  status: CompanionsSettingsStatus;
};

const STATUS_BADGE_CLASS =
  'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium';

export function CompanionsSettingsSection({ status }: CompanionsSettingsSectionProps) {
  if (status === 'unavailable' || status === 'unreadable') {
    return null;
  }

  return (
    <section aria-labelledby="settings-organization-heading" className="space-y-3">
      <h3
        id="settings-organization-heading"
        className="text-xs font-medium uppercase tracking-wider text-text-muted"
      >
        Organizzazione
      </h3>
      <article aria-labelledby="companions-settings-heading" className="card space-y-3 p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 id="companions-settings-heading" className="text-base font-semibold text-text-primary">
            Accompagnatori
          </h4>
          <CompanionsFeatureStatus status={status} />
        </div>
        <p className="text-sm text-text-secondary">
          Funzione dell&apos;organizzazione per associare persone alle spese.
        </p>
        {status === 'error' ? (
          <p className="text-sm text-text-secondary" role="status">
            Non è stato possibile leggere lo stato della funzione.
          </p>
        ) : null}
        {status === 'missing' ? (
          <p className="text-sm text-text-secondary" role="status">
            L&apos;impostazione della funzione non è presente.
          </p>
        ) : null}
      </article>
    </section>
  );
}

function CompanionsFeatureStatus({
  status,
}: {
  status: Exclude<CompanionsSettingsStatus, 'unavailable' | 'unreadable'>;
}) {
  if (status !== 'loading' && status !== 'enabled' && status !== 'disabled') {
    return null;
  }

  return (
    <div aria-live="polite" aria-atomic="true" aria-busy={status === 'loading'}>
      {status === 'loading' ? (
        <>
          <span className="sr-only">Caricamento stato Accompagnatori</span>
          <Skeleton className="h-5 w-28 rounded-full" />
        </>
      ) : (
        <span
          className={`${STATUS_BADGE_CLASS} ${
            status === 'enabled'
              ? 'border-transparent bg-primary-soft text-primary-soft-fg'
              : 'border-border bg-surface-muted text-text-secondary'
          }`}
        >
          {status === 'enabled' ? 'Funzione attiva' : 'Funzione disattivata'}
        </span>
      )}
    </div>
  );
}
