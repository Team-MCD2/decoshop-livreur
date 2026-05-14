/**
 * Offline mutation queue — Phase 6 foundation.
 *
 * Persists driver-issued mutations in IndexedDB so they survive a closed tab,
 * a reboot, or a multi-hour offline shift, and replays them in FIFO order
 * when connectivity returns.
 *
 * Design contract :
 *   - This module is PURE : no React, no Supabase. It deals with IndexedDB
 *     and one injected executor function. Trivially testable.
 *   - The owning hook (`useOfflineQueue` + the call sites in `useBLDetail`)
 *     is responsible for wiring (a) deciding when to enqueue, (b) translating
 *     `QueuedMutation → supabase.rpc(…)`, (c) showing UI feedback.
 *   - IndexedDB schema is versioned. Future migrations bump `DB_VERSION` and
 *     branch in `openQueueDB`'s `upgrade` callback.
 *
 * See ADR-013 for the broader rationale (window-thread replay vs SW-driven,
 * choice of `idb` wrapper, conflict handling).
 */
import { openDB, type IDBPDatabase } from 'idb';
import {
  type QueuedMutation,
  type QueueableRpc,
  type ReplayResult,
  PERMANENT_ERROR_CODES,
  MAX_TRANSIENT_RETRIES,
} from '@/types/queue';

const DB_NAME = 'decoshop-livreur-offline';
const DB_VERSION = 1;
const STORE = 'mutations';

let dbPromise: Promise<IDBPDatabase> | null = null;

/**
 * Open (or create) the IndexedDB database. Memoised — the second call returns
 * the same promise so the upgrade callback fires exactly once per page load.
 *
 * @internal — exported only for the test suite to reset between tests.
 */
export function openQueueDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // v1 : one object store keyed by `id` (UUID), indexed on createdAt
        // for FIFO replay and on status for fast `getPending` queries.
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('byCreatedAt', 'createdAt');
          store.createIndex('byStatus',    'status');
          store.createIndex('byBlId',      'blId');
        }
      },
    });
  }
  return dbPromise;
}

/**
 * Reset the singleton — exposed for tests that delete the DB between runs.
 * @internal
 */
export function _resetDBCache(): void {
  dbPromise = null;
}

/**
 * Generate a UUID v4 using the platform crypto. Falls back to a non-cryptographic
 * generator if `crypto.randomUUID` is unavailable (only happens in jsdom <23 or
 * older Android WebViews). The fallback is good enough for queue ids — they
 * don't need cryptographic strength, just uniqueness.
 */
function generateId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  // Fallback : 32 hex chars from Math.random. Acceptable for queue keys.
  return Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join('');
}

// -----------------------------------------------------------------------------
//                                 CRUD
// -----------------------------------------------------------------------------

/**
 * Add a mutation to the queue. Returns the generated id.
 *
 * The mutation is created with `status = 'pending'`, `attempts = 0`, and a
 * `createdAt` of `new Date().toISOString()`. The caller is responsible for
 * triggering a replay (typically `useOfflineQueue` does this on the next
 * `online` event).
 */
export async function enqueue(input: {
  rpcName: QueueableRpc;
  args: Record<string, unknown>;
  blId?: string;
}): Promise<string> {
  const id = generateId();
  const mutation: QueuedMutation = {
    id,
    rpcName: input.rpcName,
    args:    input.args,
    blId:    input.blId,
    createdAt: new Date().toISOString(),
    status:    'pending',
    attempts:  0,
  };
  const db = await openQueueDB();
  await db.add(STORE, mutation);
  return id;
}

/** Hard-delete a mutation. Called when replay succeeds. */
export async function dequeue(id: string): Promise<void> {
  const db = await openQueueDB();
  await db.delete(STORE, id);
}

/** Returns all mutations regardless of status, sorted FIFO by `createdAt`. */
export async function getAll(): Promise<QueuedMutation[]> {
  const db = await openQueueDB();
  return db.getAllFromIndex(STORE, 'byCreatedAt');
}

/** Returns only mutations with `status = 'pending'`, FIFO. */
export async function getPending(): Promise<QueuedMutation[]> {
  const all = await getAll();
  return all.filter((m) => m.status === 'pending');
}

/** Returns mutations with `status = 'failed'`. */
export async function getFailed(): Promise<QueuedMutation[]> {
  const all = await getAll();
  return all.filter((m) => m.status === 'failed');
}

/** Count of `pending` mutations — used by the offline banner. */
export async function countPending(): Promise<number> {
  const pending = await getPending();
  return pending.length;
}

/**
 * Update one mutation in-place. Internal helper for the lifecycle methods
 * below. We re-read the row first so concurrent writes (rare — IndexedDB
 * transactions serialise) don't clobber each other.
 */
async function patchMutation(
  id: string,
  patch: Partial<QueuedMutation>,
): Promise<void> {
  const db = await openQueueDB();
  const tx = db.transaction(STORE, 'readwrite');
  const existing = (await tx.store.get(id)) as QueuedMutation | undefined;
  if (!existing) {
    await tx.done;
    return;
  }
  await tx.store.put({ ...existing, ...patch });
  await tx.done;
}

