import { type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { hasPinSetup } from '@/lib/pin-crypto';

interface AuthGuardProps {
  children: ReactNode;
}

/**
 * Garde de route :
 *   - Pas de session             → /login
 *   - Session + PIN configuré + locked → /unlock
 *   - Session + pas de PIN              → /setup-pin (PIN obligatoire, spec §6.4)
 *   - Session + unlocked                → render children
 */
export function AuthGuard({ children }: AuthGuardProps) {
  const session = useAuthStore((s) => s.session);
  const isUnlocked = useAuthStore((s) => s.isUnlocked);
  const isLoading = useAuthStore((s) => s.isLoading);
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-cream">
        <div className="w-8 h-8 border-[3px] border-navy border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (!isUnlocked) {
    // PIN obligatoire (spec §6.4 sécurité)
    if (hasPinSetup()) {
      return <Navigate to="/unlock" state={{ from: location.pathname }} replace />;
    }
    return <Navigate to="/setup-pin" state={{ from: location.pathname }} replace />;
  }

  return <>{children}</>;
}
