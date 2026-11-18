-- =====================================================================
--  封  FUINJUTSU · ARCHIVES DE ZENKAI — Schéma Supabase
-- ---------------------------------------------------------------------
--  À exécuter UNE FOIS dans Supabase → SQL Editor (ré-exécutable sans
--  perte de données : tout est en "if not exists" / "create or replace").
--
--  Principe de sécurité :
--   • Toutes les tables vivent dans le schéma privé `fuin`, invisible
--     depuis l'API (la clé anon ne peut RIEN lire directement).
--   • Le site ne parle à la base qu'au travers des fonctions
--     `public.fuin_*` (SECURITY DEFINER) qui vérifient la session et le
--     cercle du membre AVANT de renvoyer le moindre contenu.
--   • Les comptes sont créés par le Conclave (prénom + nom RP + mot de
--     passe). Les mots de passe sont hachés en bcrypt (pgcrypto).
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

create schema if not exists fuin;
revoke all on schema fuin from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on schema fuin from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on schema fuin from authenticated';
  end if;
end $$;

-- ---------------------------------------------------------------------
--  Normalisation des noms RP (insensible à la casse et aux accents)
--  "Sôka  Shirogane" → "soka shirogane"
-- ---------------------------------------------------------------------
create or replace function fuin.name_key(p text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select btrim(regexp_replace(
    translate(lower(coalesce(p, '')),
      'àáâãäåāçèéêëēìíîïīñòóôõöōùúûüūýÿ',
      'aaaaaaaceeeeeiiiiinoooooouuuuuyy'),
    '[^a-z0-9]+', ' ', 'g'))
$$;

-- ---------------------------------------------------------------------
--  Tables
-- ---------------------------------------------------------------------
create table if not exists fuin.members (
  id              uuid primary key default gen_random_uuid(),
  prenom          text not null check (length(btrim(prenom)) between 1 and 60),
  nom             text not null default '' check (length(nom) <= 60),
  display_name    text generated always as (btrim(btrim(prenom) || ' ' || btrim(nom))) stored,
  login_key       text generated always as (fuin.name_key(prenom || ' ' || nom)) stored,
  rank            smallint not null default 1 check (rank between 1 and 5),
  is_conclave     boolean not null default false,
  password_hash   text,
  failed_attempts integer not null default 0,
  locked_until    timestamptz,
  last_login_at   timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint members_login_key_unique unique (login_key)
);

create table if not exists fuin.sessions (
  token_hash   text primary key,
  member_id    uuid not null references fuin.members(id) on delete cascade,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '30 days'
);
create index if not exists sessions_member_idx on fuin.sessions(member_id);

create table if not exists fuin.categories (
  id            serial primary key,
  slug          text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name          text not null check (length(btrim(name)) > 0),
  glyph         text not null default '封',
  tagline       text not null default '',
  min_rank      smallint not null default 1 check (min_rank between 1 and 5),
  conclave_only boolean not null default false,
  show_on_home  boolean not null default true,
  position      integer not null default 0
);

create table if not exists fuin.pages (
  id          serial primary key,
  category_id integer not null references fuin.categories(id) on delete restrict,
  slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*(/[a-z0-9]+(-[a-z0-9]+)*)*$'),
  kind        text not null default 'seal' check (kind in ('seal', 'index', 'doc')),
  title       text not null check (length(btrim(title)) > 0),
  nav_title   text,
  description text not null default '',
  badge       text check (badge in ('mj')),
  kanji       text,
  icon_svg    text,
  content_md  text not null default '',
  min_rank    smallint check (min_rank between 1 and 5),
  hidden      boolean not null default false,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references fuin.members(id) on delete set null
);
create index if not exists pages_category_idx on fuin.pages(category_id, position);

create table if not exists fuin.villages (
  id       serial primary key,
  name     text not null unique check (length(btrim(name)) > 0),
  position integer not null default 0
);

create table if not exists fuin.slot_seals (
  page_id    integer primary key references fuin.pages(id) on delete cascade,
  notes      text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists fuin.slot_caps (
  page_id    integer not null references fuin.slot_seals(page_id) on delete cascade,
  village_id integer not null references fuin.villages(id) on delete cascade,
  cap        integer not null default 0 check (cap >= 0),
  primary key (page_id, village_id)
);

create table if not exists fuin.slot_assignments (
  id          serial primary key,
  page_id     integer not null references fuin.slot_seals(page_id) on delete cascade,
  village_id  integer not null references fuin.villages(id) on delete cascade,
  member_id   uuid not null references fuin.members(id) on delete cascade,
  note        text not null default '',
  assigned_at timestamptz not null default now(),
  assigned_by uuid references fuin.members(id) on delete set null,
  constraint slot_assignments_unique unique (page_id, member_id)
);

create table if not exists fuin.audit_log (
  id         bigserial primary key,
  actor_id   uuid references fuin.members(id) on delete set null,
  actor_name text not null default '',
  action     text not null,
  target     text not null default '',
  details    jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_created_idx on fuin.audit_log(created_at desc);

-- Veille anti-pause : touchée chaque jour par le workflow GitHub "keepalive"
create table if not exists fuin.keepalive (
  id        smallint primary key default 1 check (id = 1),
  pinged_at timestamptz not null default now(),
  pings     bigint not null default 0
);

-- Défense en profondeur : RLS activé sans aucune policy = accès direct refusé.
alter table fuin.members          enable row level security;
alter table fuin.sessions         enable row level security;
alter table fuin.categories       enable row level security;
alter table fuin.pages            enable row level security;
alter table fuin.villages         enable row level security;
alter table fuin.slot_seals       enable row level security;
alter table fuin.slot_caps        enable row level security;
alter table fuin.slot_assignments enable row level security;
alter table fuin.audit_log        enable row level security;
alter table fuin.keepalive        enable row level security;

-- ---------------------------------------------------------------------
--  Utilitaires internes
-- ---------------------------------------------------------------------
create or replace function fuin.fail(p_code text, p_message text, p_detail text default null)
returns void language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = p_code, message = p_message, detail = coalesce(p_detail, '');
end $$;

create or replace function fuin.gen_password() returns text
language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  b bytea := extensions.gen_random_bytes(12);
  r text := '';
begin
  for i in 0..11 loop
    if i in (4, 8) then r := r || '-'; end if;
    r := r || substr(alphabet, (get_byte(b, i) % length(alphabet)) + 1, 1);
  end loop;
  return r;
end $$;

create or replace function fuin.hash_password(p text) returns text
language sql volatile set search_path = '' as $$
  select extensions.crypt(p, extensions.gen_salt('bf', 10))
$$;

create or replace function fuin.check_password_strength(p text) returns void
language plpgsql set search_path = '' as $$
begin
  if p is null or length(p) < 8 then
    perform fuin.fail('FU422', 'Le mot de passe doit contenir au moins 8 caractères.');
  end if;
  if length(p) > 72 then
    perform fuin.fail('FU422', 'Le mot de passe est trop long (72 caractères maximum).');
  end if;
end $$;

create or replace function fuin.member_json(m fuin.members) returns json
language sql stable set search_path = '' as $$
  select json_build_object(
    'id', m.id, 'prenom', m.prenom, 'nom', m.nom, 'display_name', m.display_name,
    'rank', m.rank, 'is_conclave', m.is_conclave
  )
$$;

create or replace function fuin.log(p_actor fuin.members, p_action text, p_target text, p_details jsonb default null)
returns void language sql volatile security definer set search_path = '' as $$
  insert into fuin.audit_log(actor_id, actor_name, action, target, details)
  values (p_actor.id, coalesce(p_actor.display_name, ''), p_action, coalesce(p_target, ''), p_details)
$$;

-- Session → membre (lève FU401 si invalide ou expirée)
create or replace function fuin.session_member(p_token text) returns fuin.members
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_hash   text;
  v_member fuin.members;
begin
  if p_token is null or length(p_token) <> 64 then
    perform fuin.fail('FU401', 'Session invalide ou expirée. Reconnecte-toi.');
  end if;
  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');
  select m.* into v_member
    from fuin.sessions s join fuin.members m on m.id = s.member_id
   where s.token_hash = v_hash and s.expires_at > now();
  if not found then
    perform fuin.fail('FU401', 'Session invalide ou expirée. Reconnecte-toi.');
  end if;
  update fuin.sessions
     set last_seen_at = now(), expires_at = now() + interval '30 days'
   where token_hash = v_hash and last_seen_at < now() - interval '10 minutes';
  return v_member;
end $$;

create or replace function fuin.require_conclave(p_token text) returns fuin.members
language plpgsql volatile security definer set search_path = '' as $$
declare v_member fuin.members;
begin
  v_member := fuin.session_member(p_token);
  if not v_member.is_conclave then
    perform fuin.fail('FU403', 'Réservé au Conclave.');
  end if;
  return v_member;
end $$;

-- Règles d'accès : le Conclave voit tout ; sinon cercle du membre ≥ cercle requis.
create or replace function fuin.can_view_category(m fuin.members, c fuin.categories) returns boolean
language sql stable set search_path = '' as $$
  select m.is_conclave or (not c.conclave_only and m.rank >= c.min_rank)
$$;

create or replace function fuin.can_view_page(m fuin.members, c fuin.categories, p fuin.pages) returns boolean
language sql stable set search_path = '' as $$
  select m.is_conclave
      or (not p.hidden
          and p.badge is distinct from 'mj'            -- un sceau MJ n'est jamais visible d'un joueur
          and not c.conclave_only
          and m.rank >= greatest(c.min_rank, coalesce(p.min_rank, 1)))
$$;

create or replace function fuin.is_slotted(p_page_id integer) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select sum(cap) from fuin.slot_caps where page_id = p_page_id), 0) > 0
$$;

-- Statut de slot d'une fiche (noms des porteurs uniquement pour le Conclave)
create or replace function fuin.slot_json(p_page_id integer, p_full boolean) returns json
language sql stable security definer set search_path = '' as $$
  select case when s.page_id is null then null else json_build_object(
    'notes', case when p_full then s.notes else null end,
    'total_cap', (select coalesce(sum(cap), 0) from fuin.slot_caps where page_id = s.page_id),
    'total_taken', (select count(*) from fuin.slot_assignments where page_id = s.page_id),
    'villages', coalesce((
      select json_agg(json_build_object(
        'village_id', v.id,
        'name', v.name,
        'cap', coalesce(sc.cap, 0),
        'taken', (select count(*) from fuin.slot_assignments a where a.page_id = s.page_id and a.village_id = v.id),
        'occupants', case when p_full then (
            select coalesce(json_agg(json_build_object('id', a.id, 'member_id', a.member_id, 'name', mm.display_name, 'note', a.note) order by a.assigned_at), '[]'::json)
              from fuin.slot_assignments a join fuin.members mm on mm.id = a.member_id
             where a.page_id = s.page_id and a.village_id = v.id
          ) else null end
      ) order by v.position, v.name)
      from fuin.villages v
      left join fuin.slot_caps sc on sc.village_id = v.id and sc.page_id = s.page_id
      where coalesce(sc.cap, 0) > 0
         or exists (select 1 from fuin.slot_assignments a where a.page_id = s.page_id and a.village_id = v.id)
    ), '[]'::json)
  ) end
  from (select p_page_id as pid) x
  left join fuin.slot_seals s on s.page_id = x.pid
$$;

-- Création / mise à jour d'un membre (utilisée par la console et le bootstrap)
create or replace function fuin.upsert_member(
  p_prenom text, p_nom text, p_password text, p_rank smallint, p_is_conclave boolean
) returns fuin.members
language plpgsql volatile security definer set search_path = '' as $$
declare v_member fuin.members;
begin
  if p_password is not null then
    perform fuin.check_password_strength(p_password);
  end if;
  insert into fuin.members(prenom, nom, rank, is_conclave, password_hash)
  values (btrim(p_prenom), btrim(coalesce(p_nom, '')), p_rank, p_is_conclave,
          case when p_password is null then null else fuin.hash_password(p_password) end)
  on conflict (login_key) do update
     set rank = excluded.rank,
         is_conclave = excluded.is_conclave,
         password_hash = coalesce(excluded.password_hash, fuin.members.password_hash),
         updated_at = now()
  returning * into v_member;
  return v_member;
end $$;

-- ▶ À lancer à la main dans le SQL Editor pour créer le premier membre du Conclave :
--   select fuin.bootstrap_conclave('Prénom', 'Nom', 'MotDePasseSolide');
create or replace function fuin.bootstrap_conclave(p_prenom text, p_nom text, p_password text)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare v_member fuin.members;
begin
  v_member := fuin.upsert_member(p_prenom, p_nom, p_password, 5::smallint, true);
  return 'Conclave prêt : ' || v_member.display_name || ' peut se connecter.';
end $$;

-- Retire d'un texte, pour un joueur, toute mention des fiches secrètes (sceaux MJ, catégories
-- du Conclave, brouillons) : lignes contenant un lien vers elles, lignes de tableau qui les citent,
-- puis tableaux et sections devenus vides. Le Conclave reçoit le texte intact.
create or replace function fuin.strip_secret(m fuin.members, p_md text) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v    text;
  src  text[];
  tmp  text[] := '{}';
  res  text[] := '{}';
  n    integer;
  i    integer;
  line text;
  nxt  text;
