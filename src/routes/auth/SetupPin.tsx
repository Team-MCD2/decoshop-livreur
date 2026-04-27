import { useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Shield, ArrowLeft, ShieldAlert } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { PinPad } from '@/components/auth/PinPad';
import {
  setupPin,
  isCryptoAvailable,
  InsecureContextError,
} from '@/lib/pin-crypto';
import { useAuthStore } from '@/stores/authStore';

type Step = 'enter' | 'confirm';

export default function SetupPin() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const session = useAuthStore((s) => s.session);
  const setUnlocked = useAuthStore((s) => s.setUnlocked);

  const [step, setStep] = useState<Step>('enter');
  const [firstPin, setFirstPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pinLength] = useState<4 | 6>(4);

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  // Web Crypto exige HTTPS ou localhost. Sur un IP privé en HTTP, on bloque
  // l'UI avec un message clair plutôt qu'un cryptique « Une erreur est survenue ».
  if (!isCryptoAvailable()) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-cream px-4 py-8">
        <Card padding="lg" className="w-full max-w-md text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-yellow-100 rounded-full flex items-center justify-center">
            <ShieldAlert className="w-8 h-8 text-yellow-700" />
          </div>
          <h1 className="text-xl font-display font-bold text-ink mb-2">
            {t('auth.pin.errors.insecure_context')}
          </h1>
          <p className="text-sm text-muted">
            {t('auth.pin.errors.insecure_context_hint')}
          </p>
        </Card>
      </div>
    );
  }

  const handleFirstComplete = (pin: string) => {
    setFirstPin(pin);
    setStep('confirm');
    setError(null);
  };

  const handleConfirmComplete = async (pin: string) => {
    if (pin !== firstPin) {
      setError(t('auth.pin.mismatch'));
      return;
    }
    try {
      await setupPin(pin, session.user.id);
      setUnlocked(true);
      const next = (location.state as { from?: string } | null)?.from ?? '/';
      navigate(next, { replace: true });
    } catch (e) {
      if (e instanceof InsecureContextError) {
        setError(t('auth.pin.errors.insecure_context'));
      } else {
        setError(t('errors.generic'));
      }
    }
  };

  const handleBack = () => {
    setStep('enter');
    setFirstPin('');
    setError(null);
  };

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-cream px-4 py-8">
      <Card padding="lg" className="w-full max-w-md text-center">
        <div className="w-16 h-16 mx-auto mb-4 bg-navy-50 rounded-full flex items-center justify-center">
          <Shield className="w-8 h-8 text-navy" />
        </div>

        <h1 className="text-2xl font-display font-bold text-ink mb-2">
          {step === 'enter' ? t('auth.pin.setup_title') : t('auth.pin.confirm_title')}
        </h1>
        <p className="text-sm text-muted mb-8">
          {step === 'enter' ? t('auth.pin.setup_subtitle') : t('auth.pin.confirm_subtitle')}
        </p>

        <PinPad
          key={step}
          length={pinLength}
          onComplete={step === 'enter' ? handleFirstComplete : (p) => void handleConfirmComplete(p)}
          error={error ?? undefined}
        />

        <p className="text-xs text-muted mt-6">{t('auth.pin.length_hint')}</p>

        {step === 'confirm' && (
          <div className="mt-6 pt-6 border-t border-line">
            <Button
              intent="ghost"
              size="sm"
              leftIcon={<ArrowLeft className="w-4 h-4 rtl-flip" />}
              onClick={handleBack}
            >
              {t('common.back')}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
