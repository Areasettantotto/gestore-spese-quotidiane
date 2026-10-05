import { useEffect, useId, useRef, useState, type FormEvent } from 'react';

import { Skeleton } from '@/src/components/app/Skeleton';
import {
  COMPANION_CREATE_ACTIVE_LIMIT_MESSAGE,
  COMPANION_CREATE_BLANK_NAME_MESSAGE,
  COMPANION_CREATE_FEATURE_DISABLED_MESSAGE,
  MAX_ACTIVE_TENANT_COMPANIONS,
  countActiveTenantCompanions,
  type TenantCompanion,
} from '@/src/features/companions/tenantCompanions';
import type { CompanionsSettingsStatus } from '@/src/features/companions/useCompanionsSettings';
import type {
  TenantCompanionCreateUiResult,
  TenantCompanionDeactivateUiResult,
  TenantCompanionsStatus,
} from '@/src/features/companions/useTenantCompanions';

type CompanionsSettingsSectionProps = {
  activeTenantId: string | null;
  status: CompanionsSettingsStatus;
  isUpdating: boolean;
  updateError: string | null;
  onCompanionsEnabledChange: ((next: boolean) => Promise<void>) | null;
  catalogStatus: TenantCompanionsStatus;
  catalogItems: readonly TenantCompanion[];
  isCreatingCompanion: boolean;
  onCreateCompanion: ((displayName: string) => Promise<TenantCompanionCreateUiResult>) | null;
  deactivatingCompanionId: string | null;
  onDeactivateCompanion:
    | ((companionId: string) => Promise<TenantCompanionDeactivateUiResult>)
    | null;
};

export function CompanionsSettingsSection({
  activeTenantId,
  status,
  isUpdating,
  updateError,
  onCompanionsEnabledChange,
  catalogStatus,
  catalogItems,
  isCreatingCompanion,
  onCreateCompanion,
  deactivatingCompanionId,
  onDeactivateCompanion,
}: CompanionsSettingsSectionProps) {
  if (status === 'unavailable' || status === 'unreadable') {
    return null;
  }

  const showToggle =
    (status === 'enabled' || status === 'disabled') && onCompanionsEnabledChange != null;
  const showCatalog =
    (status === 'enabled' || status === 'disabled') &&
    (catalogStatus === 'loading' || catalogStatus === 'ready' || catalogStatus === 'error');
  const activeCount = catalogStatus === 'ready' ? countActiveTenantCompanions(catalogItems) : 0;
  const atActiveLimit =
    status === 'enabled' && catalogStatus === 'ready' && activeCount >= MAX_ACTIVE_TENANT_COMPANIONS;
  const showCreate =
    status === 'enabled' && (onCreateCompanion != null || isCreatingCompanion);

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
          {status === 'loading' ? <CompanionsSettingsLoading /> : null}
        </div>
        <p className="text-sm text-text-secondary">
          Funzione dell&apos;organizzazione per associare persone alle spese.
        </p>
        {showToggle ? (
          <CompanionsEnabledSwitch
            checked={status === 'enabled'}
            isUpdating={isUpdating}
            updateError={updateError}
            onChange={onCompanionsEnabledChange}
          />
        ) : null}
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
        {showCatalog ? (
          <TenantCompanionsCatalog
            activeTenantId={activeTenantId}
            status={catalogStatus}
            items={catalogItems}
            isCreatingCompanion={isCreatingCompanion}
            deactivatingCompanionId={deactivatingCompanionId}
            onDeactivateCompanion={onDeactivateCompanion}
          />
        ) : null}
        {status === 'disabled' ? (
          <p className="border-t border-border pt-3 text-sm text-text-secondary" role="status">
            {COMPANION_CREATE_FEATURE_DISABLED_MESSAGE}
          </p>
        ) : null}
        {atActiveLimit && !isCreatingCompanion ? (
          <p className="border-t border-border pt-3 text-sm text-text-secondary" role="status">
            {COMPANION_CREATE_ACTIVE_LIMIT_MESSAGE}
          </p>
        ) : null}
        {showCreate ? (
          <CreateCompanionControl
            activeTenantId={activeTenantId}
            isCreating={isCreatingCompanion}
            isDeactivateInFlight={deactivatingCompanionId != null}
            onCreate={onCreateCompanion}
          />
        ) : null}
      </article>
    </section>
  );
}

