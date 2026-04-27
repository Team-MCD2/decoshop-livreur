import { useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Lock } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { PinPad } from '@/components/auth/PinPad';
import { verifyPin, hasPinSetup, getPinUserId } from '@/lib/pin-crypto';
import { useAuthStore } from '@/stores/authStore';
import { useProfile } from '@/hooks/useAuth';

export default function Unlock() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const session = useAuthStore((s) => s.session);
  const setUnlocked = useAuthStore((s) => s.setUnlocked);
  const signOut = useAuthStore((s) => s.signOut);
  const profile = useProfile();

  const [error, setError] = useState<string | null>(null);

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (!hasPinSetup()) {
    setUnlocked(true);
    return <Navigate to="/" replace />;
  }

  // Cohérence : si le PIN local appartient à un autre user → re-login
  const pinUserId = getPinUserId();
  if (pinUserId && pinUserId !== session.user.id) {
    void signOut();
    return <Navigate to="/login" replace />;
  }

  const handleComplete = async (pin: string) => {
    const ok = await verifyPin(pin);
    if (!ok) {
      setError(t('auth.pin.incorrect'));
      return;
    }
    setUnlocked(true);
    const next = (location.state as { from?: string } | null)?.from ?? '/';
    navigate(next, { replace: true });
  };

  const userLabel = profile ? `${profile.prenom ?? ''} ${profile.nom ?? ''}`.trim() : session.user.email;

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-cream px-4 py-8">
      <Card padding="lg" className="w-full max-w-md text-center">
        <div className="w-16 h-16 mx-auto mb-4 bg-navy-50 rounded-full flex items-center justify-center">
          <Lock className="w-8 h-8 text-navy" />
        </div>

        <h1 className="text-2xl font-display font-bold text-ink mb-2">
          {t('auth.pin.enter_title')}
        </h1>
        <p className="text-sm text-muted mb-1">{t('auth.pin.enter_subtitle')}</p>
        {userLabel && <p className="text-base font-semibold text-navy mb-8">{userLabel}</p>}

        <PinPad
          length={4}
          onComplete={(p) => void handleComplete(p)}
          error={error ?? undefined}
        />

        <div className="mt-8 pt-6 border-t border-line space-y-2">
          <Button intent="ghost" size="sm" onClick={() => void signOut()}>
            {t('auth.pin.use_password')}
          </Button>
        </div>
      </Card>
    </div>
  );
}
