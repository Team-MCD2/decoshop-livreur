# DecoShop Livreur

> PWA livreur DecoShop Toulouse — gestion des bons de livraison, signature électronique, tournées GPS.
> Ref : [`plan/plan_v3_livreur.md`](../plan/plan_v3_livreur.md) · Phase 1 ✅

## 🚀 Quick start

```bash
# 1. Installer les dépendances
npm install

# 2. Configurer l'environnement
cp .env.example .env.local
# Puis éditer .env.local avec tes vraies clés Supabase

# 3. Lancer le dev server
npm run dev
# → http://localhost:5173

# 4. Tests
npm test          # mode watch
npm run test:run  # one-shot
npm run typecheck # tsc --noEmit
```

## 🧱 Stack

- **Frontend** : Vite 6 + React 19 + TypeScript 5
- **Styling** : Tailwind CSS 4 (CSS-first config) + Lucide icons
- **State / Data** : Zustand + TanStack Query 5
- **Routing** : React Router 7
- **i18n** : react-i18next (FR / AR + RTL)
- **Backend** : Supabase (Auth + Postgres + Realtime + Storage + Edge Functions)
- **PWA** : vite-plugin-pwa (Workbox)
- **Tests** : Vitest + Testing Library
- **Forms** : React Hook Form + Zod

## 📂 Structure

```
src/
├── main.tsx              · Entry point (React + QueryClient + Router)
├── App.tsx               · Root component (i18n, theme, auth init)
├── routes/               · Pages (lazy-loaded)
│   ├── auth/             · Login, SetupPin, Unlock
│   └── protected/        · Home, BLDetail, Calendar, Performance, Profile
├── components/
│   ├── ui/               · Primitives (Button, Card, Input, Badge)
│   ├── layout/           · AppLayout, Sidebar, BottomNav, Header
│   ├── auth/             · AuthGuard, LanguageToggle, PinPad
│   └── brand/            · Logo, BrandBlock
├── lib/                  · supabase, pin-crypto, i18n
├── stores/               · Zustand (authStore, settingsStore)
├── hooks/                · useAuth, useProfile
├── types/                · domain.ts + database.types.ts
├── i18n/                 · fr.json + ar.json
├── utils/                · cn (clsx wrapper)
└── styles/globals.css    · Tailwind v4 + design tokens DecoShop
```

## 🔐 Auth flow

```
            ┌──────────────────────────┐
            │   App boot — initAuth()  │
            └────────────┬─────────────┘
                         │
            session?  ◀──┴──▶  pas de session
                │                    │
                ▼                    ▼
         hasPinSetup?           /login (email/pwd)
            │                        │
       OUI ─┴─ NON              succès → setUnlocked(true)
       │       │                       → /setup-pin (si pas de PIN)
       ▼       ▼                       → / (sinon)
    /unlock   /
    (PIN)
       │
       ▼
       /  (déverrouillé)
```

- **Email/pwd** : Supabase Auth standard
- **PIN local** : SHA-256 (10 000 rounds) + salt unique device, stocké chiffré localStorage
- **Session refresh** : auto via Supabase (storageKey custom : `decoshop-livreur-auth`)

## 🎨 Design system

Couleurs et fonts extraites de [`decoshop-v3`](../decoshop-v3) pour cohérence brand transverse.

| Token | Hex | Usage |
|---|---|---|
| `navy` | `#1E3A8A` | Primaire |
| `yellow` | `#FACC15` | Accent (or marocain) |
| `cream` | `#FAF7F0` | Background |
| `ink` | `#0F172A` | Texte principal |

Fonts : **Playfair Display** (display) + **DM Sans** (body) + **Tajawal** (arabe).

Tous les composants utilisent les **CSS Logical Properties** pour le RTL automatique en arabe.

## 🌍 i18n FR/AR

- Langue par défaut : `fr`
- Switch via `LanguageToggle` (header desktop + sidebar)
- Direction (`<html dir>`) bascule auto entre `ltr` (FR) et `rtl` (AR)
- Toutes les strings dans `src/i18n/fr.json` + `src/i18n/ar.json`
- Date/heure via `Intl.DateTimeFormat('fr-FR' | 'ar-MA')`

## 🗄️ Backend Supabase

Les scripts SQL sont dans [`../plan/sql/`](../plan/sql) :

```bash
# 1. Exécuter dans le SQL Editor Supabase :
01_types_and_tables.sql
02_indexes_functions_triggers.sql
03_rls_policies.sql

# 2. Créer 5 comptes Auth via Studio (cf. en-tête de 04_seed_dev.sql)

# 3. Exécuter le seed :
04_seed_dev.sql
```

## 🧪 Tests

```bash
npm test               # mode watch
npm run test:run       # one-shot
npm run test:ui        # UI Vitest
```

Tests Phase 1 :

- `pin-crypto.test.ts` — Validation, hash, vérification, salt unique
- `Button.test.tsx` — Variants, loading, fullWidth, événements
- `i18n.test.tsx` — Traductions FR/AR, parité des clés, interpolation

## 🛣️ Roadmap

| Phase | Statut | Description |
|---|---|---|
| **1** | ✅ | Scaffold, auth, PIN, layout, i18n, tests |
| **2** | 🔜 | Liste BL + créneaux + auto-assignation |
| **3** | ⏳ | Détail BL + Mapbox + tracking GPS live |
| **4** | ⏳ | Workflow livraison + signature 10 min |
| **5** | ⏳ | Échec / re-livraison / paliers tentatives |
| **6** | ⏳ | Offline (Workbox + IndexedDB + Background Sync) |
| **7** | ⏳ | Push notifications (Web Push API) |
| **8** | ⏳ | KPI dashboard + gamification |
| **9** | ⏳ | i18n FR/AR polish + a11y |
| **10** | ⏳ | E2E Playwright + Lighthouse + deploy v1.0.0 |

## 📜 Scripts

| Script | Description |
|---|---|
| `npm run dev` | Dev server (port 5173) |
| `npm run build` | Build prod (typecheck + Vite) |
| `npm run preview` | Preview du build prod |
| `npm run typecheck` | Vérif types sans build |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |
| `npm test` | Vitest watch |
| `npm run test:run` | Vitest one-shot |
| `npm run test:ui` | Vitest UI |
| `npm run check` | **Full gate** : lint + typecheck + build + tests (à lancer avant un PR) |

## 🤖 CI

Chaque push et PR sur `main` ou `develop` lance le full gate
(lint + typecheck + build + tests) sur Node 20 via GitHub Actions
(`.github/workflows/ci.yml`). La protection de branche sur `main`
doit exiger ce check avant merge.

## 📄 Licence

Propriétaire — DecoShop Toulouse / Microdidact 2026
