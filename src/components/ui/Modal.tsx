import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { cn } from '@/utils/cn';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** Largeur max (par défaut max-w-md). */
  size?: 'sm' | 'md' | 'lg';
  /** Désactive la fermeture sur Escape / clic backdrop. */
  dismissible?: boolean;
}

const SIZE_CLASS = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
} as const;

/**
 * Modal accessible : focus trap basique, Escape pour fermer, clic backdrop, scroll-lock.
 *
 * Utilise createPortal pour s'attacher au body (évite stacking contexts foireux).
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  size = 'md',
  dismissible = true,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);

  // Escape + scroll lock + focus
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Focus le dialog après mount pour ARIA
    const t = window.setTimeout(() => dialogRef.current?.focus(), 50);

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      window.clearTimeout(t);
    };
  }, [open, onClose, dismissible]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-ink/60 backdrop-blur-sm modal-backdrop"
        onClick={dismissible ? onClose : undefined}
        aria-hidden
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={cn(
          'relative w-full bg-white rounded-t-3xl sm:rounded-3xl shadow-xl',
          'max-h-[90dvh] overflow-y-auto modal-dialog',
          SIZE_CLASS[size],
        )}
      >
        {(title || dismissible) && (
          <div className="sticky top-0 bg-white z-10 flex items-center justify-between gap-3 px-5 py-4 border-b border-line rounded-t-3xl">
            <h2 id="modal-title" className="text-lg font-display font-bold text-ink">
              {title}
            </h2>
            {dismissible && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Fermer"
                className="w-9 h-9 rounded-full inline-flex items-center justify-center text-muted hover:text-ink hover:bg-cream-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        )}
        <div className="p-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
