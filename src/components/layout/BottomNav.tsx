import { NavLink } from 'react-router-dom';
import { Home, Calendar, BarChart3, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/utils/cn';

export function BottomNav() {
  const { t } = useTranslation();

  const items = [
    { to: '/', icon: Home, label: t('nav.home'), end: true },
    { to: '/calendrier', icon: Calendar, label: t('nav.calendar') },
    { to: '/performance', icon: BarChart3, label: t('nav.performance') },
    { to: '/profil', icon: User, label: t('nav.profile') },
  ];

  return (
    <nav
      className={cn(
        'fixed bottom-0 inset-x-0 z-30',
        'bg-white/95 backdrop-blur-md border-t border-line',
        'safe-bottom',
        'lg:hidden',
      )}
      aria-label="Navigation principale"
    >
      <ul className="flex items-stretch justify-around max-w-md mx-auto">
        {items.map(({ to, icon: Icon, label, end }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center justify-center gap-0.5 py-2.5 px-1',
                  'text-xs font-medium transition-colors',
                  'min-h-[56px]',
                  isActive
                    ? 'text-navy'
                    : 'text-muted hover:text-ink',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={cn(
                      'w-5 h-5 transition-transform',
                      isActive && 'scale-110',
                    )}
                    strokeWidth={isActive ? 2.4 : 1.8}
                  />
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
