import { ArrowLeft } from 'lucide-react';

type SettingsViewProps = {
  onBack: () => void;
};

export function SettingsView({ onBack }: SettingsViewProps) {
  return (
    <section aria-labelledby="settings-heading" className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onBack}
            aria-label="Torna alla Home"
            className="p-2 hover:bg-surface-muted rounded-full transition-colors text-text-secondary"
          >
            <ArrowLeft size={24} aria-hidden="true" />
          </button>
          <h2 id="settings-heading" className="text-xl font-bold text-text-primary">
            Impostazioni
          </h2>
        </div>
        <div className="invisible select-none text-right" aria-hidden="true">
          <p className="text-xs text-text-muted font-medium uppercase tracking-wider">&nbsp;</p>
          <p className="text-lg font-bold text-primary">&nbsp;</p>
        </div>
      </div>
      <p className="text-sm text-text-secondary">Preferenze personali e impostazioni dell'organizzazione.</p>
    </section>
  );
}
