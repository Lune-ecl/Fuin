-- =====================================================================
--  封  Migration 004 — Demandes de création de sceau + outils de trame
-- ---------------------------------------------------------------------
--  À exécuter UNE FOIS dans Supabase → SQL Editor (après la 003).
--  • Demandes de création de sceau (4e cercle et plus) et leur examen
--    par le Conclave (validation, ou refus avec explication).
--  • Outils de trame du Conclave : tables de roll (désenclavement,
--    déchiffrement, pose) et lecture du contenu pour le déchiffreur.
-- =====================================================================

-- Demandes de création de sceau (4e cercle et plus)
create table if not exists fuin.seal_requests (
  id          serial primary key,
  member_id   uuid not null references fuin.members(id) on delete cascade,
  title       text not null check (length(btrim(title)) between 1 and 120),
  circle      smallint check (circle between 1 and 5),
  kanji       text not null default '',
  description text not null default '',
  content_md  text not null default '',
  icon_svg    text,
  status      text not null default 'pending' check (status in ('pending', 'approved', 'refused')),
  review_note text not null default '',
  reviewed_by uuid references fuin.members(id) on delete set null,
  reviewed_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists seal_requests_status_idx on fuin.seal_requests(status, created_at desc);
create index if not exists seal_requests_member_idx on fuin.seal_requests(member_id);
alter table fuin.seal_requests enable row level security;

-- Tables de roll des outils de trame (paliers : min, max, label, tone, effect)
create table if not exists fuin.roll_tables (
  id          serial primary key,
  slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name        text not null check (length(btrim(name)) > 0),
  description text not null default '',
  tiers       jsonb not null default '[]'::jsonb,
  position    integer not null default 0,
  updated_at  timestamptz not null default now()
);
alter table fuin.roll_tables enable row level security;

-- =====================================================================
--  DEMANDES DE CRÉATION DE SCEAU
-- =====================================================================
create or replace function fuin.can_request(m fuin.members) returns boolean
language sql stable set search_path = '' as $$
  select m.is_conclave or m.rank >= 4
$$;

create or replace function fuin.request_json(r fuin.seal_requests, p_full boolean) returns json
language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'id', r.id, 'title', r.title, 'circle', r.circle, 'kanji', r.kanji, 'description', r.description,
    'content_md', r.content_md, 'icon_svg', r.icon_svg, 'status', r.status, 'review_note', r.review_note,
    'created_at', r.created_at, 'reviewed_at', r.reviewed_at,
    'reviewed_by', (select display_name from fuin.members where id = r.reviewed_by),
    'member', case when p_full then (
      select json_build_object('id', mm.id, 'name', mm.display_name, 'rank', mm.rank, 'is_conclave', mm.is_conclave)
        from fuin.members mm where mm.id = r.member_id) else null end
  )
$$;

create or replace function public.fuin_requests_mine(p_token text)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare m fuin.members;
begin
  m := fuin.session_member(p_token);
  if not fuin.can_request(m) then
    perform fuin.fail('FU403', 'Les demandes de création de sceau s''ouvrent au 4ème cercle.');
  end if;
  return coalesce((select json_agg(fuin.request_json(r, false) order by r.created_at desc)
                     from fuin.seal_requests r where r.member_id = m.id), '[]'::json);
end $$;

create or replace function public.fuin_request_submit(p_token text, p_req jsonb)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  m fuin.members;
  v_title text := btrim(coalesce(p_req ->> 'title', ''));
  v_circle integer := nullif(p_req ->> 'circle', '')::integer;
  v_icon text := nullif(btrim(coalesce(p_req ->> 'icon_svg', '')), '');
  v_id integer;
