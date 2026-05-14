/**
 * Hooks for the Phase 8 Performance dashboard.
 *
 *   useDailyKpis(date?)    → livreur.get_driver_daily_kpis
 *   usePeriodScore(args)   → livreur.get_driver_period_score
 *
 * Both default to the calling user (RPCs read `auth.uid()`). Admins/vendeurs
 * may pass `driverId` to inspect another driver's KPIs.
 *
 * RPC signatures, return shapes, and authorisation rules are documented in
 * `sql/010_livreur_workflow_rpcs.sql` §4 and §5 ; the local TS contract lives
 * in `src/types/performance.ts`.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { DailyKpis, PeriodScore, PeriodPresetKey } from '@/types/performance';
import { PERIOD_PRESETS } from '@/types/performance';

/** YYYY-MM-DD in local time. Avoids the toISOString() UTC-skew foot-gun. */
function toIsoDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const dd   = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Compute the [from, to] window for a preset, inclusive of today.
 * `7d` → from = today - 6, to = today (7 days total counting today).
 *
 * Returned dates are LOCAL — the RPC stores `date_livraison_prevue` as a
 * `date` column (no timezone) and we want the driver's wall-clock day, not
 * UTC.
 */
export function presetToRange(preset: PeriodPresetKey): { from: string; to: string } {
  const def = PERIOD_PRESETS.find((p) => p.key === preset);
  const days = def?.days ?? 30;
  const today = new Date();
  const from  = new Date(today);
  from.setDate(today.getDate() - (days - 1));
  return { from: toIsoDate(from), to: toIsoDate(today) };
}

// -----------------------------------------------------------------------------

export interface UseDailyKpisArgs {
  /** ISO date (YYYY-MM-DD). Defaults to today (driver's local timezone). */
  date?: string;
  /** Only admins/vendeurs may pass another driver's id. Omit to read own. */
  driverId?: string;
}

/**
 * Fetches today's KPI tiles. Returns zero-filled values when the driver has
 * no BLs assigned for `date` ; never undefined once loaded successfully.
 */
export function useDailyKpis(args: UseDailyKpisArgs = {}) {
  const date = args.date ?? toIsoDate(new Date());
  return useQuery({
    queryKey: ['performance', 'daily', date, args.driverId ?? 'self'] as const,
    queryFn: async (): Promise<DailyKpis> => {
      // @ts-expect-error - get_driver_daily_kpis added in migration 010
      const { data, error } = await supabase.rpc('get_driver_daily_kpis', {
        p_date: date,
        p_driver_id: args.driverId ?? null,
      });
      if (error) throw error;
      return data as unknown as DailyKpis;
    },
    // KPIs change continuously as BLs progress through statuses ; 30 s
    // strikes a balance between freshness and not hammering the RPC.
    staleTime: 30_000,
  });
}

// -----------------------------------------------------------------------------

export interface UsePeriodScoreArgs {
  from: string;  // YYYY-MM-DD, inclusive
  to:   string;  // YYYY-MM-DD, inclusive
  driverId?: string;
}

/**
 * Fetches the rolling-period scorecard. The window is inclusive of both
 * endpoints. Returns `null` rates when a denominator is 0 (the UI shows "—"
 * for null to distinguish "no data" from "0%").
 */
export function usePeriodScore(args: UsePeriodScoreArgs) {
  return useQuery({
    queryKey: [
      'performance',
      'period',
      args.from,
      args.to,
      args.driverId ?? 'self',
    ] as const,
    enabled: !!args.from && !!args.to,
    queryFn: async (): Promise<PeriodScore> => {
      // @ts-expect-error - get_driver_period_score added in migration 010
      const { data, error } = await supabase.rpc('get_driver_period_score', {
        p_from: args.from,
        p_to:   args.to,
        p_driver_id: args.driverId ?? null,
      });
      if (error) throw error;
      return data as unknown as PeriodScore;
    },
    // Period scores change less often than daily KPIs ; 5 min keeps the
    // dashboard snappy without redundant traffic.
    staleTime: 5 * 60_000,
  });
}

// -----------------------------------------------------------------------------

/**
 * Maps an RPC error to a stable i18n key. Mirrors the pattern in
 * `useBLDetail.transitionErrorKey` and `useFailure.failureErrorKey`.
 */
export function performanceErrorKey(e: unknown): string {
  if (typeof e === 'object' && e !== null && 'message' in e) {
    const msg = String((e as { message: string }).message);
    if (msg.includes('NOT_AUTHENTICATED'))  return 'performance.errors.unauth';
    if (msg.includes('FORBIDDEN'))           return 'performance.errors.forbidden';
    if (msg.includes('INVALID_PERIOD'))      return 'performance.errors.invalid_period';
    if (msg.includes('PERIOD_TOO_LONG'))     return 'performance.errors.period_too_long';
    if (msg.includes('PROFILE_NOT_FOUND'))   return 'performance.errors.no_profile';
  }
  return 'performance.errors.generic';
}

/**
 * Pretty-print a percentage value, returning "—" for null. Used by the tiles
 * so the "no data" state is visually distinct from "0 %".
 */
export function formatRate(rate: number | null | undefined): string {
  if (rate === null || rate === undefined) return '—';
  return `${rate.toFixed(rate % 1 === 0 ? 0 : 1)}\u00a0%`;
}

/**
 * Pretty-print an average count (one decimal), returning "—" for null.
 */
export function formatAvg(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return value.toFixed(value % 1 === 0 ? 0 : 2);
}
