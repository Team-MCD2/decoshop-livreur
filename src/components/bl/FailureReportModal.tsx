import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Send,
  MapPin,
  ShieldCheck,
  X,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import {
  FAILURE_REASONS,
  failureErrorKey,
  useRecordFailedAttempt,
  type FailureResult,
} from '@/hooks/useFailure';
import type { AttemptFailureReason } from '@/types/domain';

interface FailureReportModalProps {
  open: boolean;
  onClose: () => void;
  blId: string;
  numeroBl: string;
  /** Position GPS pré-capturée (depuis BLDetail si en_route). Optional. */
  preCapturedLat?: number | null;
  preCapturedLng?: number | null;
}

type Step = 'reason' | 'details' | 'success';

/**
 * Modal de signalement d'échec de livraison (Phase 5 UI, RG-241).
 *
 * Flow :
 *   1. Step "reason"    → picker radio + indication force-majeure
 *   2. Step "details"   → commentaire + photo + GPS, bouton "Signaler"
 *   3. Step "success"   → confirmation + résumé palier
 *
 * Toutes les soumissions passent par la RPC `livreur.record_failed_attempt`
 * qui gère atomiquement : transition de statut (echec_T1/T2/abandon),
 * incrément `nb_tentatives`, calcul des frais (via trigger), notif vendeur.
 */
