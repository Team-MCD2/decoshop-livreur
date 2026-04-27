import { useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  CheckCircle2,
  Send,
  AlertCircle,
  Clock,
  ShieldCheck,
} from 'lucide-react';
import { Card, CardSubtitle, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { BrandBlock } from '@/components/brand/Logo';
import { LanguageToggle } from '@/components/auth/LanguageToggle';
import {
  SignatureCanvas,
  type SignatureCanvasHandle,
} from '@/components/bl/SignatureCanvas';
import { CountdownPill } from '@/components/bl/CountdownPill';
import { useSignaturePublic, useSubmitSignature } from '@/hooks/useSignature';

/**
 * Page publique /sign/:token — accessible sans auth.
 * Le client signe son bon de livraison via lien partagé par le livreur.
 */
export default function Sign() {
  const { t, i18n } = useTranslation();
  const { token } = useParams<{ token: string }>();
  const canvasRef = useRef<SignatureCanvasHandle | null>(null);
  const submit = useSubmitSignature();
  const { data: info, isLoading, error } = useSignaturePublic(token);

  const [canvasEmpty, setCanvasEmpty] = useState(true);
  const [byParent, setByParent] = useState(false);
  const [parentNom, setParentNom] = useState('');
  const [parentLien, setParentLien] = useState('');
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);

  const dateLocale = i18n.language === 'ar' ? 'ar-MA' : 'fr-FR';

  // ============== Loading ==============
  if (isLoading) {
    return (
      <PublicShell>
        <Card padding="lg" className="text-center">
          <div className="w-8 h-8 border-[3px] border-navy border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-muted">{t('signature.public.loading')}</p>
        </Card>
      </PublicShell>
    );
  }

  // ============== Error / Not found ==============
  if (error || !info) {
    const msg = error instanceof Error ? error.message : '';
    const notFound = msg.includes('TOKEN_NOT_FOUND') || !info;
    return (
      <PublicShell>
        <Card padding="lg" className="text-center">
          <AlertCircle className="w-10 h-10 mx-auto mb-3 text-red-700" />
          <CardTitle className="text-center">
            {notFound
              ? t('signature.public.not_found_title')
              : t('signature.public.expired_title')}
          </CardTitle>
          <p className="mt-2 text-sm text-muted">
            {notFound
              ? t('signature.public.not_found_body')
              : t('signature.public.expired_body')}
          </p>
        </Card>
      </PublicShell>
    );
  }

  // ============== Already signed ==============
  if (info.is_signed || submittedAt) {
    const signedAt = submittedAt ?? info.date_signature;
    return (
      <PublicShell>
        <Card padding="lg" className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
            <CheckCircle2 className="w-9 h-9 text-green-700" />
          </div>
          <CardTitle className="text-center">
            {submittedAt
              ? t('signature.signed_ok')
              : t('signature.public.already_signed_title')}
          </CardTitle>
          <p className="mt-2 text-sm text-muted">
            {submittedAt
              ? t('signature.signed_thanks')
              : t('signature.public.already_signed_body')}
          </p>
          {signedAt && (
            <p className="mt-3 text-xs text-muted">
              {t('signature.signed_at', {
                date: new Date(signedAt).toLocaleString(dateLocale),
              })}
            </p>
          )}
        </Card>
      </PublicShell>
    );
  }

  // ============== Expired ==============
  if (info.is_expired || info.status === 'expire') {
    return (
      <PublicShell>
        <Card padding="lg" className="text-center">
          <Clock className="w-10 h-10 mx-auto mb-3 text-orange-600" />
          <CardTitle className="text-center">
            {t('signature.public.expired_title')}
          </CardTitle>
          <p className="mt-2 text-sm text-muted">
            {t('signature.public.expired_body')}
          </p>
        </Card>
      </PublicShell>
    );
  }

  // ============== Active sign form ==============
  const fullName = [info.client_prenom, info.client_nom].filter(Boolean).join(' ').trim();
  const fmtCurrency = (n: number) =>
    new Intl.NumberFormat(dateLocale, { style: 'currency', currency: 'EUR' }).format(n);
  const fmtDate = (iso: string) =>
    new Intl.DateTimeFormat(dateLocale, { weekday: 'long', day: 'numeric', month: 'long' }).format(
      new Date(iso),
    );

  const deliveryLabel =
    info.mode_livraison === 'retrait_magasin'
      ? t('signature.public.delivery_pickup')
      : t('signature.public.delivery_home');
  const creneauLabel = info.creneau
    ? `${t(`creneau.${info.creneau}`)} · ${t(`creneau.${info.creneau}_hours`)}`
    : null;

  const onSubmit = async () => {
    setSubmitErr(null);
    if (!canvasRef.current || canvasRef.current.isEmpty()) {
      setSubmitErr(t('signature.errors.invalid_data'));
      return;
    }
    if (byParent && parentNom.trim().length < 2) {
      setSubmitErr(t('signature.errors.invalid_data'));
      return;
    }
    const dataUrl = canvasRef.current.toDataURL();
    if (!dataUrl || !token) {
      setSubmitErr(t('signature.errors.invalid_data'));
      return;
    }

    try {
      const r = await submit.mutateAsync({
        token,
        signatureData: dataUrl,
        signeParParent: byParent,
        parentNom: byParent ? parentNom.trim() : null,
        parentLien: byParent ? parentLien.trim() || null : null,
      });
      setSubmittedAt(r.signed_at);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('SIGNATURE_EXPIRED')) {
        setSubmitErr(t('signature.errors.expired'));
      } else if (msg.includes('ALREADY_SIGNED')) {
        setSubmitErr(t('signature.errors.already_signed'));
      } else if (msg.includes('TOKEN_NOT_FOUND') || msg.includes('SIGNATURE_TOKEN_NOT_FOUND')) {
        setSubmitErr(t('signature.errors.not_found'));
      } else if (msg.includes('INVALID_SIGNATURE_DATA') || msg.includes('INVALID_TOKEN')) {
        setSubmitErr(t('signature.errors.invalid_data'));
      } else {
        setSubmitErr(t('signature.errors.generic'));
      }
    }
  };

  return (
    <PublicShell>
      <Card padding="lg">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <CardTitle>{t('signature.public.title')}</CardTitle>
            <CardSubtitle className="mt-1">
              {t('signature.public.subtitle')}
            </CardSubtitle>
          </div>
          <CountdownPill expiresAt={info.date_expiration} />
        </div>

        {/* Récap BL */}
        <dl className="rounded-2xl bg-cream-100 border border-line p-4 space-y-2.5 text-sm">
          <Row
            label={t('signature.public.bl_label')}
            value={<span className="font-mono font-bold text-ink">{info.numero_bl}</span>}
          />
          <Row label={t('signature.public.client_label')} value={fullName || '—'} />
          {info.client_ville && (
            <Row label={t('bl.detail.address')} value={info.client_ville} />
          )}
          <Row label={t('signature.public.delivery_label')} value={deliveryLabel} />
          {creneauLabel && (
            <Row label={t('signature.public.creneau_label')} value={creneauLabel} />
          )}
          {info.date_livraison_prevue && (
            <Row
              label={t('signature.public.delivery_date_label')}
              value={fmtDate(info.date_livraison_prevue)}
            />
          )}
          {info.articles_count > 0 && (
            <Row
              label={t('signature.public.articles_label')}
              value={t('signature.public.articles_count', { count: info.articles_count })}
            />
          )}
          <Row
            label={t('signature.public.amount_label')}
            value={
              <span className="font-bold text-ink">
                {fmtCurrency(info.montant_total_ttc)}
              </span>
            }
          />
        </dl>

        <p className="mt-4 text-sm text-muted">{t('signature.public.consent')}</p>

        {/* Toggle parent / mineur */}
        <label className="mt-4 flex items-center gap-2 text-sm font-medium text-ink cursor-pointer select-none">
          <input
            type="checkbox"
            className="w-4 h-4 accent-navy"
            checked={byParent}
            onChange={(e) => setByParent(e.target.checked)}
          />
          {t('signature.parent_toggle')}
        </label>

        {byParent && (
          <div className="mt-3 space-y-3">
            <Input
              type="text"
              label={t('signature.parent_name_label')}
              placeholder={t('signature.parent_name_placeholder')}
              value={parentNom}
              onChange={(e) => setParentNom(e.target.value)}
              autoComplete="name"
              required
            />
            <Input
              type="text"
              label={t('signature.parent_link_label')}
              placeholder={t('signature.parent_link_placeholder')}
              value={parentLien}
              onChange={(e) => setParentLien(e.target.value)}
            />
          </div>
        )}

        {/* Canvas */}
        <div className="mt-4">
          <SignatureCanvas
            ref={canvasRef}
            height={220}
            onChange={(empty) => setCanvasEmpty(empty)}
          />
        </div>

        {submitErr && (
          <div
            className="mt-3 rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700"
            role="alert"
          >
            {submitErr}
          </div>
        )}

        <Button
          type="button"
          intent="ink"
          size="lg"
          fullWidth
          leftIcon={<Send className="w-5 h-5 rtl-flip" />}
          disabled={canvasEmpty}
          loading={submit.isPending}
          onClick={() => void onSubmit()}
          className="mt-4"
        >
          {submit.isPending ? t('signature.submitting') : t('signature.submit')}
        </Button>
      </Card>
    </PublicShell>
  );
}

/** Layout commun aux écrans publics (pas de bottom-nav, header minimal). */
function PublicShell({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="min-h-dvh flex flex-col bg-cream">
      <div className="flex justify-between items-center p-4">
        <BrandBlock logoSize={40} />
        <LanguageToggle variant="pill" />
      </div>
      <div className="flex-1 px-4 pb-10">
        <div className="max-w-md mx-auto w-full">{children}</div>
      </div>
      <footer className="text-center text-[11px] text-muted py-4 inline-flex items-center justify-center gap-1">
        <ShieldCheck className="w-3 h-3" aria-hidden />
        {t('signature.public.powered_by')}
      </footer>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-ink font-medium text-end">{value}</dd>
    </div>
  );
}
