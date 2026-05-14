# Architecture Decision Records - decoshop-livreur

> Each decision is small, numbered, and dated. Record context,
> decision, consequences. Never rewrite a decision - if it is
> superseded, add a new one that references the old.


## ADR-001  PWA, not native mobile  [STATUS: active]
  - date         : 2026-early (pre-Phase 1)
  - context      : drivers carry personal Android phones
                   predominantly, some iPhones. We need fast
                   iteration on UX and cheap distribution.
                   Native apps require two signed builds, two
                   store submissions, and a higher barrier to
                   install.
  - decision     : build as a Progressive Web App with
                   vite-plugin-pwa (Workbox). Installable from
                   browser prompt, runs offline once Phase 6
                   lands.
  - consequences :
    (+) one codebase, one deploy, zero store friction.
    (+) updates propagate instantly on next network open.
    (-) iOS Safari PWA has known quirks (push notifications
        only from iOS 16.4+, no background GPS).
    (-) no deep OS integration (e.g. SIM-based identity).

## ADR-002  React 19 + Vite 6 + Tailwind 4  [STATUS: active]
  - date         : 2026-early
  - context      : starting a new project in 2026; team already
                   comfortable with React; owner values fast
                   DX and modern UX.
  - decision     : React 19 (useOptimistic, Actions) + Vite 6
                   (fast HMR) + Tailwind CSS 4 (CSS-first
                   config). TypeScript 5 strict.
  - consequences :
    (+) latest ergonomics; fast builds; small bundles.
    (+) Tailwind 4 beta stable enough for a new project (no
        migration cost).
    (-) Tailwind 4 is still `beta.5` in package.json - pin
        and follow release notes; plan a bump to stable post-
        GA.
    (-) React 19 strict concurrent behaviours might surface
        effects that Phase 1 tests missed.

## ADR-003  Supabase for Auth + Postgres + Realtime + Storage  [STATUS: active]
  - date         : 2026-early
  - context      : backend needs auth, DB, realtime updates for
                   driver dashboards, file storage for proofs
                   of delivery, and Edge Functions for SMS /
                   push dispatch. Team has Supabase experience.
  - decision     : Supabase as the single backend. `livreur`
                   Postgres schema for this app; cross-app
                   shared data in `public` or dedicated shared
                   schemas.
  - consequences :
    (+) one control plane for auth + db + realtime + storage.
    (+) RLS policies keep data access tight even if client
        is compromised.
    (-) vendor lock-in (mitigated: Postgres is portable; the
        Supabase client can be swapped for raw postgres +
        own realtime stack if needed).

## ADR-004  `livreur` Postgres schema, not `public`  [STATUS: active]
  - date         : 2026-early
  - context      : the `inventaire_decoshop/` family has several
                   apps sharing one Supabase project. Putting
                   every app's tables in `public` courts
                   naming collisions.
  - decision     : each app owns a dedicated schema. This app
                   uses `livreur`. Cross-app data lives in
                   `public` (rare) or a shared schema.
  - consequences :
    (+) clean boundaries; grepping for `livreur.*` returns
        this app's surface.
    (+) RLS + functions namespaced (e.g.
        `livreur.is_admin_or_vendeur()`).
    (-) Supabase client calls must set the schema explicitly
        where needed; adds a small config surface.

## ADR-005  Local PIN (SHA-256 + salt) on top of Supabase Auth  [STATUS: active]
  - date         : 2026-early
  - context      : drivers use shared or personal phones.
                   Re-logging into Supabase on every app open
                   is too much friction; persistent sessions
                   without a lock are a theft risk.
  - decision     : Supabase Auth for initial login; a 4-6
                   digit PIN encrypted with SHA-256 (10k rounds)
                   + device-unique salt, stored in localStorage,
                   gates every reopen / unlock.
  - consequences :
    (+) driver opens app, taps PIN, working in < 3 seconds.
    (+) phone theft: attacker has ~10^6 PIN combinations to
        brute-force; salt prevents rainbow tables.
    (-) losing the device means losing the salt; requires
        fresh login. Documented in the unlock flow.
    (-) PIN is NOT a real second factor; it is a lock, not
        cryptographic identity.

## ADR-006  Namespaced Supabase `storageKey`  [STATUS: active]
  - date         : 2026-early
  - context      : several DecoShop apps can be opened on the
                   same origin (or on the same device). Default
                   Supabase `storageKey` is `supabase.auth.token`
                   for all of them - sessions overwrite each
                   other.
  - decision     : each app sets a unique `storageKey` in
                   `createClient(..., { auth: { storageKey:
                   'decoshop-livreur-auth' } })`.
  - consequences :
    (+) no cross-app session collision.
    (-) if we ever want SSO across DecoShop apps, we need a
        shared session layer (cookie, or broadcast channel).


