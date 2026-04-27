import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  PenLine,
  Send,
  Copy,
  CheckCircle2,
  Share2,
  RotateCcw,
  Smartphone,
  Link2,
  AlertTriangle,
  Mail,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { SignatureCanvas, type SignatureCanvasHandle } from '@/components/bl/SignatureCanvas';
import {
  useRequestSignature,
  useSubmitSignature,
  type EmailDeliveryStatus,
} from '@/hooks/useSignature';
import { CountdownPill } from '@/components/bl/CountdownPill';

interface SignatureModalProps {
  open: boolean;
  onClose: () => void;
  blId: string;
  numeroBl: string;
  /** Token déjà généré (si BL.statut=signature_attendue + on rouvre la modal). */
  existingToken?: string | null;
  existingExpiration?: string | null;
}

type Mode = 'choose' | 'link' | 'canvas' | 'success';

export function SignatureModal({
  open,
  onClose,
  blId,
  numeroBl,
  existingToken,
  existingExpiration,
}: SignatureModalProps) {
  const { t, i18n } = useTranslation();
  const requestSig = useRequestSignature();
  const submitSig = useSubmitSignature();
  const canvasRef = useRef<SignatureCanvasHandle | null>(null);

  const [mode, setMode] = useState<Mode>(existingToken ? 'link' : 'choose');
  const [token, setToken] = useState<string | null>(existingToken ?? null);
  const [expiration, setExpiration] = useState<string | null>(existingExpiration ?? null);
  const [canvasEmpty, setCanvasEmpty] = useState(true);
  const [copyOk, setCopyOk] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [emailStatus, setEmailStatus] = useState<EmailDeliveryStatus | null>(null);
  const [emailRecipient, setEmailRecipient] = useState<string | null>(null);

  const fullUrl = token ? `${window.location.origin}/sign/${token}` : '';
  const lang: 'fr' | 'ar' = i18n.language?.startsWith('ar') ? 'ar' : 'fr';

  // Reset l'état si on rouvre la modal sur un BL différent
  useEffect(() => {
    if (open) {
      setMode(existingToken ? 'link' : 'choose');
      setToken(existingToken ?? null);
      setExpiration(existingExpiration ?? null);
      setSubmitError(null);
      setCopyOk(false);
      setEmailStatus(null);
      setEmailRecipient(null);
    }
  }, [open, existingToken, existingExpiration]);

  const requestToken = async () => {
    setSubmitError(null);
    setEmailStatus(null);
    setEmailRecipient(null);
    try {
      const r = await requestSig.mutateAsync({ blId, ttlMinutes: 10, language: lang });
      setToken(r.token);
      setExpiration(r.date_expiration);
      setEmailStatus(r.email_status);
      setEmailRecipient(r.email_client);
      setMode('link');
    } catch (e) {
      setSubmitError(t(getErrorKey(e)));
    }
  };

  const handleShare = async () => {
    if (!navigator.share) {
      // Pas de Web Share API → fallback copie
      void copyLink();
      return;
    }
    try {
      await navigator.share({
        title: t('signature.share_label', { numero: numeroBl }),
        text: t('signature.share_text', { url: fullUrl }),
        url: fullUrl,
      });
    } catch {
      // Annulé par l'utilisateur — silencieux
    }
  };

  const copyLink = async () => {
    if (!fullUrl) return;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopyOk(true);
      window.setTimeout(() => setCopyOk(false), 2000);
    } catch {
      // Fallback : selection
      const el = document.createElement('textarea');
      el.value = fullUrl;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopyOk(true);
      window.setTimeout(() => setCopyOk(false), 2000);
    }
  };

  const handleCanvasSubmit = async () => {
    setSubmitError(null);
    if (!canvasRef.current) return;
    const dataUrl = canvasRef.current.toDataURL();
    if (!dataUrl) {
      setSubmitError(t('signature.errors.invalid_data'));
      return;
    }

    // Si pas encore de token, on en demande un avant de submit
    // Mode canvas direct → inutile d'envoyer un email au client
    let activeToken = token;
    if (!activeToken) {
      try {
        const r = await requestSig.mutateAsync({
          blId,
          ttlMinutes: 10,
          language: lang,
          sendEmail: false,
        });
        activeToken = r.token;
        setToken(r.token);
        setExpiration(r.date_expiration);
      } catch (e) {
        setSubmitError(t(getErrorKey(e)));
        return;
      }
    }

    try {
      await submitSig.mutateAsync({
        token: activeToken!,
        signatureData: dataUrl,
      });
      setMode('success');
    } catch (e) {
      setSubmitError(t(getErrorKey(e)));
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t('signature.modal_title')} size="md">
      {/* ===== CHOIX DU MODE ===== */}
      {mode === 'choose' && (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            BL <span className="font-mono font-bold text-ink">{numeroBl}</span>
          </p>

          <button
            type="button"
            onClick={() => setMode('canvas')}
            className="w-full text-start p-4 rounded-2xl border-2 border-line hover:border-navy hover:bg-navy-50/30 transition-colors"
          >
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-10 h-10 rounded-full bg-navy text-yellow flex items-center justify-center">
                <Smartphone className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-ink">{t('signature.method_canvas')}</p>
                <p className="text-xs text-muted mt-1">{t('signature.method_canvas_hint')}</p>
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => void requestToken()}
            disabled={requestSig.isPending}
            className="w-full text-start p-4 rounded-2xl border-2 border-line hover:border-navy hover:bg-navy-50/30 transition-colors disabled:opacity-60"
          >
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-10 h-10 rounded-full bg-yellow-300 text-ink flex items-center justify-center">
                <Link2 className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-ink">{t('signature.method_link')}</p>
                <p className="text-xs text-muted mt-1">{t('signature.method_link_hint')}</p>
                {requestSig.isPending && (
                  <p className="text-xs text-navy mt-1">{t('signature.requesting')}</p>
                )}
              </div>
            </div>
          </button>

          {submitError && <ErrorAlert message={submitError} />}
        </div>
      )}

      {/* ===== LIEN GÉNÉRÉ — partage ===== */}
      {mode === 'link' && token && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted">
              BL <span className="font-mono font-bold text-ink">{numeroBl}</span>
            </p>
            {expiration && <CountdownPill expiresAt={expiration} />}
          </div>

          {/* Statut envoi email (best-effort) */}
          {emailStatus === 'sent' && emailRecipient && (
            <div className="rounded-xl bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800 inline-flex items-center gap-2">
              <Mail className="w-4 h-4 shrink-0" />
              <span>{t('signature.email_sent', { email: emailRecipient })}</span>
            </div>
          )}
          {(emailStatus === 'failed' || emailStatus === 'not_configured') && (
            <div className="rounded-xl bg-yellow-100 border border-yellow-300 px-3 py-2 text-sm text-ink inline-flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{t('signature.errors.email_send_failed')}</span>
            </div>
          )}

          <div className="rounded-xl bg-cream-100 border border-line p-3 break-all text-xs font-mono text-ink select-all">
            {fullUrl}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              intent="ghost"
              size="md"
              leftIcon={
                copyOk ? <CheckCircle2 className="w-4 h-4 text-green-700" /> : <Copy className="w-4 h-4" />
              }
              onClick={() => void copyLink()}
            >
              {copyOk ? t('signature.copied') : t('signature.copy_link')}
            </Button>
            <Button
              type="button"
              intent="primary"
              size="md"
              leftIcon={<Share2 className="w-4 h-4" />}
              onClick={() => void handleShare()}
            >
              {t('signature.share_link')}
            </Button>
          </div>

          <div className="pt-3 border-t border-line space-y-2">
            <Button
              type="button"
              intent="yellow"
              size="md"
              fullWidth
              leftIcon={<PenLine className="w-4 h-4" />}
              onClick={() => setMode('canvas')}
            >
              {t('signature.method_canvas')}
            </Button>
            <Button
              type="button"
              intent="ghost"
              size="sm"
              fullWidth
              leftIcon={<RotateCcw className="w-4 h-4" />}
              loading={requestSig.isPending}
              onClick={() => void requestToken()}
            >
              {t('signature.request_again')}
            </Button>
          </div>

          {submitError && <ErrorAlert message={submitError} />}
        </div>
      )}

      {/* ===== CANVAS DIRECT (livreur) ===== */}
      {mode === 'canvas' && (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            BL <span className="font-mono font-bold text-ink">{numeroBl}</span>
          </p>
          <SignatureCanvas
            ref={canvasRef}
            height={220}
            onChange={(empty) => setCanvasEmpty(empty)}
          />
          <Button
            type="button"
            intent="ink"
            size="lg"
            fullWidth
            leftIcon={<Send className="w-4 h-4 rtl-flip" />}
            disabled={canvasEmpty}
            loading={submitSig.isPending || requestSig.isPending}
            onClick={() => void handleCanvasSubmit()}
          >
            {submitSig.isPending ? t('signature.submitting') : t('signature.submit')}
          </Button>
          {submitError && <ErrorAlert message={submitError} />}
        </div>
      )}

      {/* ===== SUCCÈS ===== */}
      {mode === 'success' && (
        <div className="text-center space-y-4 py-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100">
            <CheckCircle2 className="w-9 h-9 text-green-700" />
          </div>
          <h3 className="text-xl font-display font-bold text-ink">{t('signature.signed_ok')}</h3>
          <p className="text-sm text-muted">{t('signature.signed_thanks')}</p>
          <Button intent="primary" size="md" fullWidth onClick={onClose}>
            OK
          </Button>
        </div>
      )}
    </Modal>
  );
}

