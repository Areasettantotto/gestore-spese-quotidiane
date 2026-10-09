import { ArrowLeft } from 'lucide-react';

import { CompanionsSettingsSection } from '@/src/components/app/settings/CompanionsSettingsSection';
import { useCompanionsSettings } from '@/src/features/companions/useCompanionsSettings';
import { useTenantCompanions } from '@/src/features/companions/useTenantCompanions';
import type { TenantRole } from '@/src/features/tenancy/tenancy.types';

type SettingsViewProps = {
  onBack: () => void;
  activeTenantId: string | null;
  membershipRole: TenantRole | null;
  isTenantContextLoading: boolean;
  onCompanionsEnabledUpdated: (tenantId: string) => void;
};

export function SettingsView({
  onBack,
  activeTenantId,
  membershipRole,
  isTenantContextLoading,
  onCompanionsEnabledUpdated,
}: SettingsViewProps) {
  const companionsSettings = useCompanionsSettings({
    activeTenantId,
    membershipRole,
    isTenantContextLoading,
    onCompanionsEnabledUpdated,
  });
  const tenantCompanions = useTenantCompanions({
    activeTenantId,
    membershipRole,
    isTenantContextLoading,
    companionsSettingsStatus: companionsSettings.status,
    onCompanionCatalogChanged: onCompanionsEnabledUpdated,
  });

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
      <CompanionsSettingsSection
        activeTenantId={activeTenantId}
        status={companionsSettings.status}
        isUpdating={companionsSettings.isUpdating}
        updateError={companionsSettings.updateError}
        onCompanionsEnabledChange={companionsSettings.setCompanionsEnabled}
        catalogStatus={tenantCompanions.status}
        catalogItems={tenantCompanions.items}
        isCreatingCompanion={tenantCompanions.isCreating}
        onCreateCompanion={tenantCompanions.createCompanion}
        deactivatingCompanionId={tenantCompanions.deactivatingCompanionId}
        onDeactivateCompanion={tenantCompanions.deactivateCompanion}
      />
    </section>
  );
}
