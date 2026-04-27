import { Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '@/stores/settingsStore';
import { cn } from '@/utils/cn';
import type { Language } from '@/types/domain';

interface LanguageToggleProps {
  className?: string;
  variant?: 'pill' | 'inline';
}

export function LanguageToggle({ className, variant = 'pill' }: LanguageToggleProps) {
  const { language, setLanguage } = useSettingsStore();
  const { i18n } = useTranslation();

  const handleChange = (newLang: Language) => {
    setLanguage(newLang);
    void i18n.changeLanguage(newLang);
  };

  const languages: { code: Language; label: string; native: string }[] = [
    { code: 'fr', label: 'FR', native: 'Français' },
    { code: 'ar', label: 'AR', native: 'العربية' },
  ];

  if (variant === 'inline') {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <Globe className="w-4 h-4 text-muted" aria-hidden="true" />
        {languages.map((l) => (
          <button
            key={l.code}
            onClick={() => handleChange(l.code)}
            className={cn(
              'text-sm font-semibold px-2 py-1 rounded',
              language === l.code ? 'text-navy underline underline-offset-4' : 'text-muted hover:text-ink',
            )}
          >
            {l.label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 p-1 bg-cream-100 border border-line rounded-full',
        className,
      )}
    >
      {languages.map((l) => (
        <button
          key={l.code}
          onClick={() => handleChange(l.code)}
          aria-pressed={language === l.code}
          className={cn(
            'px-3 py-1.5 text-xs font-bold rounded-full transition-colors',
            language === l.code
              ? 'bg-navy text-white shadow-sm'
              : 'text-muted hover:text-ink',
          )}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