## ADR-007  Factual correction of ADR-005 PIN crypto  [STATUS: active, supersedes facts in ADR-005]
  - date         : 2026-05-13
  - context      : ADR-005 above states the PIN uses "SHA-256
                   with 10 000 rounds". Reading
                   `src/lib/pin-crypto.ts` directly shows that
                   was wrong — the actual implementation is
                   strictly stronger.
  - decision     : record the truth here, leave ADR-005 in place
                   (per the never-overwrite rule) but flag it as
                   factually superseded by this ADR.
  - actual impl  :
                   • PBKDF2-HMAC-SHA-256, not raw SHA-256.
                   • 100 000 iterations (= NIST SP 800-132
                     baseline), not 10 000.
                   • 16-byte salt from crypto.getRandomValues().
                   • Output: 256-bit derived key, hex-encoded.
                   • Verification uses constant-time compare via
                     bitwise-XOR loop (timing-attack resistant).
                   • InsecureContextError raised when
                     crypto.subtle is unavailable (HTTP on a
                     private IP) — UI gates setup/verify behind
                     `isCryptoAvailable()`.
                   • Mirror column `livreur.profiles.pin_hash`
                     exists but cross-device sync is deferred
                     (PIN is currently device-bound).
  - consequences :
    (+) defense-in-depth aligned with current OWASP guidance.
    (+) constant-time compare closes a real timing-attack
        vector that 10 000 SHA-256 + plain `===` would leave
        open.
    (-) PBKDF2 100k on a low-end Android takes ~50–80 ms; UX
        accepts this latency on PIN unlock.

## ADR-008  Authoritative BL state machine in PostgreSQL  [STATUS: active]
  - date         : 2026-05-13
  - context      : before today, BL status transitions were
                   issued from the PWA via plain `UPDATE
                   bons_livraison SET statut = ?`. RLS gated the
                   row but nothing validated WHICH transitions
                   are legal. A buggy or compromised client
                   could move `cree → signe` directly, bypassing
                   the whole workflow.
  - decision     : the state machine lives in SQL. RPC
                   `livreur.transition_bl_status(bl_id, to,
                   metadata?)` validates each transition against
                   `livreur.allowed_bl_transitions(from, role)`
                   before writing. The front-end calls this RPC
                   instead of UPDATE.
  - consequences :
    (+) single source of truth — UI + back-office + future
        admin tools all converge on the same allowed-transitions
        function.
    (+) metadata enrichment of `bl_status_history.metadata`
        gives admins a free audit trail of WHO / WHY for each
        move.
    (+) RLS policy on bons_livraison still applies (defense in
        depth) — even if RPC is called, the row must match.
    (-) front-end `useBLDetail.nextWorkflowStatus()` now
        duplicates a sliver of the SQL state machine. Optional
        future: replace it with `useAllowedTransitions(status)`
        (RPC-backed) for a single source of truth across layers.
    (-) tighter coupling: every new status or transition
        requires both a migration AND a deploy.

## ADR-009  Failure-path palier T1 / T2 / abandon with force-majeure exemption  [STATUS: active]
  - date         : 2026-05-13
  - context      : RG-241 (delivery rulebook) defines a 3-step
                   escalation: 1st failure → echec_T1 with a 5%
                   re-livraison fee on a retry; 2nd failure →
                   echec_T2 with a bigger fee; 3rd failure →
                   abandon. The fee model already lives in
                   `trg_frais_relivraison` (sql/004) which keys
                   off `nb_tentatives` + `admin_waiver`.
  - decision     : `livreur.record_failed_attempt()` (sql/010
                   §3) bumps `nb_tentatives`, transitions
                   status, and decides force-majeure waiver:
                     meteo, panne_vehicule, articles_endommages,
                     colis_perdu → set admin_waiver=true
                     client_absent, client_refuse,
                     adresse_introuvable, autre → keep waiver
                                                  as-is (defaults
                                                  false → 5%
                                                  fee triggers)
                   The trigger does the fee math; the RPC just
                   sets the waiver flag.
  - consequences :
    (+) clear policy doc embedded in the SQL comment + i18n
        labels surfaced in the FailureReportModal.
    (+) admin can still flip waiver back to false manually if
        a force-majeure claim is later challenged.
    (+) the failure event JSON in `bl_attempt_log` + the
        in-row `attempt_log[]` carry the motif so finance can
        reconcile.
    (-) the 4 force-majeure motifs are hardcoded in the RPC
        (and mirrored in the front-end FAILURE_REASONS const).
        Future: lift to a `livreur.failure_policy` table if
        the list grows beyond a handful.

