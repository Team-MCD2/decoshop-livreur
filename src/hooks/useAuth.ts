import { useAuthStore } from '@/stores/authStore';

/**
 * Hook simple pour accéder à l'auth depuis les composants.
 * Re-export du store Zustand avec une API plus claire.
 */
export function useAuth() {
  return useAuthStore();
}

/** Le profil livreur uniquement (utile pour les sélecteurs typés) */
export function useProfile() {
  return useAuthStore((s) => s.profile);
}

/** Indique si l'utilisateur est connecté ET déverrouillé */
export function useIsAuthenticated() {
  return useAuthStore((s) => Boolean(s.session && s.isUnlocked));
}
