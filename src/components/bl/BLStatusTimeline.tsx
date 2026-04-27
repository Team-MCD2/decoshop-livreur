import { useTranslation } from 'react-i18next';
import { Check, Truck, Navigation, PenLine, Package } from 'lucide-react';
import { cn } from '@/utils/cn';
import type { BLStatus } from '@/types/domain';

interface Step {
  key: string;
  i18nKey: string;
  icon: typeof Check;
  matches: BLStatus[];
}

const STEPS: Step[] = [
  { key: 'assigne', i18nKey: 'bl.timeline.step_assigne', icon: Package, matches: ['assigne', 'release_demandee'] },
  { key: 'confirme', i18nKey: 'bl.timeline.step_confirme', icon: Check, matches: ['confirme', 'en_livraison'] },
  { key: 'en_route', i18nKey: 'bl.timeline.step_en_route', icon: Navigation, matches: ['en_route'] },
  { key: 'livre', i18nKey: 'bl.timeline.step_livre', icon: Truck, matches: ['livre', 'signature_attendue'] },
  { key: 'signe', i18nKey: 'bl.timeline.step_signe', icon: PenLine, matches: ['signe'] },
];

const PROGRESSION_INDEX: Partial<Record<BLStatus, number>> = {
  assigne: 0,
  release_demandee: 0,
  confirme: 1,
  en_livraison: 1,
  en_route: 2,
  livre: 3,
  signature_attendue: 3,
  signe: 4,
};

export function BLStatusTimeline({ status }: { status: BLStatus }) {
  const { t } = useTranslation();
  const currentIndex = PROGRESSION_INDEX[status] ?? -1;

  // Statuts d'échec → on n'affiche pas la timeline standard
  const isFailure = ['echec_T1', 'echec_T2', 'abandon', 'bloque', 'signature_expiree'].includes(
    status,
  );
  if (isFailure) return null;

  return (
    <ol className="flex items-center justify-between gap-1" aria-label={t('bl.timeline.title')}>
      {STEPS.map((step, idx) => {
        const Icon = step.icon;
        const isPast = idx < currentIndex;
        const isCurrent = idx === currentIndex;
        const isFuture = idx > currentIndex;

        return (
          <li
            key={step.key}
            className="flex-1 flex flex-col items-center gap-1 min-w-0"
          >
            <div className="flex items-center w-full">
              {/* Connector gauche */}
              {idx > 0 && (
                <div
                  className={cn(
                    'h-0.5 flex-1',
                    idx <= currentIndex ? 'bg-navy' : 'bg-line',
                  )}
                  aria-hidden
                />
              )}
              {/* Bullet */}
              <div
                className={cn(
                  'shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors',
                  isPast && 'bg-navy text-yellow',
                  isCurrent && 'bg-yellow-300 text-ink ring-4 ring-yellow-100',
                  isFuture && 'bg-cream-200 text-muted',
                )}
              >
                <Icon className="w-4 h-4" strokeWidth={2.6} aria-hidden />
              </div>
              {/* Connector droite */}
              {idx < STEPS.length - 1 && (
                <div
                  className={cn(
                    'h-0.5 flex-1',
                    idx < currentIndex ? 'bg-navy' : 'bg-line',
                  )}
                  aria-hidden
                />
              )}
            </div>
            <span
              className={cn(
                'text-[10px] font-bold uppercase tracking-wider truncate text-center w-full',
                isCurrent ? 'text-ink' : 'text-muted',
              )}
            >
              {t(step.i18nKey)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
