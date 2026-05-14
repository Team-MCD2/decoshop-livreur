/**
 * React integration for the offline mutation queue.
 *
 * Two pieces :
 *   - `usePendingMutationsCount()` : live count of queued mutations, refreshed
 *     via TanStack Query so the offline banner stays in sync with enqueue /
 *     dequeue events anywhere in the tree.
 *   - `useOfflineReplay()` : root-level effect that triggers `replayAll` on
 *     reconnection (and once on mount, in case mutations are pending from a
 *     previous session). Returns nothing — it is fire-and-forget.
 *
 * The executor function (Supabase call) is defined here so the queue lib stays
 * pure / testable.
 */
import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import {
  countPending,
  replayAll,
  type RpcExecutor,
} from '@/lib/offline-queue';
import type { QueuedMutation, ReplayResult } from '@/types/queue';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

/** TanStack Query key for the pending-count poll. */
const QUEUE_COUNT_KEY = ['offline-queue', 'pending-count'] as const;

/**
 * Reactive count of `pending` mutations in the queue. Refetches every 5 s
 * while the tab is visible. Mutation hooks should ALSO call
 * `invalidateQueueCount()` after enqueue to get an immediate refresh.
 */
export function usePendingMutationsCount(): number {
  const { data } = useQuery({
    queryKey: QUEUE_COUNT_KEY,
    queryFn: countPending,
    refetchInterval: 5000,
    staleTime: 1000,
  });
  return data ?? 0;
}

/**
 * Force a re-fetch of the queue count — call after every enqueue / replay
 * so the offline banner updates without waiting for the 5 s interval.
 */
export function useInvalidateQueueCount(): () => void {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: QUEUE_COUNT_KEY });
  };
}

/**
 * The Supabase-aware executor wired into `replayAll`. Switch-on rpcName, call
 * `supabase.rpc(...)`. Throws on error so the queue lib's retry logic kicks
 * in.
 *
 * Extension point : when adding a new `QueueableRpc`, add a `case` here AND
 * extend the type in `src/types/queue.ts`.
 */
export const queueExecutor: RpcExecutor = async (mut: QueuedMutation) => {
  switch (mut.rpcName) {
    case 'transition_bl_status': {
      // @ts-expect-error - transition_bl_status added in migration 010, types not yet regenerated.
      const { error } = await supabase.rpc('transition_bl_status', mut.args);
      if (error) throw error;
      return;
    }
    case 'record_failed_attempt': {
      // @ts-expect-error - record_failed_attempt added in migration 010, types not yet regenerated.
      const { error } = await supabase.rpc('record_failed_attempt', mut.args);
      if (error) throw error;
      return;
    }
    case 'submit_signature': {
      // The queue stores `args` as `Record<string, unknown>` so it can survive
      // IndexedDB serialisation. The typed `supabase.rpc('submit_signature', …)`
      // overload wants a specific shape — we trust the enqueue site (which IS
      // typed via its own hook) and erase here.
      // @ts-expect-error - generic args shape can't statically match typed RPC params
      const { error } = await supabase.rpc('submit_signature', mut.args);
      if (error) throw error;
      return;
    }
    default: {
      // Exhaustive check — unreachable if the union stays consistent.
      const _exhaustive: never = mut.rpcName;
      throw new Error(`Unsupported rpcName : ${String(_exhaustive)}`);
    }
  }
};

/**
 * Root-level effect : on every transition `offline → online`, AND once on
 * mount, drain the queue. Re-fetches all `['bl']` queries afterwards so the
 * UI reflects authoritative server state once replay is done.
 *
 * Callers may pass an `onResult` callback to surface a toast / log. The
 * effect deduplicates with a ref so a flaky network (rapid online/offline
 * flapping) doesn't trigger concurrent drains.
 */
export function useOfflineReplay(options?: {
  onResult?: (result: ReplayResult) => void;
}): void {
  const online = useOnlineStatus();
  const qc = useQueryClient();
  const inFlightRef = useRef<boolean>(false);
  const hasReplayedOnceRef = useRef<boolean>(false);
  const onResultRef = useRef(options?.onResult);
  onResultRef.current = options?.onResult;

  useEffect(() => {
    // Two triggers : first mount (drain whatever survived from last session)
    // AND every offline → online transition. We unify them with this guard.
    if (!online) return;
    if (inFlightRef.current) return;

    const run = async () => {
      inFlightRef.current = true;
      try {
        const result = await replayAll(queueExecutor);
        // Refresh authoritative state for any BL we touched.
        if (result.success > 0 || result.failed > 0) {
          void qc.invalidateQueries({ queryKey: ['bl'] });
          void qc.invalidateQueries({ queryKey: ['bls'] });
        }
        // Pending-count poll should reflect immediately.
        void qc.invalidateQueries({ queryKey: QUEUE_COUNT_KEY });
        onResultRef.current?.(result);
      } catch (e) {
        // The lib itself throwing is a true bug (vs an RPC failing, which is
        // caught inside replayAll). Surface it loudly to the console for
        // debugging — the boundary won't catch this since we're in an effect.
        console.error('[offline-queue] replayAll crashed', e);
      } finally {
        inFlightRef.current = false;
        hasReplayedOnceRef.current = true;
      }
    };

    void run();
  }, [online, qc]);
}
