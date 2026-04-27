import { NavLink } from 'react-router-dom';
import { Home, Calendar, BarChart3, User, LogOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { BrandBlock } from '@/components/brand/Logo';
import { LanguageToggle } from '@/components/auth/LanguageToggle';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/stores/authStore';
import { useProfile } from '@/hooks/useAuth';
import { cn } from '@/utils/cn';

export function Sidebar() {
  const { t } = useTranslation();
  const profile = useProfile();
  const signOut = useAuthStore((s) => s.signOut);

  const items = [
    { to: '/', icon: Home, label: t('nav.home'), end: true },
    { to: '/calendrier', icon: Calendar, label: t('nav.calendar') },
    { to: '/performance', icon: BarChart3, label: t('nav.performance') },
    { to: '/profil', icon: User, label: t('nav.profile') },
  ];

  return (
    <aside className="hidden lg:flex flex-col w-64 h-dvh sticky top-0 bg-white border-r border-line p-6">
      <div className="mb-8">
        <BrandBlock logoSize={48} />
      </div>

      <nav aria-label="Navigation principale" className="flex-1">
        <ul className="space-y-1">
          {items.map(({ to, icon: Icon, label, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-4 py-3 rounded-xl',
                    'text-sm font-semibold transition-colors',
                    isActive
                      ? 'bg-navy text-white shadow-sm'
                      : 'text-muted hover:bg-cream-100 hover:text-ink',
                  )
                }
              >
                <Icon className="w-5 h-5" strokeWidth={2} />
                <span>{label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="space-y-4 pt-4 border-t border-line">
        <div className="px-2">
          <div className="text-xs text-muted uppercase tracking-wider font-bold mb-1">
            {t('common.language')}
          </div>
          <LanguageToggle variant="pill" />
        </div>

        {profile && (
          <div className="px-2">
            <div className="text-sm font-semibold text-ink">
              {profile.prenom} {profile.nom}
            </div>
            <div className="text-xs text-muted">{profile.email}</div>
          </div>
        )}

        <Button
          intent="ghost"
          size="sm"
          fullWidth
          leftIcon={<LogOut className="w-4 h-4" />}
          onClick={() => void signOut()}
        >
          {t('common.logout')}
        </Button>
      </div>
    </aside>
  );
}
