export function WorkspaceLoadingState() {
  return (
    <div
      className="rounded-xl border border-border bg-surface-muted px-4 py-6 text-sm text-text-secondary"
      role="status"
      aria-live="polite"
    >
      Caricamento workspace…
    </div>
  );
}
