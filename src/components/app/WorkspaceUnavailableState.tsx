type WorkspaceUnavailableStateProps = {
  tenantError: string | null;
};

export function WorkspaceUnavailableState({ tenantError }: WorkspaceUnavailableStateProps) {
  return (
    <div
      className="rounded-xl border border-zinc-200 bg-white px-4 py-8 text-center text-sm text-zinc-600"
      role="region"
      aria-label="Workspace non disponibile"
    >
      <p className="font-medium text-zinc-900">Workspace non disponibile</p>
      <p className="mt-2">
        {tenantError ??
          'Accedi con un account configurato oppure verifica che il profilo abbia un workspace predefinito.'}
      </p>
    </div>
  );
}
