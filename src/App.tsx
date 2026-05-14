import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AppRoutes } from '@/routes';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useSettingsStore } from '@/stores/settingsStore';
import { useAuthStore } from '@/stores/authStore';
import { useOfflineReplay } from '@/hooks/useOfflineQueue';

export default function App() {
  const { i18n } = useTranslation();
  const language = useSettingsStore((s) => s.language);
  const initAuth = useAuthStore((s) => s.init);

  useEffect(() => {
    void i18n.changeLanguage(language);
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  }, [language, i18n]);

  useEffect(() => {
    void initAuth();
  }, [initAuth]);

  // Phase 6 — drain the offline mutation queue on every `online` event
  // and once on mount (in case mutations survived a tab close last shift).
  // Results land in console + the OfflineBanner pending-count updates ;
  // no toast yet (Phase 6 polish).
  useOfflineReplay({
    onResult: (r) => {
      if (r.success + r.failed + r.retried === 0) return;
      console.info('[offline-queue] replay', r);
    },
  });

  // Single ErrorBoundary at the root — catches uncaught render exceptions
  // anywhere in the tree (auth flow, BL workflow, signature canvas, GPS).
  // Lighter-weight boundaries per route would be a Phase 9 polish.
  return (
    <ErrorBoundary scope="root">
      <AppRoutes />
    </ErrorBoundary>
  );
}
