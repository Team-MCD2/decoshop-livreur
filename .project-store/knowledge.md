# Project Knowledge - decoshop-livreur

> Source of truth for THIS project's tips, conventions, and
> project-scoped lessons. Distilled insight that generalises
> beyond this project gets PROMOTED to db.md (W04/W06 or S04/S06).

This PWA is a driver-facing tool for DecoShop Toulouse. It is
ONE of several apps in the `inventaire_decoshop/` family
(decoshop-v3, decoshop-plan, decoshop-plan-v2, etc.). Shared
Supabase backend; project-specific UI + data queries.

See also:
- `db_store/db.md` W04.13.F DELIVERY / LOGISTICS (cross-project
  recipe this project embodies).
- `db_store/db.md` W04.7 PWA, W04.8 SUPABASE (canonical tips
  this project uses).


## Conventions

- **UI language**: French by default, Arabic (RTL) toggleable.
  All strings live in `src/i18n/fr.json` + `ar.json`. No
  hardcoded UI strings anywhere.
- **Colour / typography**: imported from `decoshop-v3` to keep
  brand continuity across the family. Tokens: `navy` (#1E3A8A),
  `yellow` (#FACC15), `cream` (#FAF7F0), `ink` (#0F172A). Fonts:
  Playfair Display (display) + DM Sans (body) + Tajawal (AR).
- **Component primitives**: `src/components/ui/` for atoms
  (Button, Card, Input, Badge), `src/components/layout/` for
  AppLayout / Sidebar / BottomNav / Header.
- **Data layer**: TanStack Query for server state, Zustand for
  client-only (auth, settings). Never mix.
- **Forms**: React Hook Form + Zod resolver. Shared schemas in
  `src/lib/validators.ts` (or per-feature).
- **Dates**: `date-fns` + `Intl.DateTimeFormat('fr-FR' | 'ar-MA')`
  for display. Always store UTC in Supabase.
- **Icons**: Lucide React, imported tree-shakably by name.
- **Storage key**: Supabase Auth `storageKey` is `decoshop-livreur-auth`
  to avoid collisions with other apps on the same origin.


## Tips (T-* IDs)

### T-livreur-role-routing  Home screen routes by role
  When  : implementing or debugging a role-specific experience.
  Where : `src/routes/protected/Home.tsx`, `src/hooks/useProfile.ts`.
  How   : the Home component ALWAYS fetches via
          `useTodayBLs(profile?.id)` which filters BLs by
          `livreur_id`. A `vendeur` or `vendeur_proprietaire`
          profile therefore lands on an EMPTY dashboard today.
          Future work: branch `Home` by role to show admin KPIs
          or seller-proprietor dashboard. See Phase 2+ roadmap.
  Why   : a single dashboard for all roles feels broken to
          non-livreur users. Explicit role-branching fixes it.

### T-livreur-pin-crypto  Local PIN hashing with salt
  Where : `src/lib/pin-crypto.ts`.
  How   : SHA-256 with 10 000 rounds + device-unique salt.
          Stored chiffre in localStorage under a namespaced key.
  Gotcha: the salt is derived per-device; clearing localStorage
          forces PIN re-setup. Document this on logout flow.

### T-livreur-storage-key  Avoid cross-app Supabase session collision
  Rule  : Supabase client MUST set `storageKey:
          'decoshop-livreur-auth'` in `createClient(...)`
          options. Without this, opening this app alongside
          `decoshop-v3` on the same origin overwrites the
          session token.
  Where : `src/lib/supabase.ts`.

### T-livreur-rtl-logical  Always use CSS Logical Properties
  Rule  : every direction-aware style uses `-inline-start` /
          `-inline-end` / `-block-start` / `-block-end`, never
          `-left` / `-right` / `-top` / `-bottom`. Tailwind v4
          exposes these as `ms-*`, `me-*`, `ps-*`, `pe-*`.
  Why   : Arabic locale flips the whole UI via `<html dir="rtl">`;
          logical properties handle that automatically.

### T-livreur-supabase-schema  `livreur` Postgres schema, not public
  Rule  : all domain tables live in the `livreur` schema, not
          `public`. Exposed schemas in Supabase project config
          must include `livreur` alongside `public`.
  Why   : keeps driver-app tables scoped + greppable; shared
          Auth lives in `auth.users` and is joined via `id`.
  Gotcha: the Supabase JS client must pass `{ schema: 'livreur' }`
          on the relevant queries (or set the default schema on
          the client for livreur-scoped routes).


## Lessons (L-YYYY-MM-DD-NNN)

(none captured yet at project level - previous lessons were
cross-project and live in db.md W06. Add project-specific
surprises here as they surface.)


## Open loops

- `vendeur_proprietaire` role exists in types/domain.ts but has
  NO dedicated UI. The `Profile` component renders the role
  string; `Home` shows empty state because `useTodayBLs` filters
  by `livreur_id`. Future phase: role-based dashboard branching.
- Offline mode (Phase 6) not yet implemented. IndexedDB queue
  for proof-of-delivery uploads is deferred.
- Push notifications (Phase 7) not yet wired. Web Push API +
  Supabase Edge Function for dispatch.


## Tips added 2026-05-13  (backend boost session)

### T-livreur-pin-crypto-correction  PIN is PBKDF2, not raw SHA-256
  Supersedes the facts in T-livreur-pin-crypto above (which read
  the README, not the code). The actual implementation in
  `src/lib/pin-crypto.ts`:
    • PBKDF2-HMAC-SHA-256, 100 000 iterations (constant
      PBKDF2_ITERATIONS).
    • 16-byte salt from crypto.getRandomValues, hex-stored under
      `decoshop-livreur-pin-salt`.
    • Hash: 256 bits, hex-stored under
      `decoshop-livreur-pin-hash`.
    • `constantTimeEqual` for verify — protects against
      timing attacks.
    • `InsecureContextError` thrown when crypto.subtle is
      absent (private-IP HTTP); the UI gates setup/verify
      behind `isCryptoAvailable()`.
  See ADR-007 for the full record.

### T-livreur-rpc-call-pattern  How to call livreur RPCs from the PWA
  Pattern (matches `useSignature.ts`, `useFailure.ts`,
  `useBLDetail.ts`):

    ```ts
    const { data, error } = await supabase.rpc('rpc_name', {
      p_arg_one: value,
      p_arg_two: value,
    });
    if (error) throw error;
    return data as ResultShape;
    ```

  The default schema of the Supabase client is `livreur`
  (`createClient<Database, 'livreur'>` in
  `src/lib/supabase.ts`), so RPC names are unqualified.
  PostgREST routes them to `livreur.rpc_name`.

  After a fresh migration, `database.types.ts` does not know
  about the new RPCs until you regenerate:

    ```bash
    npx supabase gen types typescript \
      --project-id dzjebcipoqgjvxxmlcry \
      > src/types/database.types.ts
    ```

  Until then, add `// @ts-expect-error - <rpc_name> added in
  migration NNN` on the line preceding `supabase.rpc(...)`.
  This is self-cleaning: once types are regen'd, the directive
  becomes a build error and forces removal.

### T-livreur-state-machine  Use `transition_bl_status` for non-failure moves, `record_failed_attempt` for failures
  - `useUpdateBLStatus({ blId, statut, metadata? })` →
    `livreur.transition_bl_status` (sql/010 §2). Validates the
    (from, to) pair against the state machine. For every move
    EXCEPT failure (T1/T2/abandon).
  - `useRecordFailedAttempt({ blId, motif, commentaire?, photo?,
    latitude?, longitude? })` → `livreur.record_failed_attempt`
    (sql/010 §3). Bumps `nb_tentatives`, decides force-majeure
    waiver, uploads photo, writes JSONB log + audit row + notif.
    Never call `transition_bl_status` for failures — palier logic
    + fee handling live exclusively in `record_failed_attempt`.

### T-livreur-failure-photo-upload  Photos go to `delivery-photos`, not inline base64
  Pattern: `<bl_id>/litige-<timestamp>.<ext>` in the
  `delivery-photos` bucket (private). The RPC returns the
  storage PATH (not URL) — consumers create signed URLs on
  demand via `supabase.storage.from('delivery-photos')
  .createSignedUrl(path, ttl)`. Contrast with
  signatures, which are sent as `data:image/png;base64,...`
  inline to `submit_signature` (signatures are SMALL — typical
  PNG < 5 KB; photos can be MB-scale and must NOT be inline).

### T-livreur-error-boundary-scope  Wrap risky surfaces with `<ErrorBoundary scope="...">`
  Default: the root boundary in `src/App.tsx` catches all
  uncaught render errors. For surfaces with isolated failure
  modes (e.g. the Mapbox lazy chunk failing to load), wrap them
  in a SECOND boundary with a descriptive `scope` prop so the
  console log identifies which sub-tree blew up:

    ```tsx
    <ErrorBoundary scope="BLDetail-Map">
      <BLMap ... />
    </ErrorBoundary>
    ```

  Once Sentry is wired, the `scope` will show up as a tag.

### T-livreur-offline-queue  Wrapping a new RPC into the offline queue (Phase 6)
  See `src/lib/offline-queue.ts` + `src/hooks/useOfflineQueue.ts` +
  ADR-013 for the full design.

  To wire a NEW mutation through the queue (e.g. once you decide to
  cover `record_failed_attempt` end-to-end) :
    1. **Type the RPC name** in `src/types/queue.ts` :
       `QueueableRpc` already covers `transition_bl_status`,
       `record_failed_attempt`, `submit_signature`. Add new ones to
       this union.
    2. **Add an executor branch** in
       `useOfflineQueue.ts → queueExecutor` :
       ```ts
       case 'new_rpc_name': {
         // @ts-expect-error - types not yet regenerated
         const { error } = await supabase.rpc('new_rpc_name', mut.args);
         if (error) throw error;
         return;
       }
       ```
    3. **Wrap the calling hook** to branch on `navigator.onLine` :
       online → `supabase.rpc(...)`, offline → `enqueue({ rpcName,
       blId, args })` + return a synthetic success payload. Mirror
       the pattern in `useBLDetail.useUpdateBLStatus`.
    4. **Add an `onMutate` snapshot** + `onError` rollback for
       optimistic UI (TanStack pattern).
    5. **Surface the queued state** in the calling component if it
       matters (e.g. show "Sera envoyée à la reconnexion" toast
       when `result.queued === true`).
    6. **Decide the permanent-error list** : if your RPC raises new
       error codes that should NOT be retried, add them to
       `PERMANENT_ERROR_CODES` in `src/types/queue.ts`.

  IMPORTANT : the queue stores `args` as `Record<string, unknown>`
  to survive IndexedDB serialisation. The typed RPC signature is
  re-applied via `@ts-expect-error` at the executor branch. This is
  intentional — the type erasure happens once at the queue
  boundary, the rest of the codebase keeps strict typing.

### T-livreur-csp-allowlist  Add new domains to vercel.json `connect-src`
  CSP is enforced. Every new external domain the PWA fetches
  from (analytics, Sentry, a new map provider, a new image CDN)
  MUST be added to the relevant CSP directive in `vercel.json`
  AND an ADR opened. Today's allowlist:
    connect-src: 'self' *.supabase.co api.mapbox.com
                 events.mapbox.com (https + wss)
    img-src:     'self' data: blob: *.mapbox.com *.supabase.co
    font-src:    'self' fonts.gstatic.com data:
    script-src:  'self' 'wasm-unsafe-eval'
    worker-src:  'self' blob:
  Local dev (Vite dev server) doesn't apply Vercel headers, so
  CSP issues only surface on deploy. Verify with the Network →
  Security tab in DevTools on the preview deploy.
