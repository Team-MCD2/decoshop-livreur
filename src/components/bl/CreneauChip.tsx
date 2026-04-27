import { useTranslation } from 'react-i18next';
import { Sun, Sunset, Moon, Clock } from 'lucide-react';
import { cn } from '@/utils/cn';
import type { CreneauType } from '@/types/domain';

const CRENEAU_META: Record<
  CreneauType | 'sans_creneau',
  { icon: typeof Sun; bg: string; text: string }
> = {
  matin: {
    icon: Sun,
    bg: 'bg-yellow-200',
    text: 'text-ink',
  },
  apres_midi: {
    icon: Sunset,
    bg: 'bg-orange-200',
    text: 'text-orange-900',
  },
  soir: {
    icon: Moon,
    bg: 'bg-navy-100',
    text: 'text-navy',
  },
  sans_creneau: {
    icon: Clock,
    bg: 'bg-cream-200',
    text: 'text-muted',
  },
};

interface CreneauChipProps {
  creneau: CreneauType | null;
  /** Affiche les horaires (ex: 9h-12h) à côté du label. */
  showHours?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

export function CreneauChip({
  creneau,
  showHours = false,
  size = 'md',
  className,
}: CreneauChipProps) {
  const { t } = useTranslation();
  const key = creneau ?? 'sans_creneau';
  const meta = CRENEAU_META[key];
  const Icon = meta.icon;

  const label = creneau ? t(`creneau.${creneau}`) : '—';
  const hours = creneau ? t(`creneau.${creneau}_hours`) : '';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-bold tracking-wide',
        meta.bg,
        meta.text,
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1 text-xs',
        className,
      )}
    >
      <Icon
        className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'}
        strokeWidth={2.4}
        aria-hidden
      />
      <span>{label}</span>
      {showHours && hours && <span className="opacity-70 font-medium">· {hours}</span>}
    </span>
  );
}
