# Blacklisted for decoshop-livreur

> Patterns, libraries, idioms, or outputs that we do NOT want
> here - typically because they make the work look AI-generated,
> they have been rejected by the boss/owner, or they conflict
> with project constraints.
>
> For cross-project bans, see `db_store/blacklisted.md`.


## Banned libraries

(none yet project-specific - cross-project bans in
db_store/blacklisted.md apply here too.)


## Banned patterns

- **Hardcoded UI strings.** All user-visible text MUST come from
  `src/i18n/fr.json` + `src/i18n/ar.json` via `react-i18next`.
  Hardcoding French strings breaks the AR (RTL) build silently.
- **Direction-specific CSS (`-left`, `-right`, `ml-*`, `mr-*`,
  `pl-*`, `pr-*`).** Use CSS Logical Properties / Tailwind's
  `ms-*`, `me-*`, `ps-*`, `pe-*`. Otherwise the RTL layout for
  the Arabic locale breaks. See T-livreur-rtl-logical.
- **Direct `import.meta.env.VITE_*` reads in business code.**
  All env values are read and validated once through `src/lib/env.ts`
  (or equivalent). Same pattern as db.md W04.1 T-env-boot-validate.
- **Mutating a delivered BL.** Once a bon de livraison enters
  the `delivered` state, any further change goes through an
  append-only event, never an in-place UPDATE. Supports chain-
  of-custody and dispute resolution.
- **Supabase client without `storageKey`.** Opening decoshop-
  livreur on the same origin as decoshop-v3 without a namespaced
  `storageKey` corrupts both sessions. See T-livreur-storage-key.


## AI-tells to remove on sight

(inherit cross-project list from db_store/blacklisted.md. Add
project-specific tells here as they surface, e.g. user-facing
copy sounding generated.)


## Why each is banned (one-line justification)

- Hardcoded UI strings       : silently breaks AR/RTL build.
- Direction-specific CSS     : same - AR layout fails without it.
- Raw env reads              : boot-time validation is the only
                               way to catch missing values BEFORE
                               a user hits the app in prod.
- Mutating delivered BLs     : wipes chain of custody; legal
                               liability for proof of delivery.
- Missing storageKey         : cross-app session collision in
                               the Microdidact family.
