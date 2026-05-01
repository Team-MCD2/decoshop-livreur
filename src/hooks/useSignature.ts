import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { CreneauType, DeliveryMode, SignatureStatus } from '@/types/domain';

export type EmailDeliveryStatus = 'sent' | 'failed' | 'skipped' | 'not_configured';

export interface SignatureRequestResult {
  token: string;
  bl_id: string;
  url_path: string;
  date_emission: string;
  date_expiration: string;
  ttl_minutes: number;
  email_client: string | null;
  /** Statut de l'envoi de l'email via Edge Function (best-effort). */
  email_status: EmailDeliveryStatus;
  /** Message d'erreur Resend / Edge Function si email_status='failed'. */
  email_error: string | null;
  /** ID Resend du message envoyé (utile pour debug / tracking). */
  email_message_id: string | null;
}

export interface SignatureSubmitResult {
  success: boolean;
  bl_id: string;
  numero_bl: string;
  signed_at: string;
}

export interface SignaturePublicInfo {
  status: SignatureStatus;
  is_expired: boolean;
  is_signed: boolean;
  date_emission: string;
  date_expiration: string;
  date_signature: string | null;
  numero_bl: string;
  montant_total_ttc: number;
  mode_livraison: DeliveryMode;
  creneau: CreneauType | null;
  date_livraison_prevue: string | null;
  client_nom: string;
  client_prenom: string | null;
  client_ville: string | null;
  articles_count: number;
}

export interface SignatureInvalidateResult {
  success: boolean;
  bl_id: string;
  motif: string | null;
  invalidated_at: string;
  invalidated_by: string;
}

/**
 * Feature flag : envoi d'email via Edge Function `send-signature-email`.
 *
 * Désactivé par défaut depuis la consolidation 2026-04-30 (Edge Function
 * pas redéployée sur le projet `decoshop`, Resend non configuré).
 *
 * Pour réactiver :
 *   1. Déployer la fonction : `supabase functions deploy send-signature-email`
 *      sur le projet `dzjebcipoqgjvxxmlcry`.
 *   2. Configurer le secret Resend : `supabase secrets set RESEND_API_KEY=re_...`
 *   3. Mettre `VITE_ENABLE_SIGNATURE_EMAIL=true` dans .env.local et redémarrer Vite.
 *
 * Tant que désactivé, le token est généré normalement par le RPC : le livreur
 * peut copier-coller le lien `/sign/:token` et l'envoyer manuellement (SMS,
 * WhatsApp, etc.).
 */
const ENABLE_SIGNATURE_EMAIL =
  import.meta.env.VITE_ENABLE_SIGNATURE_EMAIL === 'true';

/**
 * Demande de signature électronique pour un BL livré.
 *
 * Étapes :
 *   1. RPC `request_signature` → génère token + passe BL en `signature_attendue`
 *   2. Edge Function `send-signature-email` (best-effort, si flag activé) →
 *      envoie l'email via Resend. Si l'envoi échoue OU si la feature est
 *      désactivée, on retourne quand même le token : le livreur peut
 *      partager le lien manuellement.
 *
 * Paramètres :
 *   - blId : UUID du BL
 *   - ttlMinutes : durée de validité du token (1–60, défaut 10)
 *   - language : langue de l'email envoyé (défaut 'fr')
 *   - sendEmail : false pour skip l'envoi automatique (test / debug)
 */
