import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { AttemptFailureReason, BLStatus } from '@/types/domain';

/**
 * Résultat de la RPC `livreur.record_failed_attempt`.
 *
 * Le DB applique automatiquement la palier (T1/T2/abandon), met à jour
 * `nb_tentatives`, gère le `admin_waiver` pour les motifs de force majeure
 * (météo, panne véhicule, articles endommagés, colis perdu) et écrit dans
 * `bl_attempt_log` + `bl_status_history` + envoie une notif vendeur.
 *
 * Voir : sql/010_livreur_workflow_rpcs.sql §3
 */
export interface FailureResult {
  success: boolean;
  bl_id: string;
  previous_status: BLStatus;
  new_status: BLStatus;
  attempt_number: 1 | 2 | 3;
  attempt_log_id: string;
  /**
   * `true` si le motif déclenche l'exonération de frais
   * (meteo, panne_vehicule, articles_endommages, colis_perdu).
   * Quand `true`, `montant_frais_relivraison` est forcé à 0
   * via le trigger `trg_frais_relivraison`.
   */
  force_majeure: boolean;
  recorded_at: string;
}

export interface RecordFailureArgs {
  blId: string;
  motif: AttemptFailureReason;
  commentaire?: string | null;
  /** Photo optionnelle (sera uploadée vers `delivery-photos` avant l'appel RPC). */
  photo?: File | null;
  /** Position GPS optionnelle (capturée au moment du clic, pas en continu). */
  latitude?: number | null;
  longitude?: number | null;
}

/**
 * Liste ordonnée des motifs d'échec pour le picker UI.
 * L'ordre reflète la fréquence attendue (du plus courant au plus rare).
 * `force_majeure: true` indique que le motif déclenche l'exonération de frais.
 */
export const FAILURE_REASONS: ReadonlyArray<{
  value: AttemptFailureReason;
  force_majeure: boolean;
}> = [
  { value: 'client_absent',         force_majeure: false },
  { value: 'adresse_introuvable',   force_majeure: false },
  { value: 'client_refuse',         force_majeure: false },
  { value: 'articles_endommages',   force_majeure: true  },
  { value: 'colis_perdu',           force_majeure: true  },
  { value: 'meteo',                 force_majeure: true  },
  { value: 'panne_vehicule',        force_majeure: true  },
  { value: 'autre',                 force_majeure: false },
] as const;

/**
 * Upload best-effort d'une photo de litige vers le bucket `delivery-photos`.
 *
 * Convention de chemin imposée par `sql/007_livreur_storage.sql` :
 *   `<bl_id>/litige-<timestamp>.<ext>`
 *
 * En cas d'erreur (RLS, quota, format), retourne `null` au lieu de throw,
 * pour que le report d'échec puisse quand même se soumettre sans photo.
 * Le livreur peut toujours fournir un commentaire à la place.
 */
async function uploadLitigePhoto(blId: string, file: File): Promise<string | null> {
  const ts = Date.now();
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  // Sanitize ext (whitelist)
  const safeExt = ['jpg', 'jpeg', 'png', 'webp'].includes(ext) ? ext : 'jpg';
  const path = `${blId}/litige-${ts}.${safeExt}`;
  const contentType = file.type || `image/${safeExt === 'jpg' ? 'jpeg' : safeExt}`;

  // Storage lives in the `storage` schema, addressed via supabase.storage,
  // independent of the default `livreur` schema set on the client.
  const { error } = await supabase.storage
    .from('delivery-photos')
    .upload(path, file, {
      contentType,
      upsert: false,
      cacheControl: '3600',
    });

  if (error) {
    console.warn('[failure] photo upload failed, continuing without photo', error.message);
    return null;
  }

  // Bucket is private — return the storage path, not a public URL.
  // Consumers render it via supabase.storage.from('delivery-photos').createSignedUrl(path, ttl).
  return path;
}

