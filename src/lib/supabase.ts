import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

// `.trim()` — defensive against Vercel/Netlify dashboards that sometimes append
// a trailing newline to pasted env values. Without this, a trailing `\n` in
// VITE_SUPABASE_ANON_KEY gets URL-encoded as `%0A` inside the realtime
// websocket query string and breaks JWT validation (CHANNEL_ERROR).
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL?.trim();
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // eslint-disable-next-line no-console
  console.warn(
    '[supabase] VITE_SUPABASE_URL et/ou VITE_SUPABASE_ANON_KEY non défini — vérifie ton .env.local',
  );
}

/**
 * Singleton client Supabase — schéma par défaut: `livreur`.
 *
 * Consolidation 2026-04-30 : depuis le merge avec le projet `decoshop`
 * (inventaire), TOUTES les tables livreur vivent dans le schéma `livreur.*`
 * (au lieu de `public.*`). On configure donc `livreur` comme schéma par
 * défaut pour `from()` et `rpc()`. Pour les rares lectures cross-schema
 * (ex: `public.articles_public`), utiliser `supabase.schema('public').from(...)`.
 *
 * Nécessite que les schémas `livreur` ET `public` soient exposés dans
 * Supabase Studio → Settings → API → Exposed schemas.
 */
export const supabase = createClient<Database, 'livreur'>(
  SUPABASE_URL ?? 'http://localhost:54321',
  SUPABASE_ANON_KEY ?? 'anon-placeholder',
  {
    db: {
      schema: 'livreur',
    },
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
