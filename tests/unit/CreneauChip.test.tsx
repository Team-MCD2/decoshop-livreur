import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import i18n from '@/lib/i18n';
import { CreneauChip } from '@/components/bl/CreneauChip';

beforeAll(async () => {
  await i18n.changeLanguage('fr');
});

describe('CreneauChip', () => {
  it('affiche "Matin" pour creneau="matin"', () => {
    render(<CreneauChip creneau="matin" />);
    expect(screen.getByText('Matin')).toBeInTheDocument();
  });

  it('affiche "Après-midi" pour creneau="apres_midi"', () => {
    render(<CreneauChip creneau="apres_midi" />);
    expect(screen.getByText('Après-midi')).toBeInTheDocument();
  });

  it('affiche "Soir" pour creneau="soir"', () => {
    render(<CreneauChip creneau="soir" />);
    expect(screen.getByText('Soir')).toBeInTheDocument();
  });

  it('affiche "—" si creneau=null', () => {
    render(<CreneauChip creneau={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('affiche les horaires si showHours=true', () => {
    render(<CreneauChip creneau="matin" showHours />);
    expect(screen.getByText(/9h-12h/)).toBeInTheDocument();
  });

  it("n'affiche pas les horaires si showHours=false (défaut)", () => {
    render(<CreneauChip creneau="matin" />);
    expect(screen.queryByText(/9h-12h/)).not.toBeInTheDocument();
  });

  it('change le label en arabe', async () => {
    await i18n.changeLanguage('ar');
    render(<CreneauChip creneau="matin" />);
    expect(screen.getByText('صباحًا')).toBeInTheDocument();
    await i18n.changeLanguage('fr');
  });
});
