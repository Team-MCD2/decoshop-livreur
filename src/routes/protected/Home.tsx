import { useTranslation } from 'react-i18next';
import { Package, CheckCircle2, Truck, Clock } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { useProfile } from '@/hooks/useAuth';

export default function Home() {
  const { t } = useTranslation();
  const profile = useProfile();

  // Greeting selon l'heure
  const hour = new Date().getHours();
  const greetingKey =
    hour < 12 ? 'home.greeting_morning' : hour < 18 ? 'home.greeting_afternoon' : 'home.greeting_evening';

  // Date formatée
  const today = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  return (
    <div className="px-4 py-6 lg:px-8 lg:py-10 max-w-3xl mx-auto w-full">
      <header className="mb-8">
        <h1 className="text-2xl lg:text-3xl font-display font-bold text-ink mb-1">
          {t(greetingKey)} {profile?.prenom ?? ''} 👋
        </h1>
        <p className="text-sm text-muted capitalize">{today}</p>
      </header>

      {/* Mini KPIs (Phase 8 — pour l'instant des placeholders) */}
      <Card variant="navy" padding="md" className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold uppercase tracking-wider text-yellow">
            {t('home.today_kpi.title')}
          </span>
          <Badge intent="yellow" size="sm">
            Phase 1
          </Badge>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <KpiItem icon={CheckCircle2} value="0" label={t('home.today_kpi.delivered', { count: 0 })} />
          <KpiItem icon={Truck} value="0" label={t('home.today_kpi.in_progress', { count: 0 })} />
          <KpiItem icon={Clock} value="0" label={t('home.today_kpi.remaining', { count: 0 })} />
          <KpiItem icon={Package} value="—" label={t('home.today_kpi.signature_rate', { rate: 0 })} />
        </div>
      </Card>

      {/* Liste BL (Phase 2) */}
      <section>
        <h2 className="text-xl font-display font-bold text-ink mb-4">{t('home.to_deliver')}</h2>
        <Card variant="cream" padding="lg" className="text-center text-muted">
          <Package className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium">{t('home.no_deliveries')}</p>
          <p className="text-xs mt-1 opacity-70">
            La liste sera connectée à Supabase en Phase 2.
          </p>
        </Card>
      </section>
    </div>
  );
}

function KpiItem({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Package;
  value: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3 bg-navy-700/40 rounded-xl p-3">
      <Icon className="w-5 h-5 text-yellow shrink-0" strokeWidth={2.2} />
      <div className="min-w-0">
        <div className="text-2xl font-display font-bold leading-none text-white">{value}</div>
        <div className="text-[11px] text-white/80 mt-1 leading-tight">{label}</div>
      </div>
    </div>
  );
}