begin
  if m.is_conclave or p_md is null or p_md = '' then
    return p_md;
  end if;

  select string_agg(t.line, E'\n' order by t.n) into v
    from regexp_split_to_table(p_md, E'\n') with ordinality as t(line, n)
   where not exists (
     select 1
       from fuin.pages q join fuin.categories qc on qc.id = q.category_id
      where (qc.conclave_only or q.hidden or q.badge is not distinct from 'mj')
        and not fuin.can_view_page(m, qc, q)
        and (strpos(t.line, '](/' || q.slug || ')') > 0
             or (ltrim(t.line) like '|%'
                 and ((q.kanji is not null and length(q.kanji) >= 3 and strpos(t.line, '| ' || q.kanji || ' |') > 0)
                      or strpos(t.line, '| ' || q.title || ' |') > 0))));

  src := string_to_array(coalesce(v, ''), E'\n');
  n := coalesce(array_length(src, 1), 0);

  -- tableaux réduits à leur en-tête
  i := 1;
  while i <= n loop
    if src[i] ~ '^\s*\|' and i < n and src[i + 1] ~ '^\s*\|[\s:|-]+\|\s*$'
       and (i + 2 > n or src[i + 2] !~ '^\s*\|') then
      i := i + 2;
      continue;
    end if;
    tmp := tmp || src[i];
    i := i + 1;
  end loop;

  -- titres de section devenus vides (parcours de la fin vers le début)
  n := coalesce(array_length(tmp, 1), 0);
  nxt := null;
  for i in reverse n..1 loop
    line := tmp[i];
    if line ~ '^#{1,6} ' and (nxt is null or (nxt ~ '^#{1,6} '
         and length(substring(nxt from '^(#+)')) <= length(substring(line from '^(#+)')))) then
      continue;
    end if;
    res := array_prepend(line, res);
    if btrim(line) <> '' then nxt := line; end if;
  end loop;

  return regexp_replace(array_to_string(res, E'\n'), E'\n{3,}', E'\n\n', 'g');
