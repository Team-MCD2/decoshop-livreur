/**
 * Types for the offline mutation queue (Phase 6 foundation).
 *
 * See `src/lib/offline-queue.ts` for the IndexedDB implementation and
 * `ADR-013` in `.project-store/decisions.md` for the architectural rationale.
 */

/**
 * RPC names that may be queued offline. Restricted on purpose : not every
 * mutation makes sense queued. As of the Phase 6 foundation, only
 * `transition_bl_status` is wired end-to-end. Adding new ones is a 3-step
 * change : (a) extend this union, (b) add a case to the executor in
 * `useOfflineQueue.replayMutation`, (c) wrap the relevant hook with
 * `enqueueIfOffline`.
 */
export type QueueableRpc =
  | 'transition_bl_status'
  | 'record_failed_attempt'   // reserved — not yet wired
  | 'submit_signature';        // reserved — driver-canvas path only

/**
 * Lifecycle status of a queued mutation.
 *
 *   pending  — waiting for the next online window (or first replay tick).
 *   syncing  — replay in progress ; mutation is locked.
 *   failed   — replay returned a permanent error (INVALID_TRANSITION,
 *              NOT_AUTHENTICATED, etc.). Will NOT be retried automatically.
 *              Surfaced to the driver via toast + a (future) queue inspector.
 */
export type QueuedMutationStatus = 'pending' | 'syncing' | 'failed';

/**
 * One row in the IndexedDB `mutations` store.
 *
 * `args` is the raw `p_*` object passed to `supabase.rpc(rpcName, args)`.
 * We keep it JSON-serialisable to survive IndexedDB serialisation.
 */
export interface QueuedMutation {
  /** UUID, generated client-side at enqueue time. */
  id: string;
  rpcName: QueueableRpc;
  args: Record<string, unknown>;
  /** ISO 8601 timestamp ; serves as the FIFO sort key. */
  createdAt: string;
  status: QueuedMutationStatus;
  /** Number of replay attempts (failed or transient). Starts at 0. */
  attempts: number;
  /** Last error code (e.g. INVALID_TRANSITION, NETWORK, NOT_AUTH). */
  lastError?: string;
  lastAttemptAt?: string;
  /**
   * Foreign key — what entity is this mutation about ? Used to short-circuit
   * subsequent mutations for the SAME BL when an earlier one fails
   * (otherwise we'd send `en_route → livre` after the `en_livraison →
   * en_route` already failed, which would compound the error).
   */
  blId?: string;
}

/** Outcome of a single replay batch. */
export interface ReplayResult {
  success: number;
  failed:  number;
  /** Transient errors — left as pending for the next replay. */
  retried: number;
  /** ISO 8601 timestamp of the replay. */
  finishedAt: string;
}

/**
 * Error codes considered permanent — replay should mark the mutation as
 * `failed` and stop retrying. Anything else is treated as transient.
 *
 * Keep in sync with `transitionErrorKey()` in `useBLDetail.ts` and the
 * mirror in `useFailure.ts`.
 */
export const PERMANENT_ERROR_CODES = [
  'INVALID_TRANSITION',
  'BL_NOT_ASSIGNED_TO_YOU',
  'BL_NOT_FOUND',
  'PROFILE_NOT_FOUND',
  'NOT_AUTHENTICATED',
  'MAX_ATTEMPTS_REACHED',  // failure-RPC specific
  'BL_INVALID_STATUS',      // failure-RPC specific
  'PRIOR_MUTATION_FAILED', // synthetic — set when an earlier queued mutation
                            // for the same BL failed, making this one moot.
] as const;

export type PermanentErrorCode = (typeof PERMANENT_ERROR_CODES)[number];

/** Maximum transient retries before a mutation is marked `failed`. */
export const MAX_TRANSIENT_RETRIES = 5;
