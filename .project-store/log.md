# Project Log - decoshop-livreur

> Append-only. One entry per working session. Full detail.
> Cross-project summary lines go to `db_store/db.md` M09 LOG.

## D-2026-05-03  .project-store bootstrap
- context        : during the cross-project db.md refactor
                   session, the owner directed that each project
                   in the Microdidact family gets its own
                   .project-store/ per M08. decoshop-livreur is
                   the active project (owner's IDE focus).
- actions        :
  - created .project-store/ folder at project root.
  - seeded all 9 files per M08 schema: knowledge.md, log.md,
    blacklisted.md, discarded.md, boss-feedback.md,
    owner-feedback.md, roadmap.md, decisions.md, dossier.md.
  - populated knowledge.md with project-specific tips
    (role routing, PIN crypto, storage key, RTL, Supabase
    schema).
  - documented Phase 1 ✅ + Phases 2..10 in roadmap.md from
    README.
  - captured the empty-dashboard-for-non-livreur-roles issue in
    both knowledge.md open loops and roadmap.md Phase 2 notes.
- learnings      :
  - the `livreur` Postgres schema (vs `public`) is a project
    convention worth documenting in T-livreur-supabase-schema so
    new contributors don't default to `public`.
  - the `useTodayBLs` hook filters by `livreur_id` - this
    implicitly ties the Home dashboard to the livreur role and
    will need to branch when we implement vendeur_proprietaire
    UI.
- next session   : (a) read this store + db.md top to bottom
                   per new M01 PROTOCOL, (b) continue Phase 2
                   (liste BL + creneaux + auto-assignation) OR
                   pivot to whatever the owner prioritises.

## D-2026-05-13  Expert deep-dive + backend logic boost
- context        : owner asked for a zoomed-out expert analysis
                   of the platform "from the standpoint of the
                   zoomed-out expert you are". Then approved a
                   broad "proceed and really aim at boosting the
                   backend logic. we need something good."
- finding        : the README + my own .project-store/ dossier
                   under-sold reality. Actual maturity ~Phase
                   4.5 of 10, not Phase 1:
                     Phase 2 done (Home + KPIs + creneaux)
                     Phase 3 done (BLDetail + Mapbox lazy +
                       GPS RGPD-gated + throttle)
                     Phase 4 done (5 signature RPCs + anon
                       /sign/:token + parent toggle + countdown
                       + Resend email best-effort flag)
                     Phase 5 schema done, UI was a `disabled`
                       button until this session.
- backend (NEW) : sql/010_livreur_workflow_rpcs.sql (~900 lines):
                  1. `livreur.allowed_bl_transitions(from, role)`
                     — data-driven state machine, 17 statuses
                     covered, driver vs admin permissions.
                  2. `livreur.my_allowed_bl_transitions(from)` —
                     UI helper resolving caller's role.
                  3. `livreur.transition_bl_status(bl, to,
                     metadata?)` — authoritative RPC. Validates
                     transition, stamps date_livraison_effective
                     + date_signature, enriches the auto-logged
                     history row with rpc tag + metadata.
                  4. `livreur.record_failed_attempt(bl, motif,
                     comment, photo, lat, lng)` — palier T1/T2/
                     abandon, auto-bumps nb_tentatives (trigger
                     calcule frais), force-majeure motifs flip
                     admin_waiver→true (exonération frais),
                     writes to bl_attempt_log + JSONB
                     attempt_log + history + notif vendeur.
                  5. `livreur.get_driver_daily_kpis(date,
                     driver?)` — tiles for Performance.tsx with
                     signature_rate, success_rate, zero-filled.
                  6. `livreur.get_driver_period_score(from, to,
                     driver?)` — 30-day rolling scorecard +
                     avg_attempts_per_failed_bl + on_time_rate.
                  7. Auto-provisioning trigger
                     `on_auth_user_created_livreur` →
                     `public.handle_new_livreur_user()` inserts
                     a skeleton livreur.profiles row (role=
                     livreur, is_active=false). Search_path=''
                     per Supabase advisory. EXCEPTION/WARNING
                     wrapper so no signup is ever blocked.
                  8. Realtime publication: adds
                     livreur.bons_livraison + .notifications +
                     .signatures_electroniques to
                     supabase_realtime if not already.
                  + sql/010_livreur_workflow_rpcs_revert.sql.
- frontend (NEW) :
                  - `src/types/domain.ts`: typed AttemptEvent,
                    AssignmentEvent, StatusHistoryEvent (was
                    `unknown[]`); BL.attempt_log + assignment_log
                    now typed arrays.
                  - `src/hooks/useFailure.ts`: useRecordFailedAttempt
                    + useAllowedTransitions + FAILURE_REASONS const
                    + failureErrorKey i18n mapper. Best-effort
                    photo upload to `delivery-photos` bucket
                    (`<bl_id>/litige-<ts>.<ext>`).
                  - `src/components/bl/FailureReportModal.tsx`
                    (~330 lines): 3-step modal (reason picker
                    with force-majeure badge → details with
                    photo + GPS + comment → success card).
                    `capture="environment"` on the file input
                    so mobile defaults to rear camera.
                  - `src/components/bl/WorkflowActions.tsx`:
                    replaced `disabled` stub with active button
                    opening FailureReportModal. New props
                    `numeroBl`, `gpsLat`, `gpsLng` plumbed
                    from BLDetail.
                  - `src/hooks/useBLDetail.ts`: useUpdateBLStatus
                    migrated to call `transition_bl_status` RPC
                    (was a direct UPDATE). Added
                    `transitionErrorKey` i18n mapper.
                  - `src/components/ErrorBoundary.tsx` + 
                    `ErrorFallback.tsx`: root boundary class
                    catches uncaught render errors, friendly
                    French/Arabic fallback with reload button.
                    Verbose console log per db.md M06
                    (WHAT/WHERE/WHEN/CAUSE/STACK). Wired in
                    `src/App.tsx` wrapping <AppRoutes>.
                  - i18n: added `common.optional` +
                    `workflow.errors.*` + `failure.*` (54 keys)
                    + `errors.boundary.*` in FR and AR.
- infra (NEW)    : vercel.json now ships:
                   - HSTS (1 year + preload)
                   - X-Content-Type-Options: nosniff
                   - X-Frame-Options: DENY
                   - Referrer-Policy: strict-origin-when-cross-origin
                   - Permissions-Policy locked to geolocation +
                     camera self only; blocks payment / usb /
                     bluetooth / accelerometer / gyroscope /
                     interest-cohort.
                   - CSP enforced (not report-only):
                       default-src 'self'
                       script-src 'self' 'wasm-unsafe-eval'
                       connect-src self + *.supabase.co (https+wss)
                                  + api.mapbox.com + events.mapbox.com
                       worker-src 'self' blob:
                       frame-ancestors 'none'
                   - SPA rewrite tightened: now excludes /sw.js,
                     /workbox-*.js, /manifest.webmanifest,
                     /assets/*, /icons/*, image/font paths from
                     the index.html catch-all (prevents the SW
                     from being served as HTML on cache miss).
                   - Cache headers: SW gets max-age=0, assets
                     get 1y immutable, manifest follows default.
- verification   : `npm run typecheck` ✓ (0 errors)
                   `npm run lint`      ✓ (0 errors, ~7 pre-
                                          existing unused-disable
                                          warnings unrelated to
                                          this session)
                   `npm run test:run`  ✓ (114 passed / 13 files)
                   Build NOT run this session — typecheck +
                   tests cover the surface; owner can `npm run
                   build` to confirm bundling.
- type-gen note  : the new RPCs in 010 are NOT yet in
                   src/types/database.types.ts (auto-generated
                   from Supabase introspection). The 3 calls
                   carry `@ts-expect-error` directives with a
                   French comment pointing to the regen command:
                       npx supabase gen types typescript \
                         --project-id dzjebcipoqgjvxxmlcry \
                         > src/types/database.types.ts
                   Once the owner runs 010 in Studio + regenerates
                   types, those `@ts-expect-error` lines will
                   become build errors → forcing their removal.
                   This is intentional (the directive is
                   self-cleaning).
- deploy gate    : the migration must be applied to Supabase
                   BEFORE the next prod deploy of the PWA, or
                   the failure-path UI will surface
                   "BL_NOT_FOUND" errors at the RPC layer. Order:
                     1. Apply 010 via Supabase Studio SQL Editor
                     2. Re-run `npx supabase gen types typescript`
                     3. Remove the 3 `@ts-expect-error` lines
                     4. `npm run build` + `git push`
- learnings      :
                  - the existing `trg_log_bl_status_change`
                    AFTER trigger auto-inserts a row in
                    bl_status_history on every BL update. Our
                    RPCs ride on that trigger — we don't manually
                    INSERT — but we UPDATE the freshly-inserted
                    row to enrich `metadata` + tag `trigger_source
                    = 'rpc:<name>'`. The `clock_timestamp() >=
                    v_started_at` filter scopes to "this
                    statement's history row" without race.
                  - `trg_frais_relivraison` already computes 5%
                    re-livraison fee when nb_tentatives >= 1 AND
                    admin_waiver = false. Force-majeure handling
                    is therefore just `admin_waiver = admin_waiver
                    OR is_force_majeure` in the failure RPC — the
                    trigger does the rest. Single source of truth
                    for the fee formula.
                  - the `data:image/*` payload from the signature
                    canvas + the optional photo on the failure
                    modal are TWO different patterns: signatures
                    go inline as base64 to the
                    submit_signature RPC; failure photos go to
                    Storage with a path returned in the BL JSONB.
                    Worth documenting as a project tip.
                  - storing the lint output filter
                    (`Select-String -Pattern (error|warning|
                    problems)`) was the fastest way to see the
                    1 fatal error among 9 warnings on Windows
                    PowerShell (default 80-col truncation
                    mangled rule names).
- next session   : if owner approves, options ranked:
                   (A) Offline mode (Phase 6) — biggest gap.
                   (B) Performance dashboard UI binding the
                       new KPI RPCs (`Performance.tsx` is still
                       a stub).
                   (C) Sentry DSN wiring — error boundary
                       already calls console.error; one-line
                       swap to Sentry.captureException once
                       DSN env is set.
                   (D) E2E Playwright covering login →
                       BLDetail → failure path → success.
                   (E) Phase 7 push (VAPID + SW push handler).
                   Author leans (A) — drivers go offline daily.

## D-2026-05-14  Phase 6 foundation : offline mutation queue
- context        : owner picked option (A) — offline mode — from
                   the ranked list at the end of the 2026-05-13
                   entry. Realistic scope cap for one session :
                   ship the FOUNDATION with one mutation
                   (`transition_bl_status`) queued end-to-end as
                   proof of concept ; failure + signature
                   replay follow.
- deps added     : `idb@^8.0.0` (runtime, 5 KB gzipped IndexedDB
                   wrapper), `fake-indexeddb@^6.0.0` (devDep,
                   pure-JS IDB polyfill for vitest).
- new files      :
                   - `src/types/queue.ts` : `QueueableRpc` union
                     (transition_bl_status | record_failed_attempt
                     | submit_signature), `QueuedMutation`,
                     `QueuedMutationStatus`, `ReplayResult`,
                     `PERMANENT_ERROR_CODES`, `MAX_TRANSIENT_RETRIES`.
                   - `src/lib/offline-queue.ts` (~280 lines) : pure
                     IDB-backed queue. enqueue / dequeue / getAll /
                     getPending / getFailed / countPending /
                     markSyncing / markFailed / markTransientFailure
                     / clearQueue / replayAll / extractErrorCode.
                     `RpcExecutor` injected — no Supabase / React
                     imports.
                   - `src/hooks/useOnlineStatus.ts` : reactive
                     `navigator.onLine` hook (online/offline event
                     listeners + cleanup).
                   - `src/hooks/useOfflineQueue.ts` :
                     `usePendingMutationsCount()` (TanStack-backed,
                     5 s poll + invalidate-on-enqueue),
                     `useInvalidateQueueCount()`,
                     `useOfflineReplay({ onResult })` (root effect
                     draining on mount + every offline→online edge,
                     with concurrent-replay guard ref),
                     `queueExecutor` (switch on rpcName → supabase.rpc).
                   - `tests/unit/offline-queue.test.ts` : 15 tests
                     covering enqueue/dequeue, FIFO order,
                     transient-retry cap, permanent-failure path,
                     cross-BL blocking, error-code extraction.
- modified       :
                   - `src/hooks/useBLDetail.ts` :
                     `useUpdateBLStatus` now branches on
                     `navigator.onLine`. Online → existing RPC.
                     Offline → `enqueue({ rpcName, blId, args })`,
                     returns synthetic `TransitionResult` with
                     `queued: true`. Optimistic `onMutate` cache
                     patch + `onError` rollback added (works on
                     both paths). `onSuccess` replaced by `onSettled`
                     so invalidation fires regardless of online
                     status (silently fails when offline, fine).
                   - `src/App.tsx` : wired `useOfflineReplay({
                     onResult: (r) => console.info(...) })`.
                     Drains on mount AND every reconnect.
                   - `src/components/layout/OfflineBanner.tsx` :
                     replaced inline online-state logic with the
                     shared `useOnlineStatus` hook. Added live
                     pending-count line ("· N actions en attente").
                     Two-line layout with secondary subtitle. The
                     legacy `errors.offline` key is now obsolete on
                     this surface but kept in i18n for backward
                     compat.
                   - `tests/setup.ts` : `import 'fake-indexeddb/auto'`
                     at the top so all suites get a working IDB.
                   - `src/i18n/{fr,ar}.json` : new `offline.*`
                     namespace (10 keys) with i18next plural keys
                     (`queued_one` / `queued_other`).
- verification   : `npm run typecheck` ✓ 0 errors
                   `npm run lint` ✓ 0 new errors / 0 new warnings
                                    (6 pre-existing warnings still
                                     present, untouched)
                   `npm run test:run` ✓ 129 / 129 (was 114 ;
                                                 +15 offline-queue
                                                 tests, no
                                                 regressions)
- learnings      :
                   - i18next default pluralization picks `_one`
                     vs `_other` automatically when you pass
                     `count` ; calling `t('offline.queued', {
                     count: N })` is enough. No need for explicit
                     fallback chains.
                   - The pure-lib + DI-executor pattern made the
                     offline queue trivially testable — 15 tests
                     in ~280 lines of test code, no Supabase
                     mocking required. Worth replicating for the
                     other two queueable RPCs.
                   - Naming friction : the new `src/lib/offline-queue.ts`
                     is fine, but `src/hooks/useOfflineQueue.ts`
                     exports `useOfflineReplay` (root effect),
                     `usePendingMutationsCount` (the actual queue
                     count), and `queueExecutor` (DI shim). The
                     file does enough that splitting it into
                     `useOfflineReplay.ts` + `useOfflineQueue.ts`
                     could be cleaner. Deferred to a future
                     refactor.
                   - `fake-indexeddb/auto` is a zero-config
                     drop-in : one import line in setup.ts and
                     all `indexedDB.open(...)` calls resolve.
                     Highly recommended for any IDB-using test
                     suite.
- deploy note    : the offline foundation ships entirely in
                   client code. No new SQL, no Supabase
                   config changes, no env vars required. Safe
                   to deploy as-is.
- next session   : same ranked list from D-2026-05-13, minus
                   (A) Offline (now partially shipped). The
                   natural follow-up within Phase 6 is wiring
                   `record_failed_attempt` and the canvas-side
                   `submit_signature` into the queue's enqueue
                   sites (executor branches already exist).
                   But Phase 6 polish (failed-mutation
                   inspector UI, sync-success toast) and the
                   other lettered options (B/C/D/E) are all
                   viable. Author leans (B) Performance
                   dashboard next — visible win, KPI RPCs
                   currently unused.
