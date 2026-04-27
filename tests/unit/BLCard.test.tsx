import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '@/lib/i18n';
import { BLCard } from '@/components/bl/BLCard';
import type { BLWithRelations } from '@/hooks/useBLs';
import type { BL, BLStatus } from '@/types/domain';

// Mock minimal du client Supabase pour éviter tout réseau
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
  },
}));

beforeAll(async () => {
  await i18n.changeLanguage('fr');
});

function makeBL(overrides: Partial<BL> = {}): BLWithRelations {
  const base: BL = {
    id: 'bl-1',
    numero_bl: 'BL-2025-0042',
    commande_id: 'cmd-1',
    client_id: 'cli-1',
    vendeur_id: null,
    livreur_id: 'liv-1',
    statut: 'assigne',
    mode_livraison: 'domicile',
    creneau: 'matin',
    date_livraison_prevue: '2025-04-27',
    date_livraison_effective: null,
    montant_total_ttc: 1250,
    montant_frais_relivraison: 0,
    nb_tentatives: 0,
    admin_waiver: false,
    attempt_log: [],
    assignment_log: [],
    release_requested_at: null,
    release_validated_at: null,
    release_validated_by: null,
    release_rejected_motif: null,
    photo_depart_url: null,
    vendeur_present_depart: false,
    photo_litige_url: null,
    pdf_url: null,
    date_creation: '2025-04-27T00:00:00Z',
    date_signature: null,
    created_at: '2025-04-27T00:00:00Z',
    updated_at: '2025-04-27T00:00:00Z',
  };
  return {
    ...base,
    ...overrides,
    client: {
      id: 'cli-1',
      nom: 'Dupont',
      prenom: 'Jean',
      telephone: '+33612345678',
      adresse_ligne1: '12 rue de la Paix',
      adresse_ligne2: null,
      code_postal: '31000',
      ville: 'Toulouse',
      latitude: null,
      longitude: null,
      etage: null,
      ascenseur: null,
      code_porte: null,
      commentaire_acces: null,
    },
    lignes_count: 3,
  };
}

function renderBLCard(bl: BLWithRelations, props: { showRequestRelease?: boolean } = {}) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <BLCard bl={bl} {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('BLCard', () => {
  it('affiche le numéro de BL', () => {
    renderBLCard(makeBL());
    expect(screen.getByText('BL-2025-0042')).toBeInTheDocument();
  });

  it('affiche le nom complet du client', () => {
    renderBLCard(makeBL());
    expect(screen.getByText('Jean Dupont')).toBeInTheDocument();
  });

  it("affiche l'adresse formatée", () => {
    renderBLCard(makeBL());
    expect(screen.getByText('12 rue de la Paix, 31000 Toulouse')).toBeInTheDocument();
  });

  it('affiche le nombre d\'articles', () => {
    renderBLCard(makeBL({}));
    // "3 articles" en français (plural CLDR)
    expect(screen.getByText(/3\s*articles/)).toBeInTheDocument();
  });

  it('affiche le montant en EUR', () => {
    renderBLCard(makeBL());
    // Intl peut produire "1 250 €" avec espace insécable. On teste en regex laxiste.
    const text = screen.getByText(/1\s*250.*€/);
    expect(text).toBeInTheDocument();
  });

  it('affiche le bouton "Je suis dispo" si statut=assigne', () => {
    renderBLCard(makeBL({ statut: 'assigne' }));
    expect(screen.getByRole('button', { name: /Je suis dispo/i })).toBeInTheDocument();
  });

  it('n\'affiche PAS le bouton "Je suis dispo" si statut=en_route', () => {
    renderBLCard(makeBL({ statut: 'en_route' }));
    expect(screen.queryByRole('button', { name: /Je suis dispo/i })).not.toBeInTheDocument();
  });

  it('affiche "Demande envoyée" si statut=release_demandee', () => {
    renderBLCard(makeBL({ statut: 'release_demandee' }));
    expect(screen.getAllByText(/Demande envoyée/i).length).toBeGreaterThan(0);
  });

  it('respecte showRequestRelease=false (page calendrier)', () => {
    renderBLCard(makeBL({ statut: 'assigne' }), { showRequestRelease: false });
    expect(screen.queryByRole('button', { name: /Je suis dispo/i })).not.toBeInTheDocument();
  });

  it('utilise un fallback si client est null', () => {
    const bl = makeBL();
    bl.client = null;
    renderBLCard(bl);
    expect(screen.getByText('Adresse non renseignée')).toBeInTheDocument();
  });

  it('génère un lien vers /bl/:id', () => {
    renderBLCard(makeBL());
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/bl/bl-1');
  });

  it.each<BLStatus>(['livre', 'signe', 'echec_T1', 'bloque'])(
    'rend sans crash pour le statut "%s"',
    (statut) => {
      renderBLCard(makeBL({ statut }));
      expect(screen.getByText('BL-2025-0042')).toBeInTheDocument();
    },
  );
});