end $$;

-- =====================================================================
--  API PUBLIQUE (appelée par le site via supabase.rpc)
-- =====================================================================

-- Connexion : prénom + nom RP + mot de passe → jeton de session
create or replace function public.fuin_login(p_prenom text, p_nom text, p_password text)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  v_member fuin.members;
  v_token  text;
  v_fail   json := json_build_object('ok', false, 'error', 'Nom RP ou mot de passe incorrect.');
begin
  select * into v_member from fuin.members
   where login_key = fuin.name_key(coalesce(p_prenom, '') || ' ' || coalesce(p_nom, ''));

  if not found or v_member.password_hash is null then
    -- même coût de calcul qu'un vrai essai (pas d'indice sur l'existence du compte)
    perform extensions.crypt(coalesce(p_password, ''), '$2a$10$0123456789abcdefghijkl');
    return v_fail;
  end if;

  if v_member.locked_until is not null and v_member.locked_until > now() then
    return json_build_object('ok', false, 'error', 'Trop de tentatives. Réessaie dans quelques minutes.');
  end if;

  if v_member.password_hash <> extensions.crypt(coalesce(p_password, ''), v_member.password_hash) then
    update fuin.members
       set failed_attempts = failed_attempts + 1,
           locked_until = case when failed_attempts + 1 >= 8 then now() + interval '15 minutes' else null end
     where id = v_member.id;
    return v_fail;
  end if;

  update fuin.members set failed_attempts = 0, locked_until = null, last_login_at = now()
   where id = v_member.id;
  delete from fuin.sessions where expires_at < now();

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into fuin.sessions(token_hash, member_id)
  values (encode(extensions.digest(v_token, 'sha256'), 'hex'), v_member.id);

  return json_build_object('ok', true, 'token', v_token, 'member', fuin.member_json(v_member));
