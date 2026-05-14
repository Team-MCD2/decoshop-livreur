import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  Clock,
  Package,
  PenLine,
  TrendingDown,
  TrendingUp,
  Truck,
  XCircle,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { KpiTile } from '@/components/bl/KpiTile';
import { cn } from '@/utils/cn';
import {
  useDailyKpis,
  usePeriodScore,
  presetToRange,
  performanceErrorKey,
  formatRate,
  formatAvg,
} from '@/hooks/usePerformance';
import {
  DEFAULT_PERIOD_PRESET,
  PERIOD_PRESETS,
  type PeriodPresetKey,
} from '@/types/performance';

// -----------------------------------------------------------------------------
// Sub-components — kept local so the page stays self-contained.
// -----------------------------------------------------------------------------

interface PresetChipsProps {
  value: PeriodPresetKey;
  onChange: (next: PeriodPresetKey) => void;
}

function PresetChips({ value, onChange }: PresetChipsProps) {
  const { t } = useTranslation();
  return (
    <div
      role="tablist"
      aria-label={t('performance.period.title')}
      className="inline-flex items-center gap-1 rounded-full bg-cream-100 p-1"
    >
      {PERIOD_PRESETS.map((preset) => {
        const active = preset.key === value;
        return (
          <button
            key={preset.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(preset.key)}
            className={cn(
              'px-3 py-1.5 text-xs font-bold rounded-full transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-offset-2',
              active
                ? 'bg-navy text-white shadow-sm'
                : 'text-muted hover:text-ink',
            )}
          >
            {t(`performance.period.preset_${preset.key}`)}
          </button>
        );
      })}
    </div>
  );
}

function TilesSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="h-16 rounded-xl bg-cream-200/60 animate-pulse"
        />
      ))}
    </div>
  );
}

function ErrorBanner({ messageKey }: { messageKey: string }) {
  const { t } = useTranslation();
  return (
    <Card variant="cream" padding="md" className="border border-red-200">
      <div className="flex items-center gap-2 text-red-700 text-sm">
        <AlertCircle className="w-4 h-4 shrink-0" aria-hidden />
        <span>{t(messageKey)}</span>
      </div>
    </Card>
  );
}

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------

export default function Performance() {
  const { t, i18n } = useTranslation();

  const [preset, setPreset] = useState<PeriodPresetKey>(DEFAULT_PERIOD_PRESET);
  const range = useMemo(() => presetToRange(preset), [preset]);

  const daily  = useDailyKpis();
  const period = usePeriodScore(range);

  const dateLocale = i18n.language === 'ar' ? 'ar-MA' : 'fr-FR';

  const formatRange = (iso: string) =>
    new Intl.DateTimeFormat(dateLocale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(iso));

  const dailyEmpty = daily.data && daily.data.total === 0;
  const periodEmpty = period.data && period.data.total === 0;

  return (
    <div className="px-4 py-6 lg:px-8 lg:py-10 max-w-3xl mx-auto w-full">
      <header className="mb-8">
        <h1 className="text-2xl lg:text-3xl font-display font-bold text-ink mb-1">
          {t('performance.title')}
        </h1>
        <p className="text-sm text-muted">{t('performance.subtitle')}</p>
      </header>

      {/* ─── Aujourd'hui ────────────────────────────────────────────────── */}
      <section className="mb-8" aria-labelledby="perf-today">
        <div className="flex items-baseline justify-between mb-3">
          <h2
            id="perf-today"
            className="text-base font-display font-bold text-ink"
          >
            {t('performance.today.title')}
          </h2>
          <span className="text-xs text-muted">{t('performance.today.subtitle')}</span>
        </div>

        <Card variant="navy" padding="md">
          {daily.isLoading && <TilesSkeleton count={6} />}

          {daily.error && (
            <div className="text-yellow text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" aria-hidden />
              <span>{t(performanceErrorKey(daily.error))}</span>
            </div>
          )}

          {daily.data && (
            <div className="grid grid-cols-2 gap-3">
              <KpiTile
                onDark
                icon={Package}
                value={daily.data.total}
                label={t('performance.metric.total')}
              />
              <KpiTile
                onDark
                icon={CheckCircle2}
                value={daily.data.delivered}
                label={t('performance.metric.delivered')}
              />
              <KpiTile
                onDark
                icon={Truck}
                value={daily.data.in_progress}
                label={t('performance.metric.in_progress')}
              />
              <KpiTile
                onDark
                icon={Clock}
                value={daily.data.remaining}
                label={t('performance.metric.remaining')}
              />
              <KpiTile
                onDark
                icon={XCircle}
                value={daily.data.failed_t1 + daily.data.failed_t2 + daily.data.abandoned}
                label={t('performance.metric.failed')}
              />
              <KpiTile
                onDark
                icon={PenLine}
                value={formatRate(daily.data.signature_rate)}
                label={t('performance.metric.signature_rate')}
              />
            </div>
          )}

          {dailyEmpty && (
            <p className="text-white/70 text-xs text-center mt-3">
              {t('home.no_deliveries', { defaultValue: '' }) /* gentle reuse */}
            </p>
          )}
        </Card>
      </section>

      {/* ─── Sur la période ─────────────────────────────────────────────── */}
      <section aria-labelledby="perf-period">
        <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
          <h2
            id="perf-period"
            className="text-base font-display font-bold text-ink"
          >
            {t('performance.period.title')}
          </h2>
          <PresetChips value={preset} onChange={setPreset} />
        </div>

        {period.error && (
          <ErrorBanner messageKey={performanceErrorKey(period.error)} />
        )}

        {period.isLoading && (
          <Card padding="md">
            <TilesSkeleton count={6} />
          </Card>
        )}

        {period.data && periodEmpty && (
          <Card variant="cream" padding="lg" className="text-center text-muted">
            <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-40" aria-hidden />
            <p className="text-sm font-medium text-ink">
              {t('performance.empty.title')}
            </p>
            <p className="text-xs mt-1">{t('performance.empty.body')}</p>
          </Card>
        )}

        {period.data && !periodEmpty && (
          <Card padding="md">
            <div className="grid grid-cols-2 gap-3">
              <KpiTile
                icon={CheckCircle2}
                value={formatRate(period.data.success_rate)}
                label={t('performance.metric.success_rate')}
              />
              <KpiTile
                icon={PenLine}
                value={formatRate(period.data.signature_rate)}
                label={t('performance.metric.signature_rate')}
              />
              <KpiTile
                icon={TrendingUp}
                value={formatRate(period.data.on_time_rate)}
                label={t('performance.metric.on_time_rate')}
              />
              <KpiTile
                icon={TrendingDown}
                value={formatRate(period.data.failure_rate)}
                label={t('performance.metric.failure_rate')}
              />
              <KpiTile
                icon={XCircle}
                value={formatAvg(period.data.avg_attempts_per_failed_bl)}
                label={t('performance.metric.avg_attempts')}
              />
              <KpiTile
                icon={Truck}
                value={period.data.delivered}
                label={t('performance.metric.delivered')}
              />
            </div>

            <div className="mt-4 pt-4 border-t border-line flex items-center justify-between text-xs text-muted">
              <span>
                {t('performance.period.range', {
                  from: formatRange(period.data.period_from),
                  to:   formatRange(period.data.period_to),
                })}
              </span>
              <span>
                {t('performance.period.days_active', {
                  count: period.data.days_active,
                })}
              </span>
            </div>
          </Card>
        )}
      </section>
    </div>
  );
}
