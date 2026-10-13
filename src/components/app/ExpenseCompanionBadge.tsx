import { UserRound } from 'lucide-react';

import {
  ACCOMPAGNATORE_NON_DISPONIBILE_LABEL,
  COMPANION_ABSENT_ACCESSIBLE_LABEL,
  associatedCompanionLabel,
  type ExpenseCompanionPresentation,
} from '@/src/features/companions/expenseCompanionPresentation';

const CHIP_GEOMETRY =
  'inline-flex size-5 shrink-0 items-center justify-center rounded-md';

/**
 * Associated companion chip. Light mode uses the same neutral border, muted
 * fill, and secondary icon as other gray badges. Dark mode keeps the thin
 * emerald border and translucent primary wash so the chip stays visible on
 * both zinc-900 cards and zinc-800 inspectors.
 */
const ASSOCIATED_CHIP =
  'border border-border bg-surface-muted text-text-secondary dark:border-primary/50 dark:bg-primary/15 dark:text-primary';

const NEUTRAL_CHIP = 'bg-surface-muted text-text-secondary';

/** Absent companion: outlined neutral chip. No opacity, so the muted icon stays readable. */
const ABSENT_CHIP = 'border border-border bg-surface text-text-muted';

type ExpenseCompanionBadgeProps = {
  presentation: ExpenseCompanionPresentation;
};

export function ExpenseCompanionBadge({ presentation }: ExpenseCompanionBadgeProps) {
  if (presentation.status === 'hidden') return null;

  if (presentation.status === 'absent') {
    return (
      <span
        role="img"
        aria-label={COMPANION_ABSENT_ACCESSIBLE_LABEL}
        className={`${CHIP_GEOMETRY} ${ABSENT_CHIP}`}
      >
        <UserRound size={12} aria-hidden="true" />
      </span>
    );
  }

  const label =
    presentation.status === 'associated'
      ? associatedCompanionLabel(presentation.displayName)
      : ACCOMPAGNATORE_NON_DISPONIBILE_LABEL;

  const chipClass = presentation.status === 'associated' ? ASSOCIATED_CHIP : NEUTRAL_CHIP;

  return (
    <span className="inline-flex min-w-0 max-w-full items-start gap-1.5 text-xs/5 text-text-muted">
      <span className={`${CHIP_GEOMETRY} ${chipClass}`} aria-hidden="true">
        <UserRound size={12} aria-hidden="true" />
      </span>
      <span className="min-w-0 break-words">{label}</span>
    </span>
  );
}