begin
  m := fuin.session_member(p_token);
  if not fuin.can_request(m) then
    perform fuin.fail('FU403', 'Les demandes de création de sceau s''ouvrent au 4ème cercle.');
  end if;
  if v_title = '' then perform fuin.fail('FU422', 'Donne un nom à ton sceau.'); end if;
  if length(v_title) > 120 then perform fuin.fail('FU422', 'Nom trop long (120 caractères maximum).'); end if;
  if v_circle is not null and v_circle not between 1 and 5 then perform fuin.fail('FU422', 'Cercle invalide.'); end if;
  if length(coalesce(p_req ->> 'kanji', '')) > 60 then perform fuin.fail('FU422', 'Formule de kanjis trop longue.'); end if;
  if length(coalesce(p_req ->> 'description', '')) > 400 then perform fuin.fail('FU422', 'Description trop longue (400 caractères maximum).'); end if;
  if length(coalesce(p_req ->> 'content_md', '')) > 20000 then perform fuin.fail('FU422', 'Texte trop long.'); end if;
  if v_icon is not null and (length(v_icon) > 60000 or v_icon !~* '^<svg') then
    perform fuin.fail('FU422', 'Visuel invalide.');
  end if;
  if (select count(*) from fuin.seal_requests where member_id = m.id and status = 'pending') >= 5 then
    perform fuin.fail('FU422', 'Tu as déjà 5 demandes en attente. Patiente jusqu''à leur examen par le Conclave.');
  end if;
  insert into fuin.seal_requests(member_id, title, circle, kanji, description, content_md, icon_svg)
  values (m.id, v_title, v_circle, btrim(coalesce(p_req ->> 'kanji', '')), btrim(coalesce(p_req ->> 'description', '')),
          coalesce(p_req ->> 'content_md', ''), v_icon)
  returning id into v_id;
  perform fuin.log(m, 'request.create', v_title);
  return json_build_object('id', v_id);
end $$;

create or replace function public.fuin_request_withdraw(p_token text, p_id integer)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  m fuin.members;
  v_title text;
begin
  m := fuin.session_member(p_token);
  delete from fuin.seal_requests where id = p_id and member_id = m.id and status = 'pending'
  returning title into v_title;
  if v_title is null then perform fuin.fail('FU404', 'Demande introuvable ou déjà examinée.'); end if;
  perform fuin.log(m, 'request.withdraw', v_title);
  return json_build_object('ok', true);
end $$;

create or replace function public.fuin_admin_requests(p_token text)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare m fuin.members;
begin
  m := fuin.require_conclave(p_token);
  return coalesce((select json_agg(fuin.request_json(r, true)
                     order by (r.status = 'pending') desc, coalesce(r.reviewed_at, r.created_at) desc)
                     from fuin.seal_requests r), '[]'::json);
end $$;

create or replace function public.fuin_admin_request_review(p_token text, p_id integer, p_decision text, p_note text default '')
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  m fuin.members;
  r fuin.seal_requests;
  v_note text := btrim(coalesce(p_note, ''));
begin
  m := fuin.require_conclave(p_token);
  if p_decision not in ('approved', 'refused') then perform fuin.fail('FU422', 'Décision invalide.'); end if;
  if p_decision = 'refused' and v_note = '' then
    perform fuin.fail('FU422', 'Explique la raison du refus au shinobi.');
  end if;
  select * into r from fuin.seal_requests where id = p_id;
  if not found then perform fuin.fail('FU404', 'Demande introuvable.'); end if;
  if r.status <> 'pending' then perform fuin.fail('FU409', 'Cette demande a déjà été examinée.'); end if;
  update fuin.seal_requests
     set status = p_decision, review_note = v_note, reviewed_by = m.id, reviewed_at = now(), updated_at = now()
   where id = p_id;
  perform fuin.log(m, case when p_decision = 'approved' then 'request.approve' else 'request.refuse' end, r.title,
    jsonb_build_object('member', (select display_name from fuin.members where id = r.member_id)));
  return json_build_object('ok', true);
end $$;

-- =====================================================================
--  OUTILS DE TRAME (Conclave)
-- =====================================================================
-- Tout le contenu des fiches, pour le déchiffreur de kanjis
create or replace function public.fuin_admin_codex(p_token text)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare m fuin.members;
begin
  m := fuin.require_conclave(p_token);
  return coalesce((
    select json_agg(json_build_object(
      'slug', p.slug, 'title', p.title, 'kind', p.kind, 'kanji', p.kanji, 'badge', p.badge,
      'category', c.name, 'content_md', p.content_md
    ) order by c.position, p.position)
    from fuin.pages p join fuin.categories c on c.id = p.category_id
  ), '[]'::json);
end $$;

create or replace function public.fuin_admin_roll_tables(p_token text)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare m fuin.members;
begin
  m := fuin.require_conclave(p_token);
  return coalesce((select json_agg(json_build_object(
      'id', t.id, 'slug', t.slug, 'name', t.name, 'description', t.description, 'tiers', t.tiers,
      'position', t.position, 'updated_at', t.updated_at) order by t.position, t.name)
    from fuin.roll_tables t), '[]'::json);
end $$;

create or replace function public.fuin_admin_roll_table_save(p_token text, p_table jsonb)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  m fuin.members;
  v_id integer := nullif(p_table ->> 'id', '')::integer;
  v_name text := btrim(coalesce(p_table ->> 'name', ''));
  v_slug text := lower(btrim(coalesce(p_table ->> 'slug', '')));
  v_tiers jsonb := coalesce(p_table -> 'tiers', '[]'::jsonb);
  t jsonb;