function TenantCompanionsCatalog({
  activeTenantId,
  status,
  items,
  isCreatingCompanion,
  deactivatingCompanionId,
  onDeactivateCompanion,
}: {
  activeTenantId: string | null;
  status: TenantCompanionsStatus;
  items: readonly TenantCompanion[];
  isCreatingCompanion: boolean;
  deactivatingCompanionId: string | null;
  onDeactivateCompanion:
    | ((companionId: string) => Promise<TenantCompanionDeactivateUiResult>)
    | null;
}) {
  if (status === 'loading') {
    return <TenantCompanionsCatalogLoading />;
  }

  if (status === 'error') {
    return (
      <p className="border-t border-border pt-3 text-sm text-text-secondary" role="status">
        Non è stato possibile leggere gli accompagnatori.
      </p>
    );
  }

  if (status !== 'ready') {
    return null;
  }

  if (items.length === 0) {
    return (
      <p className="border-t border-border pt-3 text-sm text-text-secondary" role="status">
        Nessun accompagnatore configurato.
      </p>
    );
  }

  return (
    <ul aria-label="Accompagnatori configurati" className="divide-y divide-border border-t border-border">
      {items.map((item) => (
        <li key={item.id} className="space-y-2 py-2.5" aria-busy={deactivatingCompanionId === item.id}>
          <CompanionCatalogRow
            item={item}
            activeTenantId={activeTenantId}
            isCreatingCompanion={isCreatingCompanion}
            isDeactivating={deactivatingCompanionId === item.id}
            deactivateLocked={
              isCreatingCompanion ||
              (deactivatingCompanionId != null && deactivatingCompanionId !== item.id)
            }
            onDeactivate={onDeactivateCompanion}
          />
        </li>
      ))}
    </ul>
  );
}

