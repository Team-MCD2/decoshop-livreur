import { useState, type FormEvent } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Mail, Lock, ArrowRight } from 'lucide-react';
import { BrandBlock } from '@/components/brand/Logo';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { LanguageToggle } from '@/components/auth/LanguageToggle';
import { useAuthStore } from '@/stores/authStore';
import { hasPinSetup } from '@/lib/pin-crypto';

export default function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const session = useAuthStore((s) => s.session);
  const signIn = useAuthStore((s) => s.signInWithPassword);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Si déjà connecté → unlock (PIN existant) ou setup-pin (premier passage)
  if (session && !submitting) {
    return <Navigate to={hasPinSetup() ? '/unlock' : '/setup-pin'} replace />;
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
      // Après login OK : si pas de PIN configuré, propose de le créer
      const next = (location.state as { from?: string } | null)?.from ?? '/';
      if (!hasPinSetup()) {
        navigate('/setup-pin', { state: { from: next } });
      } else {
        navigate(next, { replace: true });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown';
      const msgLower = msg.toLowerCase();
      if (msgLower.includes('invalid') || msgLower.includes('invalid_credentials')) {
        setError(t('auth.login.errors.invalid_credentials'));
      } else if (
        msgLower.includes('failed to fetch') ||
        msgLower.includes('networkerror') ||
        msgLower.includes('network') ||
        msgLower.includes('fetch') ||
        msgLower.includes('err_name_not_resolved')
      ) {
        // DNS / network failure — likely Supabase project is paused or URL is wrong
        setError(
          t('auth.login.errors.network', {
            defaultValue:
              'Impossible de joindre le serveur. Vérifiez votre connexion internet et que le projet Supabase est actif.',
          }),
        );
      } else {
        setError(t('auth.login.errors.unknown'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-dvh flex flex-col bg-cream">
      <div className="flex justify-end p-4">
        <LanguageToggle variant="pill" />
      </div>

      <div className="flex-1 flex items-center justify-center px-4 pb-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <BrandBlock logoSize={72} className="justify-center mb-4" />
          </div>

          <Card padding="lg" className="shadow-md">
            <h1 className="text-2xl font-display font-bold text-ink mb-1 text-center">
              {t('auth.login.title')}
            </h1>
            <p className="text-sm text-muted text-center mb-6">
              {t('auth.login.subtitle')}
            </p>

            <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
              <Input
                type="email"
                label={t('auth.login.email')}
                placeholder={t('auth.login.email_placeholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                autoFocus
                disabled={submitting}
              />
              <Input
                type="password"
                label={t('auth.login.password')}
                placeholder={t('auth.login.password_placeholder')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                disabled={submitting}
                error={error ?? undefined}
              />

              <Button
                type="submit"
                intent="primary"
                size="lg"
                fullWidth
                loading={submitting}
                rightIcon={<ArrowRight className="w-5 h-5 rtl-flip" />}
              >
                {submitting ? t('auth.login.submitting') : t('auth.login.submit')}
              </Button>
            </form>

            <div className="flex flex-col items-center gap-2 mt-6 pt-6 border-t border-line">
              <a
                href="#forgot"
                className="text-sm text-muted hover:text-navy"
                onClick={(e) => e.preventDefault()}
              >
                {t('auth.login.forgot')}
              </a>
            </div>
          </Card>

          <div className="flex items-center justify-center gap-3 mt-8 text-xs text-muted">
            <Mail className="w-3 h-3" />
            <span>contact@decoshop-toulouse.fr</span>
            <span aria-hidden>•</span>
            <Lock className="w-3 h-3" />
            <span>Connexion sécurisée</span>
          </div>
        </div>
      </div>
    </div>
  );
}
