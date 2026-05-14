# Roadmap - decoshop-livreur

> Phased plan. Each phase has status, definition-of-done, and
> the next deploy gate. Cascade works EXTENSIVELY and
> AUTONOMOUSLY on phase items per db.md M05 step 5.
>
> Source: initial phases inherited from README.md; to be
> refined with the owner on each phase kickoff.

## Phase 1 - Scaffold, auth, PIN, layout, i18n, tests
  - status    : done
  - dod       : project boots on `npm run dev`; login + PIN
                flow works; FR/AR i18n switch renders correctly;
                `npm run check` passes (lint + typecheck + build
                + tests); initial unit tests for pin-crypto,
                Button, i18n pass.
  - verified  : 2026-04 (per README badge)
  - artefacts : src/lib/pin-crypto.ts, src/stores/authStore.ts,
                src/components/layout/*, src/i18n/*, tests/

## Phase 2 - Liste BL + creneaux + auto-assignation
  - status    : planned (next)
  - dod       : livreur Home renders today's BLs grouped by
                creneau (time slot); auto-assignation rule spec'd
                and runs on new BLs; filtering works; realtime
                updates on insert/update visible within <2s.
  - hooks     : useTodayBLs, useBLsRealtime (already scaffolded).
  - blockers  : none known.

## Phase 3 - Detail BL + Mapbox + tracking GPS live
  - status    : planned
  - dod       : tapping a BL opens detail page with address,
                contact, items; Mapbox map shows route from
                current position to destination; GPS live
                position updates every 10-30 s (privacy gated).
  - risk      : Mapbox imports `window` at load -> SSR guard
                not needed (SPA), but code-split the map chunk
                to keep the Home bundle small.
  - deps      : mapbox-gl (already in package.json).

## Phase 4 - Workflow livraison + signature 10 min
  - status    : planned
  - dod       : driver can mark BL as delivered; collects
                customer signature on canvas (or photo); upload
                proof-of-delivery to Supabase Storage; BL
                transitions to `delivered` (append-only event).

## Phase 5 - Echec / re-livraison / paliers tentatives
  - status    : planned
  - dod       : driver can mark a BL as failed with reason
                (client absent, refus, wrong address, etc.);
                escalation tiers (1st fail -> retry today;
                2nd fail -> reschedule; 3rd fail -> return to
                warehouse). Audit trail preserved.

## Phase 6 - Offline (Workbox + IndexedDB + Background Sync)
  - status    : planned
  - dod       : app runs with no network; signatures + photos
                queue in IndexedDB; Background Sync flushes
                queue when online; UI surfaces "offline - will
                sync" state.
  - reference : db.md W04.7 PWA, S04.6 OFFLINE.

## Phase 7 - Push notifications (Web Push API)
  - status    : planned
  - dod       : driver receives push on new BL assignment,
                cancellation, urgent status change; Supabase
                Edge Function dispatches pushes; permission
                prompt at moment-of-value (not app start).

## Phase 8 - KPI dashboard + gamification
  - status    : planned
  - dod       : driver sees daily / weekly delivery count,
                on-time %, average delivery time; gentle
                gamification (badges, streaks) without shaming.

## Phase 9 - i18n FR/AR polish + a11y
  - status    : planned
  - dod       : full translation parity FR<->AR (automated
                test passes); keyboard navigation complete;
                screen reader labels on all interactive
                elements; axe-core audit clean.

## Phase 10 - E2E Playwright + Lighthouse + deploy v1.0.0
  - status    : planned
  - dod       : Playwright e2e covers login -> home -> BL
                detail -> mark delivered -> signature; Lighthouse
                mobile score >= 90 all categories; production
                tag v1.0.0 deployed to Vercel with rollback
                verified.
  - deploy    : see dossier.md Section 5 DEPLOYMENT RUNBOOK.


## Cross-phase open loops (track here, resolve in appropriate phase)
- `vendeur_proprietaire` role dashboard branching (Phase 2 or 8).
- Multi-company / multi-warehouse support (beyond v1.0.0).
- Currency / locale beyond FR (EUR) / MA (MAD) if expansion.
- Privacy: what GPS history to retain and for how long.


## Status update 2026-05-13  (post deep-dive + backend boost session)

The Phase 1 ✅ + Phase 2..10 planned tagging above reflects the
state inherited from the README. Direct code reading shows
considerable progress NOT captured there. This section is the
authoritative status as of 2026-05-13. The phase blocks above are
preserved (per never-overwrite) — read them in conjunction with
this update.

### Phase 2 — Liste BL + creneaux + auto-assignation
- actual status : **done**
- evidence      :
  - `src/routes/protected/Home.tsx` renders today's BLs grouped
    by créneau (matin / apres_midi / soir / sans_creneau).
  - `src/hooks/useBLs.ts` exposes `useTodayBLs`, `useUpcomingBLs`,
    `computeTodayKpis`, `groupByCreneau`, `useRequestRelease`.
  - `src/hooks/useBLsRealtime.ts` subscribes to `livreur.*` with
    `livreur_id=eq.<uid>` filter; sql/010 §7 now also wires the
    realtime publication so events actually fire.
  - `sql/004` provides `livreur.auto_assign_livreur(date)` —
    least-loaded driver with weekly_schedule support. Already in
    place, just not yet invoked by any automation (Edge Function
    or Shopify webhook would be the trigger — pending).
- residual      : auto-assign is NOT yet plugged into a trigger.
                  Phase 2 is functionally done from the driver's
                  perspective; the operations side still issues
                  assignments manually via Studio.

### Phase 3 — Detail BL + Mapbox + tracking GPS live
- actual status : **done**
- evidence      :
  - `src/routes/protected/BLDetail.tsx` renders header, status
    timeline, contact bar, lazy Mapbox component, articles list,
    workflow CTA, signature CTA.
  - `src/components/bl/BLMap.tsx` (~7 KB) loaded via React.lazy
    so the Mapbox 1.8 MB chunk only ships on first BL open.
  - `src/hooks/useGeolocation.ts` (`navigator.geolocation`
    wrapper with watch/single fix + permission state).
  - `src/hooks/useGPSTracking.ts` enables `watchPosition` only
    when `bl.statut === 'en_route'` (RGPD §12), throttled to
    min 30 s OR min 25 m of movement (Haversine).
  - `livreur.purge_old_driver_locations()` + pg_cron 03:00 UTC
    handle the 30-day GPS retention.

### Phase 4 — Workflow livraison + signature 10 min
- actual status : **done**
- evidence      :
  - 5 RPCs in `sql/006`: request_signature, submit_signature,
    get_signature_public, expire_pending_signatures (pg_cron
    every minute), invalidate_signature.
  - `sql/008` adds the optional-email variant.
  - `src/routes/public/Sign.tsx` is a polished anonymous-client
    page with parent-for-minor toggle + countdown + RTL.
  - `src/components/bl/SignatureModal.tsx` driver-side: link
    sharing (Web Share API + clipboard fallback) AND on-device
    canvas signing.
  - Edge Function `send-signature-email` exists but is feature-
    flagged off since the 2026-04-30 consolidation
    (`VITE_ENABLE_SIGNATURE_EMAIL`). Driver can copy-paste the
    link manually until Resend is re-deployed on the
    consolidated project.

### Phase 5 — Echec / re-livraison / paliers tentatives
- actual status : **done** (this session)
- evidence      :
  - DB: `livreur.record_failed_attempt()` RPC in sql/010 §3.
  - DB: state machine RPCs in sql/010 §1–2 cover all
    echec_T1 / T2 / abandon / retour transitions.
  - UI: `src/components/bl/FailureReportModal.tsx` — reason
    picker (8 motifs) + comment + photo upload (best-effort
    to `delivery-photos` bucket) + GPS capture + success card.
  - UI: `WorkflowActions.tsx` no longer renders a `disabled`
    stub — the failure CTA is live during en_route /
    en_livraison / echec_T1 retry.
  - Frais: existing `trg_frais_relivraison` calcule 5%. Force-
    majeure motifs (meteo, panne_vehicule, articles_endommages,
    colis_perdu) flip `admin_waiver` to true so the trigger
    computes 0€.
- residual      : the `retour_planifie → retour_en_cours →
                  retour_collecte` UI is not yet exposed; admin
                  must transition manually via the state-machine
                  RPC. Acceptable for v1.0.

### Phase 6 — Offline (Workbox + IndexedDB + Background Sync)
- actual status : **partial — foundation shipped 2026-05-14**
- evidence      :
  - `src/lib/offline-queue.ts` : pure IDB queue (15 unit tests).
  - `src/hooks/useOfflineQueue.ts` : `useOfflineReplay`,
    `usePendingMutationsCount`, `queueExecutor`.
  - `src/hooks/useOnlineStatus.ts` : reactive `navigator.onLine`.
  - `src/hooks/useBLDetail.ts → useUpdateBLStatus` : branches
    online vs offline, optimistic UI patch, enqueues on offline.
  - `src/components/layout/OfflineBanner.tsx` : shows pending
    count when offline.
  - `src/App.tsx` : `useOfflineReplay()` drains on mount + every
    reconnect.
  - i18n `offline.*` namespace (FR + AR), 10 keys.
  - ADR-013 records the architecture (window-thread replay over
    SW Background Sync, `idb` wrapper, FIFO + cross-BL block).
- residual      :
  - Only `transition_bl_status` wired end-to-end. The other two
    queueable RPCs (`record_failed_attempt`, `submit_signature`)
    have executor branches but their hooks don't enqueue yet.
  - No queue-inspector UI for `failed` mutations ; driver only
    sees the pending count, not retry/dismiss controls.
  - No sync-success toast on reconnect (results land in console
    only).
  - Closed-tab + SW-driven background sync NOT supported ;
    replay runs only when the tab is in the foreground.

### Phase 7 — Push notifications (Web Push API)
- actual status : **not started**
- schema-ready  : `livreur.push_subscriptions` table exists;
                  `profiles.push_subscription` column exists;
                  envelopes for `bl_signed`,
                  `bl_signature_expired`, `bl_attempt_failed`
                  are already inserted into
                  `livreur.notifications` by sql/006 + sql/010.
                  Just need the VAPID setup + Edge Function fan-
                  out from `livreur.notifications`.

### Phase 8 — KPI dashboard + gamification
- actual status : **partial** — backend done, UI is a stub
- evidence      :
  - DB: `livreur.get_driver_daily_kpis(date, driver?)` +
    `livreur.get_driver_period_score(from, to, driver?)`
    RPCs in sql/010 §4–5. Caller-scoped, role-gated.
  - UI: `src/routes/protected/Performance.tsx` still renders
    a "Phase 8" placeholder card. ~1 day of work to bind the
    RPCs to KPI tiles.

### Phase 9 — i18n FR/AR polish + a11y
- actual status : **partial** — translation parity is high,
                  a11y baseline is good, formal axe-core /
                  Lighthouse pass deferred.
- evidence      : 4 fresh `failure.*` namespaces shipped this
                  session with full AR mirrors; `workflow.errors`
                  + `errors.boundary` likewise. RTL works via
                  `<html dir="rtl">` + Tailwind logical utilities.

### Phase 10 — E2E Playwright + Lighthouse + v1.0.0
- actual status : **not started**
- deps          : Phase 6 (offline) should land first so e2e
                  covers the offline replay path too.

### Newly identified gaps (not in the original Phase 1..10 plan)

#### G-001  Security headers + CSP on Vercel  [STATUS: done 2026-05-13]
The original `vercel.json` was an SPA rewrite only. ADR-010
records the rationale; the file now ships the full canonical
header set + an enforced CSP.

#### G-002  Root ErrorBoundary  [STATUS: done 2026-05-13]
`<ErrorBoundary scope="root">` wraps `<AppRoutes/>`. ADR-011.

#### G-003  Re-generate `database.types.ts` after sql/010 deploy
The RPCs in sql/010 are NOT yet in the generated types file.
Three call sites carry `@ts-expect-error` directives that will
become build errors once types are regenerated — by design.
Owner action: `npx supabase gen types typescript
--project-id dzjebcipoqgjvxxmlcry > src/types/database.types.ts`
then remove the 3 directives.

#### G-004  Sentry / Logtail / equivalent error sink
Currently the ErrorBoundary + a handful of `console.warn` are the
only error surfacing. ADR-011 explicitly notes the Sentry
captureException swap is a one-liner once DSN is wired. Tied to
Phase 10 (we want this BEFORE v1.0.0 ships).

#### G-005  Tailwind 4 still beta in production
Pinned to `4.0.0-beta.5`. Either pin EXACT + accept the risk
(ADR needed) or wait for stable. Owner decision.

#### G-006  Service-worker update prompt UX
`autoUpdate` + `skipWaiting` + `clientsClaim` are set without
a `controllerchange` handler. Drivers can theoretically see a
mid-session SW swap. Should add a `useRegisterSW` toast.
Small ticket, ~3 h.

#### G-007  `/forgot-password` link is a dead `e.preventDefault()`
At `src/routes/auth/Login.tsx:127`. Either route to a Supabase
magic-link reset page or remove the link. Small ticket.
