# DecoShop Livreur — SQL migrations

Schema-isolated, idempotent, additive migrations for the DecoShop delivery / signature platform.

## TL;DR

```
003_livreur_schema.sql              ← schema + 12 tables + ENUMs + FK to articles
004_livreur_triggers_views.sql      ← helpers, triggers, views, indexes
005_livreur_rls.sql                 ← role-based RLS policies
006_livreur_signature_rpcs.sql      ← signature flow (request/submit/get/expire/invalidate)
007_livreur_storage.sql             ← storage buckets + bucket RLS
```

Re-running any file is a no-op. Each file inserts itself into `public._migrations`.

> **PREREQUISITE**: `decoshop-plan-v2/sql/000_common.sql` must be applied first. It creates the `app_meta` schema, `set_updated_at()` helper, and `_migrations` registry that these migrations depend on.

---

## Schema layout (post-migration)

| Schema      | What lives here                                                              |
|-------------|------------------------------------------------------------------------------|
| `public`    | `articles` (existing, untouched), `_migrations`, `articles_public` view      |
| `app_meta`  | `set_updated_at()` (shared with plan)                                        |
| `plan`      | floor-plan editor tables + RPCs (separate app)                               |
| `livreur`   | this app's 12 tables + 3 views + 9 helper/utility funcs + 5 signature RPCs   |
| `storage`   | `delivery-photos`, `delivery-pdfs`, `signatures`, `article-photos` buckets   |

`public.articles` is **never altered** — only referenced via `livreur.lignes_bl.article_id` FK with `ON DELETE SET NULL`.

---

## First-time setup

### 1. Pre-flight probe (read-only)

Same probe SQL as the plan-v2 README §1 — confirm starting state. Verify especially:

```sql
-- articles.id type — must be uuid for the FK to wire
select data_type from information_schema.columns
 where table_schema = 'public' and table_name = 'articles' and column_name = 'id';
-- expected: 'uuid'

-- 000_common.sql already applied?
select * from public._migrations where filename = '000_common.sql';
```

If `000_common.sql` is missing, run it first from `decoshop-plan-v2/sql/`.

### 2. Run the migrations in order

```
003_livreur_schema.sql
004_livreur_triggers_views.sql
005_livreur_rls.sql
006_livreur_signature_rpcs.sql
007_livreur_storage.sql
```

Each in Supabase Studio → SQL Editor → Run. Wait for "Success" before next.

### 3. Configure Supabase to expose the `livreur` schema

1. Studio → Project Settings → API → **Exposed schemas**
2. Add `livreur` to the list. Save.
3. The PWA's `supabase.from('bons_livraison')` calls work via PostgREST after this.

> Note: with the schema exposed, the PWA can use either `supabase.schema('livreur').from('bons_livraison')` (explicit) or set the default schema on the client. Pick one and stay consistent. The current `decoshop-livreur/src/lib/supabase.ts` likely uses the latter — review after deploy.

### 4. Schedule the signature-expiry sweep

In SQL Editor, **as the postgres role** (not from the SPA):

```sql
create extension if not exists pg_cron;

select cron.schedule(
  'livreur-expire-pending-signatures',
  '* * * * *',                                            -- every minute
  $$ select livreur.expire_pending_signatures(); $$
);

-- Also schedule daily GPS purge:
select cron.schedule(
  'livreur-purge-old-driver-locations',
  '0 3 * * *',                                            -- 03:00 UTC daily
  $$ select livreur.purge_old_driver_locations(); $$
);

-- Inspect:
select * from cron.job;
```

### 5. Set the PWA env

`decoshop-livreur/.env.local`:

```
VITE_SUPABASE_URL=https://dzjebcipoqgjvxxmlcry.supabase.co
VITE_SUPABASE_ANON_KEY=<from Studio → Settings → API → anon (public)>
```

### 6. Smoke tests

Paste in SQL Editor (some need to be run as authenticated — see notes):

```sql
-- A. Schema + tables exist
select count(*) = 12 as ok
  from information_schema.tables
 where table_schema = 'livreur';
-- expected: ok = true

-- B. ENUMs exist
select count(*) = 10 as ok
  from pg_type t join pg_namespace n on n.oid = t.typnamespace
 where n.nspname = 'livreur' and t.typtype = 'e';

-- C. Helper functions callable
select livreur.is_admin();              -- false (anon/no profile)
select livreur.is_admin_or_vendeur();   -- false

-- D. RLS enabled on every table
select count(*) = 12 as ok
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'livreur' and c.relkind = 'r' and c.relrowsecurity;

-- E. Signature RPCs registered
select proname from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'livreur'
   and p.proname in (
     'request_signature','submit_signature','get_signature_public',
     'expire_pending_signatures','invalidate_signature'
   )
 order by proname;

-- F. articles untouched
select count(*) from public.articles;  -- compare to baseline

-- G. cron job scheduled
select jobname, schedule, active from cron.job
 where jobname like 'livreur-%';
```

