/**
 * Types for the Phase 8 Performance dashboard.
 *
 * Mirror the JSON shapes returned by :
 *   - `livreur.get_driver_daily_kpis(p_date, p_driver_id)`  → DailyKpis
 *   - `livreur.get_driver_period_score(p_from, p_to, p_driver_id)` → PeriodScore
 *
 * Defined in `sql/010_livreur_workflow_rpcs.sql` §4 and §5. When migration 010
 * is applied and the Supabase types are regenerated, these can be sourced
 * from `database.types.ts` directly ; until then this is the hand-typed
 * contract.
 */

/** Daily KPIs — zero-filled on empty days. */
export interface DailyKpis {
  driver_id: string;
  /** ISO date (YYYY-MM-DD), the slice these KPIs cover. */
  date: string;
  /** Total BLs assigned to the driver for `date_livraison_prevue = date`. */
  total: number;
  /** statut IN ('livre','signe'). */
  delivered: number;
  /** statut = 'signe'. */
  signed: number;
  /** en_livraison + en_route + signature_attendue. */
  in_progress: number;
  /** assigne + confirme + release_demandee. */
  remaining: number;
  failed_t1: number;
  failed_t2: number;
  abandoned: number;
  /**
   * `signed / delivered * 100`. NULL when `delivered = 0` (distinguishes
   * "no data yet" from "0% — everyone refused to sign").
   */
  signature_rate: number | null;
  /** `delivered / total * 100`. NULL when total = 0. */
  success_rate: number | null;
  /** ISO timestamp the RPC ran. */
  computed_at: string;
}

/** Rolling-period scorecard — default window 30 days, max 366. */
export interface PeriodScore {
  driver_id: string;
  /** ISO date — inclusive. */
  period_from: string;
  /** ISO date — inclusive. */
  period_to: string;
  /** `period_to - period_from + 1`. */
  period_days: number;
  total: number;
  delivered: number;
  signed: number;
  /** echec_T1 + echec_T2. */
  failed: number;
  abandoned: number;
  /** Delivered with `date_livraison_effective <= date_livraison_prevue`. */
  on_time: number;
  /** Distinct `date_livraison_prevue` values touched. */
  days_active: number;
  signature_rate: number | null;
  success_rate: number | null;
  failure_rate: number | null;
  on_time_rate: number | null;
  /** Average `nb_tentatives` over BLs that failed (T1+T2+abandon). */
  avg_attempts_per_failed_bl: number | null;
  computed_at: string;
}

/** Period preset for the dashboard chips. Last N days inclusive of today. */
export type PeriodPresetKey = '7d' | '30d' | '90d';

export interface PeriodPreset {
  key: PeriodPresetKey;
  /** Number of days INCLUDING today. 7d means today - 6 days .. today. */
  days: number;
}

export const PERIOD_PRESETS: ReadonlyArray<PeriodPreset> = [
  { key: '7d',  days: 7 },
  { key: '30d', days: 30 },
  { key: '90d', days: 90 },
] as const;

/** Default — matches the RPC default (30 days back, inclusive). */
export const DEFAULT_PERIOD_PRESET: PeriodPresetKey = '30d';
