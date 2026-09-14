type WorkspaceUnavailableStateProps = {
  tenantError: string | null;
};

export function WorkspaceUnavailableState({ tenantError }: WorkspaceUnavailableStateProps) {
  return (
    <div
      className="rounded-xl border border-border bg-surface px-4 py-8 text-center text-sm text-text-secondary"
      role="region"
      aria-label="Workspace non disponibile"
    >
      <p className="font-medium text-text-primary">Workspace non disponibile</p>
      <p className="mt-2">
        {tenantError ??
          'Accedi con un account configurato oppure verifica che il profilo abbia un workspace predefinito.'}
      </p>
    </div>
  );
}
