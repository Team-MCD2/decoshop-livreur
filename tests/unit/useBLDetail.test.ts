import { describe, it, expect } from 'vitest';
import { nextWorkflowStatus, ACTIONABLE_STATUSES } from '@/hooks/useBLDetail';
import type { BLStatus } from '@/types/domain';

describe('nextWorkflowStatus', () => {
  it('assigne -> en_livraison', () => {
    expect(nextWorkflowStatus('assigne')).toBe('en_livraison');
  });

  it('confirme -> en_livraison', () => {
    expect(nextWorkflowStatus('confirme')).toBe('en_livraison');
  });

  it('en_livraison -> en_route', () => {
    expect(nextWorkflowStatus('en_livraison')).toBe('en_route');
  });

  it('en_route -> livre', () => {
    expect(nextWorkflowStatus('en_route')).toBe('livre');
  });

  it('livre -> signature_attendue', () => {
    expect(nextWorkflowStatus('livre')).toBe('signature_attendue');
  });

  it('signe -> null (terminal)', () => {
    expect(nextWorkflowStatus('signe')).toBeNull();
  });

  it('echec_T2 -> null (terminal)', () => {
    expect(nextWorkflowStatus('echec_T2')).toBeNull();
  });

  it('release_demandee -> null (le vendeur doit valider)', () => {
    expect(nextWorkflowStatus('release_demandee')).toBeNull();
  });

  it('chaque statut renvoie soit null soit un BLStatus valide', () => {
    const statuses: BLStatus[] = [
      'cree',
      'assigne',
      'release_demandee',
      'confirme',
      'en_livraison',
      'en_route',
      'livre',
      'signature_attendue',
      'signe',
      'echec_T1',
      'echec_T2',
      'abandon',
      'bloque',
      'signature_expiree',
    ];
    for (const s of statuses) {
      const next = nextWorkflowStatus(s);
      // soit null soit l'un des BLStatus valides
      if (next !== null) {
        expect(statuses).toContain(next);
      }
    }
  });
});

describe('ACTIONABLE_STATUSES', () => {
  it('contient les statuts permettant une action livreur', () => {
    expect(ACTIONABLE_STATUSES).toContain('assigne');
    expect(ACTIONABLE_STATUSES).toContain('en_route');
    expect(ACTIONABLE_STATUSES).not.toContain('signe');
    expect(ACTIONABLE_STATUSES).not.toContain('echec_T2');
  });
});
