/**
 * Types Supabase Database — DecoShop Livreur
 *
 * Note : Ce fichier sera régénéré via `supabase gen types typescript --project-id <id>`
 * une fois que le repo sera connecté au CLI Supabase. En attendant, types manuels alignés
 * sur le schéma SQL (cf. plan/sql/01_types_and_tables.sql).
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
  public: {
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
    };
  };
}

// Garde le type Relationship exporté pour usage futur (RPC/joins typés).
export type { Relationship };
