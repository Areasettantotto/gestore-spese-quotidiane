/**
 * Pure companion presentation for one expense row.
 *
 * A null lookup means the caller withheld the catalog: feature off, not ready,
 * or a stale tenant snapshot. That is hidden, never an absent companion.
 * A nonblank resolved name is shown as stored, including inactive companions.
 * Blank names and unknown ids stay unavailable. Raw ids are never labels.
 */
export const ACCOMPAGNATORE_NON_DISPONIBILE_LABEL = 'Accompagnatore non disponibile';

/** Accessible name for the icon-only badge when the expense has no companion. */
export const COMPANION_ABSENT_ACCESSIBLE_LABEL = 'Senza accompagnatore';

export type ExpenseCompanionPresentation =
  | { status: 'hidden' }
  | { status: 'absent' }
  | { status: 'associated'; displayName: string }
  | { status: 'unavailable' };

export function associatedCompanionLabel(displayName: string): string {
  return `con ${displayName}`;
}

export function resolveExpenseCompanionPresentation(
  companionId: string | null | undefined,
  companionDisplayNamesById: ReadonlyMap<string, string> | null,
): ExpenseCompanionPresentation {
  if (companionDisplayNamesById == null) {
    return { status: 'hidden' };
  }

  if (companionId == null) {
    return { status: 'absent' };
  }

  const displayName = companionDisplayNamesById.get(companionId)?.trim() ?? '';
  if (displayName.length > 0) {
    return { status: 'associated', displayName };
  }

  return { status: 'unavailable' };
}