begin
  m := fuin.require_conclave(p_token);
  if v_name = '' then perform fuin.fail('FU422', 'Donne un nom à la table.'); end if;
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then perform fuin.fail('FU422', 'Identifiant de table invalide.'); end if;
  if jsonb_typeof(v_tiers) <> 'array' or jsonb_array_length(v_tiers) = 0 then
    perform fuin.fail('FU422', 'Ajoute au moins un palier.');
  end if;
  for t in select * from jsonb_array_elements(v_tiers) loop
    if (t ->> 'min') is null or (t ->> 'max') is null
       or (t ->> 'min')::integer not between 1 and 100 or (t ->> 'max')::integer not between 1 and 100
       or (t ->> 'min')::integer > (t ->> 'max')::integer then
      perform fuin.fail('FU422', format('Palier « %s » : bornes invalides (1 à 100, min ≤ max).', coalesce(t ->> 'label', '?')));
    end if;
  end loop;
  if exists (select 1 from fuin.roll_tables where slug = v_slug and id is distinct from v_id) then
    perform fuin.fail('FU409', 'Une autre table utilise déjà cet identifiant.');
  end if;
  if v_id is null then
    insert into fuin.roll_tables(slug, name, description, tiers, position)
    values (v_slug, v_name, coalesce(p_table ->> 'description', ''), v_tiers,
            (select coalesce(max(position), 0) + 1 from fuin.roll_tables))
    returning id into v_id;
  else
    update fuin.roll_tables
       set slug = v_slug, name = v_name, description = coalesce(p_table ->> 'description', ''), tiers = v_tiers, updated_at = now()
     where id = v_id;
    if not found then perform fuin.fail('FU404', 'Table introuvable.'); end if;
  end if;
  perform fuin.log(m, 'rolltable.save', v_name);
  return json_build_object('id', v_id);
end $$;

create or replace function public.fuin_admin_roll_table_delete(p_token text, p_id integer)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  m fuin.members;
  v_name text;
begin
  m := fuin.require_conclave(p_token);
  delete from fuin.roll_tables where id = p_id returning name into v_name;
  if v_name is null then perform fuin.fail('FU404', 'Table introuvable.'); end if;
  perform fuin.log(m, 'rolltable.delete', v_name);
  return json_build_object('ok', true);
end $$;


-- Session + sommaire du grimoire filtré selon le cercle du membre
create or replace function public.fuin_bootstrap(p_token text)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare m fuin.members;
begin
  m := fuin.session_member(p_token);
  return json_build_object(
    'member', fuin.member_json(m),
    'requests_pending', case when m.is_conclave
                          then (select count(*) from fuin.seal_requests where status = 'pending') end,
    'categories', coalesce((
      select json_agg(json_build_object(
        'id', c.id, 'slug', c.slug, 'name', c.name, 'glyph', c.glyph, 'tagline', c.tagline,
        'min_rank', c.min_rank, 'conclave_only', c.conclave_only, 'show_on_home', c.show_on_home,
        'accessible', fuin.can_view_category(m, c),
        'seal_count', (select count(*) from fuin.pages p where p.category_id = c.id and p.kind = 'seal'
                         and not p.hidden and p.badge is distinct from 'mj'),
        'pages', case when fuin.can_view_category(m, c) then coalesce((
            select json_agg(json_build_object(
              'slug', p.slug, 'title', p.title, 'nav_title', coalesce(nullif(p.nav_title, ''), p.title),
              'kind', p.kind, 'badge', p.badge, 'kanji', p.kanji, 'hidden', p.hidden,
              'description', p.description, 'slotted', fuin.is_slotted(p.id)
            ) order by p.position, p.title)
            from fuin.pages p
            where p.category_id = c.id and fuin.can_view_page(m, c, p)
          ), '[]'::json) else '[]'::json end
      ) order by c.position, c.name)
      from fuin.categories c
      where m.is_conclave or not c.conclave_only   -- les catégories du Conclave n'existent pas pour les joueurs
    ), '[]'::json)
  );
end $$;

