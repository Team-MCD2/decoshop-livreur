/**
 * Types domaine — DecoShop Livreur
 * Reflètent fidèlement le schéma SQL (cf. plan/sql/01_types_and_tables.sql)
 */

// ====== ENUMs ======

export type UserRole = 'admin' | 'vendeur' | 'vendeur_proprietaire' | 'livreur';

export type BLStatus =
  | 'cree'
  | 'assigne'
  | 'confirme'
  | 'release_demandee'
  | 'bloque'
  | 'en_livraison'
  | 'en_route'
  | 'livre'
  | 'signature_attendue'
  | 'signe'
  | 'signature_expiree'
  | 'echec_T1'
  | 'echec_T2'
  | 'abandon'
  | 'retour_planifie'
  | 'retour_en_cours'
  | 'retour_collecte';

export type CreneauType = 'matin' | 'apres_midi' | 'soir';
export type SlotStatus = 'disponible' | 'reserve' | 'termine' | 'annule';
export type DeliveryMode = 'domicile' | 'retrait_magasin';
export type VehicleType = 'voiture' | 'utilitaire' | 'camionnette' | 'camion';
export type SignatureStatus = 'en_attente' | 'signe' | 'expire';
export type Language = 'fr' | 'ar';

export type AttemptFailureReason =
  | 'client_absent'
  | 'client_refuse'
  | 'adresse_introuvable'
  | 'articles_endommages'
  | 'colis_perdu'
  | 'meteo'
  | 'panne_vehicule'
  | 'autre';

export type NotificationType =
  | 'bl_assigned'
  | 'bl_creneau_confirmed'
  | 'bl_release_requested'
  | 'bl_release_validated'
  | 'bl_release_rejected'
  | 'bl_delivered'
  | 'bl_signed'
  | 'bl_signature_expired'
  | 'bl_attempt_failed'
  | 'system_alert';

// ====== Tables ======

export interface Profile {
  id: string;
  nom: string | null;
  prenom: string | null;
  telephone: string | null;
  email: string | null;
  role: UserRole;
  is_active: boolean;
  vehicle_type: VehicleType | null;
  vehicle_capacity_m3: number | null;
  vehicle_immatriculation: string | null;
  weekly_schedule: WeeklySchedule;
  last_assigned_at: string | null;
  pin_hash: string | null;
  preferred_language: Language;
  push_subscription: unknown;
  zones_couvertes: string[] | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export type WeeklySchedule = Partial<
  Record<'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday', CreneauType[]>
>;

export interface Client {
  id: string;
  nom: string;
  prenom: string | null;
  email: string | null;
  telephone: string | null;
  adresse_ligne1: string;
  adresse_ligne2: string | null;
  code_postal: string | null;
  ville: string | null;
  pays: string;
  latitude: number | null;
  longitude: number | null;
  etage: number | null;
  ascenseur: boolean | null;
  code_porte: string | null;
  commentaire_acces: string | null;
  shopify_customer_id: string | null;
  anonymized_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Commande {
  id: string;
  client_id: string;
  numero_commande: string;
  shopify_order_id: string | null;
  statut: 'en_attente' | 'en_preparation' | 'expediee' | 'livree' | 'annulee';
  montant_total_ttc: number;
  montant_total_ht: number | null;
  montant_tva: number | null;
  taux_tva: number | null;
  date_commande: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface BL {
  id: string;
  numero_bl: string;
  commande_id: string;
  client_id: string;
  vendeur_id: string | null;
  livreur_id: string | null;
  statut: BLStatus;
  mode_livraison: DeliveryMode;
  creneau: CreneauType | null;
  date_livraison_prevue: string | null;
  date_livraison_effective: string | null;
  montant_total_ttc: number;
  montant_frais_relivraison: number;
  nb_tentatives: number;
  admin_waiver: boolean;
  attempt_log: unknown[];
  assignment_log: unknown[];
  release_requested_at: string | null;
  release_validated_at: string | null;
  release_validated_by: string | null;
  release_rejected_motif: string | null;
  photo_depart_url: string | null;
  vendeur_present_depart: boolean;
  photo_litige_url: string | null;
  pdf_url: string | null;
  date_creation: string;
  date_signature: string | null;
  created_at: string;
  updated_at: string;
}

export interface LigneBL {
  id: string;
  bl_id: string;
  article_id: string | null;
  designation: string;
  marque: string | null;
  modele: string | null;
  quantite: number;
  prix_unitaire_ttc: number;
  total_ligne_ttc: number;
  poids_kg: number | null;
  volume_m3: number | null;
  fragile: boolean;
  ordre_tri: number;
  created_at: string;
}

export interface CreneauLivraison {
  id: string;
  livreur_id: string;
  date_creneau: string;
  type_creneau: CreneauType;
  heure_debut: string;
  heure_fin: string;
  statut: SlotStatus;
  bl_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  bl_id: string | null;
  metadata: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}
