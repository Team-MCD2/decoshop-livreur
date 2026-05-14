# Project Dossier - decoshop-livreur

> The 5+ page big-picture document. Updated, not re-written.
> Sister docs: knowledge.md (tips), roadmap.md (phases),
> decisions.md (ADRs), log.md (session history).

---

## 1. Identity

- **Name**           : decoshop-livreur
- **Type**           : Delivery / Logistics PWA (driver-facing)
- **Business type**  : see `db_store/db.md` W04.13.F DELIVERY /
                       LOGISTICS for the generic recipe.
- **Owner**          : Mommy Jayce (Microdidact)
- **Customer**       : DecoShop Toulouse (French home-decor retail)
- **Repo path**      : `c:\Users\Mommy Jayce\Desktop\Microdidact\`
                       `inventaire_decoshop\decoshop-livreur\`
- **Parent / family**: `inventaire_decoshop\` - monorepo-like
                       umbrella containing decoshop-v3 (main
                       consumer site), decoshop-plan,
                       decoshop-plan-v2, Gestion_inventaire_decoshop,
                       bdd_tp (DB experiments), supabase/ (shared
                       backend config), plan/ (roadmaps).
- **Live URL**       : not yet deployed to production (v1.0.0
                       targeted at Phase 10); preview branches on
                       Vercel.
- **Stack summary**  : Vite 6 + React 19 + TS 5 + Tailwind CSS 4
                       (beta) + Supabase (Auth + Postgres +
                       Realtime + Storage + Edge Functions) +
                       Workbox (via vite-plugin-pwa) + React
                       Router 7 + TanStack Query 5 + Zustand +
                       React Hook Form + Zod + react-i18next +
                       mapbox-gl + Vitest + Testing Library.
- **Status**         : Phase 1 ✅, Phase 2 next. See roadmap.md.
- **One-liner**      : A French + Arabic PWA that gives DecoShop
                       delivery drivers their daily runs, live
                       status, and signed proofs of delivery,
                       with offline resilience and a shared
                       Supabase backend.

---

## 2. Architecture

### 2.1 High-level shape

    ┌─────────────────────────────────────────────────────────┐
    │  Driver's phone                                          │
    │  ┌───────────────────────────────────────────────────┐  │
    │  │  PWA (installed) - React 19 + Vite + Tailwind 4   │  │
    │  │    ├── Auth guard  (Supabase session + local PIN) │  │
    │  │    ├── Home        (today's BLs by creneau)       │  │
    │  │    ├── BLDetail    (address, items, Mapbox route) │  │
    │  │    ├── Calendar    (multi-day schedule)           │  │
    │  │    ├── Performance (KPIs, gamification)           │  │
    │  │    └── Profile     (role, vehicle, schedule)      │  │
    │  │  ─── Workbox SW: precache + runtime cache         │  │
    │  │  ─── IndexedDB: offline queue (Phase 6)           │  │
    │  └───────────────────────────────────────────────────┘  │
    └──────────────────────┬──────────────────────────────────┘
                           │ HTTPS (TanStack Query + fetch)
                           │ + Realtime WebSocket
                           ▼
    ┌──────────────────────────────────────────────────────────┐
    │  Supabase project (shared with decoshop-v3 etc.)          │
    │    ├── Auth (users, sessions, JWT)                        │
    │    ├── Postgres                                           │
    │    │    ├── public (cross-app, rare)                      │
    │    │    └── livreur schema (THIS app's domain)            │
    │    │         ├── profiles (role, vehicle, PIN hash, ...)  │
    │    │         ├── bons_livraison (BLs)                     │
    │    │         ├── events (append-only delivery events)     │
    │    │         └── ... (see sql/ folder for full schema)    │
    │    ├── Realtime (Postgres changes -> WS)                  │
    │    ├── Storage (bucket: livreur-pods/ for proof uploads)  │
    │    └── Edge Functions (SMS / push dispatch - Phase 7)     │
    └───────────────────────────────────────────────────────────┘

### 2.2 Feature boundaries (`src/` layout)

  - `src/routes/auth/`      : public auth flows (Login,
                              SetupPin, Unlock).
  - `src/routes/protected/` : post-auth pages (Home, BLDetail,
                              Calendar, Performance, Profile).
  - `src/components/ui/`    : atomic primitives (Button, Card,
                              Input, Badge).
  - `src/components/layout/`: AppLayout, Sidebar, BottomNav,
                              Header.
  - `src/components/auth/`  : AuthGuard, LanguageToggle, PinPad.
  - `src/components/brand/` : Logo, BrandBlock.
  - `src/stores/`           : Zustand (authStore, settingsStore).
  - `src/hooks/`             : useAuth, useProfile, useTodayBLs,
                               useBLsRealtime, etc.
  - `src/lib/`              : `supabase.ts`, `pin-crypto.ts`,
                              `i18n.ts`.
  - `src/types/`            : `domain.ts` (Profile, BL, ...) +
                              `database.types.ts` (generated
                              from Supabase schema).
  - `src/i18n/`             : `fr.json` + `ar.json`.

### 2.3 Data flow (reads)

  Home mount -> useProfile() -> profileStore ->
    useTodayBLs(profile.id) -> TanStack Query ->
      supabase.from('bons_livraison').select(...).eq('livreur_id', id) ->
        Postgres livreur.bons_livraison ->
          map rows to domain shape -> render grouped by creneau.

  On subscribe: useBLsRealtime(profile.id) opens a WebSocket
  listener on `livreur.bons_livraison` filtered by livreur_id.
  On INSERT/UPDATE: TanStack Query cache invalidated -> refetch.

### 2.4 Data flow (writes)

  User action (mark delivered, upload signature) -> React Hook
  Form + Zod validation -> mutation -> supabase.from(...) or
  supabase.storage (for files) -> RLS check at DB -> commit.
  On Phase 6: mutation first goes to IndexedDB queue; Background
  Sync drains the queue to Supabase when online.

---

## 3. Environment contract

### 3.1 Required env vars (all in `.env.local`, gitignored)

| Name                       | Kind   | Scope      | Source                     |
|----------------------------|--------|------------|----------------------------|
| `VITE_SUPABASE_URL`        | public | build+run  | Supabase project settings  |
| `VITE_SUPABASE_ANON_KEY`   | public | build+run  | Supabase project settings  |
| `VITE_MAPBOX_TOKEN`        | public | build+run  | Mapbox account             |
| `VITE_PUBLIC_SITE_URL`     | public | build      | project canonical URL      |
| `VITE_APP_ENV`             | public | build+run  | `development`/`preview`/`production` |

> Any `VITE_*` prefixed var is bundled into the client and is
> therefore public. Secrets (service_role key, SMS gateway key)
> MUST live in Supabase Edge Function env, not here.

### 3.2 Validation

  Per db.md W04.1 T-env-boot-validate: all env reads go through
  ONE module (`src/lib/env.ts` - to be created if not already).
  Boot fails fast on missing / malformed values. `.trim()` every
  value to kill the Vercel trailing-newline bug (see db.md
  PB-supabase-project-consolidation and L-2026-05-03-008).

### 3.3 `.env.example` (committed, template)

  Must list every name in the table above with inline comments
  pointing to WHERE the value comes from. NEVER real values.

---

## 4. Schema / Data map

See `sql/` folder at project root (11 files) and `plan/sql/`
for the canonical migration order:

  1. `01_types_and_tables.sql`       - enum types + tables.
  2. `02_indexes_functions_triggers.sql` - performance + helpers.
  3. `03_rls_policies.sql`           - row-level security.
  4. `04_seed_dev.sql`               - 5 test accounts + sample BLs.

### 4.1 Key tables (livreur schema)

- `livreur.profiles`
    - `id` uuid PK (= auth.users.id)
    - `role` enum: admin | vendeur | vendeur_proprietaire | livreur
    - `is_active` bool
    - `vehicle_type`, `vehicle_capacity_m3`, `vehicle_immatriculation`
    - `weekly_schedule` jsonb
    - `last_assigned_at` timestamptz
    - `pin_hash` text (nullable; set after SetupPin)
    - `preferred_language` enum: fr | ar
    - `push_subscription` jsonb (Phase 7)
    - `zones_couvertes` text[] (driver's delivery zones)
    - `avatar_url` text
- `livreur.bons_livraison`
    - `id` uuid PK
    - `numero_bl` text unique
    - `livreur_id` uuid FK -> profiles.id (assignee)
    - `date_livraison_prevue` date
    - `creneau` enum / text (time slot)
    - `adresse_livraison` text + geocoded fields
    - `client_nom`, `client_telephone`
    - `items` jsonb (line items)
    - `statut` enum: planned | en-route | delivered | failed | returned
    - `created_at`, `updated_at`
- `livreur.events` (Phase 4+)
    - append-only BL events (assigned, started, completed,
      failed, re-assigned). Source of truth for chain-of-custody.

### 4.2 Helper functions (SQL, in livreur schema)

- `livreur.is_admin_or_vendeur()` returns bool. Used in RLS
  policies to grant elevated permissions. Checks the authenticated
  user's profile role.

### 4.3 RLS posture

- `profiles`        : owner can SELECT/UPDATE own row;
                      admin/vendeur can SELECT all.
- `bons_livraison`  : livreur SELECTs where `livreur_id = auth.uid()`;
                      admin/vendeur SELECTs all; UPDATE gated by
                      role + status transitions.
- `events`          : INSERT-only; SELECT by owner or admin.

---

## 5. Deployment runbook

### 5.1 Targets

- **Dev**      : `npm run dev` -> http://localhost:5173
- **HTTPS dev**: `npm run dev:https` (for push / install testing)
- **Preview** : Vercel auto-preview on every PR.
- **Prod**    : Vercel production on merge to `main` (protection
                rule: CI full-gate must pass).

### 5.2 Commands (local)

- `npm run dev`         - dev server.
- `npm run build`       - typecheck + Vite prod build.
- `npm run preview`     - serve the prod build locally.
- `npm run typecheck`   - tsc --noEmit.
- `npm run lint`        - ESLint.
- `npm run test:run`    - Vitest one-shot.
- `npm run check`       - FULL GATE (lint + typecheck + build +
                          tests). Mandatory before any PR.

### 5.3 Rollback

  Per db.md PB-deploy-astro-vercel step 7 (applies here too):
  Vercel > Deployments > pick previous > "Promote to Production".
  < 30 seconds, zero downtime. DB migrations need their own
  rollback path (documented per migration).

### 5.4 CI

  GitHub Actions (`.github/workflows/ci.yml`) runs the full
  gate on push + PR to `main` and `develop`, Node 20. Branch
  protection on `main` requires this check before merge.

---

## 6. Role matrix

| Role                  | Home dashboard                  | Key capabilities                             |
|-----------------------|---------------------------------|----------------------------------------------|
| `livreur`             | today's BLs by creneau          | mark delivered, upload proof, view own runs  |
| `vendeur`             | (currently empty - uses Home    | SELECT all BLs (RLS), cannot drive           |
|                       |  same as livreur - Phase 2+ fix)|                                              |
| `vendeur_proprietaire`| (currently empty - no UI yet)   | SELECT all BLs, potentially admin override   |
| `admin`               | (currently empty - Phase 8 KPI  | all-access, role assignment, config          |
|                       |  dashboard)                     |                                              |

> Known gap: the Home component uses `useTodayBLs(profile.id)`
> which filters by `livreur_id`. Non-livreur roles therefore see
> an empty dashboard. See roadmap Phase 2 and knowledge.md
> open loops.

---

## 7. SEO baseline (PWA, mostly non-public)

  This app is a driver-facing PWA, NOT a public marketing site.
  SEO concerns are minimal:
  - A single landing route `/` behind login - no indexing value.
  - `robots.txt` should disallow `/` for crawlers (the driver
    app should not appear in search results).
  - `manifest.json` (vite-plugin-pwa) carries the installable
    metadata (name, short_name, icons, theme_color, background,
    display: standalone, start_url: /).
  - The parent decoshop-v3 site owns the SEO story for the
    customer-facing DecoShop brand - see that project's dossier.

---

## 8. Observability

  - **Client logs**  : `console.error(obj)` for unrecoverable
                       errors; structured fields via a logger
                       module (to formalise in Phase 1 polish).
  - **Error sink**   : Sentry (planned for Phase 10) or console
                       for now. See db.md S04.1 LOGGING.
  - **Server logs**  : Supabase Edge Functions log to their own
                       dashboard; Vercel Runtime Logs for any
                       Vercel functions (none yet).
  - **Metrics**      : (deferred) - Vercel Web Analytics +
                       custom metrics on BL throughput (Phase 8).
  - **Alerts**       : (deferred) - Sentry issue alerts to the
                       owner's email / Slack when wired.

---

## 9. Open loops and risks

- `vendeur_proprietaire` role has no UI path. High priority to
  close before inviting those users.
- Tailwind 4 is still in beta (`4.0.0-beta.5` in package.json).
  Plan a bump to stable release when GA.
- Mapbox GL is a heavy dep (~800 KB gzipped). Code-split the
  BLDetail chunk so the Home bundle stays lean. See db.md
  W04.10 PERF + W04.7 PWA (globIgnores for mapbox-gl in Workbox).
- Offline queue (Phase 6) is non-trivial: reliable ordering,
  conflict resolution, quota. See db.md S04.6 OFFLINE patterns.
- Push notifications on iOS require iOS 16.4+ Safari and
  "Add to Home Screen" - document this user-facing constraint
  on the onboarding screen.
- Driver privacy: GPS history retention policy TBD. Default to
  short window (delete after 7 days) unless owner states
  otherwise. Mention in privacy policy page.
- Supabase `storageKey` collision prevention must be enforced
  in ALL DecoShop family apps - add a check in each app's
  `src/lib/supabase.ts` (see T-livreur-storage-key).

---

## 10. KPIs

(operational targets; to be refined with the owner on Phase 8
kickoff)

- **Driver adoption**        : % of DecoShop drivers actively
                                using the app daily (target:
                                100% after rollout).
- **BL completion rate**     : delivered / assigned per day
                                (baseline before app: TBD).
- **Proof-of-delivery time** : median seconds from "arrived"
                                to signature captured.
- **Offline resilience**     : % of shifts where the driver
                                lost network temporarily AND
                                no data was lost.
- **App crash-free rate**    : sessions without JS error /
                                total sessions (target: > 99%
                                after Phase 10).
- **Install rate**           : drivers who installed the PWA
                                (Add to Home Screen) / drivers
                                who opened the app (target: >
                                80%).
- **i18n usage**             : % of drivers using AR locale
                                (tracks rollout success in
                                Arabic-speaking driver cohort).
