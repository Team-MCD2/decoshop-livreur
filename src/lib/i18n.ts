import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import fr from '@/i18n/fr.json';
import ar from '@/i18n/ar.json';

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      fr: { translation: fr },
      ar: { translation: ar },
    },
    fallbackLng: 'fr',
    supportedLngs: ['fr', 'ar'],
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'decoshop-livreur-language',
      caches: ['localStorage'],
    },
  });

export default i18n;
