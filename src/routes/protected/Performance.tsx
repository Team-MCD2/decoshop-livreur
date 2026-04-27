import { useTranslation } from 'react-i18next';
import { BarChart3 } from 'lucide-react';
import { Card } from '@/components/ui/Card';

export default function Performance() {
  const { t } = useTranslation();
  return (
    <div className="px-4 py-6 lg:px-8 lg:py-10 max-w-3xl mx-auto w-full">
      <h1 className="text-2xl font-display font-bold text-ink mb-6">{t('nav.performance')}</h1>
      <Card variant="cream" padding="lg" className="text-center">
        <BarChart3 className="w-12 h-12 mx-auto mb-3 text-muted opacity-40" />
        <p className="text-muted text-sm">Statistiques + score qualité — Phase 8.</p>
      </Card>
    </div>
  );
}
