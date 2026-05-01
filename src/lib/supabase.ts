import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

// `.trim()` — defensive against Vercel/Netlify dashboards that sometimes append
// a trailing newline to pasted env values. Without this, a trailing `\n` in
// VITE_SUPABASE_ANON_KEY gets URL-encoded as `%0A` inside the realtime
// websocket query string and breaks JWT validation (CHANNEL_ERROR).
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL?.trim();
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

// Fail loud at module load if env is missing / malformed — beats the cryptic
// "Invalid supabaseUrl" thrown later by the SDK constructor, and prevents
// silent fallback to `http://localhost:54321` in a production build.
if (!SUPABASE_URL || !/^https?:\/\//.test(SUPABASE_URL)) {
  throw new Error(
    `[supabase] VITE_SUPABASE_URL manquant ou malformé (reçu: "${SUPABASE_URL ?? '<undefined>'}"). ` +
      'Vérifie .env.local en local, ou Settings → Environment Variables sur Vercel. ' +
      'Format attendu : https://<ref>.supabase.co',
  );
}
if (!SUPABASE_ANON_KEY) {
  throw new Error(
    '[supabase] VITE_SUPABASE_ANON_KEY manquant. ' +
      'Vérifie .env.local en local, ou Settings → Environment Variables sur Vercel.',
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
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
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
