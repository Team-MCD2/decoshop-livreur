import { Bell } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { LanguageToggle } from '@/components/auth/LanguageToggle';
import { useProfile } from '@/hooks/useAuth';

/**
 * Header mobile (visible uniquement < lg).
 * Sur desktop, c'est la sidebar qui prend le rôle de navigation principale.
 */
export function Header() {
  const profile = useProfile();

  const initials = profile
    ? `${profile.prenom?.[0] ?? ''}${profile.nom?.[0] ?? ''}`.toUpperCase()
    : '??';

  return (
    <header
      className="lg:hidden sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-line safe-top"
      aria-label="Header"
    >
      <div className="flex items-center justify-between h-14 px-4">
        <div className="flex items-center gap-2">
          <Logo size={32} variant="full" />
          <span className="font-display font-black text-lg text-navy tracking-wide">
            DECOSHOP
          </span>
        </div>

        <div className="flex items-center gap-2">
          <LanguageToggle variant="pill" className="scale-90" />
          <button
            type="button"
            aria-label="Notifications"
            className="relative w-10 h-10 rounded-full hover:bg-cream-100 flex items-center justify-center transition-colors"
          >
            <Bell className="w-5 h-5 text-ink" />
            {/* Badge à brancher Phase 7 */}
            {/* <span className="absolute top-2 right-2 w-2 h-2 bg-yellow rounded-full" /> */}
          </button>
          <div
            className="w-9 h-9 rounded-full bg-navy text-yellow flex items-center justify-center font-bold text-sm"
            aria-label={`Connecté en tant que ${profile?.prenom ?? 'utilisateur'}`}
          >
            {initials}
          </div>
        </div>
      </div>
    </header>
  );
}