end $$;

create or replace function public.fuin_logout(p_token text)
returns json language plpgsql volatile security definer set search_path = '' as $$
begin
  if p_token is not null then
    delete from fuin.sessions where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  end if;
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

-- Une fiche (sceau, index de cercle ou dossier)
create or replace function public.fuin_page(p_token text, p_slug text)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  m fuin.members;
  p fuin.pages;
  c fuin.categories;
begin
  m := fuin.session_member(p_token);
  select * into p from fuin.pages where slug = trim(both '/' from coalesce(p_slug, ''));
  if not found then
    perform fuin.fail('FU404', 'Archive introuvable.');
  end if;
  select * into c from fuin.categories where id = p.category_id;

  if not fuin.can_view_page(m, c, p) then
    -- brouillons, sceaux MJ et catégories du Conclave : leur existence n'est jamais révélée
    if p.hidden or c.conclave_only or p.badge is not distinct from 'mj' then
      perform fuin.fail('FU404', 'Archive introuvable.');
    end if;
    perform fuin.fail('FU403', 'Archive scellée.', json_build_object(
      'category', c.name,
      'min_rank', greatest(c.min_rank, coalesce(p.min_rank, 1)),
      'conclave_only', c.conclave_only or p.badge is not distinct from 'mj'
    )::text);
  end if;

  return json_build_object(
    'page', json_build_object(
      'id', p.id, 'slug', p.slug, 'title', p.title, 'nav_title', coalesce(nullif(p.nav_title, ''), p.title),
      'kind', p.kind, 'badge', p.badge, 'kanji', p.kanji, 'icon_svg', p.icon_svg,
      'description', p.description, 'content_md', fuin.strip_secret(m, p.content_md), 'hidden', p.hidden,
      'min_rank', greatest(c.min_rank, coalesce(p.min_rank, 1)), 'updated_at', p.updated_at,
      'category', json_build_object('slug', c.slug, 'name', c.name, 'glyph', c.glyph,
        'index_slug', (select q.slug from fuin.pages q where q.category_id = c.id and q.kind = 'index' order by q.position limit 1))
    ),
    'slot', fuin.slot_json(p.id, m.is_conclave),
    'children', case when p.kind = 'index' then coalesce((
        select json_agg(json_build_object(
          'slug', q.slug, 'title', q.title, 'description', q.description, 'badge', q.badge,
          'kanji', q.kanji, 'icon_svg', q.icon_svg, 'slotted', fuin.is_slotted(q.id), 'hidden', q.hidden
        ) order by q.position, q.title)
        from fuin.pages q
        where q.category_id = c.id and q.kind = 'seal' and fuin.can_view_page(m, c, q)
      ), '[]'::json) else null end,
    'related', coalesce((
        select json_agg(json_build_object('slug', r.slug, 'title', r.title, 'kanji', r.kanji))
        from (
          select q.slug, q.title, q.kanji
            from fuin.pages q
           where q.category_id = c.id and q.kind <> 'index' and q.id <> p.id and fuin.can_view_page(m, c, q)
           order by (q.position > p.position) desc, q.position, q.title
           limit 3
        ) r
      ), '[]'::json)
  );
end $$;

-- Changer son propre mot de passe
create or replace function public.fuin_change_password(p_token text, p_old text, p_new text)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare m fuin.members;
begin
  m := fuin.session_member(p_token);
  if m.password_hash is null or m.password_hash <> extensions.crypt(coalesce(p_old, ''), m.password_hash) then
    return json_build_object('ok', false, 'error', 'Mot de passe actuel incorrect.');
  end if;
  perform fuin.check_password_strength(p_new);
  update fuin.members set password_hash = fuin.hash_password(p_new), updated_at = now() where id = m.id;
  -- déconnecte les autres appareils
  delete from fuin.sessions
   where member_id = m.id and token_hash <> encode(extensions.digest(p_token, 'sha256'), 'hex');
  perform fuin.log(m, 'member.self_password', m.display_name);
  return json_build_object('ok', true);
end $$;

-- Veille : appelée chaque jour par GitHub Actions pour éviter la mise en pause de Supabase
create or replace function public.fuin_ping()
returns json language plpgsql volatile security definer set search_path = '' as $$
declare v fuin.keepalive;
begin
  insert into fuin.keepalive(id, pinged_at, pings) values (1, now(), 1)
  on conflict (id) do update set pinged_at = now(), pings = fuin.keepalive.pings + 1
  returning * into v;
  delete from fuin.sessions where expires_at < now();
  return json_build_object('ok', true, 'at', v.pinged_at, 'pings', v.pings);
end $$;

-- =====================================================================
--  CONSOLE DU CONCLAVE
-- =====================================================================

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
    'recent', coalesce((select json_agg(x) from (
        select id, actor_name, action, target, details, created_at
          from fuin.audit_log order by created_at desc limit 8) x), '[]'::json)
  );
end $$;