export async function markSyncing(id: string): Promise<void> {
  await patchMutation(id, {
    status: 'syncing',
    lastAttemptAt: new Date().toISOString(),
  });
}

export async function markFailed(id: string, errorCode: string): Promise<void> {
  await patchMutation(id, {
    status: 'failed',
    lastError: errorCode,
    lastAttemptAt: new Date().toISOString(),
  });
}

/**
 * Increment attempts + leave as `pending` for the next replay tick. Used on
 * transient errors (network timeout, 5xx).
 */
export async function markTransientFailure(
  id: string,
  errorCode: string,
): Promise<void> {
  const db = await openQueueDB();
  const tx = db.transaction(STORE, 'readwrite');
  const existing = (await tx.store.get(id)) as QueuedMutation | undefined;
  if (!existing) {
    await tx.done;
    return;
  }
  const nextAttempts = existing.attempts + 1;
  const patched: QueuedMutation = {
    ...existing,
    attempts: nextAttempts,
    lastError: errorCode,
    lastAttemptAt: new Date().toISOString(),
    // Cap : promote to `failed` once we hit the retry ceiling.
    status: nextAttempts >= MAX_TRANSIENT_RETRIES ? 'failed' : 'pending',
  };
  await tx.store.put(patched);
  await tx.done;
}

/** Remove all entries — used by the (future) "Reset queue" admin action. */
export async function clearQueue(): Promise<void> {
  const db = await openQueueDB();
  await db.clear(STORE);
}

// -----------------------------------------------------------------------------
//                                Replay
// -----------------------------------------------------------------------------

/**
 * The shape the calling code provides to actually invoke the RPC for a given
 * queued mutation. Keeping this as DI (instead of importing supabase here)
 * makes the queue lib trivially testable without mocking Supabase.
 *
 * Implementations should THROW on failure. The error's `code` or `message`
 * is inspected against `PERMANENT_ERROR_CODES` to decide retry vs fail.
 */
export type RpcExecutor = (mutation: QueuedMutation) => Promise<void>;

/**
 * Inspect an error and return an uppercase error code. Looks at, in order :
 *   - `error.code` (PostgREST conventional shape)
 *   - `error.message` upper-cased (our RPCs raise `RAISE EXCEPTION 'CODE'`)
 *   - falls back to 'UNKNOWN'.
 */
export function extractErrorCode(err: unknown): string {
  if (typeof err !== 'object' || err === null) return 'UNKNOWN';
  const obj = err as { code?: unknown; message?: unknown };
  if (typeof obj.code === 'string' && obj.code.length > 0) {
    return obj.code.toUpperCase();
  }
  if (typeof obj.message === 'string' && obj.message.length > 0) {
    const upper = obj.message.toUpperCase();
    // The supabase-js TypeError on offline fetch has message "FAILED TO FETCH" or "NETWORK".
    if (upper.includes('FAILED TO FETCH') || upper.includes('NETWORKERROR')) {
      return 'NETWORK';
    }
    // Our PL/pgSQL exceptions are bare codes (BL_NOT_FOUND, INVALID_TRANSITION…).
    // Return the first whitespace-free token so we match them.
    const match = upper.match(/[A-Z_]{4,}/);
    if (match) return match[0];
  }
  return 'UNKNOWN';
}

function isPermanent(code: string): boolean {
  return (PERMANENT_ERROR_CODES as readonly string[]).includes(code);
}

/**
 * Drain the queue. Iterates pending mutations FIFO, invoking the executor for
 * each. Side-effects on the queue store :
 *   - success                      → `dequeue`
 *   - permanent error (or attempts saturated) → `markFailed`
 *   - transient error              → increment attempts, leave pending
 *
 * IMPORTANT : if a mutation for BL X fails (permanently OR transiently), ALL
 * subsequent queued mutations for the same BL X in this batch are treated as
 * having failed too (`PRIOR_MUTATION_FAILED`). This prevents trying to
 * `en_route → livre` after `en_livraison → en_route` already broke — that
 * second mutation would always return INVALID_TRANSITION against the
 * authoritative server state.
 *
 * The returned `ReplayResult` carries counts so the caller can show a toast.
 */
export async function replayAll(executor: RpcExecutor): Promise<ReplayResult> {
  const pending = await getPending();
  const result: ReplayResult = {
    success: 0,
    failed:  0,
    retried: 0,
    finishedAt: new Date().toISOString(),
  };
  const blockedBls = new Set<string>();

  for (const mut of pending) {
    // Short-circuit : a prior mutation for this BL failed this batch.
    if (mut.blId && blockedBls.has(mut.blId)) {
      await markFailed(mut.id, 'PRIOR_MUTATION_FAILED');
      result.failed += 1;
      continue;
    }

    await markSyncing(mut.id);
    try {
      await executor(mut);
      await dequeue(mut.id);
      result.success += 1;
    } catch (err) {
      const code = extractErrorCode(err);
      if (isPermanent(code) || mut.attempts + 1 >= MAX_TRANSIENT_RETRIES) {
        await markFailed(mut.id, code);
        if (mut.blId) blockedBls.add(mut.blId);
        result.failed += 1;
      } else {
        await markTransientFailure(mut.id, code);
        result.retried += 1;
      }
    }
  }

  result.finishedAt = new Date().toISOString();
  return result;
}
