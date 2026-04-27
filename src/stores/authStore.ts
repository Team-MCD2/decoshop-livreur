import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { clearPin, getPinUserId } from '@/lib/pin-crypto';
import type { Profile } from '@/types/domain';

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  /** L'utilisateur a une session valide ET a passé l'unlock (PIN ou login frais). */
  isUnlocked: boolean;
  /** En cours de chargement initial (au boot de l'app). */
  isLoading: boolean;
  /** Erreur de connexion ou de chargement profil. */
  error: string | null;

  init: () => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  loadProfile: () => Promise<void>;
  setUnlocked: (unlocked: boolean) => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  profile: null,
  isUnlocked: false,
  isLoading: true,
  error: null,

  init: async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        set({ session, user: session.user });
        await get().loadProfile();
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[auth] init failed', e);
    } finally {
      set({ isLoading: false });
    }

    // Réagir aux changements de session
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        set({ session: null, user: null, profile: null, isUnlocked: false });
      } else {
        set({ session, user: session.user });
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          void get().loadProfile();
        }
      }
    });
  },

  signInWithPassword: async (email, password) => {
    set({ error: null });
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      set({ error: error.message });
      throw error;
    }
    if (data.session) {
      // Si un PIN existe sur ce device pour un AUTRE utilisateur (device partagé),
      // on l'efface — le nouvel utilisateur devra créer le sien.
      const existingPinUser = getPinUserId();
      if (existingPinUser && existingPinUser !== data.user.id) {
        clearPin();
      }
      set({ session: data.session, user: data.user, isUnlocked: true });
      await get().loadProfile();
    }
  },

  signOut: async () => {
    await supabase.auth.signOut();
    // PIN conservé volontairement (device-bound, commodité de ré-enrôlement).
    // Voir signInWithPassword : wipe automatique si autre utilisateur se connecte.
    set({ session: null, user: null, profile: null, isUnlocked: false });
  },

  loadProfile: async () => {
    const userId = get().user?.id;
    if (!userId) return;

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      // eslint-disable-next-line no-console
      console.error('[auth] loadProfile failed', error);
      set({ error: error.message });
      return;
    }

    set({ profile: data });
  },

  setUnlocked: (isUnlocked) => set({ isUnlocked }),
  clearError: () => set({ error: null }),
}));