## ADR-010  Strict CSP + full security headers on Vercel  [STATUS: active]
  - date         : 2026-05-13
  - context      : `vercel.json` shipped only an SPA rewrite —
                   no HSTS, no CSP, no X-Frame-Options, no
                   Permissions-Policy. A serious gap for a PWA
                   handling driver auth, GPS, and customer
                   signatures.
  - decision     : ship the canonical web baseline (see db.md
                   W04.12 SECURITY). CSP is enforced (NOT
                   report-only) because we have no Sentry DSN
                   wired yet — report-only without a sink is
                   noise.
  - allowlist    :
                   default-src 'self'
                   script-src 'self' 'wasm-unsafe-eval'
                     (Mapbox 3.x needs wasm-unsafe-eval but
                      not unsafe-eval; verified mapbox-gl v3
                      release notes.)
                   style-src 'self' 'unsafe-inline'
                     (Tailwind 4 inlines styles via vite-plugin
                      — strict-dynamic / hashes deferred.)
                   img-src 'self' data: blob: *.mapbox.com
                     *.supabase.co (signed URLs from Storage)
                   font-src 'self' fonts.gstatic.com data:
                   connect-src 'self' *.supabase.co (https +
                     wss for realtime) api.mapbox.com
                     events.mapbox.com
                   worker-src 'self' blob: (Workbox + Mapbox
                     worker chunks)
                   frame-ancestors 'none'  (X-Frame-Options
                     mirror for older browsers)
                   object-src 'none', base-uri 'self',
                   form-action 'self', upgrade-insecure-requests
  - consequences :
    (+) clickjacking + MIME-sniff + mixed-content vectors
        closed.
    (+) Permissions-Policy gates camera + geolocation to
        `self`; blocks payment / bluetooth / usb that we never
        use.
    (-) tighter CSP means any future 3rd-party script (Stripe,
        Intercom, GA4) requires a deliberate add to the
        allowlist + an ADR.
    (-) if we later add Sentry, the CSP needs
        `connect-src ... *.ingest.sentry.io` + a `report-uri`.

## ADR-011  Root ErrorBoundary with verbose `db.md M06` logs  [STATUS: active]
  - date         : 2026-05-13
  - context      : an uncaught render error in any sub-tree
                   produced a blank white screen mid-delivery
                   for the driver. Worst possible UX.
  - decision     : wrap `<AppRoutes/>` in a class-based
                   `<ErrorBoundary scope="root">` that renders
                   a friendly French/Arabic fallback (home +
                   reload buttons) and logs the verbose
                   `WHAT/WHERE/WHEN/INPUT/STATE/CAUSE/HINT`
                   shape from db.md M06 to the console. Sentry
                   swap is a one-liner when DSN is configured.
  - consequences :
    (+) the worst-case is now "broken card with reload
        button" instead of "the app is dead".
    (+) the structured error shape is grep-friendly in
        production logs once Sentry / Logtail / equivalent is
        wired.
    (-) the boundary only catches RENDER errors. Async
        errors (event handlers, promise rejections) still need
        per-call try/catch + i18n error mapping. Documented
        as a known limitation.

## ADR-012  Auto-provisioning trigger on `auth.users` insert  [STATUS: active]
  - date         : 2026-05-13
  - context      : creating a new auth user (Studio "Add user"
                   or app signup) used to leave RLS blocking
                   every read until an admin manually inserted
                   the matching `livreur.profiles` row. Pure
                   ops drag, frequent source of "I can log in
                   but see nothing" tickets.
  - decision     : `public.handle_new_livreur_user()` SECURITY
                   DEFINER trigger fires AFTER INSERT on
                   `auth.users`, inserting a skeleton
                   `livreur.profiles` (role=livreur,
                   is_active=false, language defaulted from
                   metadata or 'fr'). Admin still must flip
                   `is_active=true` before the user can
                   transact (RLS helpers gate on is_active).
  - consequences :
    (+) zero-touch onboarding step; profile row exists from
        second 1.
    (+) defaults to is_active=false → no privilege escalation
        even if RLS or roles drift.
    (+) `search_path = ''` + fully-qualified inserts per the
        Supabase advisory; EXCEPTION/WARNING wrapper so a
        malformed metadata payload can NEVER block a signup.
    (-) the trigger lives in `public` schema (not `livreur`)
        because `auth.users` is owned by `supabase_auth_admin`
        and the standard Supabase pattern lives in public. The
        revert script handles cleanup correctly.

