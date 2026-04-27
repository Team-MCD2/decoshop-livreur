import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function OfflineBanner() {
  const { t } = useTranslation();
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== 'undefined' && !navigator.onLine,
  );

  useEffect(() => {
    const onOnline = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-warning text-ink px-4 py-2 flex items-center gap-2 text-sm font-medium shadow-sm"
    >
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>{t('errors.offline')}</span>
    </div>
  );
}
