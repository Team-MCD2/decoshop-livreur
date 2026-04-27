import type { HTMLAttributes, ReactNode } from 'react';
import { tv, type VariantProps } from 'tailwind-variants';
import { cn } from '@/utils/cn';
import type { BLStatus } from '@/types/domain';

const badgeStyles = tv({
  base: 'inline-flex items-center gap-1.5 rounded-full text-xs font-bold tracking-wider uppercase',
  variants: {
    intent: {
      navy: 'bg-navy-50 text-navy',
      yellow: 'bg-yellow-300 text-ink',
      success: 'bg-green-100 text-green-700',
      warning: 'bg-orange-100 text-orange-700',
      danger: 'bg-red-100 text-red-700',
      info: 'bg-blue-100 text-blue-700',
      muted: 'bg-cream-100 text-muted',
    },
    size: {
      sm: 'px-2 py-0.5 text-[10px]',
      md: 'px-2.5 py-1 text-xs',
      lg: 'px-3 py-1.5 text-sm',
    },
  },
  defaultVariants: {
    intent: 'navy',
    size: 'md',
  },
});

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeStyles> {
  children: ReactNode;
}

export function Badge({ className, intent, size, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeStyles({ intent, size }), className)} {...props}>
      {children}
    </span>
  );
}

/**
 * Badge dédié pour afficher un statut BL avec la palette appropriée
 * (cf. plan §6.4 - Statuts BL palette dédiée).
 */
export function BLStatusBadge({ status, size }: { status: BLStatus; size?: 'sm' | 'md' | 'lg' }) {
  const intentMap: Record<BLStatus, BadgeProps['intent']> = {
    cree: 'muted',
    assigne: 'info',
    confirme: 'yellow',
    release_demandee: 'warning',
    bloque: 'danger',
    en_livraison: 'navy',
    en_route: 'navy',
    livre: 'success',
    signature_attendue: 'warning',
    signe: 'success',
    signature_expiree: 'danger',
    echec_T1: 'warning',
    echec_T2: 'danger',
    abandon: 'muted',
    retour_planifie: 'info',
    retour_en_cours: 'info',
    retour_collecte: 'success',
  };

  return (
    <Badge intent={intentMap[status]} size={size}>
      {status.replace(/_/g, ' ')}
    </Badge>
  );
}