### 7. Create dev users + seed (manual)

1. Studio → Authentication → Users → "+ Add user" → create one of each role
2. After signup, insert the matching `livreur.profiles` row:

```sql
insert into livreur.profiles (id, nom, prenom, email, role, is_active)
values
  ('<auth.users.id-of-admin>',    'Admin',    'Dev', 'admin@dev.local',     'admin',                false),
  ('<auth.users.id-of-vendeur>',  'Vendeur',  'Dev', 'vendeur@dev.local',   'vendeur',              false),
  ('<auth.users.id-of-prop>',     'Proprio',  'Dev', 'proprio@dev.local',   'vendeur_proprietaire', false),
  ('<auth.users.id-of-livreur>',  'Livreur',  'Dev', 'livreur@dev.local',   'livreur',              true);
```

(Future improvement: an `auth.users` trigger that auto-creates a `livreur.profiles` row.)

### 8. Smoke test the signature flow

```sql
-- As an authenticated livreur (set jwt.claims via Studio impersonation):
select livreur.request_signature('<bl-uuid>'::uuid, 10);
-- expected: { token, url_path, date_expiration, ... }

-- As anon, with the returned token:
select livreur.get_signature_public('<token-64hex>');
-- expected: { status: 'en_attente', is_expired: false, ... }

-- Submit a fake signature:
select livreur.submit_signature(
  '<token>',
  'data:image/png;base64,iVBORw0KGgo' || repeat('A', 200),
  false, null, null, 'smoke-test'
);
-- expected: { success: true, bl_id, numero_bl, signed_at }
```

---

## Reverting

In **reverse** order:

```
007_livreur_storage_revert.sql      ← drops buckets + bucket policies
003_livreur_schema_revert.sql       ← drops the entire livreur schema (cascades 003-006)
```

⚠ Both are destructive. `drop schema livreur cascade` removes all data. Backup first.

⚠ Don't run `decoshop-plan-v2/sql/000_common_revert.sql` while `livreur.*` exists — it'll fail because plan triggers reference `app_meta.set_updated_at()`. Order: livreur revert → plan revert → common revert.

---

## Multi-app safety guarantees

- ✅ **`public.articles` never altered**. FK with `ON DELETE SET NULL` plus denormalised line-item fields preserve audit history.
- ✅ **No symbol collision** with `plan.*` or `public.*`. Generic names like `profiles`, `clients`, `commandes` live safely inside `livreur.*`.
- ✅ **Idempotent** — every migration uses `IF NOT EXISTS` / `CREATE OR REPLACE` / `ON CONFLICT DO NOTHING`.
- ✅ **Reverts isolate** — `drop schema livreur cascade` is one-line.
- ✅ **Migration registry** — `select * from public._migrations where app = 'livreur'`.
- ✅ **RLS by default** — every table has RLS enabled with role-based policies.

---

## Troubleshooting

### "permission denied for schema livreur" (HTTP 403)
You forgot to add `livreur` to **Exposed schemas** in Supabase Settings → API. Step 3 above.

### "function livreur.request_signature does not exist"
Either 006 didn't run, or PostgREST hasn't refreshed its cache. Studio → API → "Reload schema cache".

### "permission denied for table profiles" (when querying livreur.profiles)
Check that the user has both:
1. A row in `livreur.profiles` matching their `auth.uid()`
2. `is_active = true`

The RLS helpers (`is_admin()`, `is_admin_or_vendeur()`) all require `is_active = true`.

### "foreign key constraint cannot be implemented" on lignes_bl
`public.articles.id` is not `uuid`. Re-run `003_livreur_schema.sql` — the FK section is wrapped in a guarded `do $$`, it skips with a NOTICE rather than fail.

### Signature expiry isn't running
Check pg_cron:
```sql
select * from cron.job_run_details
 where jobid = (select jobid from cron.job
                 where jobname = 'livreur-expire-pending-signatures')
 order by start_time desc limit 5;
```

### Edge Function `send-signature-email` 500
The function lives in `<workspace>/supabase/functions/send-signature-email/`. After consolidation, redeploy:
```
supabase link --project-ref dzjebcipoqgjvxxmlcry
supabase functions deploy send-signature-email
```
See `<workspace>/supabase/README.md` for the full runbook.

---

## What's NOT in this folder

- **Edge Functions** — they live in `<workspace>/supabase/functions/`. Currently only `send-signature-email`.
- **Plan-v2 migrations** (000, 001, 002) — they live in `decoshop-plan-v2/sql/`. Both apps share the database; the split here is for ownership clarity.
- **Seed data** — intentionally not provided. Production seeding is via Shopify webhook ingestion + Studio for dev users; test fixtures should live in `tests/`.
- **Type generation** — run `npx supabase gen types typescript --project-id dzjebcipoqgjvxxmlcry > src/types/database.types.ts` after every schema change.
