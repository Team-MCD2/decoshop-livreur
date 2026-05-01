-- ════════════════════════════════════════════════════════════════════════════
--  DECO SHOP — Livreur DEV/STAGING seed   (livreur.* schema-qualified)
-- ════════════════════════════════════════════════════════════════════════════
--
--  ⚠ NE PAS EXÉCUTER EN PRODUCTION
--
--  Loads a realistic working dataset so the PWA has something to render
--  end-to-end (drivers, clients, orders, BLs, slots, notifications,
--  one signed delivery, one failed attempt).
--
--  IDEMPOTENT — re-running upserts via deterministic UUIDs / ON CONFLICT.
--
--  Run AFTER:
--    decoshop-plan-v2/sql/000_common.sql
--    003_livreur_schema.sql        (tables + ENUMs)
--    004_livreur_triggers_views.sql (set_creneau_heures trigger)
--    005_livreur_rls.sql            (policies — seed runs as service role)
--    006_livreur_signature_rpcs.sql (optional, only used by signature row)
--    007_livreur_storage.sql        (optional)
--
--  ─── PRÉ-REQUIS — créer les 5 comptes Auth d'abord :
--
--    Studio → Authentication → Users → Add user
--      karim@decoshop-toulouse.fr      / Test1234!
--      yassine@decoshop-toulouse.fr    / Test1234!
--      mehdi@decoshop-toulouse.fr      / Test1234!
--      omar@decoshop-toulouse.fr       / Test1234!
--      fayssal@decoshop-toulouse.fr    / Admin1234!
--
--  Le script résout les UUIDs Auth via les emails, pas besoin de coller
--  des UUIDs en dur. Si un compte manque, RAISE EXCEPTION explicite.
-- ════════════════════════════════════════════════════════════════════════════

do $$
declare
  -- Drivers / owner — résolus via auth.users.email
  v_karim_id    uuid;
  v_yassine_id  uuid;
  v_mehdi_id    uuid;
  v_omar_id     uuid;
  v_fayssal_id  uuid;

  -- Clients / commandes / BL : UUIDs déterministes pour idempotence
  v_client1_id  uuid := '66666666-6666-6666-6666-666666666601';
  v_client2_id  uuid := '66666666-6666-6666-6666-666666666602';
  v_client3_id  uuid := '66666666-6666-6666-6666-666666666603';
  v_client4_id  uuid := '66666666-6666-6666-6666-666666666604';
  v_client5_id  uuid := '66666666-6666-6666-6666-666666666605';
  v_cmd1_id     uuid := '77777777-7777-7777-7777-777777777701';
  v_cmd2_id     uuid := '77777777-7777-7777-7777-777777777702';
  v_cmd3_id     uuid := '77777777-7777-7777-7777-777777777703';
  v_cmd4_id     uuid := '77777777-7777-7777-7777-777777777704';
  v_cmd5_id     uuid := '77777777-7777-7777-7777-777777777705';
  v_bl1_id      uuid := '88888888-8888-8888-8888-888888888801';
  v_bl2_id      uuid := '88888888-8888-8888-8888-888888888802';
  v_bl3_id      uuid := '88888888-8888-8888-8888-888888888803';
  v_bl4_id      uuid := '88888888-8888-8888-8888-888888888804';
  v_bl5_id      uuid := '88888888-8888-8888-8888-888888888805';

  v_missing     text[] := array[]::text[];