/**
 * Mutation : signale un échec de livraison.
 *
 * Workflow :
 *   1. (si photo) upload best-effort vers `delivery-photos`
 *   2. RPC `livreur.record_failed_attempt` (atomique, transactionnelle)
 *   3. Invalidation des queries `['bl', 'detail', blId]` et `['bls']`
 *
 * Surface d'erreur (mappée par le composant) :
 *   - BL_NOT_FOUND, BL_NOT_ASSIGNED_TO_YOU
 *   - INVALID_BL_STATUS_FOR_FAILURE
 *   - MAX_ATTEMPTS_REACHED
 *   - PROFILE_NOT_FOUND (admin n'a pas approuvé le profil livreur)
 */
export function useRecordFailedAttempt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: RecordFailureArgs): Promise<FailureResult> => {
      const { blId, motif, commentaire, photo, latitude, longitude } = args;

      // 1. Photo (best-effort, doesn't block report submission)
      let photoUrl: string | null = null;
      if (photo) {
        photoUrl = await uploadLitigePhoto(blId, photo);
      }

      // 2. RPC — atomique côté DB (BL.statut + nb_tentatives + log + notif)
      // Voir sql/010_livreur_workflow_rpcs.sql §3. Le typage de supabase.rpc()
      // sera mis à jour après `npx supabase gen types typescript`.
      // @ts-expect-error - record_failed_attempt added in migration 010
      const { data, error } = await supabase.rpc('record_failed_attempt', {
        p_bl_id:            blId,
        p_motif:            motif,
        p_commentaire:      commentaire ?? null,
        p_photo_litige_url: photoUrl,
        p_latitude:         latitude ?? null,
        p_longitude:        longitude ?? null,
      });
      if (error) throw error;
      return data as unknown as FailureResult;
    },
    onSuccess: (_data, { blId }) => {
      void qc.invalidateQueries({ queryKey: ['bl', 'detail', blId] });
      void qc.invalidateQueries({ queryKey: ['bls'] });
    },
  });
}

/**
 * Récupère les transitions de statut autorisées pour l'utilisateur courant
 * depuis un statut donné, via la RPC `livreur.my_allowed_bl_transitions`.
 *
 * Permet à l'UI de désactiver les actions non valides sans rouler son propre
 * mini-state-machine. Si la RPC retourne `[]`, le statut est terminal pour
 * ce rôle (e.g. `signe` pour un livreur).
 */
export function useAllowedTransitions(fromStatus: BLStatus | undefined) {
  return useQuery({
    queryKey: ['workflow', 'allowed-transitions', fromStatus] as const,
    enabled: !!fromStatus,
    queryFn: async (): Promise<BLStatus[]> => {
      // @ts-expect-error - my_allowed_bl_transitions added in migration 010
      const { data, error } = await supabase.rpc('my_allowed_bl_transitions', {
        p_from: fromStatus!,
      });
      if (error) throw error;
      return ((data as unknown as BLStatus[] | null) ?? []);
    },
    // Le state machine est stable par déploiement — pas de revalidation agressive.
    staleTime: 5 * 60_000,
  });
}

/**
 * Mappe un message d'erreur RPC vers une clé i18n stable.
 * Toujours retourne une clé valide pour `t()`.
 */
export function failureErrorKey(e: unknown): string {
  if (typeof e === 'object' && e !== null && 'message' in e) {
    const msg = String((e as { message: string }).message);
    if (msg.includes('BL_NOT_ASSIGNED_TO_YOU')) return 'failure.errors.not_yours';
    if (msg.includes('INVALID_BL_STATUS_FOR_FAILURE')) return 'failure.errors.invalid_status';
    if (msg.includes('MAX_ATTEMPTS_REACHED')) return 'failure.errors.max_reached';
    if (msg.includes('PROFILE_NOT_FOUND')) return 'failure.errors.no_profile';
    if (msg.includes('BL_NOT_FOUND')) return 'failure.errors.not_found';
    if (msg.includes('NOT_AUTHENTICATED')) return 'failure.errors.unauth';
  }
  return 'failure.errors.generic';
}
