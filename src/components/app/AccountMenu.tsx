import { useEffect, useId, useRef, useState } from 'react';
import { LogOut } from 'lucide-react';

type AccountMenuProps = {
  userEmail: string | null;
  onSignOut: () => void;
};

const NEUTRAL_INITIALS = '?';

function initialsFromEmail(email: string | null): string {
  if (!email) return NEUTRAL_INITIALS;

  const trimmed = email.trim();
  const atIndex = trimmed.indexOf('@');
  const localPart = (atIndex === -1 ? trimmed : trimmed.slice(0, atIndex)).trim();

  if (!localPart) return NEUTRAL_INITIALS;

  const parts = localPart.split(/[._-]+/).filter((part) => part.length > 0);

  if (parts.length === 0) return NEUTRAL_INITIALS;

  if (parts.length === 1) {
    const part = parts[0];
    return part.slice(0, Math.min(2, part.length)).toUpperCase();
  }

  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export function AccountMenu({ userEmail, onSignOut }: AccountMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const initials = initialsFromEmail(userEmail);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (containerRef.current?.contains(target)) return;
      setIsOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleSignOut = () => {
    setIsOpen(false);
    onSignOut();
  };

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-label="Menu account"
        aria-expanded={isOpen}
        aria-controls={menuId}
        onClick={() => setIsOpen((current) => !current)}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:ring-offset-2"
      >
        <span aria-hidden="true">{initials}</span>
      </button>

      {isOpen ? (
        <div
          id={menuId}
          className="absolute right-0 z-20 mt-2 w-56 rounded-xl border border-zinc-200 bg-white py-2 shadow-lg"
        >
          <div className="px-3 py-2">
            <p className="truncate text-sm text-zinc-600" title={userEmail ?? undefined}>
              {userEmail ?? 'Account'}
            </p>
          </div>
          <div className="my-1 border-t border-zinc-100" />
          <button
            type="button"
            onClick={handleSignOut}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-700 transition-colors hover:bg-zinc-50"
          >
            <LogOut size={16} aria-hidden="true" />
            Esci
          </button>
        </div>
      ) : null}
    </div>
  );
}
