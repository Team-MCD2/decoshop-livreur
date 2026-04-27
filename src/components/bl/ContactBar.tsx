import { useTranslation } from 'react-i18next';
import { Phone, MessageSquare, Navigation } from 'lucide-react';
import { ButtonLink } from '@/components/ui/Button';

interface ContactBarProps {
  phone?: string | null;
  /** Coordonnées GPS (optionnel) — sinon fallback adresse texte. */
  lat?: number | null;
  lng?: number | null;
  /** Adresse texte (fallback si pas de GPS). */
  addressLine?: string | null;
}

/**
 * Barre d'actions de contact rapide pour la page BLDetail.
 * - Téléphone (tel:)
 * - SMS (sms:)
 * - Itinéraire (Google Maps universal link, fonctionne web + mobile native)
 */
export function ContactBar({ phone, lat, lng, addressLine }: ContactBarProps) {
  const { t } = useTranslation();

  const sanitized = phone?.replace(/[\s.()/-]/g, '');
  const hasPhone = sanitized && sanitized.length >= 6;

  const directionsUrl = (() => {
    if (lat != null && lng != null) {
      // Universal link Google Maps directions vers (lat,lng) depuis position actuelle
      return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
    }
    if (addressLine) {
      return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addressLine)}&travelmode=driving`;
    }
    return null;
  })();

  return (
    <div className="grid grid-cols-3 gap-2">
      <ButtonLink
        intent="ghost"
        size="sm"
        leftIcon={<Phone className="w-4 h-4 rtl-flip" />}
        disabled={!hasPhone}
        href={hasPhone ? `tel:${sanitized}` : undefined}
        aria-label={t('bl.actions.call_client')}
      >
        {t('bl.actions.call_client')}
      </ButtonLink>
      <ButtonLink
        intent="ghost"
        size="sm"
        leftIcon={<MessageSquare className="w-4 h-4 rtl-flip" />}
        disabled={!hasPhone}
        href={hasPhone ? `sms:${sanitized}` : undefined}
        aria-label={t('bl.actions.sms_client')}
      >
        {t('bl.actions.sms_client')}
      </ButtonLink>
      <ButtonLink
        intent="primary"
        size="sm"
        leftIcon={<Navigation className="w-4 h-4 rtl-flip" />}
        disabled={!directionsUrl}
        href={directionsUrl ?? undefined}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t('bl.actions.open_map')}
      >
        {t('bl.actions.open_map')}
      </ButtonLink>
    </div>
  );
}