create or replace function public.fuin_admin_overview(p_token text)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare m fuin.members;
begin
  m := fuin.require_conclave(p_token);
  return json_build_object(
    'members', (select count(*) from fuin.members),
    'conclave', (select count(*) from fuin.members where is_conclave),
    'players', (select count(*) from fuin.members where not is_conclave),
    'inactive', (select count(*) from fuin.members where password_hash is null),
    'active_week', (select count(*) from fuin.members where last_login_at > now() - interval '7 days'),
    'by_rank', (select json_agg(json_build_object('rank', r, 'count',
                  (select count(*) from fuin.members where rank = r and not is_conclave)) order by r)
                from generate_series(1, 5) r),
    'pages', (select count(*) from fuin.pages where kind = 'seal'),
    'hidden', (select count(*) from fuin.pages where hidden),
    'slotted', (select count(*) from fuin.slot_seals s where fuin.is_slotted(s.page_id)),
    'slot_taken', (select count(*) from fuin.slot_assignments),
    'slot_total', (select coalesce(sum(cap), 0) from fuin.slot_caps),
    'requests_pending', (select count(*) from fuin.seal_requests where status = 'pending'),
    'recent', coalesce((select json_agg(x) from (
        select id, actor_name, action, target, details, created_at
          from fuin.audit_log order by created_at desc limit 8) x), '[]'::json)
  );
end $$;

create or replace function public.fuin_admin_page_save(p_token text, p_page jsonb)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  m fuin.members;
  v_id integer := nullif(p_page ->> 'id', '')::integer;
  v_slug text := lower(trim(both '/' from coalesce(p_page ->> 'slug', '')));
  v_title text := btrim(coalesce(p_page ->> 'title', ''));
  v_kind text := coalesce(nullif(p_page ->> 'kind', ''), 'seal');
  v_cat integer := nullif(p_page ->> 'category_id', '')::integer;
  v_badge text := nullif(p_page ->> 'badge', '');
  v_min integer := nullif(p_page ->> 'min_rank', '')::integer;
begin
  m := fuin.require_conclave(p_token);
  if v_title = '' then perform fuin.fail('FU422', 'Le titre est obligatoire.'); end if;
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*(/[a-z0-9]+(-[a-z0-9]+)*)*$' then
    perform fuin.fail('FU422', 'Identifiant d''URL invalide : lettres minuscules, chiffres, tirets (ex. premier-cercle/mon-sceau).');
  end if;
  if split_part(v_slug, '/', 1) in ('connexion', 'conclave', 'mon-compte', 'demandes', 'assets') then
    perform fuin.fail('FU422', 'Cet identifiant d''URL est réservé par le site.');
  end if;
  if v_kind not in ('seal', 'index', 'doc') then perform fuin.fail('FU422', 'Type de fiche invalide.'); end if;
  if v_badge is not null and v_badge <> 'mj' then perform fuin.fail('FU422', 'Badge invalide.'); end if;
  if v_min is not null and v_min not between 1 and 5 then perform fuin.fail('FU422', 'Cercle minimum invalide.'); end if;
  if not exists (select 1 from fuin.categories where id = v_cat) then
    perform fuin.fail('FU422', 'Catégorie inconnue.');
  end if;
  if exists (select 1 from fuin.pages where slug = v_slug and id is distinct from v_id) then
    perform fuin.fail('FU409', 'Une autre fiche utilise déjà cet identifiant d''URL.');
  end if;

  if v_id is null then
    insert into fuin.pages(category_id, slug, kind, title, nav_title, description, badge, kanji, icon_svg,
                           content_md, min_rank, hidden, position, updated_by)
    values (v_cat, v_slug, v_kind, v_title, nullif(btrim(coalesce(p_page ->> 'nav_title', '')), ''),
            coalesce(p_page ->> 'description', ''), v_badge, nullif(btrim(coalesce(p_page ->> 'kanji', '')), ''),
            nullif(btrim(coalesce(p_page ->> 'icon_svg', '')), ''), coalesce(p_page ->> 'content_md', ''),
            v_min, coalesce((p_page ->> 'hidden')::boolean, false),
            coalesce(nullif(p_page ->> 'position', '')::integer,
                     (select coalesce(max(position), 0) + 1 from fuin.pages where category_id = v_cat)),
            m.id)
    returning id into v_id;
    perform fuin.log(m, 'page.create', v_title, jsonb_build_object('slug', v_slug));
  else
    update fuin.pages set
      category_id = v_cat, slug = v_slug, kind = v_kind, title = v_title,
      nav_title = nullif(btrim(coalesce(p_page ->> 'nav_title', '')), ''),
      description = coalesce(p_page ->> 'description', ''), badge = v_badge,
      kanji = nullif(btrim(coalesce(p_page ->> 'kanji', '')), ''),
      icon_svg = nullif(btrim(coalesce(p_page ->> 'icon_svg', '')), ''),
      content_md = coalesce(p_page ->> 'content_md', ''), min_rank = v_min,
      hidden = coalesce((p_page ->> 'hidden')::boolean, false),
      position = coalesce(nullif(p_page ->> 'position', '')::integer, position),
      updated_at = now(), updated_by = m.id
    where id = v_id;
    if not found then perform fuin.fail('FU404', 'Fiche introuvable.'); end if;
    perform fuin.log(m, 'page.update', v_title, jsonb_build_object('slug', v_slug));
  end if;
  return json_build_object('id', v_id, 'slug', v_slug);
