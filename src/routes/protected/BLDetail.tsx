import { lazy, Suspense, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  AlertTriangle,
  Building2,
  KeyRound,
  Package,
  AlertCircle,
  Wifi,
  WifiOff,
  PenLine,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { Card, CardTitle, CardSubtitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { BLStatusBadge } from '@/components/ui/Badge';
import { CreneauChip } from '@/components/bl/CreneauChip';
import { BLStatusTimeline } from '@/components/bl/BLStatusTimeline';
import { ContactBar } from '@/components/bl/ContactBar';
import { WorkflowActions } from '@/components/bl/WorkflowActions';
import { SignatureModal } from '@/components/bl/SignatureModal';
import { CountdownPill } from '@/components/bl/CountdownPill';
import { useBLDetail } from '@/hooks/useBLDetail';
import { useGPSTracking } from '@/hooks/useGPSTracking';
import { useProfile } from '@/hooks/useAuth';
import { useBLsRealtime } from '@/hooks/useBLsRealtime';

// Lazy-load Mapbox (chunk ~1,8 MB) : ne charge que quand un BL est ouvert.
const BLMap = lazy(() =>
  import('@/components/bl/BLMap').then((m) => ({ default: m.BLMap })),
);

function MapFallback() {
  const { t } = useTranslation();
  return (
    <div className="h-72 w-full rounded-2xl bg-cream-100 border border-line flex items-center justify-center text-sm text-muted">
      {t('map.loading')}
    </div>
  );
}

export default function BLDetail() {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const profile = useProfile();
  const { data: bl, isLoading, error } = useBLDetail(id);
  useBLsRealtime(profile?.id);

  const [showSignatureModal, setShowSignatureModal] = useState(false);

  // GPS tracking actif uniquement quand BL en route (RGPD §12)
  const isEnRoute = bl?.statut === 'en_route';
  const gps = useGPSTracking({
    driverId: profile?.id,
    blId: bl?.id ?? null,
    enabled: isEnRoute,
  });

  const dateLocale = i18n.language === 'ar' ? 'ar-MA' : 'fr-FR';
  const fmtCurrency = (n: number) =>
    new Intl.NumberFormat(dateLocale, { style: 'currency', currency: 'EUR' }).format(n);

  // ====== Loading ======
  if (isLoading) {
    return (
      <div className="px-4 py-6 lg:px-8 lg:py-10 max-w-3xl mx-auto w-full">
        <BackLink />
        <Card padding="lg" className="text-center text-muted">
          <p className="text-sm">{t('bl.detail.loading')}</p>
        </Card>
      </div>
    );
  }

  // ====== Error / not found ======
  if (error || !bl) {
    return (
      <div className="px-4 py-6 lg:px-8 lg:py-10 max-w-3xl mx-auto w-full">
        <BackLink />
        <Card variant="cream" padding="lg" className="text-center">
          <AlertCircle className="w-10 h-10 mx-auto mb-2 text-red-700" />
          <p className="font-bold text-ink">{t('bl.detail.not_found')}</p>
          <Link to="/" className="block mt-4">
            <Button intent="ghost" size="sm">
              {t('bl.detail.back_home')}
            </Button>
          </Link>
        </Card>
      </div>
    );
  }

  const client = bl.client;
  const fullAddress = client
    ? [client.adresse_ligne1, client.adresse_ligne2, client.code_postal, client.ville]
        .filter(Boolean)
        .join(', ')
    : '—';

  return (
    <div className="px-4 py-6 lg:px-8 lg:py-10 max-w-3xl mx-auto w-full space-y-4">
      <BackLink />

      {/* Header BL */}
      <Card padding="md">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider text-muted mb-1">
              {bl.numero_bl}
            </p>
            <h1 className="text-xl font-display font-bold text-ink truncate">
              {client ? `${client.prenom ?? ''} ${client.nom}`.trim() : '—'}
            </h1>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <CreneauChip creneau={bl.creneau} showHours size="sm" />
              {bl.nb_tentatives > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 text-[11px] font-bold">
                  <AlertTriangle className="w-3 h-3" />
                  {t('bl.detail.attempts')} : {bl.nb_tentatives}
                </span>
              )}
            </div>
          </div>
          <BLStatusBadge status={bl.statut} size="md" />
        </div>

        <div className="pt-3 border-t border-line">
          <BLStatusTimeline status={bl.statut} />
        </div>
      </Card>

      {/* GPS status (visible quand actif) */}
      {isEnRoute && (
        <div
          className={
            'rounded-xl px-3 py-2 flex items-center gap-2 text-xs font-bold ' +
            (gps.status === 'active'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : gps.status === 'denied'
                ? 'bg-red-50 text-red-700 border border-red-200'
                : 'bg-cream-100 text-muted border border-line')
          }
          role="status"
          aria-live="polite"
        >
          {gps.status === 'active' ? (
            <Wifi className="w-4 h-4" />
          ) : (
            <WifiOff className="w-4 h-4" />
          )}
          {gps.status === 'active' && (
            <span>
              {t('bl.gps.active')}
              {gps.position && ` · ${t('bl.gps.accuracy', { m: gps.position.accuracy_m })}`}
            </span>
          )}
          {gps.status === 'requesting' && <span>{t('bl.gps.starting')}</span>}
          {gps.status === 'denied' && <span>{t('bl.gps.denied')}</span>}
          {gps.status === 'unavailable' && <span>{t('bl.gps.unavailable')}</span>}
        </div>
      )}

      {/* Map (lazy-loaded — Mapbox ~1,8 MB) */}
      <Suspense fallback={<MapFallback />}>
        <BLMap
          destLat={client?.latitude ?? null}
          destLng={client?.longitude ?? null}
          driver={isEnRoute ? gps.position : null}
        />
      </Suspense>

      {/* Contact + directions */}
      <ContactBar
        phone={client?.telephone ?? null}
        lat={client?.latitude ?? null}
        lng={client?.longitude ?? null}
        addressLine={fullAddress}
      />

      {/* Adresse + accès */}
      <Card padding="md">
        <CardTitle>
          <span className="inline-flex items-center gap-2">
            <Building2 className="w-5 h-5 text-navy" />
            {t('bl.detail.address')}
          </span>
        </CardTitle>
        <p className="mt-2 text-sm text-ink">{fullAddress}</p>

        {(client?.etage != null || client?.ascenseur != null || client?.code_porte || client?.commentaire_acces) && (
          <div className="mt-3 pt-3 border-t border-line space-y-1.5 text-sm">
            {client?.etage != null && (
              <Row label={t('bl.detail.floor')} value={client.etage.toString()} />
            )}
            {client?.ascenseur != null && (
              <Row
                label={t('bl.detail.elevator')}
                value={client.ascenseur ? t('bl.detail.elevator_yes') : t('bl.detail.elevator_no')}
              />
            )}
            {client?.code_porte && (
              <Row
                label={t('bl.detail.door_code')}
                value={
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-yellow-200 text-ink font-mono font-bold">
                    <KeyRound className="w-3 h-3" />
                    {client.code_porte}
                  </span>
                }
              />
            )}
            {client?.commentaire_acces && (
              <div className="mt-2 text-xs text-muted">
                <CardSubtitle>{t('bl.detail.address_complement')}</CardSubtitle>
                <p className="mt-1">{client.commentaire_acces}</p>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Articles */}
      <Card padding="md">
        <CardTitle>
          <span className="inline-flex items-center gap-2">
            <Package className="w-5 h-5 text-navy" />
            {t('bl.detail.articles')}
            <span className="text-xs text-muted ml-1">({bl.lignes.length})</span>
          </span>
        </CardTitle>
        {bl.lignes.length === 0 ? (
          <p className="text-sm text-muted mt-3">{t('bl.detail.no_articles')}</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {bl.lignes.map((ligne) => (
              <li key={ligne.id} className="py-2.5 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink leading-tight">{ligne.designation}</p>
                  {(ligne.marque || ligne.modele) && (
                    <p className="text-xs text-muted mt-0.5">
                      {[ligne.marque, ligne.modele].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  {ligne.fragile && (
                    <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-bold text-red-700 bg-red-50 px-1.5 py-0.5 rounded">
                      <AlertTriangle className="w-3 h-3" />
                      {t('bl.detail.fragile')}
                    </span>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-ink">×{ligne.quantite}</p>
                  <p className="text-xs text-muted">{fmtCurrency(ligne.total_ligne_ttc)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 pt-3 border-t border-line flex items-center justify-between">
          <span className="text-sm text-muted">{t('bl.detail.amount')}</span>
          <span className="font-display font-bold text-lg text-ink">
            {fmtCurrency(bl.montant_total_ttc)}
          </span>
        </div>
        {bl.montant_frais_relivraison > 0 && (
          <div className="mt-1 flex items-center justify-between text-orange-700 text-xs">
            <span>{t('bl.detail.redelivery_fee')}</span>
            <span className="font-bold">+{fmtCurrency(bl.montant_frais_relivraison)}</span>
          </div>
        )}
      </Card>

      {/* Workflow actions / Signature
          - livre / signature_attendue / signature_expiree → carte signature avec CTA modal
          - signe                                          → carte récap signature (terminal)
          - autres                                         → bouton workflow standard */}
      {bl.statut === 'signe' ? (
        <Card padding="md">
          <CardTitle>
            <span className="inline-flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-700" />
              {t('signature.signed_ok')}
            </span>
          </CardTitle>
          {bl.signature?.date_signature && (
            <p className="mt-2 text-sm text-muted">
              {t('signature.signed_at', {
                date: new Date(bl.signature.date_signature).toLocaleString(dateLocale),
              })}
            </p>
          )}
        </Card>
      ) : bl.statut === 'livre' ||
        bl.statut === 'signature_attendue' ||
        bl.statut === 'signature_expiree' ? (
        <Card padding="md">
          <CardTitle>
            <span className="inline-flex items-center gap-2">
              <PenLine className="w-5 h-5 text-navy" />
              {t('signature.modal_title')}
            </span>
          </CardTitle>

          {/* Pill compte-à-rebours si lien actif (statut signature_attendue) */}
          {bl.statut === 'signature_attendue' && bl.signature?.date_expiration && (
            <div className="mt-3">
              <CountdownPill expiresAt={bl.signature.date_expiration} />
            </div>
          )}

          {/* Bandeau si lien expiré */}
          {bl.statut === 'signature_expiree' && (
            <div className="mt-3 rounded-xl bg-yellow-100 border border-yellow-300 px-3 py-2 text-sm text-ink">
              {t('signature.expired_hint')}
            </div>
          )}

          <Button
            intent={bl.statut === 'signature_expiree' ? 'yellow' : 'primary'}
            size="lg"
            fullWidth
            leftIcon={
              bl.statut === 'signature_expiree' ? (
                <RefreshCw className="w-5 h-5 rtl-flip" />
              ) : (
                <PenLine className="w-5 h-5 rtl-flip" />
              )
            }
            onClick={() => setShowSignatureModal(true)}
            className="mt-3"
          >
            {bl.statut === 'signature_attendue'
              ? t('signature.method_canvas')
              : bl.statut === 'signature_expiree'
                ? t('signature.request_again')
                : t('signature.request')}
          </Button>
        </Card>
      ) : (
        <WorkflowActions blId={bl.id} status={bl.statut} />
      )}

      <SignatureModal
        open={showSignatureModal}
        onClose={() => setShowSignatureModal(false)}
        blId={bl.id}
        numeroBl={bl.numero_bl}
        existingToken={
          bl.statut === 'signature_attendue' ? (bl.signature?.token ?? null) : null
        }
        existingExpiration={
          bl.statut === 'signature_attendue'
            ? (bl.signature?.date_expiration ?? null)
            : null
        }
      />
    </div>
  );
}

function BackLink() {
  const { t } = useTranslation();
  return (
    <Link
      to="/"
      className="inline-flex items-center gap-2 text-muted hover:text-navy mb-2 text-sm"
    >
      <ArrowLeft className="w-4 h-4 rtl-flip" />
      {t('bl.actions.back')}
    </Link>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="text-ink font-medium">{value}</span>
    </div>
  );
}
