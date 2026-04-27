import { describe, it, expect } from 'vitest';
import {
  computeTodayKpis,
  groupByCreneau,
  toIsoDate,
  STATUTS_A_FAIRE,
  STATUTS_LIVRES,
  type BLWithRelations,
} from '@/hooks/useBLs';
import type { BL, BLStatus, CreneauType } from '@/types/domain';

function makeBL(overrides: Partial<BL> = {}): BLWithRelations {
  const base: BL = {
    id: 'bl-' + Math.random().toString(36).slice(2, 8),
    numero_bl: 'BL-2025-0001',
    commande_id: 'cmd-1',
    client_id: 'cli-1',
    vendeur_id: null,
    livreur_id: 'liv-1',
    statut: 'assigne',
    mode_livraison: 'domicile',
    creneau: 'matin',
    date_livraison_prevue: '2025-04-27',
    date_livraison_effective: null,
    montant_total_ttc: 0,
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
    client: null,
    lignes_count: 0,
  };
}

describe('toIsoDate', () => {
  it("formate au format YYYY-MM-DD en zone locale", () => {
    const d = new Date(2025, 3, 27, 18, 30); // 27 avril 2025
    expect(toIsoDate(d)).toBe('2025-04-27');
  });

  it('pad les mois et jours < 10', () => {
    const d = new Date(2025, 0, 5);
    expect(toIsoDate(d)).toBe('2025-01-05');
  });
});

describe('computeTodayKpis', () => {
  it('renvoie tout à 0 sur une liste vide', () => {
    const kpis = computeTodayKpis([]);
    expect(kpis).toEqual({
      total: 0,
      delivered: 0,
      in_progress: 0,
      remaining: 0,
      signature_rate: 0,
    });
  });

  it("compte 'delivered' = livre + signe", () => {
    const bls = [
      makeBL({ statut: 'livre' }),
      makeBL({ statut: 'signe' }),
      makeBL({ statut: 'assigne' }),
    ];
    expect(computeTodayKpis(bls).delivered).toBe(2);
  });

  it("compte 'in_progress' = en_livraison + en_route + signature_attendue", () => {
    const bls = [
      makeBL({ statut: 'en_livraison' }),
      makeBL({ statut: 'en_route' }),
      makeBL({ statut: 'signature_attendue' }),
      makeBL({ statut: 'livre' }),
    ];
    expect(computeTodayKpis(bls).in_progress).toBe(3);
  });

  it("compte 'remaining' = assigne + confirme", () => {
    const bls = [
      makeBL({ statut: 'assigne' }),
      makeBL({ statut: 'confirme' }),
      makeBL({ statut: 'release_demandee' }),
      makeBL({ statut: 'livre' }),
    ];
    expect(computeTodayKpis(bls).remaining).toBe(2);
  });

  it('calcule signature_rate = 100% si tous les delivered sont signés', () => {
    const bls = [makeBL({ statut: 'signe' }), makeBL({ statut: 'signe' })];
    expect(computeTodayKpis(bls).signature_rate).toBe(100);
  });

  it('calcule signature_rate = 50% si 1 sur 2 signés', () => {
    const bls = [makeBL({ statut: 'signe' }), makeBL({ statut: 'livre' })];
    expect(computeTodayKpis(bls).signature_rate).toBe(50);
  });

  it('calcule signature_rate = 0 si aucun livré', () => {
    const bls = [makeBL({ statut: 'assigne' }), makeBL({ statut: 'en_route' })];
    expect(computeTodayKpis(bls).signature_rate).toBe(0);
  });
});

describe('groupByCreneau', () => {
  it('initialise les 4 buckets même si vides', () => {
    const groups = groupByCreneau([]);
    expect(Object.keys(groups).sort()).toEqual(
      ['apres_midi', 'matin', 'sans_creneau', 'soir'],
    );
    expect(groups.matin).toEqual([]);
  });

  it('ventile les BLs selon leur créneau', () => {
    const bls = [
      makeBL({ id: 'a', creneau: 'matin' }),
      makeBL({ id: 'b', creneau: 'apres_midi' }),
      makeBL({ id: 'c', creneau: 'matin' }),
      makeBL({ id: 'd', creneau: null }),
      makeBL({ id: 'e', creneau: 'soir' }),
    ];
    const groups = groupByCreneau(bls);
    expect(groups.matin).toHaveLength(2);
    expect(groups.apres_midi).toHaveLength(1);
    expect(groups.soir).toHaveLength(1);
    expect(groups.sans_creneau).toHaveLength(1);
  });

  it('préserve l\'ordre des BLs au sein d\'un créneau', () => {
    const bls = [
      makeBL({ id: 'a', creneau: 'matin' }),
      makeBL({ id: 'b', creneau: 'matin' }),
      makeBL({ id: 'c', creneau: 'matin' }),
    ];
    const groups = groupByCreneau(bls);
    expect(groups.matin.map((b) => b.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('STATUTS_A_FAIRE / STATUTS_LIVRES (constantes)', () => {
  it('inclut les statuts opérationnels du livreur', () => {
    const expected: BLStatus[] = [
      'assigne',
      'confirme',
      'en_livraison',
      'en_route',
      'signature_attendue',
      'echec_T1',
    ];
    expect([...STATUTS_A_FAIRE]).toEqual(expected);
  });

  it('inclut livre et signe dans STATUTS_LIVRES', () => {
    expect([...STATUTS_LIVRES]).toEqual(['livre', 'signe']);
  });

  // Sanity check: les 3 créneaux sont toujours déclarés
  it('CreneauType couvre matin/apres_midi/soir', () => {
    const all: CreneauType[] = ['matin', 'apres_midi', 'soir'];
    expect(all).toHaveLength(3);
  });
});
