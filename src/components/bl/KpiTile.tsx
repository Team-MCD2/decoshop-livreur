import type { LucideIcon } from 'lucide-react';
import { cn } from '@/utils/cn';

interface KpiTileProps {
  icon: LucideIcon;
  value: string | number;
  label: string;
  /** Variante visuelle sur fond navy (sur Card variant=navy). */
  onDark?: boolean;
}

export function KpiTile({ icon: Icon, value, label, onDark = false }: KpiTileProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-xl p-3',
        onDark ? 'bg-navy-700/40' : 'bg-cream-100',
      )}
    >
      <Icon
        className={cn('w-5 h-5 shrink-0', onDark ? 'text-yellow' : 'text-navy')}
        strokeWidth={2.2}
        aria-hidden
      />
      <div className="min-w-0">
        <div
          className={cn(
            'text-2xl font-display font-bold leading-none',
            onDark ? 'text-white' : 'text-ink',
          )}
        >
          {value}
        </div>
        <div className={cn('text-[11px] mt-1 leading-tight', onDark ? 'text-white/80' : 'text-muted')}>
          {label}
        </div>
      </div>
    </div>
  );
}