function CompanionCatalogRow({
  item,
  activeTenantId,
  isCreatingCompanion,
  isDeactivating,
  deactivateLocked,
  onDeactivate,
}: {
  item: TenantCompanion;
  activeTenantId: string | null;
  isCreatingCompanion: boolean;
  isDeactivating: boolean;
  deactivateLocked: boolean;
  onDeactivate: ((companionId: string) => Promise<TenantCompanionDeactivateUiResult>) | null;
}) {
  const [confirming, setConfirming] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const errorId = useId();
  const isMountedRef = useRef(true);
  const activeTenantIdRef = useRef(activeTenantId);
  activeTenantIdRef.current = activeTenantId;
  const seenTenantIdRef = useRef(activeTenantId);
  const showDeactivate = item.isActive && onDeactivate != null;
  const showConfirmation = item.isActive && confirming;

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (seenTenantIdRef.current === activeTenantId) return;
    seenTenantIdRef.current = activeTenantId;
    setConfirming(false);
    setLocalError(null);
  }, [activeTenantId]);

  useEffect(() => {
    if (item.isActive) return;
    setConfirming(false);
    setLocalError(null);
  }, [item.isActive]);

  const handleConfirm = async () => {
    if (!showDeactivate || onDeactivate == null) return;
    if (isDeactivating || deactivateLocked || isCreatingCompanion) return;

    setLocalError(null);
    const tenantAtConfirm = activeTenantId;
    const result = await onDeactivate(item.id);
    if (!isMountedRef.current) return;
    if (activeTenantIdRef.current !== tenantAtConfirm) return;

    if (result.kind === 'deactivated') {
      setConfirming(false);
      setLocalError(null);
      return;
    }

    if (result.kind === 'failed') {
      setLocalError(result.message);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-sm text-text-primary" title={item.displayName}>
          {item.displayName}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="text-sm text-text-muted">{item.isActive ? 'Attivo' : 'Disattivato'}</span>
          {showDeactivate && !showConfirmation ? (
            <button
              type="button"
              onClick={() => {
                setLocalError(null);
                setConfirming(true);
              }}
              disabled={deactivateLocked}
              className="rounded-xl px-2.5 py-1 text-sm font-medium text-danger hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-60"
            >
              Disattiva
            </button>
          ) : null}
        </span>
      </div>
      {showConfirmation ? (
        <div className="space-y-2">
          <p className="text-sm text-text-secondary">Disattivare questo accompagnatore?</p>
          <p className="text-sm text-text-muted">Lo storico rimarrà disponibile.</p>
          {localError ? (
            <p id={errorId} className="text-sm text-danger" role="alert">
              {localError}
            </p>
          ) : null}
          {isDeactivating ? (
            <p className="text-sm text-text-muted" role="status">
              Disattivazione in corso
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                void handleConfirm();
              }}
              disabled={isDeactivating || deactivateLocked || onDeactivate == null}
              className="btn-primary px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              Conferma
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
                setLocalError(null);
              }}
              disabled={isDeactivating}
              className="rounded-xl px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              Annulla
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

function CreateCompanionControl({
  activeTenantId,
  isCreating,
  isDeactivateInFlight,
  onCreate,
}: {
  activeTenantId: string | null;
  isCreating: boolean;
  isDeactivateInFlight: boolean;
  onCreate: ((displayName: string) => Promise<TenantCompanionCreateUiResult>) | null;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const inputId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const isMountedRef = useRef(true);
  const activeTenantIdRef = useRef(activeTenantId);
  activeTenantIdRef.current = activeTenantId;
  const seenTenantIdRef = useRef(activeTenantId);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (seenTenantIdRef.current === activeTenantId) return;
    seenTenantIdRef.current = activeTenantId;
    setOpen(false);
    setDraft('');
    setLocalError(null);
  }, [activeTenantId]);

  const closeForm = () => {
    setOpen(false);
    setDraft('');
    setLocalError(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isCreating || isDeactivateInFlight || onCreate == null) return;
    if (draft.trim().length === 0) {
      setLocalError(COMPANION_CREATE_BLANK_NAME_MESSAGE);
      return;
    }

    setLocalError(null);
    const tenantAtSubmit = activeTenantId;
    const result = await onCreate(draft);
    if (!isMountedRef.current) return;
    if (activeTenantIdRef.current !== tenantAtSubmit) return;

    if (result.kind === 'created') {
      closeForm();
      return;
    }

    if (result.kind === 'failed') {
      setLocalError(result.message);
    }
  };

  if (!open) {
    return (
      <div className="border-t border-border pt-3">
        <button
          type="button"
          onClick={() => {
            setLocalError(null);
            setOpen(true);
          }}
          disabled={onCreate == null || isDeactivateInFlight}
          className="rounded-xl px-3 py-2 text-sm font-medium text-primary hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-60"
        >
          Aggiungi accompagnatore
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
      aria-busy={isCreating}
      className="space-y-2 border-t border-border pt-3"
    >
      <div className="space-y-2">
        <label htmlFor={inputId} className="text-sm font-medium text-text-secondary">
          Nome accompagnatore
        </label>
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          value={draft}
          autoComplete="off"
          disabled={isCreating || isDeactivateInFlight}
          aria-invalid={localError != null}
          aria-describedby={localError ? errorId : undefined}
          onChange={(event) => {
            setDraft(event.target.value);
            if (localError) setLocalError(null);
          }}
          className="input-field"
        />
      </div>
      {localError ? (
        <p id={errorId} className="text-sm text-danger" role="alert">
          {localError}
        </p>
      ) : null}
      {isCreating ? (
        <p className="text-sm text-text-muted" role="status">
          Aggiunta in corso
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={isCreating || isDeactivateInFlight || onCreate == null}
          className="btn-primary px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          Aggiungi
        </button>
        <button
          type="button"
          onClick={closeForm}
          disabled={isCreating}
          className="rounded-xl px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          Annulla
        </button>
      </div>
    </form>
  );
}

function TenantCompanionsCatalogLoading() {
  return (
    <div aria-live="polite" aria-atomic="true" aria-busy="true" className="space-y-2 border-t border-border pt-3">
      <span className="sr-only">Caricamento accompagnatori</span>
      <Skeleton className="h-5 w-full" />
      <Skeleton className="h-5 w-4/5" />
      <Skeleton className="h-5 w-3/5" />
    </div>
  );
}

function CompanionsSettingsLoading() {
  return (
    <div aria-live="polite" aria-atomic="true" aria-busy="true">
      <span className="sr-only">Caricamento stato Accompagnatori</span>
      <Skeleton className="h-5 w-28 rounded-full" />
    </div>
  );
}

function CompanionsEnabledSwitch({
  checked,
  isUpdating,
  updateError,
  onChange,
}: {
  checked: boolean;
  isUpdating: boolean;
  updateError: string | null;
  onChange: (next: boolean) => Promise<void>;
}) {
  const switchId = useId();
  const labelId = useId();
  const statusId = useId();
  const switchRef = useRef<HTMLButtonElement>(null);
  const wasUpdatingRef = useRef(false);

  useEffect(() => {
    if (wasUpdatingRef.current && !isUpdating) {
      switchRef.current?.focus();
    }
    wasUpdatingRef.current = isUpdating;
  }, [isUpdating]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-4">
        <label id={labelId} htmlFor={switchId} className="min-w-0 text-sm text-text-secondary">
          Abilita la gestione degli Accompagnatori per questa organizzazione.
        </label>
        <button
          ref={switchRef}
          id={switchId}
          type="button"
          role="switch"
          aria-checked={checked}
          aria-labelledby={labelId}
          aria-describedby={statusId}
          aria-busy={isUpdating}
          disabled={isUpdating}
          onClick={() => {
            if (isUpdating) return;
            void onChange(!checked);
          }}
          className="inline-flex h-11 w-16 shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span
            aria-hidden="true"
            className={`relative inline-flex h-7 w-12 items-center rounded-full border transition-colors ${
              checked ? 'border-transparent bg-primary' : 'border-border bg-surface-muted'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
                checked ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </span>
        </button>
      </div>
      <p id={statusId} className="text-sm text-text-muted">
        {checked ? 'Funzione attiva' : 'Funzione disattivata'}
      </p>
      {isUpdating ? (
        <p className="text-sm text-text-muted" role="status">
          Aggiornamento in corso
        </p>
      ) : null}
      {updateError ? (
        <p className="text-sm text-danger" role="alert">
          {updateError}
        </p>
      ) : null}
    </div>
  );
}