-- ---------- Membres ----------
create or replace function public.fuin_admin_members(p_token text)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare m fuin.members;
begin
  m := fuin.require_conclave(p_token);
  return coalesce((
    select json_agg(json_build_object(
      'id', x.id, 'prenom', x.prenom, 'nom', x.nom, 'display_name', x.display_name,
      'rank', x.rank, 'is_conclave', x.is_conclave, 'active', x.password_hash is not null,
      'locked', x.locked_until is not null and x.locked_until > now(),
      'last_login_at', x.last_login_at, 'created_at', x.created_at,
      'slots', (select count(*) from fuin.slot_assignments a where a.member_id = x.id),
      'is_me', x.id = m.id
    ) order by x.is_conclave desc, x.rank desc, x.display_name)
    from fuin.members x
  ), '[]'::json);
end $$;

create or replace function public.fuin_admin_member_create(
  p_token text, p_prenom text, p_nom text, p_rank integer, p_is_conclave boolean, p_password text default null
) returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  m fuin.members;
  v_new fuin.members;
  v_password text := nullif(btrim(coalesce(p_password, '')), '');
begin
  m := fuin.require_conclave(p_token);
  if length(btrim(coalesce(p_prenom, ''))) = 0 then
    perform fuin.fail('FU422', 'Le prénom RP est obligatoire.');
  end if;
  if p_rank is null or p_rank not between 1 and 5 then
    perform fuin.fail('FU422', 'Le cercle doit être compris entre 1 et 5.');
  end if;
  if fuin.name_key(p_prenom || ' ' || coalesce(p_nom, '')) = '' then
    perform fuin.fail('FU422', 'Le nom RP doit contenir au moins une lettre ou un chiffre.');
  end if;
  if exists (select 1 from fuin.members where login_key = fuin.name_key(p_prenom || ' ' || coalesce(p_nom, ''))) then
    perform fuin.fail('FU409', 'Un shinobi porte déjà ce nom RP.');
  end if;
  if v_password is null then
    v_password := fuin.gen_password();
  end if;
  v_new := fuin.upsert_member(p_prenom, coalesce(p_nom, ''), v_password, p_rank::smallint, coalesce(p_is_conclave, false));
  perform fuin.log(m, 'member.create', v_new.display_name,
    jsonb_build_object('rank', v_new.rank, 'conclave', v_new.is_conclave));
  return json_build_object('member', fuin.member_json(v_new), 'password', v_password);
end $$;

create or replace function public.fuin_admin_member_update(
  p_token text, p_id uuid, p_prenom text, p_nom text, p_rank integer, p_is_conclave boolean
) returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  m fuin.members;
  v_old fuin.members;
  v_new fuin.members;
begin
  m := fuin.require_conclave(p_token);
  select * into v_old from fuin.members where id = p_id;
  if not found then perform fuin.fail('FU404', 'Shinobi introuvable.'); end if;
  if length(btrim(coalesce(p_prenom, ''))) = 0 then
    perform fuin.fail('FU422', 'Le prénom RP est obligatoire.');
  end if;
  if p_rank is null or p_rank not between 1 and 5 then
    perform fuin.fail('FU422', 'Le cercle doit être compris entre 1 et 5.');
  end if;
  if p_id = m.id and not coalesce(p_is_conclave, false) then
    perform fuin.fail('FU422', 'Tu ne peux pas te retirer toi-même du Conclave.');
  end if;
  if fuin.name_key(p_prenom || ' ' || coalesce(p_nom, '')) = '' then
    perform fuin.fail('FU422', 'Le nom RP doit contenir au moins une lettre ou un chiffre.');
  end if;
  if exists (select 1 from fuin.members
              where login_key = fuin.name_key(p_prenom || ' ' || coalesce(p_nom, '')) and id <> p_id) then
    perform fuin.fail('FU409', 'Un shinobi porte déjà ce nom RP.');
  end if;
  update fuin.members
     set prenom = btrim(p_prenom), nom = btrim(coalesce(p_nom, '')), rank = p_rank,
         is_conclave = coalesce(p_is_conclave, false), updated_at = now()
   where id = p_id
  returning * into v_new;
  perform fuin.log(m, 'member.update', v_new.display_name, jsonb_build_object(
    'rank', jsonb_build_array(v_old.rank, v_new.rank),
    'conclave', jsonb_build_array(v_old.is_conclave, v_new.is_conclave),
    'name', case when v_old.display_name <> v_new.display_name then jsonb_build_array(v_old.display_name, v_new.display_name) end));
  return fuin.member_json(v_new);
end $$;

create or replace function public.fuin_admin_member_password(p_token text, p_id uuid, p_password text default null)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  m fuin.members;
  v_target fuin.members;
  v_password text := nullif(btrim(coalesce(p_password, '')), '');
begin
  m := fuin.require_conclave(p_token);
  select * into v_target from fuin.members where id = p_id;
  if not found then perform fuin.fail('FU404', 'Shinobi introuvable.'); end if;
  if v_password is null then v_password := fuin.gen_password(); end if;
  perform fuin.check_password_strength(v_password);
  update fuin.members
     set password_hash = fuin.hash_password(v_password), failed_attempts = 0, locked_until = null, updated_at = now()
   where id = p_id;
  -- toutes les sessions du membre sont révoquées (sauf la nôtre si on se change soi-même)
  delete from fuin.sessions
   where member_id = p_id and token_hash <> encode(extensions.digest(p_token, 'sha256'), 'hex');
  perform fuin.log(m, 'member.password', v_target.display_name);
  return json_build_object('member', fuin.member_json(v_target), 'password', v_password);
end $$;

create or replace function public.fuin_admin_member_delete(p_token text, p_id uuid)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  m fuin.members;
  v_target fuin.members;
begin
  m := fuin.require_conclave(p_token);
  if p_id = m.id then perform fuin.fail('FU422', 'Tu ne peux pas supprimer ton propre compte.'); end if;
  delete from fuin.members where id = p_id returning * into v_target;
  if v_target.id is null then perform fuin.fail('FU404', 'Shinobi introuvable.'); end if;
  perform fuin.log(m, 'member.delete', v_target.display_name,
    jsonb_build_object('rank', v_target.rank, 'conclave', v_target.is_conclave));
  return json_build_object('ok', true);