export function useRequestSignature() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      blId,
      ttlMinutes = 10,
      language = 'fr',
      sendEmail = true,
    }: {
      blId: string;
      ttlMinutes?: number;
      language?: 'fr' | 'ar';
      sendEmail?: boolean;
    }): Promise<SignatureRequestResult> => {
      // 1) RPC : génère token, transitionne BL
      const { data: rpcData, error: rpcErr } = await supabase.rpc(
        'request_signature',
        { p_bl_id: blId, p_ttl_minutes: ttlMinutes },
      );
      if (rpcErr) throw rpcErr;
      const rpc = rpcData as Omit<
        SignatureRequestResult,
        'email_status' | 'email_error' | 'email_message_id'
      >;

      // 2) Court-circuit si la feature email est désactivée globalement OU
      //    si l'appelant a explicitement passé `sendEmail: false`.
      if (!ENABLE_SIGNATURE_EMAIL || !sendEmail) {
        return {
          ...rpc,
          email_status: ENABLE_SIGNATURE_EMAIL ? 'skipped' : 'not_configured',
          email_error: null,
          email_message_id: null,
        };
      }

      // 3) Edge Function : envoi best-effort
      const { data: fnData, error: fnErr } = await supabase.functions.invoke<{
        success: boolean;
        recipient?: string;
        message_id?: string | null;
        error?: string;
      }>('send-signature-email', {
        body: { token: rpc.token, language },
      });

      if (fnErr || !fnData?.success) {
        // Edge Function en erreur : pas une erreur fatale (le token est valide)
        const code = fnData?.error ?? fnErr?.message ?? 'EMAIL_SEND_FAILED';
        return {
          ...rpc,
          email_status:
            code === 'RESEND_NOT_CONFIGURED' ? 'not_configured' : 'failed',
          email_error: code,
          email_message_id: null,
        };
      }

      return {
        ...rpc,
        email_status: 'sent',
        email_error: null,
        email_message_id: fnData.message_id ?? null,
      };
    },
    onSuccess: (_data, { blId }) => {
      void qc.invalidateQueries({ queryKey: ['bl', 'detail', blId] });
      void qc.invalidateQueries({ queryKey: ['bls'] });
    },
  });
}

/**
 * Soumission de signature côté CLIENT (page publique /sign/:token).
 * Anonyme — utilise SECURITY DEFINER côté DB.
 */
export function useSubmitSignature() {
  return useMutation({
    mutationFn: async ({
      token,
      signatureData,
      signeParParent = false,
      parentNom = null,
      parentLien = null,
    }: {
      token: string;
      signatureData: string;
      signeParParent?: boolean;
      parentNom?: string | null;
      parentLien?: string | null;
    }): Promise<SignatureSubmitResult> => {
      const { data, error } = await supabase.rpc('submit_signature', {
        p_token: token,
        p_signature_data: signatureData,
        p_signe_par_parent: signeParParent,
        p_parent_nom: parentNom,
        p_parent_lien: parentLien,
        p_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      });
      if (error) throw error;
      return data as SignatureSubmitResult;
    },
  });
}

/**
 * Récupère les infos publiques d'une signature (côté page /sign/:token).
 * Retourne uniquement les champs non sensibles.
 */
export function useSignaturePublic(token: string | undefined) {
  return useQuery({
    queryKey: ['signature', 'public', token] as const,
    enabled: !!token,
    queryFn: async (): Promise<SignaturePublicInfo> => {
      const { data, error } = await supabase.rpc('get_signature_public', {
        p_token: token!,
      });
      if (error) throw error;
      return data as SignaturePublicInfo;
    },
    // Refresh toutes les 30s pour détecter expiration
    refetchInterval: 30_000,
    staleTime: 5_000,
  });
}

/**
 * Annulation administrative d'une signature en attente (RG-236).
 * Réservé aux rôles admin / vendeur — l'erreur FORBIDDEN remonte sinon.
 * Repasse le BL en statut `livre` pour autoriser un nouveau request_signature().
 */
export function useInvalidateSignature() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      blId,
      motif = null,
    }: {
      blId: string;
      motif?: string | null;
    }): Promise<SignatureInvalidateResult> => {
      const { data, error } = await supabase.rpc('invalidate_signature', {
        p_bl_id: blId,
        p_motif: motif,
      });
      if (error) throw error;
      return data as SignatureInvalidateResult;
    },
    onSuccess: (_data, { blId }) => {
      void qc.invalidateQueries({ queryKey: ['bl', 'detail', blId] });
      void qc.invalidateQueries({ queryKey: ['bls'] });
    },
  });
}

/**
 * Hook helper : retourne les secondes restantes avant expiration.
 * Refresh chaque seconde via setInterval.
 */
export function useExpirationCountdown(expiresAt: string | null | undefined) {
  // Pas dans queryClient — c'est purement client-side timer.
  // L'usage prévu : ce hook est appelé dans un composant qui re-render via setInterval.
  // Pour rester simple, on retourne une fonction de calcul + on déclenche un re-render
  // depuis le composant via useState/useEffect.
  if (!expiresAt) return null;
  const now = Date.now();
  const expMs = new Date(expiresAt).getTime();
  return Math.max(0, Math.floor((expMs - now) / 1000));
}
