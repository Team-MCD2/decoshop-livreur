import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/lib/i18n';
import { ContactBar } from '@/components/bl/ContactBar';

function renderWithI18n(ui: React.ReactElement) {
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
}

describe('ContactBar', () => {
  it('génère un href tel: avec téléphone normalisé', () => {
    renderWithI18n(<ContactBar phone="06 12 34 56 78" lat={43.6} lng={1.44} />);
    const callLink = screen.getByLabelText(/appeler/i);
    expect(callLink).toHaveAttribute('href', 'tel:0612345678');
  });

  it('génère un href sms: avec téléphone normalisé', () => {
    renderWithI18n(<ContactBar phone="06.12.34.56.78" lat={null} lng={null} />);
    const smsLink = screen.getByLabelText(/^SMS$/i);
    expect(smsLink).toHaveAttribute('href', 'sms:0612345678');
  });

  it('désactive les boutons tel/sms si pas de téléphone', () => {
    renderWithI18n(<ContactBar phone={null} lat={43.6} lng={1.44} />);
    const callLink = screen.getByLabelText(/appeler/i);
    expect(callLink).toHaveAttribute('aria-disabled', 'true');
    expect(callLink).not.toHaveAttribute('href');
  });

  it('génère URL Google Maps avec lat/lng en priorité', () => {
    renderWithI18n(<ContactBar phone="0612345678" lat={43.6047} lng={1.4442} addressLine="Rue de la Pomme" />);
    const dirLink = screen.getByLabelText(/itinéraire/i);
    expect(dirLink.getAttribute('href')).toContain('destination=43.6047,1.4442');
    expect(dirLink.getAttribute('href')).toContain('travelmode=driving');
  });

  it('fallback : URL Maps avec adresse texte si pas de lat/lng', () => {
    renderWithI18n(
      <ContactBar phone={null} lat={null} lng={null} addressLine="12 Rue de la Pomme, Toulouse" />,
    );
    const dirLink = screen.getByLabelText(/itinéraire/i);
    expect(dirLink.getAttribute('href')).toContain(
      'destination=12%20Rue%20de%20la%20Pomme%2C%20Toulouse',
    );
  });

  it('désactive Itinéraire si ni coords ni adresse', () => {
    renderWithI18n(<ContactBar phone="0612345678" lat={null} lng={null} addressLine={null} />);
    const dirLink = screen.getByLabelText(/itinéraire/i);
    expect(dirLink).toHaveAttribute('aria-disabled', 'true');
  });

  it('téléphone court (< 6 chars) traité comme invalide', () => {
    renderWithI18n(<ContactBar phone="123" lat={null} lng={null} />);
    const callLink = screen.getByLabelText(/appeler/i);
    expect(callLink).toHaveAttribute('aria-disabled', 'true');
  });
});