## ADR-013  Phase 6 offline queue : IndexedDB + window-thread replay  [STATUS: active]
  - date         : 2026-05-14
  - context      : drivers run multi-hour shifts in dead zones
                   (basements, rural detours, underground parkings).
                   Before this session, every workflow action was
                   online-only ; a transient outage during a delivery
                   meant the driver couldn't mark anything as
                   delivered until reconnection — and the state would
                   be lost if they happened to close the tab.
  - decision     :
                   • Persistence : IndexedDB via the `idb` wrapper
                     (5 KB gzipped, zero deps, well-maintained). Single
                     object store `mutations`, keyed by UUID, indexed
                     on `createdAt` (FIFO), `status`, `blId`.
                   • Replay strategy : WINDOW-thread, fired by the
                     `online` event from `navigator`. NOT Workbox
                     Background Sync. Rationale : supabase-js session
                     lives in localStorage which the SW context cannot
                     access without a custom message-passing dance ;
                     postponing that complexity to a future ADR.
                   • Executor : dependency-injected callback
                     (`RpcExecutor`). The queue lib in
                     `src/lib/offline-queue.ts` is pure (no Supabase /
                     React imports) — trivially testable. Wiring lives
                     in `src/hooks/useOfflineQueue.ts`.
                   • FIFO with cross-BL blocking : when one mutation
                     for BL X fails permanently, ALL subsequent
                     mutations for the same BL X in the same replay
                     batch are auto-failed with
                     `PRIOR_MUTATION_FAILED`. Stops cascade-retry
                     loops where step 2 always returns
                     `INVALID_TRANSITION` against the state machine
                     because step 1 never landed.
                   • Permanent failure list (no retry) :
                     INVALID_TRANSITION, BL_NOT_ASSIGNED_TO_YOU,
                     BL_NOT_FOUND, PROFILE_NOT_FOUND,
                     NOT_AUTHENTICATED, MAX_ATTEMPTS_REACHED,
                     BL_INVALID_STATUS, PRIOR_MUTATION_FAILED.
                     Everything else is transient → up to 5 retries
                     before promotion to `failed`.
                   • Optimistic UI : standard TanStack pattern
                     (`onMutate` snapshots + patches cache, `onError`
                     rolls back, `onSettled` invalidates). Online and
                     offline paths share this code — only the
                     `mutationFn` body branches.
  - scope (v1)   :
                   • End-to-end : `transition_bl_status` only.
                   • Reserved (typed in `QueueableRpc` but not yet
                     wired at the enqueue site) :
                     `record_failed_attempt`, `submit_signature`
                     (driver-canvas path only — the anon `/sign/:token`
                     page is online-only by definition).
                   • No queue-inspector UI for failed mutations yet ;
                     driver only sees the `pending` count in the
                     OfflineBanner. Failed mutations live in IDB until
                     the (future) inspector lets them be retried or
                     dismissed.
  - consequences :
    (+) drivers can mark BLs through their statuses entirely
        offline ; actions sync transparently on reconnect.
    (+) tab close survival : mutations live in IndexedDB, not
        memory ; a full app restart still replays them.
    (+) pure queue lib + DI executor = 15 unit tests covering
        enqueue, dequeue, replay, retry cap, cross-BL blocking,
        error code extraction. Pattern reusable for the other two
        RPCs when we wire them.
    (-) closed-tab AND background sync are NOT supported yet ; the
        replay runs only when the tab is at least active in the
        foreground. Future : SW-driven sync with a session bridge.
    (-) no conflict-resolution UI : if the server state moved out
        from under a queued mutation, the user sees a "sync
        failed" log line but no surfaced toast yet. Future work.
    (-) only `transition_bl_status` actually USES the queue in
        v1. The other two are wired in the executor but not yet
        called from `useFailure` / `useSignature`. Intentional
        scope-cap for this session.

## ADR template (for future decisions)
    ## ADR-NNN  <title>  [STATUS: active | superseded by ADR-0NN]
      - date         : YYYY-MM-DD
      - context      : why we faced this choice
      - decision     : what we chose
      - consequences : positive / negative / tradeoffs
      - research     : (for library picks) W04.14 axes scores
                       + sources consulted; see T-lib-adopt-gates.
