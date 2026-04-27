import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Package, CheckCircle2, Truck, Clock, AlertCircle } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { KpiTile } from '@/components/bl/KpiTile';
import { BLCard } from '@/components/bl/BLCard';
import { BLCardSkeletonList } from '@/components/bl/BLCardSkeleton';
import { CreneauChip } from '@/components/bl/CreneauChip';
import { useProfile } from '@/hooks/useAuth';
import { useTodayBLs, computeTodayKpis, groupByCreneau } from '@/hooks/useBLs';
import { useBLsRealtime } from '@/hooks/useBLsRealtime';
import type { CreneauType } from '@/types/domain';

const CRENEAU_ORDER: (CreneauType | 'sans_creneau')[] = [
  'matin',
  'apres_midi',
  'soir',
  'sans_creneau',
];

export default function Home() {
  const { t, i18n } = useTranslation();
  const profile = useProfile();

  // Greeting selon l'heure
  const hour = new Date().getHours();
  const greetingKey =
    hour < 12
      ? 'home.greeting_morning'
      : hour < 18
        ? 'home.greeting_afternoon'
        : 'home.greeting_evening';

  // Date formatée selon la locale
  const dateLocale = i18n.language === 'ar' ? 'ar-MA' : 'fr-FR';
  const today = new Intl.DateTimeFormat(dateLocale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  // Data
  const { data: bls, isLoading, error } = useTodayBLs(profile?.id);
  useBLsRealtime(profile?.id);

  const kpis = useMemo(() => computeTodayKpis(bls ?? []), [bls]);
  const groups = useMemo(() => groupByCreneau(bls ?? []), [bls]);

  const hasBLs = (bls?.length ?? 0) > 0;

  return (
    <div className="px-4 py-6 lg:px-8 lg:py-10 max-w-3xl mx-auto w-full">
      <header className="mb-8">
        <h1 className="text-2xl lg:text-3xl font-display font-bold text-ink mb-1">
          {t(greetingKey)} {profile?.prenom ?? ''} 👋
        </h1>
        <p className="text-sm text-muted capitalize">{today}</p>
      </header>

      {/* KPIs jour */}
      <Card variant="navy" padding="md" className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold uppercase tracking-wider text-yellow">
            {t('home.today_kpi.title')}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <KpiTile
            onDark
            icon={CheckCircle2}
            value={kpis.delivered}
            label={t('home.today_kpi.delivered', { count: kpis.delivered })}
          />
          <KpiTile
            onDark
            icon={Truck}
            value={kpis.in_progress}
            label={t('home.today_kpi.in_progress', { count: kpis.in_progress })}
          />
          <KpiTile
            onDark
            icon={Clock}
            value={kpis.remaining}
            label={t('home.today_kpi.remaining', { count: kpis.remaining })}
          />
          <KpiTile
            onDark
            icon={Package}
            value={kpis.delivered > 0 ? `${kpis.signature_rate}%` : '—'}
            label={t('home.today_kpi.signature_rate', { rate: kpis.signature_rate })}
          />
        </div>
      </Card>

      {/* Liste BL groupée par créneau */}
      <section>
        <h2 className="text-xl font-display font-bold text-ink mb-4">{t('home.to_deliver')}</h2>

        {error && (
          <Card variant="cream" padding="md" className="mb-4 border-red-200">
            <div className="flex items-center gap-2 text-red-700 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{t('errors.generic')}</span>
            </div>
          </Card>
        )}

        {isLoading && <BLCardSkeletonList count={3} />}

        {!isLoading && !hasBLs && (
          <Card variant="cream" padding="lg" className="text-center text-muted">
            <Package className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p className="text-sm font-medium">{t('home.no_deliveries')}</p>
          </Card>
        )}

        {!isLoading && hasBLs && (
          <div className="space-y-6">
            {CRENEAU_ORDER.map((key) => {
              const items = groups[key];
              if (items.length === 0) return null;
              const creneau = key === 'sans_creneau' ? null : (key as CreneauType);
              return (
                <div key={key}>
                  <div className="flex items-center gap-3 mb-3">
                    <CreneauChip creneau={creneau} showHours />
                    <span className="text-xs text-muted font-medium">
                      {items.length}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {items.map((bl) => (
                      <BLCard key={bl.id} bl={bl} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
