import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MapPin, Package, ChevronRight, Send } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { BLStatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { CreneauChip } from '@/components/bl/CreneauChip';
import { useRequestRelease } from '@/hooks/useBLs';
import type { BLWithRelations } from '@/hooks/useBLs';

interface BLCardProps {
  bl: BLWithRelations;
  /** Affiche bouton "Je suis dispo" si statut = assigne. */
  showRequestRelease?: boolean;
}

export function BLCard({ bl, showRequestRelease = true }: BLCardProps) {
  const { t } = useTranslation();
  const requestRelease = useRequestRelease();
  const [requested, setRequested] = useState(bl.statut === 'release_demandee');

  const client = bl.client;
  const fullName = client
    ? `${client.prenom ?? ''} ${client.nom}`.trim()
    : '—';
  const address = client
    ? [client.adresse_ligne1, [client.code_postal, client.ville].filter(Boolean).join(' ')]
        .filter(Boolean)
        .join(', ')
    : t('bl.card.no_address');

  const amount = new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(bl.montant_total_ttc);

  const canRequestRelease = showRequestRelease && bl.statut === 'assigne' && !requested;

  const handleRequestRelease = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    requestRelease.mutate(bl.id, {
      onSuccess: () => setRequested(true),
    });
  };

  return (
    <Link to={`/bl/${bl.id}`} className="block group focus:outline-none">
      <Card
        padding="md"
        className="group-hover:border-navy/30 group-focus-visible:border-navy transition-colors"
      >
        {/* Header : numero + status */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-xs text-muted mb-1">
              <span className="font-bold tracking-wider uppercase">{bl.numero_bl}</span>
              <CreneauChip creneau={bl.creneau} size="sm" />
            </div>
            <h3 className="font-display font-bold text-ink truncate">{fullName}</h3>
          </div>
          <BLStatusBadge status={bl.statut} size="sm" />
        </div>

        {/* Body : adresse + items + montant */}
        <div className="space-y-1.5 text-sm text-muted">
          <div className="flex items-start gap-2">
            <MapPin className="w-4 h-4 shrink-0 mt-0.5 text-navy/60" />
            <span className="truncate">{address}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-2">
              <Package className="w-4 h-4 text-navy/60" />
              {t('bl.card.items', { count: bl.lignes_count })}
            </span>
            <span className="font-bold text-ink">{amount}</span>
          </div>
        </div>

        {/* Footer : action */}
        {(canRequestRelease || requested) && (
          <div className="mt-3 pt-3 border-t border-line">
            {canRequestRelease ? (
              <Button
                intent="primary"
                size="sm"
                fullWidth
                leftIcon={<Send className="w-4 h-4 rtl-flip" />}
                loading={requestRelease.isPending}
                onClick={handleRequestRelease}
              >
                {t('bl.actions.request_release')}
              </Button>
            ) : (
              <div className="text-center text-xs font-bold text-orange-700">
                {t('bl.actions.release_pending')}
              </div>
            )}
          </div>
        )}

        {/* Affordance "voir détails" */}
        <div className="mt-3 flex items-center justify-end text-xs text-navy/60 group-hover:text-navy transition-colors">
          {t('bl.actions.details')}
          <ChevronRight className="w-4 h-4 rtl-flip" />
        </div>
      </Card>
    </Link>
  );
}