export function FailureReportModal({
  open,
  onClose,
  blId,
  numeroBl,
  preCapturedLat,
  preCapturedLng,
}: FailureReportModalProps) {
  const { t } = useTranslation();
  const record = useRecordFailedAttempt();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [step, setStep] = useState<Step>('reason');
  const [motif, setMotif] = useState<AttemptFailureReason | null>(null);
  const [commentaire, setCommentaire] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [lat, setLat] = useState<number | null>(preCapturedLat ?? null);
  const [lng, setLng] = useState<number | null>(preCapturedLng ?? null);
  const [gpsCapturing, setGpsCapturing] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<FailureResult | null>(null);

  // Reset state every time the modal re-opens
  useEffect(() => {
    if (open) {
      setStep('reason');
      setMotif(null);
      setCommentaire('');
      setPhoto(null);
      setPhotoPreview(null);
      setLat(preCapturedLat ?? null);
      setLng(preCapturedLng ?? null);
      setSubmitError(null);
      setResult(null);
    }
  }, [open, preCapturedLat, preCapturedLng]);

  // Cleanup blob URL on unmount / photo change to avoid leaks
  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview]);

  const isForceMaj = motif
    ? FAILURE_REASONS.find((r) => r.value === motif)?.force_majeure ?? false
    : false;

  const captureGps = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    setGpsCapturing(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
        setGpsCapturing(false);
      },
      () => {
        // Best-effort — silent failure (the report can still be submitted)
        setGpsCapturing(false);
      },
      { timeout: 8000, enableHighAccuracy: false, maximumAge: 30_000 },
    );
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setSubmitError(t('failure.errors.photo_too_large'));
      return;
    }
    setPhoto(file);
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  };

  const removePhoto = () => {
    setPhoto(null);
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async () => {
    if (!motif) return;
    setSubmitError(null);
    try {
      const r = await record.mutateAsync({
        blId,
        motif,
        commentaire: commentaire.trim() || null,
        photo,
        latitude: lat,
        longitude: lng,
      });
      setResult(r);
      setStep('success');
    } catch (e) {
      setSubmitError(t(failureErrorKey(e)));
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t('failure.modal_title')} size="md">
      {/* ============== STEP 1 : reason picker ============== */}
      {step === 'reason' && (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            BL <span className="font-mono font-bold text-ink">{numeroBl}</span>
          </p>

          <div className="rounded-xl bg-orange-50 border border-orange-200 px-3 py-2 text-xs text-orange-800 inline-flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{t('failure.intro')}</span>
          </div>

          <fieldset className="space-y-2" aria-label={t('failure.reason_label')}>
            <legend className="sr-only">{t('failure.reason_label')}</legend>
            {FAILURE_REASONS.map((r) => {
              const selected = motif === r.value;
              return (
                <label
                  key={r.value}
                  className={
                    'flex items-start gap-3 p-3 rounded-2xl border-2 cursor-pointer transition-colors ' +
                    (selected
                      ? 'border-navy bg-navy-50/40'
                      : 'border-line hover:border-navy/40')
                  }
                >
                  <input
                    type="radio"
                    name="failure-reason"
                    value={r.value}
                    checked={selected}
                    onChange={() => setMotif(r.value)}
                    className="mt-1 w-4 h-4 accent-navy"
                  />
                  <span className="flex-1 min-w-0">
                    <span className="block font-medium text-ink">
                      {t(`failure.reasons.${r.value}`)}
                    </span>
                    <span className="block text-xs text-muted mt-0.5">
                      {t(`failure.reasons_hint.${r.value}`)}
                    </span>
                    {r.force_majeure && (
                      <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full bg-green-100 text-green-800 text-[10px] font-bold">
                        <ShieldCheck className="w-3 h-3" />
                        {t('failure.no_fee')}
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
          </fieldset>

          <div className="grid grid-cols-2 gap-2 pt-2">
            <Button intent="ghost" size="md" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button
              intent="primary"
              size="md"
              disabled={!motif}
              onClick={() => setStep('details')}
            >
              {t('common.next')}
            </Button>
          </div>
        </div>
      )}

      {/* ============== STEP 2 : details + submit ============== */}
      {step === 'details' && motif && (
        <div className="space-y-4">
          <div className="rounded-xl bg-cream-100 border border-line p-3">
            <p className="text-xs text-muted uppercase tracking-wider font-bold">
              {t('failure.reason_label')}
            </p>
            <p className="font-bold text-ink mt-1">
              {t(`failure.reasons.${motif}`)}
            </p>
            {isForceMaj && (
              <p className="inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded-full bg-green-100 text-green-800 text-[11px] font-bold">
                <ShieldCheck className="w-3 h-3" />
                {t('failure.no_fee_explain')}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="failure-commentaire"
              className="block text-sm font-medium text-ink mb-1.5"
            >
              {t('failure.comment_label')}{' '}
              <span className="text-muted font-normal">({t('common.optional', { defaultValue: 'optionnel' })})</span>
            </label>
            <textarea
              id="failure-commentaire"
              value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder={t('failure.comment_placeholder')}
              className="w-full px-4 py-3 rounded-xl bg-white border border-line text-ink placeholder:text-muted focus:outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
            />
            <p className="text-xs text-muted mt-1">
              {commentaire.length}/500
            </p>
          </div>

          {/* Photo (best-effort upload) */}
          <div>
            <p className="block text-sm font-medium text-ink mb-1.5">
              {t('failure.photo_label')}{' '}
              <span className="text-muted font-normal">({t('common.optional', { defaultValue: 'optionnel' })})</span>
            </p>
            {photoPreview ? (
              <div className="relative rounded-2xl overflow-hidden border border-line">
                <img src={photoPreview} alt={t('failure.photo_alt')} className="w-full h-44 object-cover" />
                <button
                  type="button"
                  onClick={removePhoto}
                  className="absolute top-2 right-2 w-9 h-9 rounded-full bg-ink/70 text-white inline-flex items-center justify-center hover:bg-ink"
                  aria-label={t('common.delete')}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <Button
                type="button"
                intent="outline"
                size="md"
                fullWidth
                leftIcon={<Camera className="w-4 h-4" />}
                onClick={() => fileInputRef.current?.click()}
              >
                {t('failure.photo_pick')}
              </Button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              onChange={handlePhotoSelect}
              className="hidden"
              aria-hidden="true"
            />
          </div>

          {/* GPS capture */}
          <div className="rounded-xl bg-cream-100 border border-line p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink inline-flex items-center gap-1.5">
                  <MapPin className="w-4 h-4" />
                  {t('failure.gps_label')}
                </p>
                <p className="text-xs text-muted mt-0.5">
                  {lat != null && lng != null
                    ? `${lat.toFixed(5)}, ${lng.toFixed(5)}`
                    : t('failure.gps_none')}
                </p>
              </div>
              <Button
                type="button"
                intent="ghost"
                size="sm"
                loading={gpsCapturing}
                onClick={captureGps}
              >
                {lat != null ? t('failure.gps_refresh') : t('failure.gps_capture')}
              </Button>
            </div>
          </div>

          {submitError && (
            <div
              role="alert"
              className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700"
            >
              {submitError}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 pt-1">
            <Button
              intent="ghost"
              size="md"
              onClick={() => setStep('reason')}
              disabled={record.isPending}
            >
              {t('common.back')}
            </Button>
            <Button
              intent="danger"
              size="md"
              loading={record.isPending}
              leftIcon={<Send className="w-4 h-4 rtl-flip" />}
              onClick={() => void handleSubmit()}
            >
              {record.isPending ? t('failure.submitting') : t('failure.submit')}
            </Button>
          </div>
        </div>
      )}

      {/* ============== STEP 3 : success ============== */}
      {step === 'success' && result && (
        <div className="text-center space-y-4 py-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-orange-100 mb-1">
            <CheckCircle2 className="w-9 h-9 text-orange-700" />
          </div>
          <h3 className="text-xl font-display font-bold text-ink">
            {t('failure.success_title')}
          </h3>
          <p className="text-sm text-muted">
            {t('failure.success_body', {
              attempt: result.attempt_number,
              status: t(`bl.status.${result.new_status}`),
            })}
          </p>

          {result.force_majeure && (
            <div className="rounded-xl bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800 inline-flex items-start gap-2 text-start">
              <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{t('failure.success_no_fee')}</span>
            </div>
          )}

          {result.new_status === 'abandon' && (
            <div className="rounded-xl bg-orange-50 border border-orange-200 px-3 py-2 text-sm text-orange-800 text-start">
              {t('failure.success_abandon_hint')}
            </div>
          )}

          <Button intent="primary" size="md" fullWidth onClick={onClose}>
            {t('common.close')}
          </Button>
        </div>
      )}
    </Modal>
  );
}