end $$;

-- ---------- Slots ----------
create or replace function public.fuin_admin_slots(p_token text)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare m fuin.members;
begin
  m := fuin.require_conclave(p_token);
  return json_build_object(
    'villages', coalesce((select json_agg(json_build_object('id', v.id, 'name', v.name, 'position', v.position)
                  order by v.position, v.name) from fuin.villages v), '[]'::json),
    'members', coalesce((select json_agg(json_build_object('id', x.id, 'name', x.display_name, 'rank', x.rank,
                  'is_conclave', x.is_conclave) order by x.display_name) from fuin.members x), '[]'::json),
    'seals', coalesce((
      select json_agg(json_build_object(
        'page_id', p.id, 'slug', p.slug, 'title', p.title, 'badge', p.badge, 'hidden', p.hidden,
        'category', json_build_object('slug', c.slug, 'name', c.name, 'glyph', c.glyph),
        'flagged', s.page_id is not null,
        'notes', coalesce(s.notes, ''),
        'caps', coalesce((select json_agg(json_build_object('village_id', sc.village_id, 'cap', sc.cap))
                   from fuin.slot_caps sc where sc.page_id = p.id), '[]'::json),
        'assignments', coalesce((select json_agg(json_build_object(
                     'id', a.id, 'village_id', a.village_id, 'member_id', a.member_id,
                     'member_name', mm.display_name, 'note', a.note, 'assigned_at', a.assigned_at)
                     order by a.assigned_at)
                   from fuin.slot_assignments a join fuin.members mm on mm.id = a.member_id
                  where a.page_id = p.id), '[]'::json)
      ) order by c.position, p.position, p.title)
      from fuin.pages p
      join fuin.categories c on c.id = p.category_id
      left join fuin.slot_seals s on s.page_id = p.id
      where p.kind = 'seal'
    ), '[]'::json)
  );
end $$;

create or replace function public.fuin_admin_village_save(p_token text, p_id integer, p_name text)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  m fuin.members;
  v_id integer;
begin
  m := fuin.require_conclave(p_token);
  if length(btrim(coalesce(p_name, ''))) = 0 then perform fuin.fail('FU422', 'Nom de village requis.'); end if;
  if exists (select 1 from fuin.villages where lower(name) = lower(btrim(p_name)) and id is distinct from p_id) then
    perform fuin.fail('FU409', 'Ce village existe déjà.');
  end if;
  if p_id is null then
    insert into fuin.villages(name, position)
    values (btrim(p_name), coalesce((select max(position) from fuin.villages), 0) + 1)
    returning id into v_id;
    perform fuin.log(m, 'village.add', btrim(p_name));
  else
    update fuin.villages set name = btrim(p_name) where id = p_id returning id into v_id;
    if v_id is null then perform fuin.fail('FU404', 'Village introuvable.'); end if;
    perform fuin.log(m, 'village.rename', btrim(p_name));
  end if;
  return json_build_object('id', v_id);
end $$;

create or replace function public.fuin_admin_village_delete(p_token text, p_id integer)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  m fuin.members;
  v_name text;
begin
  m := fuin.require_conclave(p_token);
  delete from fuin.villages where id = p_id returning name into v_name;
  if v_name is null then perform fuin.fail('FU404', 'Village introuvable.'); end if;
  perform fuin.log(m, 'village.delete', v_name);
  return json_build_object('ok', true);
end $$;

create or replace function public.fuin_admin_slot_flag(p_token text, p_page_id integer, p_flag boolean)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  m fuin.members;
  v_title text;
begin
  m := fuin.require_conclave(p_token);
  select title into v_title from fuin.pages where id = p_page_id and kind = 'seal';
  if v_title is null then perform fuin.fail('FU404', 'Sceau introuvable.'); end if;
  if p_flag then
    insert into fuin.slot_seals(page_id) values (p_page_id) on conflict do nothing;
    perform fuin.log(m, 'slot.flag', v_title);
  else
    delete from fuin.slot_seals where page_id = p_page_id;
    perform fuin.log(m, 'slot.unflag', v_title);
  end if;
  return json_build_object('ok', true);
end $$;

-- p_caps = {"<village_id>": <places>, ...}
create or replace function public.fuin_admin_slot_caps(p_token text, p_page_id integer, p_caps jsonb)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  m fuin.members;
  v_title text;
  r record;
  v_cap integer;
  v_taken integer;
begin
  m := fuin.require_conclave(p_token);
  select p.title into v_title from fuin.pages p join fuin.slot_seals s on s.page_id = p.id where p.id = p_page_id;
  if v_title is null then perform fuin.fail('FU404', 'Ce sceau n''est pas dans le système de slots.'); end if;
  for r in select v.id, v.name from fuin.villages v loop
    if p_caps ? r.id::text then
      v_cap := greatest(0, coalesce((p_caps ->> r.id::text)::integer, 0));
      select count(*) into v_taken from fuin.slot_assignments where page_id = p_page_id and village_id = r.id;
      if v_cap < v_taken then
        perform fuin.fail('FU422', format('%s : %s place(s) déjà occupée(s), impossible de descendre à %s.', r.name, v_taken, v_cap));
      end if;
      insert into fuin.slot_caps(page_id, village_id, cap) values (p_page_id, r.id, v_cap)
      on conflict (page_id, village_id) do update set cap = excluded.cap;
    end if;
  end loop;
  perform fuin.log(m, 'slot.caps', v_title, p_caps);
  return json_build_object('ok', true);
