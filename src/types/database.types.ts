/**
 * Types Supabase Database — DecoShop Livreur
 *
 * Consolidation 2026-04-30 : toutes les tables livreur vivent maintenant dans
 * le schéma `livreur.*` (au lieu de `public.*`). Le client Supabase est
 * configuré avec `db.schema: 'livreur'` comme défaut, donc `from('xxx')` et
 * `rpc('xxx')` résolvent automatiquement vers `livreur.xxx`.
 *
 * Le schéma `public` est exposé uniquement pour la vue `articles_public`
 * (lecture cross-schema des articles inventaire) — utiliser via
 * `supabase.schema('public').from('articles_public').select(...)`.
 *
 * Note : Ce fichier sera régénéré via `supabase gen types typescript --project-id <id>`
 * une fois le CLI authentifié. En attendant, types manuels alignés
 * sur le schéma SQL (cf. decoshop-livreur/sql/003_livreur_schema.sql).
 *
 * IMPORTANT — chaque table/view DOIT inclure `Relationships: []` (ou les vraies FK)
 * pour satisfaire la contrainte `GenericTable` de @supabase/postgrest-js, sinon le
 * client tombe en fallback typé `never` sur les méthodes update/insert/select.
 */

import type {
  Profile,
  Client,
  Commande,
  BL,
  LigneBL,
  CreneauLivraison,
  Notification,
} from './domain';

// Helpers de manipulation pour Supabase
//
// IMPORTANT — `ToRow<T>` re-mappe une interface en mapped-type pour qu'elle satisfasse
// `Record<string, unknown>` (contrainte de `GenericTable`). Sans ça, importer une
// `interface` (Profile, BL...) brise l'inférence de `Row` côté postgrest-js.
type ToRow<T> = { [K in keyof T]: T[K] };
type WithoutTimestamps<T> = Omit<T, 'created_at' | 'updated_at'>;
type Insertable<T> = Partial<ToRow<WithoutTimestamps<T>>> & { id?: string };
type Updatable<T> = Partial<ToRow<WithoutTimestamps<T>>>;

interface Relationship {
  foreignKeyName: string;
  columns: string[];
  isOneToOne?: boolean;
  referencedRelation: string;
  referencedColumns: string[];
}

