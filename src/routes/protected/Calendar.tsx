import { useTranslation } from 'react-i18next';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Card } from '@/components/ui/Card';

export default function Calendar() {
  const { t } = useTranslation();
  return (
    <div className="px-4 py-6 lg:px-8 lg:py-10 max-w-3xl mx-auto w-full">
      <h1 className="text-2xl font-display font-bold text-ink mb-6">{t('nav.calendar')}</h1>
      <Card variant="cream" padding="lg" className="text-center">
        <CalendarIcon className="w-12 h-12 mx-auto mb-3 text-muted opacity-40" />
        <p className="text-muted text-sm">Vue semaine — Phase 2.</p>
      </Card>
    </div>
  );
}