function ErrorAlert({ message }: { message: string }) {
  return (
    <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
      {message}
    </div>
  );
}

/**
 * Mappe une erreur RPC sur une clé i18n. Retourne toujours une clé valide
 * (le composant appelant fait `t(getErrorKey(e))` pour rendre le message).
 */
function getErrorKey(e: unknown): string {
  if (typeof e === 'object' && e !== null && 'message' in e) {
    const msg = String((e as { message: string }).message);
    // Ordre important : ALREADY_SIGNED_CANNOT_INVALIDATE avant ALREADY_SIGNED
    if (msg.includes('ALREADY_SIGNED_CANNOT_INVALIDATE'))
      return 'signature.errors.already_signed_cannot_invalidate';
    if (msg.includes('SIGNATURE_EXPIRED')) return 'signature.errors.expired';
    if (msg.includes('ALREADY_SIGNED')) return 'signature.errors.already_signed';
    if (msg.includes('TOKEN_NOT_FOUND') || msg.includes('SIGNATURE_TOKEN_NOT_FOUND'))
      return 'signature.errors.not_found';
    if (msg.includes('INVALID_SIGNATURE_DATA') || msg.includes('INVALID_TOKEN'))
      return 'signature.errors.invalid_data';
    if (msg.includes('CLIENT_HAS_NO_EMAIL')) return 'signature.errors.no_client_email';
    if (msg.includes('BL_NOT_ASSIGNED_TO_YOU')) return 'signature.errors.bl_not_yours';
    if (msg.includes('INVALID_BL_STATUS')) return 'signature.errors.bl_invalid_status';
    if (msg.includes('FORBIDDEN')) return 'signature.errors.forbidden';
  }
  return 'signature.errors.generic';
}