begin

  -- ─── Résolution dynamique des UUIDs Auth (par email) ──────────────────────
  select id into v_karim_id   from auth.users where email = 'karim@decoshop-toulouse.fr';
  select id into v_yassine_id from auth.users where email = 'yassine@decoshop-toulouse.fr';
  select id into v_mehdi_id   from auth.users where email = 'mehdi@decoshop-toulouse.fr';
  select id into v_omar_id    from auth.users where email = 'omar@decoshop-toulouse.fr';
  select id into v_fayssal_id from auth.users where email = 'fayssal@decoshop-toulouse.fr';

  if v_karim_id   is null then v_missing := array_append(v_missing, 'karim@decoshop-toulouse.fr'); end if;
  if v_yassine_id is null then v_missing := array_append(v_missing, 'yassine@decoshop-toulouse.fr'); end if;
  if v_mehdi_id   is null then v_missing := array_append(v_missing, 'mehdi@decoshop-toulouse.fr'); end if;
  if v_omar_id    is null then v_missing := array_append(v_missing, 'omar@decoshop-toulouse.fr'); end if;
  if v_fayssal_id is null then v_missing := array_append(v_missing, 'fayssal@decoshop-toulouse.fr'); end if;

  if array_length(v_missing, 1) > 0 then
    raise exception
      'Comptes auth.users manquants : %. Crée-les d''abord via Authentication → Users → Add user.',
      array_to_string(v_missing, ', ');
  end if;

  raise notice 'UUIDs Auth résolus : Karim=%, Yassine=%, Mehdi=%, Omar=%, Fayssal=%',
    v_karim_id, v_yassine_id, v_mehdi_id, v_omar_id, v_fayssal_id;

  -- ─── 1) profiles (livreurs + propriétaire) ────────────────────────────────
  insert into livreur.profiles (
    id, nom, prenom, telephone, email, role, is_active,
    vehicle_type, vehicle_capacity_m3, vehicle_immatriculation,
    weekly_schedule, preferred_language, zones_couvertes
  ) values
  (v_karim_id, 'BENALI', 'Karim', '+33 6 00 00 00 01', 'karim@decoshop-toulouse.fr', 'livreur', true,
   'utilitaire', 8.0, 'AB-123-CD',
   '{"monday":["matin","apres_midi"],"tuesday":["matin","apres_midi","soir"],"wednesday":["matin","apres_midi"],"thursday":["matin","apres_midi","soir"],"friday":["matin","apres_midi","soir"],"saturday":["matin","apres_midi"]}'::jsonb,
   'fr', array['Toulouse Centre','Rangueil','Côte Pavée','Empalot']),
  (v_yassine_id, 'EL AMRANI', 'Yassine', '+33 6 00 00 00 02', 'yassine@decoshop-toulouse.fr', 'livreur', true,
   'camionnette', 14.0, 'EF-456-GH',
   '{"monday":["matin","apres_midi","soir"],"tuesday":["matin","apres_midi"],"wednesday":["matin","apres_midi","soir"],"thursday":["matin","apres_midi"],"friday":["matin","apres_midi"],"saturday":["matin","apres_midi","soir"]}'::jsonb,
   'fr', array['Blagnac','Colomiers','Tournefeuille','Toulouse Ouest']),
  (v_mehdi_id, 'ZAHIDI', 'Mehdi', '+33 6 00 00 00 03', 'mehdi@decoshop-toulouse.fr', 'livreur', true,
   'voiture', 3.0, 'IJ-789-KL',
   '{"tuesday":["apres_midi","soir"],"wednesday":["matin","apres_midi","soir"],"thursday":["matin","apres_midi","soir"],"friday":["apres_midi","soir"],"saturday":["matin","apres_midi","soir"]}'::jsonb,
   'ar', array['Saint-Orens','Balma','Toulouse Est']),
  (v_omar_id, 'CHAKIR', 'Omar', '+33 6 00 00 00 04', 'omar@decoshop-toulouse.fr', 'livreur', false,
   'voiture', 3.0, 'MN-012-OP', '{}'::jsonb, 'fr', array[]::text[]),
  (v_fayssal_id, 'BOUSSATTA', 'Fayssal', '+33 7 67 27 86 25', 'fayssal@decoshop-toulouse.fr', 'vendeur_proprietaire', true,
   null, null, null, '{}'::jsonb, 'fr', null)
  on conflict (id) do update set
    nom = excluded.nom, prenom = excluded.prenom, telephone = excluded.telephone,
    email = excluded.email, role = excluded.role, is_active = excluded.is_active,
    vehicle_type = excluded.vehicle_type, vehicle_capacity_m3 = excluded.vehicle_capacity_m3,
    vehicle_immatriculation = excluded.vehicle_immatriculation,
    weekly_schedule = excluded.weekly_schedule, preferred_language = excluded.preferred_language,
    zones_couvertes = excluded.zones_couvertes, updated_at = now();

  -- ─── 2) clients (Toulouse + alentours) ────────────────────────────────────
  insert into livreur.clients (
    id, nom, prenom, email, telephone,
    adresse_ligne1, code_postal, ville, pays,
    latitude, longitude, etage, ascenseur, code_porte, commentaire_acces
  ) values
  (v_client1_id, 'Dupont', 'Marie', 'marie.dupont@example.com', '+33 6 12 34 56 78',
   '12 Rue Bayard', '31000', 'Toulouse', 'France',
   43.6080, 1.4475, 3, true, '1234',
   'Sonner à droite, M. Dupont au bureau jusqu''à 18h'),
  (v_client2_id, 'El Khalid', 'Aïcha', 'aicha.elkhalid@example.com', '+33 6 23 45 67 89',
   '5 Avenue Jean Jaurès', '31000', 'Toulouse', 'France',
   43.6045, 1.4518, 1, false, null,
   'Pavillon avec portail vert, sonner à l''interphone'),
  (v_client3_id, 'Martin', 'Jean-Pierre', 'jp.martin@example.com', '+33 6 34 56 78 90',
   '24 Boulevard de Suisse', '31200', 'Toulouse', 'France',
   43.6235, 1.4360, 5, true, '7890',
   'Bâtiment B, ascenseur en panne signalé hier — appeler avant arrivée'),
  (v_client4_id, 'Bouchareb', 'Karim', 'karim.bouchareb@example.com', '+33 6 45 67 89 01',
   '8 Place du Capitole', '31000', 'Toulouse', 'France',
   43.6045, 1.4440, 2, true, '4567',
   'Stationnement difficile centre-ville, prévoir 5 min de marche'),
  (v_client5_id, 'Garcia', 'Sophia', 'sophia.garcia@example.com', '+33 6 56 78 90 12',
   '17 Rue des Lilas', '31700', 'Blagnac', 'France',
   43.6358, 1.3900, 0, false, null,
   'Maison individuelle, garage devant, bien placer le véhicule')
  on conflict (id) do update set
    nom = excluded.nom, prenom = excluded.prenom,
    email = excluded.email, telephone = excluded.telephone,
    updated_at = now();

  -- ─── 3) commandes (Shopify simulées) ──────────────────────────────────────
  insert into livreur.commandes (
    id, client_id, numero_commande, shopify_order_id, statut,
    montant_total_ttc, montant_total_ht, taux_tva, montant_tva, date_commande
  ) values
  (v_cmd1_id, v_client1_id, 'DECO-CMD-260425-001', 'shopify-1001', 'en_preparation',
   899.00, 749.17, 20.00, 149.83, '2026-04-25 14:30:00+02'),
  (v_cmd2_id, v_client2_id, 'DECO-CMD-260425-002', 'shopify-1002', 'en_preparation',
   1450.00, 1208.33, 20.00, 241.67, '2026-04-25 16:45:00+02'),
  (v_cmd3_id, v_client3_id, 'DECO-CMD-260426-003', 'shopify-1003', 'en_preparation',
   329.00, 274.17, 20.00, 54.83, '2026-04-26 10:15:00+02'),
  (v_cmd4_id, v_client4_id, 'DECO-CMD-260426-004', 'shopify-1004', 'expediee',
   549.00, 457.50, 20.00, 91.50, '2026-04-26 11:20:00+02'),
  (v_cmd5_id, v_client5_id, 'DECO-CMD-260426-005', 'shopify-1005', 'expediee',
   2199.00, 1832.50, 20.00, 366.50, '2026-04-26 12:00:00+02')
  on conflict (id) do update set
    montant_total_ttc = excluded.montant_total_ttc, updated_at = now();

  -- ─── 4) bons_livraison (variété de statuts) ───────────────────────────────
  insert into livreur.bons_livraison (
    id, numero_bl, commande_id, client_id, vendeur_id, livreur_id,
    statut, mode_livraison, creneau, date_livraison_prevue,
    montant_total_ttc, nb_tentatives, vendeur_present_depart
  ) values
  -- BL 1 : confirmé pour aujourd'hui matin (Karim)
  (v_bl1_id, 'DECO-BL-260427-0001', v_cmd1_id, v_client1_id, v_fayssal_id, v_karim_id,
   'confirme', 'domicile', 'matin', current_date, 899.00, 0, true),
  -- BL 2 : assigné à Yassine, créneau pas encore choisi
  (v_bl2_id, 'DECO-BL-260427-0002', v_cmd2_id, v_client2_id, v_fayssal_id, v_yassine_id,
   'assigne', 'domicile', null, null, 1450.00, 0, true),
  -- BL 3 : en cours de livraison (Mehdi)
  (v_bl3_id, 'DECO-BL-260427-0003', v_cmd3_id, v_client3_id, v_fayssal_id, v_mehdi_id,
   'en_route', 'domicile', 'apres_midi', current_date, 329.00, 0, true),
  -- BL 4 : déjà livré et signé (Karim, hier)
  (v_bl4_id, 'DECO-BL-260426-0004', v_cmd4_id, v_client4_id, v_fayssal_id, v_karim_id,
   'signe', 'domicile', 'apres_midi', current_date - 1, 549.00, 0, true),
  -- BL 5 : tentative 1 échouée → re-planifié (frais 5% calculés auto)
  (v_bl5_id, 'DECO-BL-260427-0005', v_cmd5_id, v_client5_id, v_fayssal_id, v_yassine_id,
   'echec_T1', 'domicile', 'matin', current_date, 2199.00, 1, true)
  on conflict (id) do update set
    statut = excluded.statut, updated_at = now();

  -- ─── 5) lignes_bl (articles) ──────────────────────────────────────────────
  -- Suppression préalable pour éviter doublons (re-seed). WHERE clause is
  -- explicit (not a bare DELETE) to comply with pg_safeupdate.
  delete from livreur.lignes_bl
   where bl_id in (v_bl1_id, v_bl2_id, v_bl3_id, v_bl4_id, v_bl5_id);

  insert into livreur.lignes_bl (
    bl_id, designation, marque, modele, quantite, prix_unitaire_ttc,
    poids_kg, volume_m3, fragile, ordre_tri
  ) values
  (v_bl1_id, 'Canapé Linen 3 places',         'DecoShop', 'CAN-LIN-3P-NAVY',  1,  899.00, 65.0, 2.40, false, 1),
  (v_bl2_id, 'Tapis berbère 200×300 cm',      'DecoShop', 'TAP-BER-200x300',  1, 1290.00, 12.0, 0.30, false, 1),
  (v_bl2_id, 'Lanterne marocaine XL dorée',   'DecoShop', 'LAN-MOR-XL-OR',    2,   80.00,  1.5, 0.10, true,  2),
  (v_bl3_id, 'Voilage brodé 140×260 cm',      'DecoShop', 'VOI-BROD-140x260', 1,   89.00,  0.8, 0.05, false, 1),
  (v_bl3_id, 'Service à thé 6 verres dorés',  'DecoShop', 'SVC-THE-6-OR',     1,  240.00,  2.5, 0.10, true,  2),
  (v_bl4_id, 'Pouf en cuir camel',            'DecoShop', 'POUF-CUIR-CAM',    2,  159.00,  8.0, 0.40, false, 1),
  (v_bl4_id, 'Miroir soleil 80 cm doré',      'DecoShop', 'MIR-SOL-80-OR',    1,  231.00,  4.0, 0.20, true,  2),
  (v_bl5_id, 'Canapé angle convertible Beni', 'DecoShop', 'CAN-ANG-BENI',     1, 2199.00, 95.0, 3.80, false, 1);

  -- ─── 6) creneaux_livraison (semaine en cours) ─────────────────────────────
  -- heure_debut / heure_fin sont auto-remplies par le trigger
  -- livreur.set_creneau_heures (cf. 004_livreur_triggers_views.sql).
  insert into livreur.creneaux_livraison (livreur_id, date_creneau, type_creneau, statut, bl_id) values
  -- Aujourd'hui
  (v_karim_id,   current_date,     'matin',      'reserve',    v_bl1_id),
  (v_karim_id,   current_date,     'apres_midi', 'disponible', null),
  (v_karim_id,   current_date,     'soir',       'disponible', null),
  (v_yassine_id, current_date,     'matin',      'reserve',    v_bl5_id),
  (v_yassine_id, current_date,     'apres_midi', 'disponible', null),
  (v_mehdi_id,   current_date,     'apres_midi', 'reserve',    v_bl3_id),
  (v_mehdi_id,   current_date,     'soir',       'disponible', null),
  -- Demain (planning)
  (v_karim_id,   current_date + 1, 'matin',      'disponible', null),
  (v_karim_id,   current_date + 1, 'apres_midi', 'disponible', null),
  (v_yassine_id, current_date + 1, 'matin',      'disponible', null),
  (v_yassine_id, current_date + 1, 'apres_midi', 'disponible', null),
  (v_mehdi_id,   current_date + 1, 'matin',      'disponible', null)
  on conflict (livreur_id, date_creneau, type_creneau) do nothing;

  -- ─── 7) notifications mock (in-app feed) ──────────────────────────────────
  delete from livreur.notifications
   where bl_id in (v_bl1_id, v_bl2_id, v_bl3_id);

  insert into livreur.notifications (user_id, type, title, body, link, bl_id) values
  (v_karim_id,   'bl_assigned',          'Nouveau BL assigné',
   'M. Dupont · 12 Rue Bayard · Canapé 3 places', '/bl/' || v_bl1_id, v_bl1_id),
  (v_yassine_id, 'bl_assigned',          'Nouveau BL assigné',
   'Mme El Khalid · 5 Av Jean Jaurès · 2 articles', '/bl/' || v_bl2_id, v_bl2_id),
  (v_mehdi_id,   'bl_release_validated', 'BL débloqué par Fayssal',
   'Tu peux démarrer la livraison', '/bl/' || v_bl3_id, v_bl3_id);

  -- ─── 8) signature mock (BL 4 = signé) ─────────────────────────────────────
  insert into livreur.signatures_electroniques (
    bl_id, token, email_client, statut,
    signature_data, date_emission, date_expiration, date_signature, signe_par_parent
  ) values (
    v_bl4_id, 'mock-jwt-' || gen_random_uuid()::text,
    'karim.bouchareb@example.com', 'signe',
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    now() - interval '1 day' - interval '5 minutes',
    now() - interval '1 day' + interval '5 minutes',
    now() - interval '1 day', false
  )
  on conflict (bl_id) do nothing;

  -- ─── 9) tentative log (BL 5 = échec T1) ───────────────────────────────────
  insert into livreur.bl_attempt_log (bl_id, livreur_id, numero_tentative, motif, commentaire) values
  (v_bl5_id, v_yassine_id, 1, 'client_absent',
   'Sonné 3 fois, appelé téléphone — pas de réponse. Voisin non disponible. Re-planifié.');

  raise notice '✅  Seed dev terminé : 5 profiles, 5 clients, 5 commandes, 5 BL, 8 lignes, 12 créneaux, 3 notifs, 1 signature, 1 tentative.';
end $$;

-- ─── Register this migration ───────────────────────────────────────────────
insert into public._migrations (filename, app, checksum)
values ('009_livreur_seed_dev.sql', 'livreur', null)
on conflict (filename) do nothing;

-- ════════════════════════════════════════════════════════════════════════════
--  Verification :
--    select count(*) from livreur.profiles;                 -- 5
--    select count(*) from livreur.clients;                  -- 5
--    select count(*) from livreur.bons_livraison;           -- 5
--    select count(*) from livreur.lignes_bl;                -- 8
--    select count(*) from livreur.creneaux_livraison;       -- 12
--    select count(*) from livreur.notifications;            -- 3
--    select count(*) from livreur.signatures_electroniques; -- 1
--    select count(*) from livreur.bl_attempt_log;           -- 1
-- ════════════════════════════════════════════════════════════════════════════
