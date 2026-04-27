import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // eslint-disable-next-line no-console
  console.warn(
    '[supabase] VITE_SUPABASE_URL et/ou VITE_SUPABASE_ANON_KEY non défini — vérifie ton .env.local',
  );
}

export const supabase = createClient<Database>(
  SUPABASE_URL ?? 'http://localhost:54321',
  SUPABASE_ANON_KEY ?? 'anon-placeholder',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
      storageKey: 'decoshop-livreur-auth',
    },
    global: {
      headers: {
        'x-app-name': 'decoshop-livreur',
      },
    },
  },
);

export type SupabaseClient = typeof supabase;
