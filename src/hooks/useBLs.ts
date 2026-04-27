import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { BL, Client, CreneauType } from '@/types/domain';

/**
 * BL enrichi avec relations (client + nb articles).
 * Sélectionné via l'embedding Supabase pour limiter les round-trips.
 */
export interface BLWithRelations extends BL {
  client: Pick<
    Client,
    | 'id'
    | 'nom'
    | 'prenom'
    | 'telephone'
    | 'adresse_ligne1'
    | 'adresse_ligne2'
    | 'code_postal'
    | 'ville'
    | 'latitude'
    | 'longitude'
    | 'etage'
    | 'ascenseur'
    | 'code_porte'
    | 'commentaire_acces'
  > | null;
  lignes_count: number;
}

/** Statuts considérés comme "à faire" pour un livreur (non finaux). */
export const STATUTS_A_FAIRE = [
  'assigne',
  'confirme',
  'en_livraison',
  'en_route',
  'signature_attendue',
  'echec_T1',
] as const;

/** Statuts finaux positifs (livraison réussie). */
export const STATUTS_LIVRES = ['livre', 'signe'] as const;

/** Format YYYY-MM-DD en TZ locale. */
export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const BL_SELECT = `
  *,
  client:clients (
    id, nom, prenom, telephone,
    adresse_ligne1, adresse_ligne2, code_postal, ville,
    latitude, longitude, etage, ascenseur, code_porte, commentaire_acces
  ),
  lignes:lignes_bl ( count )
` as const;

interface SupabaseBLRow extends BL {
  client: BLWithRelations['client'];
  lignes: { count: number }[] | null;
}

function mapRow(row: SupabaseBLRow): BLWithRelations {
  const { lignes, ...rest } = row;
  return {
    ...rest,
    lignes_count: lignes?.[0]?.count ?? 0,
  };
}

/**
 * BLs assignés au livreur pour une date donnée (par défaut : aujourd'hui).
 */
export function useTodayBLs(livreurId: string | undefined, date?: string) {
  const isoDate = date ?? toIsoDate(new Date());
  return useQuery({
    queryKey: ['bls', 'day', livreurId, isoDate] as const,
    enabled: !!livreurId,
    queryFn: async (): Promise<BLWithRelations[]> => {
      const { data, error } = await supabase
        .from('bons_livraison')
        .select(BL_SELECT)
        .eq('livreur_id', livreurId!)
        .eq('date_livraison_prevue', isoDate)
        .order('creneau', { ascending: true })
        .order('numero_bl', { ascending: true });
      if (error) throw error;
      return (data as SupabaseBLRow[]).map(mapRow);
    },
    staleTime: 30_000,
  });
}

/**
 * BLs à venir sur une plage [from, to] inclus.
 * Utilisé par la page Calendar.
 */
export function useUpcomingBLs(
  livreurId: string | undefined,
  fromDate: Date,
  toDate: Date,
) {
  const from = toIsoDate(fromDate);
  const to = toIsoDate(toDate);
  return useQuery({
    queryKey: ['bls', 'range', livreurId, from, to] as const,
    enabled: !!livreurId,
    queryFn: async (): Promise<BLWithRelations[]> => {
      const { data, error } = await supabase
        .from('bons_livraison')
        .select(BL_SELECT)
        .eq('livreur_id', livreurId!)
        .gte('date_livraison_prevue', from)
        .lte('date_livraison_prevue', to)
        .order('date_livraison_prevue', { ascending: true })
        .order('creneau', { ascending: true });
      if (error) throw error;
      return (data as SupabaseBLRow[]).map(mapRow);
    },
    staleTime: 60_000,
  });
}

/**
 * KPIs jour dérivés des BL du jour.
 * (Pas de RPC dédié pour rester sous le radar Phase 2 — sera optimisable plus tard.)
 */
export interface TodayKpis {
  total: number;
  delivered: number;
  in_progress: number;
  remaining: number;
  signature_rate: number;
}

export function computeTodayKpis(bls: BLWithRelations[]): TodayKpis {
  const total = bls.length;
  const delivered = bls.filter((b) => b.statut === 'livre' || b.statut === 'signe').length;
  const in_progress = bls.filter(
    (b) => b.statut === 'en_livraison' || b.statut === 'en_route' || b.statut === 'signature_attendue',
  ).length;
  const remaining = bls.filter((b) =>
    (['assigne', 'confirme'] as const).includes(b.statut as 'assigne' | 'confirme'),
  ).length;
  const signed = bls.filter((b) => b.statut === 'signe').length;
  const signature_rate = delivered > 0 ? Math.round((signed / delivered) * 100) : 0;
  return { total, delivered, in_progress, remaining, signature_rate };
}

/**
 * Mutation : demande de libération du BL au vendeur.
 * Le livreur signale qu'il est dispo pour cette livraison aujourd'hui.
 */
export function useRequestRelease() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (blId: string) => {
      // `as const` empêche le widening de 'release_demandee' vers `string`,
      // ce qui ferait échouer la contrainte BLStatus.
      const payload = {
        statut: 'release_demandee' as const,
        release_requested_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from('bons_livraison')
        .update(payload)
        .eq('id', blId);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['bls'] });
    },
  });
}

/**
 * Groupe une liste de BLs par créneau (matin/apres_midi/soir + sans créneau).
 * Renvoie toujours les 3 créneaux, même vides, pour un rendu UI cohérent.
 */
export type GroupedByCreneau = Record<CreneauType | 'sans_creneau', BLWithRelations[]>;

export function groupByCreneau(bls: BLWithRelations[]): GroupedByCreneau {
  const groups: GroupedByCreneau = {
    matin: [],
    apres_midi: [],
    soir: [],
    sans_creneau: [],
  };
  for (const bl of bls) {
    const key = bl.creneau ?? 'sans_creneau';
    groups[key].push(bl);
  }
  return groups;
}
