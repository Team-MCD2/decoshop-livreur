/**
 * Unit tests for the offline mutation queue (Phase 6 foundation).
 *
 * Covers :
 *   - enqueue / dequeue round-trip
 *   - getPending / countPending after a mix of statuses
 *   - replayAll with a passing executor, a permanent-failure executor,
 *     a transient-failure executor (capped at MAX_TRANSIENT_RETRIES)
 *   - cross-BL blocking : when one mutation for BL X fails, subsequent
 *     queued mutations for the same BL X are auto-failed
 *   - extractErrorCode for the common error shapes
 *
 * Uses `fake-indexeddb/auto` (wired in `tests/setup.ts`) so the queue
 * persists across calls within one test, then is wiped by IDBFactory
 * resets between tests (we manually clear + reset the singleton).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  enqueue,
  dequeue,
  getPending,
  getAll,
  getFailed,
  countPending,
  markFailed,
  markTransientFailure,
  clearQueue,
  replayAll,
  extractErrorCode,
  _resetDBCache,
} from '@/lib/offline-queue';
import { MAX_TRANSIENT_RETRIES } from '@/types/queue';

// Reset IDB state between tests. `fake-indexeddb` keeps DBs across tests
// inside one suite, so we clear the store + reset the cached singleton.
beforeEach(async () => {
  await clearQueue();
  _resetDBCache();
});

describe('offline-queue', () => {
  describe('enqueue / dequeue', () => {
    it('enqueue returns an id and persists a pending mutation', async () => {
      const id = await enqueue({
        rpcName: 'transition_bl_status',
        args: { p_bl_id: 'bl-1', p_to_status: 'livre' },
        blId: 'bl-1',
      });
      expect(id).toBeTypeOf('string');
      expect(id.length).toBeGreaterThan(8);

      const all = await getAll();
      expect(all).toHaveLength(1);
      expect(all[0]).toMatchObject({
        id,
        rpcName: 'transition_bl_status',
        status: 'pending',
        attempts: 0,
        blId: 'bl-1',
      });
      expect(all[0].createdAt).toBeTypeOf('string');
    });

    it('dequeue removes a mutation by id', async () => {
      const id = await enqueue({
        rpcName: 'transition_bl_status',
        args: {},
        blId: 'bl-1',
      });
      await dequeue(id);
      const all = await getAll();
      expect(all).toHaveLength(0);
    });

    it('countPending only counts pending status', async () => {
      const a = await enqueue({ rpcName: 'transition_bl_status', args: {}, blId: 'a' });
      await enqueue({ rpcName: 'transition_bl_status', args: {}, blId: 'b' });
      await markFailed(a, 'INVALID_TRANSITION');
      expect(await countPending()).toBe(1);
      expect((await getFailed()).length).toBe(1);
    });

    it('preserves FIFO order in getPending', async () => {
      // enqueue 3 in quick succession ; createdAt should still be monotonic
      // (ms-precision) so the FIFO contract holds.
      const a = await enqueue({ rpcName: 'transition_bl_status', args: {}, blId: 'a' });
      // Force a 1 ms gap so timestamps differ even on fast machines.
      await new Promise((r) => setTimeout(r, 2));
      const b = await enqueue({ rpcName: 'transition_bl_status', args: {}, blId: 'b' });
      await new Promise((r) => setTimeout(r, 2));
      const c = await enqueue({ rpcName: 'transition_bl_status', args: {}, blId: 'c' });

      const ids = (await getPending()).map((m) => m.id);
      expect(ids).toEqual([a, b, c]);
    });
  });

  describe('markTransientFailure', () => {
    it('increments attempts and stays pending below the cap', async () => {
      const id = await enqueue({ rpcName: 'transition_bl_status', args: {}, blId: 'bl-1' });
      await markTransientFailure(id, 'NETWORK');
      const [row] = await getAll();
      expect(row.attempts).toBe(1);
      expect(row.status).toBe('pending');
      expect(row.lastError).toBe('NETWORK');
    });

    it('promotes to failed once attempts reach MAX_TRANSIENT_RETRIES', async () => {
      const id = await enqueue({ rpcName: 'transition_bl_status', args: {}, blId: 'bl-1' });
      for (let i = 0; i < MAX_TRANSIENT_RETRIES; i++) {
        await markTransientFailure(id, 'NETWORK');
      }
      const [row] = await getAll();
      expect(row.attempts).toBe(MAX_TRANSIENT_RETRIES);
      expect(row.status).toBe('failed');
    });
  });

  describe('extractErrorCode', () => {
    it('returns UNKNOWN for non-objects', () => {
      expect(extractErrorCode(null)).toBe('UNKNOWN');
      expect(extractErrorCode('boom')).toBe('UNKNOWN');
      expect(extractErrorCode(42)).toBe('UNKNOWN');
    });

    it('prefers err.code when present', () => {
      expect(extractErrorCode({ code: 'INVALID_TRANSITION' })).toBe(
        'INVALID_TRANSITION',
      );
    });

    it('parses err.message for our SQL exception codes', () => {
      expect(extractErrorCode({ message: 'BL_NOT_FOUND: foo' })).toBe(
        'BL_NOT_FOUND',
      );
      expect(extractErrorCode({ message: 'INVALID_TRANSITION' })).toBe(
        'INVALID_TRANSITION',
      );
    });

    it('classifies network-shaped errors as NETWORK', () => {
      expect(extractErrorCode(new TypeError('Failed to fetch'))).toBe('NETWORK');
    });
  });

  describe('replayAll', () => {
    it('drains a passing batch and dequeues every mutation', async () => {
      await enqueue({ rpcName: 'transition_bl_status', args: { a: 1 }, blId: 'a' });
      await enqueue({ rpcName: 'transition_bl_status', args: { b: 2 }, blId: 'b' });

      const seen: string[] = [];
      const executor = async (mut: { id: string }) => {
        seen.push(mut.id);
      };

      const result = await replayAll(executor);
      expect(result.success).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.retried).toBe(0);
      expect(seen).toHaveLength(2);
      expect(await countPending()).toBe(0);
    });

    it('marks permanent failures as failed and stops retrying', async () => {
      await enqueue({ rpcName: 'transition_bl_status', args: {}, blId: 'bl-1' });

      const executor = async () => {
        throw new Error('INVALID_TRANSITION');
      };

      const result = await replayAll(executor);
      expect(result.success).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.retried).toBe(0);

      const failed = await getFailed();
      expect(failed).toHaveLength(1);
      expect(failed[0].lastError).toBe('INVALID_TRANSITION');
    });

    it('treats network errors as transient and re-queues', async () => {
      await enqueue({ rpcName: 'transition_bl_status', args: {}, blId: 'bl-1' });

      const executor = async () => {
        throw new TypeError('Failed to fetch');
      };

      const result = await replayAll(executor);
      expect(result.success).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.retried).toBe(1);

      const [row] = await getAll();
      expect(row.status).toBe('pending');
      expect(row.attempts).toBe(1);
      expect(row.lastError).toBe('NETWORK');
    });

    it('blocks subsequent mutations for the same BL after a failure', async () => {
      // Two mutations for the same BL : the first fails permanently, the
      // second must be auto-failed with PRIOR_MUTATION_FAILED.
      await enqueue({ rpcName: 'transition_bl_status', args: { step: 1 }, blId: 'bl-1' });
      await new Promise((r) => setTimeout(r, 2));
      await enqueue({ rpcName: 'transition_bl_status', args: { step: 2 }, blId: 'bl-1' });

      let calls = 0;
      const executor = async () => {
        calls += 1;
        throw new Error('INVALID_TRANSITION');
      };

      const result = await replayAll(executor);
      expect(calls).toBe(1); // second mutation skipped, not executed
      expect(result.success).toBe(0);
      expect(result.failed).toBe(2);

      const failed = await getFailed();
      const codes = failed.map((m) => m.lastError).sort();
      expect(codes).toEqual(['INVALID_TRANSITION', 'PRIOR_MUTATION_FAILED']);
    });

    it('different BLs are independent — one failing does not block the other', async () => {
      await enqueue({ rpcName: 'transition_bl_status', args: {}, blId: 'bl-A' });
      await enqueue({ rpcName: 'transition_bl_status', args: {}, blId: 'bl-B' });

      const executor = async (mut: { blId?: string }) => {
        if (mut.blId === 'bl-A') throw new Error('INVALID_TRANSITION');
        // BL-B succeeds
      };

      const result = await replayAll(executor);
      expect(result.success).toBe(1);
      expect(result.failed).toBe(1);
      expect(await countPending()).toBe(0);
    });
  });
});
