import { describe, it, expect, beforeEach } from 'vitest';
import i18n from '@/lib/i18n';

describe('i18n', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
  });

  it('charge les traductions FR par défaut', () => {
    expect(i18n.t('auth.login.title')).toBe('Connexion livreur');
  });

  it('peut basculer vers AR', async () => {
    await i18n.changeLanguage('ar');
    expect(i18n.t('auth.login.title')).toBe('تسجيل دخول الموصّل');
  });

  it('a la même structure de clés en FR et AR (no missing keys)', () => {
    const flatKeys = (obj: Record<string, unknown>, prefix = ''): string[] =>
      Object.entries(obj).flatMap(([k, v]) => {
        const path = prefix ? `${prefix}.${k}` : k;
        return v && typeof v === 'object' && !Array.isArray(v)
          ? flatKeys(v as Record<string, unknown>, path)
          : [path];
      });

    const fr = i18n.getResourceBundle('fr', 'translation') as Record<string, unknown>;
    const ar = i18n.getResourceBundle('ar', 'translation') as Record<string, unknown>;

    const frKeys = flatKeys(fr).sort();
    const arKeys = flatKeys(ar).sort();

    expect(arKeys).toEqual(frKeys);
  });

  it('interpole correctement les variables', () => {
    const result = i18n.t('home.today_kpi.delivered', { count: 5 });
    expect(result).toContain('5');
  });
});
