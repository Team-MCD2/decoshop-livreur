import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/**
 * Souscrit aux changements `bons_livraison` filtrés sur `livreur_id`.
 * Sur INSERT/UPDATE/DELETE → invalide les queries `['bls', ...]`.
 *
 * Permet la mise à jour live de la liste/calendrier quand :
 *  - Admin/vendeur réassigne un BL
 *  - Un BL est libéré
 *  - Le statut change (passe en livraison, livré, etc.)
 */
export function useBLsRealtime(livreurId: string | undefined) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!livreurId) return;

    const channel = supabase
      .channel(`livreur-bls-${livreurId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          // Consolidation 2026-04-30 : la table vit dans `livreur.*`, pas `public.*`.
          // Nécessite que la publication realtime de Supabase couvre le schéma livreur
          // (Studio → Database → Replication → cocher livreur.bons_livraison).
          schema: 'livreur',
          table: 'bons_livraison',
          filter: `livreur_id=eq.${livreurId}`,
        },
        () => {
          void qc.invalidateQueries({ queryKey: ['bls'] });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [livreurId, qc]);
}
