import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { BL, Client, LigneBL, Commande, BLStatus } from '@/types/domain';
import { enqueue as enqueueMutation } from '@/lib/offline-queue';
import { useInvalidateQueueCount } from '@/hooks/useOfflineQueue';

/** Champs minimaux de la signature pour l'UI BLDetail (sans dévoiler signature_data côté client). */
export interface BLSignatureSummary {
  id: string;
  token: string;
  statut: 'en_attente' | 'signe' | 'expire';
  date_emission: string;
  date_expiration: string;
  date_signature: string | null;
  retry_count: number;
}

/**
 * BL avec toutes les relations nécessaires pour la page Detail.
 */
export interface BLDetail extends BL {
  client: Client | null;
  commande: Pick<Commande, 'id' | 'numero_commande' | 'date_commande' | 'montant_total_ttc'> | null;
  lignes: LigneBL[];
  signature: BLSignatureSummary | null;
}

const SELECT_DETAIL = `
  *,
  client:clients (*),
  commande:commandes ( id, numero_commande, date_commande, montant_total_ttc ),
  lignes:lignes_bl ( * ),
  signature:signatures_electroniques (
    id, token, statut, date_emission, date_expiration, date_signature, retry_count
  )
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
 * Depuis la migration 010 (2026-05-13), cette mutation appelle la RPC
 * authoritative `livreur.transition_bl_status` qui :
 *   • Valide la transition contre la state-machine (003 + 010 §1)
 *   • Pose `date_livraison_effective` et `date_signature` au besoin
 *   • Enrichit la ligne `bl_status_history` avec un `metadata.rpc` tag
 *
 * Transitions livreur autorisées (subset, voir RPC pour la liste complète) :
 *   confirme        → en_livraison
 *   en_livraison    → en_route
 *   en_route        → livre
 *   livre           → signature_attendue (déclenchement signature)
 *   signature_attendue → signe (canvas direct livreur)
 *
 * Pour signaler un échec (echec_T1 / T2 / abandon), NE PAS utiliser ce
 * hook — utiliser `useRecordFailedAttempt()` qui capture motif/photo/GPS
 * en une transaction.
 */
export interface TransitionResult {
  success: boolean;
  bl_id: string;
  previous_status: BLStatus;
  new_status: BLStatus;
  history_id: string | null;
  changed_at: string;
  no_op?: boolean;
  /**
   * `true` when the mutation was enqueued offline instead of executed
   * against the server. The UI should surface a "Sera envoyé à la
   * reconnexion" hint in this case ; the optimistic cache patch is
   * already in place.
   */
  queued?: boolean;
}

export interface UpdateBLStatusArgs {
  blId: string;
  statut: BLStatus;
  /** Métadonnées libres attachées à la ligne d'historique (e.g. note livreur). */
  metadata?: Record<string, unknown>;
}

interface OptimisticContext {
  previousDetail: BLDetail | undefined;
  previousStatus: BLStatus | undefined;
}

export function useUpdateBLStatus() {
  const qc = useQueryClient();
  const invalidateQueueCount = useInvalidateQueueCount();

  return useMutation<TransitionResult, Error, UpdateBLStatusArgs, OptimisticContext>({
    mutationFn: async ({ blId, statut, metadata }) => {
      // Phase 6 — offline path : if the browser believes it's offline,
      // enqueue the mutation in IndexedDB and return a synthetic result.
      // The optimistic cache patch in `onMutate` keeps the UI in sync ;
      // the queue replay (see `useOfflineReplay`) flushes on reconnect.
      const offline =
        typeof navigator !== 'undefined' && navigator.onLine === false;

      if (offline) {
        const previous = qc.getQueryData<BLDetail>(['bl', 'detail', blId]);
        await enqueueMutation({
          rpcName: 'transition_bl_status',
          blId,
          args: {
            p_bl_id:     blId,
            p_to_status: statut,
            p_metadata:  metadata ?? {},
          },
        });
        invalidateQueueCount();
        return {
          success: true,
          bl_id: blId,
          previous_status: previous?.statut ?? statut,
          new_status: statut,
          history_id: null,
          changed_at: new Date().toISOString(),
          queued: true,
        } satisfies TransitionResult;
      }

      // Online path — call the authoritative RPC.
      // RPC livreur.transition_bl_status — voir sql/010_livreur_workflow_rpcs.sql §2.
      // Le typage strict de `supabase.rpc()` est généré depuis le schéma live
      // par `npx supabase gen types typescript`. Tant que 010 n'a pas été
      // appliquée + types régénérés, on suppress. Le ts-expect-error deviendra
      // une erreur de build une fois les types à jour → force le nettoyage.
      // @ts-expect-error - transition_bl_status added in migration 010
      const { data, error } = await supabase.rpc('transition_bl_status', {
        p_bl_id:     blId,
        p_to_status: statut,
        p_metadata:  metadata ?? {},
      });
      if (error) throw error;
      return data as unknown as TransitionResult;
    },

    /**
     * Optimistic update — patch the BL-detail cache immediately so the UI
     * reflects the new status without waiting for the round-trip. Snapshot
     * the previous state so `onError` can roll back.
     */
    onMutate: async ({ blId, statut }) => {
      await qc.cancelQueries({ queryKey: ['bl', 'detail', blId] });
      const previousDetail = qc.getQueryData<BLDetail>(['bl', 'detail', blId]);
      if (previousDetail) {
        qc.setQueryData<BLDetail>(['bl', 'detail', blId], {
          ...previousDetail,
          statut,
        });
      }
      return {
        previousDetail,
        previousStatus: previousDetail?.statut,
      };
    },

    /** Roll back to the snapshot if the mutation throws. */
    onError: (_err, { blId }, context) => {
      if (context?.previousDetail) {
        qc.setQueryData(['bl', 'detail', blId], context.previousDetail);
      }
    },

    /**
     * Refetch on settled — refreshes the authoritative server view.
     * If offline, the refetch will silently fail and the optimistic patch
     * remains in place until the queue is drained.
     */
    onSettled: (_data, _err, { blId }) => {
      void qc.invalidateQueries({ queryKey: ['bl', 'detail', blId] });
      void qc.invalidateQueries({ queryKey: ['bls'] });
    },
  });
}

/**
 * Mappe une erreur de `transition_bl_status` vers une clé i18n stable.
 */
export function transitionErrorKey(e: unknown): string {
  if (typeof e === 'object' && e !== null && 'message' in e) {
    const msg = String((e as { message: string }).message);
    if (msg.includes('BL_NOT_ASSIGNED_TO_YOU')) return 'workflow.errors.not_yours';
    if (msg.includes('INVALID_TRANSITION')) return 'workflow.errors.invalid_transition';
    if (msg.includes('PROFILE_NOT_FOUND')) return 'workflow.errors.no_profile';
    if (msg.includes('BL_NOT_FOUND')) return 'workflow.errors.not_found';
    if (msg.includes('NOT_AUTHENTICATED')) return 'workflow.errors.unauth';
  }
  return 'workflow.errors.generic';
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