export interface Database {
  livreur: {
    Tables: {
      profiles: {
        Row: ToRow<Profile>;
        Insert: Insertable<Profile>;
        Update: Updatable<Profile>;
        Relationships: [];
      };
      clients: {
        Row: ToRow<Client>;
        Insert: Insertable<Client>;
        Update: Updatable<Client>;
        Relationships: [];
      };
      commandes: {
        Row: ToRow<Commande>;
        Insert: Insertable<Commande>;
        Update: Updatable<Commande>;
        Relationships: [
          {
            foreignKeyName: 'commandes_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
        ];
      };
      bons_livraison: {
        Row: ToRow<BL>;
        Insert: Insertable<BL>;
        Update: Updatable<BL>;
        Relationships: [
          {
            foreignKeyName: 'bons_livraison_commande_id_fkey';
            columns: ['commande_id'];
            isOneToOne: false;
            referencedRelation: 'commandes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bons_livraison_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bons_livraison_livreur_id_fkey';
            columns: ['livreur_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      lignes_bl: {
        Row: ToRow<LigneBL>;
        Insert: Insertable<LigneBL>;
        Update: Updatable<LigneBL>;
        Relationships: [
          {
            foreignKeyName: 'lignes_bl_bl_id_fkey';
            columns: ['bl_id'];
            isOneToOne: false;
            referencedRelation: 'bons_livraison';
            referencedColumns: ['id'];
          },
        ];
      };
      creneaux_livraison: {
        Row: ToRow<CreneauLivraison>;
        Insert: Insertable<CreneauLivraison>;
        Update: Updatable<CreneauLivraison>;
        Relationships: [
          {
            foreignKeyName: 'creneaux_livraison_livreur_id_fkey';
            columns: ['livreur_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      notifications: {
        Row: ToRow<Notification>;
        Insert: Insertable<Notification>;
        Update: Updatable<Notification>;
        Relationships: [];
      };
      driver_locations: {
        Row: {
          id: string;
          driver_id: string;
          bl_id: string | null;
          lat: number;
          lng: number;
          accuracy_m: number | null;
          heading_deg: number | null;
          speed_kmh: number | null;
          recorded_at: string;
        };
        Insert: {
          id?: string;
          driver_id: string;
          bl_id?: string | null;
          lat: number;
          lng: number;
          accuracy_m?: number | null;
          heading_deg?: number | null;
          speed_kmh?: number | null;
          recorded_at?: string;
        };
        Update: {
          id?: string;
          driver_id?: string;
          bl_id?: string | null;
          lat?: number;
          lng?: number;
          accuracy_m?: number | null;
          heading_deg?: number | null;
          speed_kmh?: number | null;
          recorded_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'driver_locations_driver_id_fkey';
            columns: ['driver_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'driver_locations_bl_id_fkey';
            columns: ['bl_id'];
            isOneToOne: false;
            referencedRelation: 'bons_livraison';
            referencedColumns: ['id'];
          },
        ];
      };
      signatures_electroniques: {
        Row: {
          id: string;
          bl_id: string;
          token: string;
          statut: 'en_attente' | 'signe' | 'expire';
          date_emission: string;
          date_expiration: string;
          date_signature: string | null;
          signature_data: string | null;
          signe_par_parent: boolean;
          parent_nom: string | null;
          parent_lien: string | null;
          user_agent: string | null;
          retry_count: number;
          invalidated_at: string | null;
          invalidated_by: string | null;
          invalidated_motif: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          bl_id: string;
          token: string;
          statut?: 'en_attente' | 'signe' | 'expire';
          date_emission?: string;
          date_expiration: string;
          date_signature?: string | null;
          signature_data?: string | null;
          signe_par_parent?: boolean;
          parent_nom?: string | null;
          parent_lien?: string | null;
          user_agent?: string | null;
          retry_count?: number;
        };
        Update: {
          statut?: 'en_attente' | 'signe' | 'expire';
          date_signature?: string | null;
          signature_data?: string | null;
          signe_par_parent?: boolean;
          parent_nom?: string | null;
          parent_lien?: string | null;
          user_agent?: string | null;
          retry_count?: number;
          invalidated_at?: string | null;
          invalidated_by?: string | null;
          invalidated_motif?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'signatures_electroniques_bl_id_fkey';
            columns: ['bl_id'];
            isOneToOne: false;
            referencedRelation: 'bons_livraison';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      v_livreur_bl_today: {
        Row: ToRow<BL> & {
          client_nom: string;
          client_prenom: string | null;
          client_telephone: string | null;
          client_email: string | null;
          client_adresse: string;
          client_cp: string | null;
          client_ville: string | null;
          client_lat: number | null;
          client_lng: number | null;
          client_etage: number | null;
          client_ascenseur: boolean | null;
          client_code_porte: string | null;
          client_commentaire: string | null;
          numero_commande: string;
          date_commande: string;
          articles: unknown;
        };
        Relationships: [];
      };
      v_livreur_kpis_today: {
        Row: {
          livreur_id: string;
          bl_aujourd_hui: number;
          livres_signes_today: number;
          en_cours: number;
          restant: number;
          taux_signature_pct: number | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      auto_assign_livreur: {
        Args: { p_date?: string };
        Returns: string;
      };
      anonymize_client: {
        Args: { p_client_id: string };
        Returns: void;
      };
      request_signature: {
        Args: { p_bl_id: string; p_ttl_minutes?: number };
        Returns: {
          token: string;
          bl_id: string;
          url_path: string;
          date_emission: string;
          date_expiration: string;
          ttl_minutes: number;
          email_client: string | null;
        };
      };
      submit_signature: {
        Args: {
          p_token: string;
          p_signature_data: string;
          p_signe_par_parent?: boolean;
          p_parent_nom?: string | null;
          p_parent_lien?: string | null;
          p_user_agent?: string | null;
        };
        Returns: {
          success: boolean;
          bl_id: string;
          numero_bl: string;
          signed_at: string;
        };
      };
      get_signature_public: {
        Args: { p_token: string };
        Returns: {
          status: 'en_attente' | 'signe' | 'expire';
          is_expired: boolean;
          is_signed: boolean;
          date_emission: string;
          date_expiration: string;
          date_signature: string | null;
          numero_bl: string;
          montant_total_ttc: number;
          mode_livraison: 'domicile' | 'retrait_magasin';
          creneau: 'matin' | 'apres_midi' | 'soir' | null;
          date_livraison_prevue: string | null;
          client_nom: string;
          client_prenom: string | null;
          client_ville: string | null;
          articles_count: number;
        };
      };
      expire_pending_signatures: {
        Args: Record<string, never>;
        Returns: {
          processed: number;
          expired_at: string;
        };
      };
      invalidate_signature: {
        Args: { p_bl_id: string; p_motif?: string | null };
        Returns: {
          success: boolean;
          bl_id: string;
          motif: string | null;
          invalidated_at: string;
          invalidated_by: string;
        };
      };
    };
  };
  public: {
    Tables: Record<string, never>;
    Views: {
      articles_public: {
        Row: {
          id: string;
          numero_article: string | null;
          description: string | null;
          marque: string | null;
          categorie: string | null;
          couleur: string | null;
          prix_vente: number | null;
          quantite: number | null;
          quantite_initiale: number | null;
          seuil_stock_faible: number | null;
          photo_url: string | null;
          code_barres: string | null;
          taille: string | null;
          created_at: number | null;
          updated_at: number | null;
        };
        Relationships: [];
      };
    };
    Functions: Record<string, never>;
  };
}

// Garde le type Relationship exporté pour usage futur (RPC/joins typés).
export type { Relationship };
