import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/lib/i18n';
import { BLStatusTimeline } from '@/components/bl/BLStatusTimeline';

function renderWithI18n(ui: React.ReactElement) {
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
}

describe('BLStatusTimeline', () => {
  it('affiche les 5 étapes pour un statut standard', () => {
    renderWithI18n(<BLStatusTimeline status="confirme" />);
    // Match exact (uppercase) car les labels sont en uppercase via CSS,
    // mais le DOM contient le texte original (i18n).
    expect(screen.getByText('Assigné')).toBeInTheDocument();
    expect(screen.getByText('Confirmé')).toBeInTheDocument();
    expect(screen.getByText('En route')).toBeInTheDocument();
    expect(screen.getByText('Livré')).toBeInTheDocument();
    expect(screen.getByText('Signé')).toBeInTheDocument();
  });

  it('marque "Confirmé" comme étape courante pour statut=confirme', () => {
    const { container } = renderWithI18n(<BLStatusTimeline status="confirme" />);
    // L'étape current a la classe ring-4
    const current = container.querySelector('.ring-4');
    expect(current).toBeInTheDocument();
  });

  it('renvoie null pour un statut d\'échec (echec_T2)', () => {
    const { container } = renderWithI18n(<BLStatusTimeline status="echec_T2" />);
    expect(container.firstChild).toBeNull();
  });

  it('renvoie null pour signature_expiree', () => {
    const { container } = renderWithI18n(<BLStatusTimeline status="signature_expiree" />);
    expect(container.firstChild).toBeNull();
  });

  it('affiche un role list pour l\'a11y', () => {
    renderWithI18n(<BLStatusTimeline status="en_route" />);
    expect(screen.getByRole('list')).toBeInTheDocument();
  });
});
