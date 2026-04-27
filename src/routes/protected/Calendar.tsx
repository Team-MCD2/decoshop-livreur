import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, AlertCircle } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { BLCard } from '@/components/bl/BLCard';
import { BLCardSkeletonList } from '@/components/bl/BLCardSkeleton';
import { CreneauChip } from '@/components/bl/CreneauChip';
import { useProfile } from '@/hooks/useAuth';
import { useUpcomingBLs, toIsoDate, groupByCreneau } from '@/hooks/useBLs';
import { useBLsRealtime } from '@/hooks/useBLsRealtime';
import type { BLWithRelations, GroupedByCreneau } from '@/hooks/useBLs';
import type { CreneauType } from '@/types/domain';

const CRENEAU_ORDER: (CreneauType | 'sans_creneau')[] = [
  'matin',
  'apres_midi',
  'soir',
  'sans_creneau',
];

/** Retourne le lundi 00:00 de la semaine contenant `d`. */
function startOfWeek(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  const dow = out.getDay(); // 0=dim, 1=lun…6=sam
  const offset = dow === 0 ? -6 : 1 - dow; // ramène à lundi
  out.setDate(out.getDate() + offset);
  return out;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export default function Calendar() {
  const { t, i18n } = useTranslation();
  const profile = useProfile();
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));

  const weekEnd = addDays(weekStart, 6);
  const dateLocale = i18n.language === 'ar' ? 'ar-MA' : 'fr-FR';

  const { data: bls, isLoading, error } = useUpcomingBLs(profile?.id, weekStart, weekEnd);
  useBLsRealtime(profile?.id);

  // Map: yyyy-mm-dd → BL[]
  const byDay = useMemo(() => {
    const m = new Map<string, BLWithRelations[]>();
    for (const bl of bls ?? []) {
      const key = bl.date_livraison_prevue ?? 'unknown';
      const arr = m.get(key) ?? [];
      arr.push(bl);
      m.set(key, arr);
    }
    return m;
  }, [bls]);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const weekRangeLabel = `${weekStart.toLocaleDateString(dateLocale, { day: 'numeric', month: 'short' })} – ${weekEnd.toLocaleDateString(dateLocale, { day: 'numeric', month: 'short', year: 'numeric' })}`;

  return (
    <div className="px-4 py-6 lg:px-8 lg:py-10 max-w-3xl mx-auto w-full">
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-display font-bold text-ink">{t('nav.calendar')}</h1>
        <Button
          intent="ghost"
          size="sm"
          onClick={() => setWeekStart(startOfWeek(new Date()))}
        >
          {t('common.today')}
        </Button>
      </header>

      {/* Navigation semaine */}
      <Card padding="md" className="mb-4">
        <div className="flex items-center justify-between gap-3">
          <Button
            intent="ghost"
            size="sm"
            leftIcon={<ChevronLeft className="w-4 h-4 rtl-flip" />}
            onClick={() => setWeekStart((d) => addDays(d, -7))}
            aria-label="Semaine précédente"
          >
            {/* visible on md+ pour économiser de la place */}
          </Button>
          <div className="flex-1 text-center">
            <div className="inline-flex items-center gap-2 text-sm font-bold text-ink">
              <CalendarIcon className="w-4 h-4 text-navy" />
              {weekRangeLabel}
            </div>
          </div>
          <Button
            intent="ghost"
            size="sm"
            rightIcon={<ChevronRight className="w-4 h-4 rtl-flip" />}
            onClick={() => setWeekStart((d) => addDays(d, 7))}
            aria-label="Semaine suivante"
          >
            {/* visible on md+ */}
          </Button>
        </div>
      </Card>

      {error && (
        <Card variant="cream" padding="md" className="mb-4 border-red-200">
          <div className="flex items-center gap-2 text-red-700 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{t('errors.generic')}</span>
          </div>
        </Card>
      )}

      {isLoading && <BLCardSkeletonList count={3} />}

      {!isLoading && (
        <div className="space-y-6">
          {days.map((day) => {
            const key = toIsoDate(day);
            const items = byDay.get(key) ?? [];
            const isToday = isSameDay(day, today);
            const groups = groupByCreneau(items);

            return (
              <section key={key} aria-labelledby={`day-${key}`}>
                <header
                  id={`day-${key}`}
                  className="flex items-center justify-between mb-2 pb-1 border-b border-line"
                >
                  <h2
                    className={`text-sm font-display font-bold capitalize ${
                      isToday ? 'text-navy' : 'text-ink'
                    }`}
                  >
                    {day.toLocaleDateString(dateLocale, {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'short',
                    })}
                    {isToday && (
                      <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] bg-yellow-300 text-ink">
                        {t('common.today')}
                      </span>
                    )}
                  </h2>
                  <span className="text-xs text-muted font-medium">
                    {items.length === 0 ? '—' : items.length}
                  </span>
                </header>

                {items.length === 0 ? (
                  <p className="text-xs text-muted italic ml-1">—</p>
                ) : (
                  <DayCreneaux groups={groups} />
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DayCreneaux({ groups }: { groups: GroupedByCreneau }) {
  return (
    <div className="space-y-3">
      {CRENEAU_ORDER.map((key) => {
        const items = groups[key];
        if (items.length === 0) return null;
        const creneau = key === 'sans_creneau' ? null : (key as CreneauType);
        return (
          <div key={key}>
            <div className="mb-2">
              <CreneauChip creneau={creneau} size="sm" showHours />
            </div>
            <div className="space-y-2">
              {items.map((bl) => (
                <BLCard key={bl.id} bl={bl} showRequestRelease={false} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
