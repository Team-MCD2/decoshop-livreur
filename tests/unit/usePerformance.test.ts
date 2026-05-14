/**
 * Unit tests for `src/hooks/usePerformance.ts` — Phase 8 dashboard hooks.
 *
 * Covers :
 *   - presetToRange (pure, deterministic with fake timers)
 *   - formatRate / formatAvg (null handling + decimal trimming)
 *   - performanceErrorKey (error → i18n key mapping)
 *   - useDailyKpis / usePeriodScore : success + error paths via mocked
 *     supabase.rpc.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { createElement } from 'react';

// ---------------------------------------------------------------------------
// Mock supabase BEFORE importing the hook under test.
// ---------------------------------------------------------------------------
const mockRpc = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

import {
  presetToRange,
  formatRate,
  formatAvg,
  performanceErrorKey,
  useDailyKpis,
  usePeriodScore,
} from '@/hooks/usePerformance';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

beforeEach(() => {
  mockRpc.mockReset();
});

// ---------------------------------------------------------------------------
// presetToRange
// ---------------------------------------------------------------------------
describe('presetToRange', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Local-time noon to avoid any DST/UTC-boundary surprises.
    vi.setSystemTime(new Date(2026, 4 /* May */, 14, 12, 0, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('7d → from is today minus 6 days, to is today', () => {
    const { from, to } = presetToRange('7d');
    expect(to).toBe('2026-05-14');
    expect(from).toBe('2026-05-08');
  });

  it('30d → from is today minus 29 days', () => {
    const { from, to } = presetToRange('30d');
    expect(to).toBe('2026-05-14');
    expect(from).toBe('2026-04-15');
  });

  it('90d spans 3 months back', () => {
    const { from, to } = presetToRange('90d');
    expect(to).toBe('2026-05-14');
    expect(from).toBe('2026-02-14');
  });
});

// ---------------------------------------------------------------------------
// formatRate / formatAvg
// ---------------------------------------------------------------------------
describe('formatRate', () => {
  it('returns "—" for null and undefined', () => {
    expect(formatRate(null)).toBe('—');
    expect(formatRate(undefined)).toBe('—');
  });

  it('trims decimals when integer', () => {
    expect(formatRate(0)).toMatch(/^0\u00a0%$/);
    expect(formatRate(100)).toMatch(/^100\u00a0%$/);
  });

  it('keeps one decimal for non-integers', () => {
    expect(formatRate(87.5)).toMatch(/^87\.5\u00a0%$/);
    expect(formatRate(33.3)).toMatch(/^33\.3\u00a0%$/);
  });
});

describe('formatAvg', () => {
  it('returns "—" for null and undefined', () => {
    expect(formatAvg(null)).toBe('—');
    expect(formatAvg(undefined)).toBe('—');
  });

  it('formats integers without decimals', () => {
    expect(formatAvg(2)).toBe('2');
  });

  it('formats fractions with two decimals', () => {
    expect(formatAvg(1.75)).toBe('1.75');
    expect(formatAvg(1.5)).toBe('1.50');
  });
});

// ---------------------------------------------------------------------------
// performanceErrorKey
// ---------------------------------------------------------------------------
describe('performanceErrorKey', () => {
  it('maps NOT_AUTHENTICATED', () => {
    expect(performanceErrorKey({ message: 'NOT_AUTHENTICATED' })).toBe(
      'performance.errors.unauth',
    );
  });
  it('maps FORBIDDEN', () => {
    expect(performanceErrorKey({ message: 'FORBIDDEN' })).toBe(
      'performance.errors.forbidden',
    );
  });
  it('maps INVALID_PERIOD', () => {
    expect(performanceErrorKey({ message: 'INVALID_PERIOD: p_from > p_to' })).toBe(
      'performance.errors.invalid_period',
    );
  });
  it('maps PERIOD_TOO_LONG', () => {
    expect(performanceErrorKey({ message: 'PERIOD_TOO_LONG' })).toBe(
      'performance.errors.period_too_long',
    );
  });
  it('falls back to generic', () => {
    expect(performanceErrorKey(new Error('boom'))).toBe(
      'performance.errors.generic',
    );
    expect(performanceErrorKey(null)).toBe('performance.errors.generic');
  });
});