end $$;

create or replace function public.fuin_admin_slot_notes(p_token text, p_page_id integer, p_notes text)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare m fuin.members;
begin
  m := fuin.require_conclave(p_token);
  update fuin.slot_seals set notes = coalesce(p_notes, '') where page_id = p_page_id;
  if not found then perform fuin.fail('FU404', 'Ce sceau n''est pas dans le système de slots.'); end if;
  return json_build_object('ok', true);
end $$;

create or replace function public.fuin_admin_slot_assign(
  p_token text, p_page_id integer, p_village_id integer, p_member_id uuid, p_note text default ''
) returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  m fuin.members;
  v_title text;
  v_cap integer;
  v_taken integer;
  v_member text;
  v_village text;
begin
  m := fuin.require_conclave(p_token);
  select p.title into v_title from fuin.pages p join fuin.slot_seals s on s.page_id = p.id where p.id = p_page_id;
  if v_title is null then perform fuin.fail('FU404', 'Ce sceau n''est pas dans le système de slots.'); end if;
  select display_name into v_member from fuin.members where id = p_member_id;
  if v_member is null then perform fuin.fail('FU404', 'Shinobi introuvable.'); end if;
  select name into v_village from fuin.villages where id = p_village_id;
  if v_village is null then perform fuin.fail('FU404', 'Village introuvable.'); end if;
  select coalesce((select cap from fuin.slot_caps where page_id = p_page_id and village_id = p_village_id), 0) into v_cap;
  select count(*) into v_taken from fuin.slot_assignments where page_id = p_page_id and village_id = p_village_id;
  if v_taken >= v_cap then
    perform fuin.fail('FU422', format('%s : toutes les places sont occupées (%s/%s).', v_village, v_taken, v_cap));
  end if;
  if exists (select 1 from fuin.slot_assignments where page_id = p_page_id and member_id = p_member_id) then
    perform fuin.fail('FU409', format('%s occupe déjà une place sur ce sceau.', v_member));
  end if;
  insert into fuin.slot_assignments(page_id, village_id, member_id, note, assigned_by)
  values (p_page_id, p_village_id, p_member_id, coalesce(p_note, ''), m.id);
  perform fuin.log(m, 'slot.assign', v_title, jsonb_build_object('member', v_member, 'village', v_village));
  return json_build_object('ok', true);
end $$;

create or replace function public.fuin_admin_slot_unassign(p_token text, p_assignment_id integer)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  m fuin.members;
  r record;
begin
  m := fuin.require_conclave(p_token);
  select p.title, mm.display_name as member, v.name as village into r
    from fuin.slot_assignments a
    join fuin.pages p on p.id = a.page_id
    join fuin.members mm on mm.id = a.member_id
    join fuin.villages v on v.id = a.village_id
   where a.id = p_assignment_id;
  if not found then perform fuin.fail('FU404', 'Assignation introuvable.'); end if;
  delete from fuin.slot_assignments where id = p_assignment_id;
  perform fuin.log(m, 'slot.unassign', r.title, jsonb_build_object('member', r.member, 'village', r.village));
  return json_build_object('ok', true);
end $$;

-- ---------- Fiches (éditeur) ----------
create or replace function public.fuin_admin_pages(p_token text)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare m fuin.members;
begin
  m := fuin.require_conclave(p_token);
  return coalesce((
    select json_agg(json_build_object(
      'id', p.id, 'slug', p.slug, 'title', p.title, 'kind', p.kind, 'badge', p.badge,
      'kanji', p.kanji, 'hidden', p.hidden, 'position', p.position, 'min_rank', p.min_rank,
      'category_id', c.id, 'category_name', c.name, 'category_glyph', c.glyph,
      'slotted', fuin.is_slotted(p.id), 'updated_at', p.updated_at,
      'updated_by', (select display_name from fuin.members where id = p.updated_by)
    ) order by c.position, p.position, p.title)
    from fuin.pages p join fuin.categories c on c.id = p.category_id
  ), '[]'::json);
end $$;

create or replace function public.fuin_admin_page(p_token text, p_id integer)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  m fuin.members;
  v json;
begin
  m := fuin.require_conclave(p_token);
  select json_build_object(
    'id', p.id, 'category_id', p.category_id, 'slug', p.slug, 'kind', p.kind, 'title', p.title,
    'nav_title', p.nav_title, 'description', p.description, 'badge', p.badge, 'kanji', p.kanji,
    'icon_svg', p.icon_svg, 'content_md', p.content_md, 'min_rank', p.min_rank, 'hidden', p.hidden,
    'position', p.position, 'updated_at', p.updated_at
  ) into v from fuin.pages p where p.id = p_id;
  if v is null then perform fuin.fail('FU404', 'Fiche introuvable.'); end if;
  return v;
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
  if split_part(v_slug, '/', 1) in ('connexion', 'conclave', 'mon-compte', 'assets') then
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

create or replace function public.fuin_admin_page_delete(p_token text, p_id integer)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  m fuin.members;
  v_title text;
begin
  m := fuin.require_conclave(p_token);
  delete from fuin.pages where id = p_id returning title into v_title;
  if v_title is null then perform fuin.fail('FU404', 'Fiche introuvable.'); end if;
  perform fuin.log(m, 'page.delete', v_title);
  return json_build_object('ok', true);
end $$;

