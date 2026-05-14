import { WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { usePendingMutationsCount } from '@/hooks/useOfflineQueue';

/**
 * Banner shown at the top of the layout when the browser reports no
 * connectivity. Includes a live pending-mutations count so the driver
 * can tell how many actions are waiting for the next sync window.
 *
 * Phase 6 foundation : only renders while offline. A separate UI for
 * "has failed mutations" (amber, dismissable, with retry CTA) is left
 * for a future session.
 */
export function OfflineBanner() {
  const { t } = useTranslation();
  const online = useOnlineStatus();
  const pending = usePendingMutationsCount();

  if (online) return null;

  // i18next picks `offline.queued_one` or `offline.queued_other` automatically
  // based on `count` ; passing the base key is enough.
  const queuedLine = pending > 0 ? t('offline.queued', { count: pending }) : null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-warning text-ink px-4 py-2 flex items-center gap-2 text-sm font-medium shadow-sm"
    >
      <WifiOff className="w-4 h-4 shrink-0 rtl-flip" aria-hidden="true" />
      <div className="flex flex-col leading-tight">
        <span>
          {t('offline.banner_title')}
          {queuedLine ? <> &middot; <span className="font-semibold">{queuedLine}</span></> : null}
        </span>
        <span className="text-xs text-ink/70 font-normal">
          {t('offline.banner_body')}
        </span>
      </div>
    </div>
  );
}