end $$;

-- =====================================================================
--  Droits : seules les fonctions public.fuin_* sont appelables par le site
-- =====================================================================
revoke all on all tables in schema fuin from public;
revoke all on all functions in schema fuin from public;

do $$
declare
  f record;
  has_anon boolean := exists (select 1 from pg_roles where rolname = 'anon');
  has_auth boolean := exists (select 1 from pg_roles where rolname = 'authenticated');
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'fuin\_%'
  loop
    execute format('revoke all on function %s from public', f.sig);
    if has_anon then execute format('grant execute on function %s to anon', f.sig); end if;
    if has_auth then execute format('grant execute on function %s to authenticated', f.sig); end if;
  end loop;
  -- les fonctions internes ne doivent jamais être exposées
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'fuin'
  loop
    if has_anon then execute format('revoke all on function %s from anon', f.sig); end if;
    if has_auth then execute format('revoke all on function %s from authenticated', f.sig); end if;
  end loop;
end $$;

-- Tables de roll par défaut (à adapter dans Console → Outils de trame → Tables de roll)
insert into fuin.roll_tables(slug, name, description, tiers, position) values
('desenclavement', 'Désenclavement',
 'Un roll par essai. Il faut autant de réussites que le cercle du sceau, en autant d''essais que le cercle du désenclaveur. Effets à adapter par le Conclave.',
 '[
   {"min":1,"max":1,"label":"Échec critique","tone":"crit-fail","effect":"Le sceau se retourne contre le désenclaveur : violent retour de chakra (blessure grave ou perte de conscience selon le cercle du sceau). L''essai est perdu."},
   {"min":2,"max":15,"label":"Échec avec contrecoup","tone":"fail","effect":"Le sceau résiste et renvoie une partie du chakra : douleur vive, épuisement ou brûlure du kanji dans la paume."},
   {"min":16,"max":50,"label":"Échec","tone":"neutral","effect":"Le sceau tient bon, sans conséquence."},
   {"min":51,"max":90,"label":"Réussite","tone":"success","effect":"Un verrou du sceau cède."},
   {"min":91,"max":99,"label":"Belle réussite","tone":"success","effect":"Le verrou cède proprement et le désenclaveur comprend mieux la structure du sceau."},
   {"min":100,"max":100,"label":"Réussite critique","tone":"crit-success","effect":"Le verrou se brise net, sans le moindre contrecoup."}
 ]'::jsonb, 1),
('dechiffrement', 'Déchiffrement',
 'Un roll par kanji lors du déchiffrement d''une inscription.',
 '[
   {"min":1,"max":1,"label":"Contresens","tone":"crit-fail","effect":"Le kanji est mal lu : le déchiffreur lui prête un faux sens."},
   {"min":2,"max":50,"label":"Illisible","tone":"neutral","effect":"Le kanji reste incompris."},
   {"min":51,"max":95,"label":"Déchiffré","tone":"success","effect":"Le sens du kanji est compris."},
   {"min":96,"max":100,"label":"Déchiffré avec intuition","tone":"crit-success","effect":"Le sens est compris et le déchiffreur pressent l''intention du sceau."}
 ]'::jsonb, 2),
('pose', 'Pose de sceau',
 'Roll de pose (règle générale : réussite au-dessus de 50).',
 '[
   {"min":1,"max":1,"label":"Échec critique","tone":"crit-fail","effect":"Le sceau se déforme : effet inverse ou explosion de chakra sur le poseur."},
   {"min":2,"max":50,"label":"Échec","tone":"neutral","effect":"Le sceau ne prend pas."},
   {"min":51,"max":99,"label":"Réussite","tone":"success","effect":"Le sceau est posé."},
   {"min":100,"max":100,"label":"Réussite critique","tone":"crit-success","effect":"Pose parfaite : le sceau est plus difficile à désenclaver."}
 ]'::jsonb, 3)
on conflict (slug) do nothing;

notify pgrst, 'reload schema';

select 'Migration 004 appliquée : demandes de création de sceau et outils de trame prêts.' as resultat;