-- ---------- Catégories ----------
create or replace function public.fuin_admin_categories(p_token text)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare m fuin.members;
begin
  m := fuin.require_conclave(p_token);
  return coalesce((
    select json_agg(json_build_object(
      'id', c.id, 'slug', c.slug, 'name', c.name, 'glyph', c.glyph, 'tagline', c.tagline,
      'min_rank', c.min_rank, 'conclave_only', c.conclave_only, 'show_on_home', c.show_on_home,
      'position', c.position, 'page_count', (select count(*) from fuin.pages p where p.category_id = c.id)
    ) order by c.position, c.name)
    from fuin.categories c
  ), '[]'::json);
end $$;

create or replace function public.fuin_admin_category_save(p_token text, p_cat jsonb)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  m fuin.members;
  v_id integer := nullif(p_cat ->> 'id', '')::integer;
  v_slug text := lower(btrim(coalesce(p_cat ->> 'slug', '')));
  v_name text := btrim(coalesce(p_cat ->> 'name', ''));
  v_min integer := coalesce(nullif(p_cat ->> 'min_rank', '')::integer, 1);
begin
  m := fuin.require_conclave(p_token);
  if v_name = '' then perform fuin.fail('FU422', 'Le nom est obligatoire.'); end if;
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then perform fuin.fail('FU422', 'Identifiant invalide.'); end if;
  if v_min not between 1 and 5 then perform fuin.fail('FU422', 'Cercle requis invalide.'); end if;
  if exists (select 1 from fuin.categories where slug = v_slug and id is distinct from v_id) then
    perform fuin.fail('FU409', 'Identifiant déjà utilisé.');
  end if;
  if v_id is null then
    insert into fuin.categories(slug, name, glyph, tagline, min_rank, conclave_only, show_on_home, position)
    values (v_slug, v_name, coalesce(nullif(btrim(p_cat ->> 'glyph'), ''), '封'), coalesce(p_cat ->> 'tagline', ''),
            v_min, coalesce((p_cat ->> 'conclave_only')::boolean, false),
            coalesce((p_cat ->> 'show_on_home')::boolean, true),
            coalesce(nullif(p_cat ->> 'position', '')::integer, (select coalesce(max(position), 0) + 1 from fuin.categories)))
    returning id into v_id;
  else
    update fuin.categories set
      slug = v_slug, name = v_name, glyph = coalesce(nullif(btrim(p_cat ->> 'glyph'), ''), glyph),
      tagline = coalesce(p_cat ->> 'tagline', ''), min_rank = v_min,
      conclave_only = coalesce((p_cat ->> 'conclave_only')::boolean, false),
      show_on_home = coalesce((p_cat ->> 'show_on_home')::boolean, true),
      position = coalesce(nullif(p_cat ->> 'position', '')::integer, position)
    where id = v_id;
    if not found then perform fuin.fail('FU404', 'Catégorie introuvable.'); end if;
  end if;
  perform fuin.log(m, 'category.save', v_name,
    jsonb_build_object('min_rank', v_min, 'conclave_only', coalesce((p_cat ->> 'conclave_only')::boolean, false)));
  return json_build_object('id', v_id);
end $$;

create or replace function public.fuin_admin_category_delete(p_token text, p_id integer)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  m fuin.members;
  v_name text;
begin
  m := fuin.require_conclave(p_token);
  if exists (select 1 from fuin.pages where category_id = p_id) then
    perform fuin.fail('FU422', 'Déplace ou supprime d''abord les fiches de cette catégorie.');
  end if;
  delete from fuin.categories where id = p_id returning name into v_name;
  if v_name is null then perform fuin.fail('FU404', 'Catégorie introuvable.'); end if;
  perform fuin.log(m, 'category.delete', v_name);
  return json_build_object('ok', true);
end $$;

-- ---------- Journal ----------
create or replace function public.fuin_admin_audit(p_token text, p_limit integer default 200)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare m fuin.members;
begin
  m := fuin.require_conclave(p_token);
  return coalesce((select json_agg(x) from (
    select id, actor_name, action, target, details, created_at
      from fuin.audit_log order by created_at desc limit least(greatest(coalesce(p_limit, 200), 1), 1000)
  ) x), '[]'::json);
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

-- ---------------------------------------------------------------------
--  Données de structure par défaut (catégories + villages)
-- ---------------------------------------------------------------------
insert into fuin.categories(slug, name, glyph, tagline, min_rank, conclave_only, show_on_home, position) values
  ('fondations',         'Fondations',         '壱', 'Règles générales et système de slots.',   1, false, false, 1),
  ('premier-cercle',     'Premier cercle',     '一', 'Les gestes fondamentaux du scellement.',  1, false, true,  2),
  ('deuxieme-cercle',    'Deuxième cercle',    '二', 'Barrières, dressage et accumulation.',    2, false, true,  3),
  ('troisieme-cercle',   'Troisième cercle',   '三', 'Contrôle, restriction et pactes.',        3, false, true,  4),
  ('quatrieme-cercle',   'Quatrième cercle',   '四', 'Le domaine des Maîtres Fuin.',            4, false, true,  5),
  ('cinquieme-cercle',   'Cinquième cercle',   '五', 'Arts interdits des Grands Maîtres.',      5, false, true,  6),
  ('sceaux-mj',          'Sceaux MJ',          '禁', 'Sceaux réservés aux Maîtres de Jeu.',     5, true,  false, 7),
  ('sceaux-de-clan',     'Sceaux de clan',     '氏', 'Secrets transmis par le sang.',           5, true,  true,  8),
  ('archives-instables', 'Archives instables', '呪', 'Propositions de sceaux en cours d’examen.', 1, false, false, 9)
on conflict (slug) do nothing;

insert into fuin.villages(name, position) values ('Ame', 1), ('Konoha', 2), ('Suna', 3)
on conflict (name) do nothing;

notify pgrst, 'reload schema';
