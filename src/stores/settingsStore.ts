import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Language } from '@/types/domain';

interface SettingsState {
  language: Language;
  theme: 'light' | 'dark' | 'system';
  setLanguage: (lang: Language) => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      language: (import.meta.env.VITE_DEFAULT_LANGUAGE as Language) ?? 'fr',
      theme: 'system',
      setLanguage: (language) => set({ language }),
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: 'decoshop-livreur-settings',
    },
  ),
);
