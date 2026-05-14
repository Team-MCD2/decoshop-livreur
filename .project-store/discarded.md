# Discarded ideas for decoshop-livreur

> Things tried and rejected, with the reason. Keeps the team
> from re-proposing the same dead ends. If a boss pushed back
> on an idea and the owner confirms "never again", it goes
> here.
>
> For cross-project rejected ideas, see `db_store/discarded.md`.


## Entry template

    ## <Idea (one line)>
    - tried on      : YYYY-MM-DD
    - why rejected  : ...
    - alternative   : ... (what we did instead, or "see <ID>")


## Discarded ideas

## Native mobile app (React Native / Flutter / Swift+Kotlin)
  - tried on      : 2026 (early planning phase)
  - why rejected  : drivers use any phone, own or personal. A
                    native app means two signed builds, two
                    store submissions, two crash-report pipelines,
                    and a higher barrier to trying the app. Does
                    not match a DecoShop-scale operation.
  - alternative   : PWA with vite-plugin-pwa (Workbox), installable
                    from the browser, works on iOS Safari + Android
                    Chrome. See db.md W04.7 PWA + S03 STACK (PWA
                    row).

## Using `public` schema for livreur-scoped tables
  - tried on      : 2026 (initial schema sketch)
  - why rejected  : decoshop-livreur is one of several apps
                    sharing the Supabase project. `public` would
                    be a free-for-all across apps. Naming
                    collisions inevitable as decoshop-v3 grows.
  - alternative   : dedicated `livreur` schema. Cross-app shared
                    data lives in `public`; app-specific tables
                    live in the app's schema. Exposed schemas
                    list in Supabase project config includes
                    `livreur`. See T-livreur-supabase-schema.

## Session token stored in sessionStorage (not localStorage)
  - tried on      : 2026 (auth design)
  - why rejected  : sessionStorage is tab-scoped. A driver
                    closing the tab and reopening would have to
                    re-login every time. Friction drives
                    shortcuts (writing the password down).
  - alternative   : localStorage with a namespaced `storageKey`
                    (decoshop-livreur-auth) + PIN lock for
                    re-entry after app is closed. SHA-256 +
                    salt for PIN hashing, never the password
                    itself.

## Storing proof-of-delivery photos as base64 in Postgres
  - tried on      : 2026 (data design)
  - why rejected  : base64 blobs balloon the DB, kill Realtime
                    performance, and cost 3-4x the storage.
  - alternative   : Supabase Storage bucket (`livreur-pods/`),
                    row in `bons_livraison` carries the storage
                    path only. Use signed URLs for read access.
