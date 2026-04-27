import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Logo } from '@/components/brand/Logo';

export default function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-cream px-4 text-center">
      <Logo size={80} variant="full" className="mb-6 opacity-60" />
      <h1 className="text-7xl font-display font-black text-navy mb-2">404</h1>
      <p className="text-lg text-muted mb-8">{t('errors.page_not_found')}</p>
      <Link to="/">
        <Button intent="primary" size="lg">
          {t('errors.page_not_found_back')}
        </Button>
      </Link>
    </div>
  );
}