// ---------------------------------------------------------------------------
// useDailyKpis
// ---------------------------------------------------------------------------
describe('useDailyKpis', () => {
  it('calls get_driver_daily_kpis with today and self', async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        driver_id:      'me',
        date:           '2026-05-14',
        total:          10,
        delivered:      8,
        signed:         7,
        in_progress:    1,
        remaining:      1,
        failed_t1:      0,
        failed_t2:      0,
        abandoned:      0,
        signature_rate: 87.5,
        success_rate:   80,
        computed_at:    '2026-05-14T10:00:00Z',
      },
      error: null,
    });

    const { result } = renderHook(() => useDailyKpis({ date: '2026-05-14' }), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockRpc).toHaveBeenCalledWith('get_driver_daily_kpis', {
      p_date: '2026-05-14',
      p_driver_id: null,
    });
    expect(result.current.data?.total).toBe(10);
    expect(result.current.data?.signature_rate).toBe(87.5);
  });

  it('passes p_driver_id when provided', async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        driver_id: 'other', date: '2026-05-14',
        total: 0, delivered: 0, signed: 0, in_progress: 0, remaining: 0,
        failed_t1: 0, failed_t2: 0, abandoned: 0,
        signature_rate: null, success_rate: null,
        computed_at: '2026-05-14T10:00:00Z',
      },
      error: null,
    });

    const { result } = renderHook(
      () => useDailyKpis({ date: '2026-05-14', driverId: 'other' }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockRpc).toHaveBeenCalledWith('get_driver_daily_kpis', {
      p_date: '2026-05-14',
      p_driver_id: 'other',
    });
  });

  it('surfaces RPC errors', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'NOT_AUTHENTICATED' },
    });

    const { result } = renderHook(() => useDailyKpis({ date: '2026-05-14' }), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error | null)?.message).toBe(
      'NOT_AUTHENTICATED',
    );
  });
});

// ---------------------------------------------------------------------------
// usePeriodScore
// ---------------------------------------------------------------------------
describe('usePeriodScore', () => {
  const OK_RESPONSE = {
    driver_id:                  'me',
    period_from:                '2026-04-15',
    period_to:                  '2026-05-14',
    period_days:                30,
    total:                      120,
    delivered:                  100,
    signed:                     90,
    failed:                     15,
    abandoned:                  5,
    on_time:                    85,
    days_active:                22,
    signature_rate:             90,
    success_rate:               83.3,
    failure_rate:               16.7,
    on_time_rate:               85,
    avg_attempts_per_failed_bl: 1.4,
    computed_at:                '2026-05-14T10:00:00Z',
  };

  it('calls get_driver_period_score with from / to', async () => {
    mockRpc.mockResolvedValueOnce({ data: OK_RESPONSE, error: null });

    const { result } = renderHook(
      () => usePeriodScore({ from: '2026-04-15', to: '2026-05-14' }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockRpc).toHaveBeenCalledWith('get_driver_period_score', {
      p_from: '2026-04-15',
      p_to:   '2026-05-14',
      p_driver_id: null,
    });
    expect(result.current.data?.success_rate).toBe(83.3);
    expect(result.current.data?.days_active).toBe(22);
  });

  it('is disabled when from or to is missing', () => {
    const { result } = renderHook(
      () => usePeriodScore({ from: '', to: '' }),
      { wrapper: makeWrapper() },
    );
    // `enabled: false` keeps the query in a "fetching not started" state.
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('surfaces PERIOD_TOO_LONG errors', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'PERIOD_TOO_LONG' },
    });

    const { result } = renderHook(
      () => usePeriodScore({ from: '2024-01-01', to: '2026-05-14' }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(performanceErrorKey(result.current.error)).toBe(
      'performance.errors.period_too_long',
    );
  });
});
