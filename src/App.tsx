import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AppRoutes } from '@/routes';
import { useSettingsStore } from '@/stores/settingsStore';
import { useAuthStore } from '@/stores/authStore';

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

  return <AppRoutes />;
}
