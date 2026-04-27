/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_MAPBOX_TOKEN?: string;
  readonly VITE_VAPID_PUBLIC_KEY?: string;
  readonly VITE_APP_URL: string;
  readonly VITE_APP_NAME: string;
  readonly VITE_DEFAULT_LANGUAGE: 'fr' | 'ar';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
