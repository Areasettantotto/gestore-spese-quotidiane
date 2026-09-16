import type { ReactElement } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type SkeletonProps = {
  className?: string;
};

/** Presentational bone. Decorative: callers should not attach readable labels. */
export function Skeleton({ className }: SkeletonProps): ReactElement {
  return (
    <div
      aria-hidden="true"
      className={cn('rounded-md bg-surface-muted motion-safe:animate-pulse', className)}
    />
  );
}
