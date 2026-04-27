import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogOut, Globe, Truck } from 'lucide-react';
import { Card, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { LanguageToggle } from '@/components/auth/LanguageToggle';
import { useAuthStore } from '@/stores/authStore';
import { useProfile } from '@/hooks/useAuth';

export default function Profile() {
  const { t } = useTranslation();
  const profile = useProfile();
  const signOut = useAuthStore((s) => s.signOut);
  const [confirming, setConfirming] = useState(false);

  const handleSignOut = () => {
    if (!confirming) {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 4000);
      return;
    }
    void signOut();
  };

  return (
    <div className="px-4 py-6 lg:px-8 lg:py-10 max-w-3xl mx-auto w-full space-y-4">
      <h1 className="text-2xl font-display font-bold text-ink mb-2">{t('profile.title')}</h1>

      {profile && (
        <Card padding="md">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-navy text-yellow flex items-center justify-center font-display font-black text-xl">
              {(profile.prenom?.[0] ?? '') + (profile.nom?.[0] ?? '')}
            </div>
            <div>
              <div className="font-display font-bold text-lg text-ink">
                {profile.prenom} {profile.nom}
              </div>
              <div className="text-sm text-muted">{profile.email}</div>
              <div className="text-xs text-yellow-700 font-bold uppercase tracking-wider mt-1">
                {profile.role}
              </div>
            </div>
          </div>
        </Card>
      )}

      <Card padding="md">
        <CardTitle>
          <span className="inline-flex items-center gap-2">
            <Globe className="w-5 h-5 text-navy" />
            {t('profile.language')}
          </span>
        </CardTitle>
        <LanguageToggle variant="pill" className="mt-2" />
      </Card>

      <Card padding="md">
        <CardTitle>
          <span className="inline-flex items-center gap-2">
            <Truck className="w-5 h-5 text-navy" />
            {t('profile.vehicle')}
          </span>
        </CardTitle>
        <div className="mt-2 text-sm text-muted">
          {profile?.vehicle_type ? (
            <div className="space-y-1">
              <div>
                <strong className="text-ink">Type :</strong> {profile.vehicle_type}
              </div>
              {profile.vehicle_capacity_m3 && (
                <div>
                  <strong className="text-ink">Capacité :</strong> {profile.vehicle_capacity_m3} m³
                </div>
              )}
              {profile.vehicle_immatriculation && (
                <div>
                  <strong className="text-ink">Immat. :</strong> {profile.vehicle_immatriculation}
                </div>
              )}
            </div>
          ) : (
            <span>— Aucun véhicule renseigné —</span>
          )}
        </div>
      </Card>

      <Card padding="md">
        <Button
          intent={confirming ? 'danger' : 'ghost'}
          size="md"
          fullWidth
          leftIcon={<LogOut className="w-4 h-4 rtl-flip" />}
          onClick={handleSignOut}
        >
          {confirming ? t('profile.logout_confirm') : t('common.logout')}
        </Button>
      </Card>
    </div>
  );
}
