/**
 * Types Supabase Database — DecoShop Livreur
 *
 * Note : Ce fichier sera régénéré via `supabase gen types typescript --project-id <id>`
 * une fois que le repo sera connecté au CLI Supabase. En attendant, types manuels alignés
 * sur le schéma SQL (cf. plan/sql/01_types_and_tables.sql).
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
type WithoutTimestamps<T> = Omit<T, 'created_at' | 'updated_at'>;
type Insertable<T> = Partial<WithoutTimestamps<T>> & { id?: string };
type Updatable<T> = Partial<WithoutTimestamps<T>>;

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Insertable<Profile>;
        Update: Updatable<Profile>;
      };
      clients: {
        Row: Client;
        Insert: Insertable<Client>;
        Update: Updatable<Client>;
      };
      commandes: {
        Row: Commande;
        Insert: Insertable<Commande>;
        Update: Updatable<Commande>;
      };
      bons_livraison: {
        Row: BL;
        Insert: Insertable<BL>;
        Update: Updatable<BL>;
      };
      lignes_bl: {
        Row: LigneBL;
        Insert: Insertable<LigneBL>;
        Update: Updatable<LigneBL>;
      };
      creneaux_livraison: {
        Row: CreneauLivraison;
        Insert: Insertable<CreneauLivraison>;
        Update: Updatable<CreneauLivraison>;
      };
      notifications: {
        Row: Notification;
        Insert: Insertable<Notification>;
        Update: Updatable<Notification>;
      };
    };
    Views: {
      v_livreur_bl_today: {
        Row: BL & {
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
    };
  };
}
