import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { BL, Client, LigneBL, Commande, BLStatus } from '@/types/domain';

/**
 * BL avec toutes les relations nécessaires pour la page Detail.
 */
export interface BLDetail extends BL {
  client: Client | null;
  commande: Pick<Commande, 'id' | 'numero_commande' | 'date_commande' | 'montant_total_ttc'> | null;
  lignes: LigneBL[];
}

const SELECT_DETAIL = `
  *,
  client:clients (*),
  commande:commandes ( id, numero_commande, date_commande, montant_total_ttc ),
  lignes:lignes_bl ( * )
` as const;

/**
 * Récupère un BL avec client/commande/lignes pour la page Detail.
 */
export function useBLDetail(blId: string | undefined) {
  return useQuery({
    queryKey: ['bl', 'detail', blId] as const,
    enabled: !!blId,
    queryFn: async (): Promise<BLDetail> => {
      const { data, error } = await supabase
        .from('bons_livraison')
        .select(SELECT_DETAIL)
        .eq('id', blId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('BL not found');

      // Tri stable des lignes par ordre_tri puis création
      const detail = data as unknown as BLDetail;
      detail.lignes = [...(detail.lignes ?? [])].sort((a, b) => {
        if (a.ordre_tri !== b.ordre_tri) return a.ordre_tri - b.ordre_tri;
        return a.created_at.localeCompare(b.created_at);
      });
      return detail;
    },
    staleTime: 15_000,
  });
}

/**
 * Mutation : transition de statut côté livreur.
 *
 * Transitions autorisées (côté front, plus la RLS côté DB) :
 *   confirme        → en_livraison
 *   en_livraison    → en_route
 *   en_route        → livre
 *   livre           → signature_attendue   (déclenchement signature)
 */
export function useUpdateBLStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ blId, statut }: { blId: string; statut: BLStatus }) => {
      // `as const` empêche le widening de la valeur littérale (cf. useRequestRelease).
      const payload = {
        statut,
        // Si livraison effective → enregistrer date_livraison_effective
        ...(statut === 'livre' || statut === 'signe'
          ? { date_livraison_effective: new Date().toISOString() }
          : {}),
      };
      const { error } = await supabase
        .from('bons_livraison')
        .update(payload)
        .eq('id', blId);
      if (error) throw error;
    },
    onSuccess: (_data, { blId }) => {
      void qc.invalidateQueries({ queryKey: ['bl', 'detail', blId] });
      void qc.invalidateQueries({ queryKey: ['bls'] });
    },
  });
}

/**
 * Statuts pour lesquels une action workflow livreur est disponible.
 */
export const ACTIONABLE_STATUSES: BLStatus[] = [
  'assigne',
  'confirme',
  'en_livraison',
  'en_route',
  'signature_attendue',
];

/**
 * Détermine la prochaine action disponible pour un statut donné.
 * Renvoie `null` si aucune action automatique.
 */
export function nextWorkflowStatus(current: BLStatus): BLStatus | null {
  switch (current) {
    case 'assigne':
    case 'confirme':
      return 'en_livraison';
    case 'en_livraison':
      return 'en_route';
    case 'en_route':
      return 'livre';
    case 'livre':
      return 'signature_attendue';
    default:
      return null;
  }
}
