import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/lib/i18n';
import { CountdownPill } from '@/components/bl/CountdownPill';

beforeAll(async () => {
  await i18n.changeLanguage('fr');
});

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false });
  vi.setSystemTime(new Date('2025-04-27T10:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

function renderWith(ui: React.ReactElement) {
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
}

describe('CountdownPill', () => {
  it('affiche le temps restant en mm:ss', () => {
    // 9 min 30 s dans le futur
    const exp = new Date('2025-04-27T10:09:30Z').toISOString();
    renderWith(<CountdownPill expiresAt={exp} />);
    // « Expire dans 9:30 »
    expect(screen.getByText(/9:30/)).toBeInTheDocument();
  });

  it('décrémente chaque seconde', () => {
    const exp = new Date('2025-04-27T10:00:10Z').toISOString();
    renderWith(<CountdownPill expiresAt={exp} />);
    expect(screen.getByText(/0:10/)).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByText(/0:07/)).toBeInTheDocument();
  });

  it('affiche "Lien expiré" si déjà expiré', () => {
    const exp = new Date('2025-04-27T09:59:00Z').toISOString();
    renderWith(<CountdownPill expiresAt={exp} />);
    expect(screen.getByText(/Lien expiré/i)).toBeInTheDocument();
  });

  it('appelle onExpire quand le timer passe à 0', () => {
    const onExpire = vi.fn();
    const exp = new Date('2025-04-27T10:00:02Z').toISOString();
    renderWith(<CountdownPill expiresAt={exp} onExpire={onExpire} />);
    expect(onExpire).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(onExpire).toHaveBeenCalled();
  });

  it('utilise des classes différentes selon urgence (>5min vert, 2-5min jaune, <2min rouge)', () => {
    const expGreen = new Date('2025-04-27T10:08:00Z').toISOString();
    const { container, rerender } = renderWith(<CountdownPill expiresAt={expGreen} />);
    expect(container.querySelector('.bg-green-100')).toBeTruthy();

    const expYellow = new Date('2025-04-27T10:03:00Z').toISOString();
    rerender(
      <I18nextProvider i18n={i18n}>
        <CountdownPill expiresAt={expYellow} />
      </I18nextProvider>,
    );
    expect(container.querySelector('.bg-yellow-200')).toBeTruthy();

    const expRed = new Date('2025-04-27T10:01:00Z').toISOString();
    rerender(
      <I18nextProvider i18n={i18n}>
        <CountdownPill expiresAt={expRed} />
      </I18nextProvider>,
    );
    expect(container.querySelector('.bg-red-100')).toBeTruthy();
  });

  it('a un attribut aria-live=polite pour les lecteurs d\'écran', () => {
    const exp = new Date('2025-04-27T10:05:00Z').toISOString();
    renderWith(<CountdownPill expiresAt={exp} />);
    const pill = screen.getByText(/5:00/).closest('span');
    expect(pill).toHaveAttribute('aria-live', 'polite');
  });
});
