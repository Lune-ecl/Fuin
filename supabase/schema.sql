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
  kind        text not null default 'seal' check (kind in ('seal', 'index', 'doc', 'memorial')),
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
-- les bases créées avant le mémorial gardent l'ancienne liste de types : on la remplace
alter table fuin.pages drop constraint if exists pages_kind_check;
alter table fuin.pages add constraint pages_kind_check check (kind in ('seal', 'index', 'doc', 'memorial'));

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

-- Demandes de création de sceau (3e cercle et plus)
create table if not exists fuin.seal_requests (
  id          serial primary key,
  member_id   uuid not null references fuin.members(id) on delete cascade,
  title       text not null check (length(btrim(title)) between 1 and 120),
  circle      smallint check (circle between 1 and 5),
  kanji       text not null default '',
  description text not null default '',
  content_md  text not null default '',
  icon_svg    text,
  status      text not null default 'pending' check (status in ('draft', 'pending', 'approved', 'refused')),
  review_note text not null default '',
  reviewed_by uuid references fuin.members(id) on delete set null,
  reviewed_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists seal_requests_status_idx on fuin.seal_requests(status, created_at desc);
create index if not exists seal_requests_member_idx on fuin.seal_requests(member_id);
alter table fuin.seal_requests enable row level security;
-- bases existantes : le statut « draft » (brouillon) s'ajoute
alter table fuin.seal_requests drop constraint if exists seal_requests_status_check;
alter table fuin.seal_requests add constraint seal_requests_status_check
  check (status in ('draft', 'pending', 'approved', 'refused'));

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

-- Trames : événements RP du Conclave, composés d'étapes (déchiffrement, désenclavement, texte)
create table if not exists fuin.trames (
  id         serial primary key,
  title      text not null check (length(btrim(title)) between 1 and 120),
  intro_md   text not null default '',
  status     text not null default 'draft' check (status in ('draft', 'active', 'ended')),
  shared     boolean not null default true,
  min_rank   smallint not null default 1 check (min_rank between 1 and 5),
  steps      jsonb not null default '[]'::jsonb,
  started_at timestamptz,
  ended_at   timestamptz,
  created_by uuid references fuin.members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- trame réservée à des shinobi choisis (vide : ouverte à tous à partir de min_rank)
alter table fuin.trames add column if not exists restricted_to uuid[] not null default '{}';
-- trame de test : seul le Conclave la voit, même ouverte
alter table fuin.trames add column if not exists test_only boolean not null default false;
alter table fuin.trames enable row level security;

create table if not exists fuin.trame_attempts (
  id         bigserial primary key,
  trame_id   integer not null references fuin.trames(id) on delete cascade,
  step_index integer not null,
  member_id  uuid not null references fuin.members(id) on delete cascade,
  kind       text not null check (kind in ('cipher', 'riddle', 'unseal', 'missing', 'situation', 'choice', 'order', 'match', 'review')),
  answer     text,
  roll       integer,
  label      text,
  tone       text,
  effect     text,
  success    boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists trame_attempts_idx on fuin.trame_attempts(trame_id, step_index, member_id);
-- bases existantes : nouvelles épreuves
alter table fuin.trame_attempts drop constraint if exists trame_attempts_kind_check;
alter table fuin.trame_attempts add constraint trame_attempts_kind_check
  check (kind in ('cipher', 'riddle', 'unseal', 'missing', 'situation', 'choice', 'order', 'match', 'review',
                  'dial', 'mastermind', 'path', 'sequence', 'memory', 'intruder', 'substitution'));
alter table fuin.trame_attempts enable row level security;

create table if not exists fuin.trame_solves (
  trame_id   integer not null references fuin.trames(id) on delete cascade,
  step_index integer not null,
  member_id  uuid not null references fuin.members(id) on delete cascade,
  solved_at  timestamptz not null default now(),
  primary key (trame_id, step_index, member_id)
);
alter table fuin.trame_solves enable row level security;

-- Rolls d'étude : comprendre le sens d'un kanji ou gagner un indice (propres à chaque étape)
create table if not exists fuin.trame_studies (
  id         bigserial primary key,
  trame_id   integer not null references fuin.trames(id) on delete cascade,
  step_index integer not null,
  member_id  uuid not null references fuin.members(id) on delete cascade,
  target     integer not null default -1,   -- position du kanji étudié, -1 pour un indice
  roll       integer not null,
  label      text,
  tone       text,
  effect     text,
  success    boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists trame_studies_idx on fuin.trame_studies(trame_id, step_index, member_id);
alter table fuin.trame_studies enable row level security;


-- Mémorial des Grands Maîtres et des Maîtres (page « memorial » de Fondations)
create table if not exists fuin.memorial (
  id         serial primary key,
  name       text not null check (length(btrim(name)) between 1 and 80),
  rank       text not null check (rank in ('grand_maitre', 'maitre')),
  epithet    text not null default '',
  status     text not null default '' check (status in ('', 'actif', 'retire', 'mort', 'disparu', 'traitre')),
  origin     text not null default '',
  era        text not null default '',
  specialty  text not null default '',
  story_md   text not null default '',
  image      text,
  position   integer not null default 0,
  member_id  uuid references fuin.members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references fuin.members(id) on delete set null
);
create index if not exists memorial_rank_idx on fuin.memorial(rank, position);

-- Sceaux qu'un shinobi déclare maîtriser (il coche lui-même, parmi ceux qu'il peut lire)
create table if not exists fuin.masteries (
  member_id  uuid not null references fuin.members(id) on delete cascade,
  page_id    integer not null references fuin.pages(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (member_id, page_id)
);
create index if not exists masteries_page_idx on fuin.masteries(page_id);
alter table fuin.masteries enable row level security;
alter table fuin.memorial enable row level security;
-- le maître lié à une fiche peut la modifier lui-même (bases existantes)
alter table fuin.memorial add column if not exists member_id uuid references fuin.members(id) on delete set null;
create unique index if not exists memorial_member_idx on fuin.memorial(member_id) where member_id is not null;

-- Suggestions des membres pour améliorer le site, et leurs soutiens
create table if not exists fuin.suggestions (
  id          serial primary key,
  member_id   uuid references fuin.members(id) on delete set null,
  kind        text not null default 'feature' check (kind in ('feature', 'content', 'trame', 'bug', 'other')),
  title       text not null check (length(btrim(title)) between 1 and 120),
  body        text not null default '' check (length(body) <= 4000),
  status      text not null default 'new' check (status in ('new', 'planned', 'done', 'refused')),
  reply       text not null default '',
  replied_by  uuid references fuin.members(id) on delete set null,
  replied_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists suggestions_status_idx on fuin.suggestions(status, created_at desc);
create index if not exists suggestions_member_idx on fuin.suggestions(member_id);
alter table fuin.suggestions enable row level security;

create table if not exists fuin.suggestion_votes (
  suggestion_id integer not null references fuin.suggestions(id) on delete cascade,
  member_id     uuid not null references fuin.members(id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (suggestion_id, member_id)
);
alter table fuin.suggestion_votes enable row level security;

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
    'requests_pending', case when m.is_conclave
                          then (select count(*) from fuin.seal_requests where status = 'pending') end,
    'suggestions_new', case when m.is_conclave
                         then (select count(*) from fuin.suggestions where status = 'new') end,
    'active_trames', coalesce((select json_agg(json_build_object('id', t.id, 'title', t.title) order by t.started_at)
                                 from fuin.trames t
                                where t.status = 'active' and fuin.trame_visible(t, m)), '[]'::json),
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
      'mastered', exists (select 1 from fuin.masteries w where w.member_id = m.id and w.page_id = p.id),
      'category', json_build_object('slug', c.slug, 'name', c.name, 'glyph', c.glyph,
        'index_slug', (select q.slug from fuin.pages q where q.category_id = c.id and q.kind = 'index' order by q.position limit 1))
    ),
    'slot', fuin.slot_json(p.id, m.is_conclave),
    -- le Conclave voit qui maîtrise ce sceau
    'masters', case when m.is_conclave and p.kind = 'seal' then coalesce((
        select json_agg(json_build_object('id', x.id, 'name', x.display_name, 'rank', x.rank) order by x.rank desc, x.display_name)
          from fuin.masteries w join fuin.members x on x.id = w.member_id
         where w.page_id = p.id), '[]'::json) else null end,
    'children', case when p.kind = 'index' then coalesce((
        select json_agg(json_build_object(
          'slug', q.slug, 'title', q.title, 'description', q.description, 'badge', q.badge,
          'kanji', q.kanji, 'icon_svg', q.icon_svg, 'slotted', fuin.is_slotted(q.id), 'hidden', q.hidden,
          'mastered', exists (select 1 from fuin.masteries w where w.member_id = m.id and w.page_id = q.id)
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

-- =====================================================================
--  Sceaux maîtrisés
-- =====================================================================
-- Tous les sceaux que le shinobi peut lire, rangés par catégorie, avec ceux qu'il maîtrise
create or replace function public.fuin_masteries_mine(p_token text)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare m fuin.members;
begin
  m := fuin.session_member(p_token);
  return coalesce((
    select json_agg(json_build_object(
      'id', c.id, 'slug', c.slug, 'name', c.name, 'glyph', c.glyph,
      'pages', (select json_agg(json_build_object(
                  'id', p.id, 'slug', p.slug, 'title', p.title, 'kanji', p.kanji, 'icon_svg', p.icon_svg, 'badge', p.badge,
                  'mastered', exists (select 1 from fuin.masteries w where w.member_id = m.id and w.page_id = p.id)
                ) order by p.position, p.title)
                  from fuin.pages p
                 where p.category_id = c.id and p.kind = 'seal' and fuin.can_view_page(m, c, p))
    ) order by c.position)
      from fuin.categories c
     where exists (select 1 from fuin.pages p where p.category_id = c.id and p.kind = 'seal' and fuin.can_view_page(m, c, p))
  ), '[]'::json);
end $$;

-- Cocher ou décocher un sceau maîtrisé (seulement un sceau que le shinobi peut lire)
create or replace function public.fuin_mastery_set(p_token text, p_page_id integer, p_on boolean)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  m fuin.members;
  p fuin.pages;
  c fuin.categories;
  v_on boolean := coalesce(p_on, false);
  v_changed integer;
begin
  m := fuin.session_member(p_token);
  select * into p from fuin.pages where id = p_page_id;
  if not found or p.kind <> 'seal' then perform fuin.fail('FU404', 'Sceau introuvable.'); end if;
  select * into c from fuin.categories where id = p.category_id;
  if not fuin.can_view_page(m, c, p) then perform fuin.fail('FU404', 'Sceau introuvable.'); end if;
  if v_on then
    insert into fuin.masteries(member_id, page_id) values (m.id, p.id) on conflict do nothing;
  else
    delete from fuin.masteries where member_id = m.id and page_id = p.id;
  end if;
  get diagnostics v_changed = row_count;
  if v_changed > 0 then
    perform fuin.log(m, case when v_on then 'mastery.add' else 'mastery.remove' end, p.title);
  end if;
  return json_build_object('ok', true, 'mastered', v_on,
                           'total', (select count(*) from fuin.masteries where member_id = m.id));
end $$;

-- Le Conclave consulte les sceaux maîtrisés d'un shinobi
create or replace function public.fuin_admin_member_masteries(p_token text, p_member_id uuid)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare m fuin.members;
begin
  m := fuin.require_conclave(p_token);
  return coalesce((
    select json_agg(json_build_object(
      'id', p.id, 'slug', p.slug, 'title', p.title, 'kanji', p.kanji,
      'category', c.name, 'glyph', c.glyph, 'since', w.created_at
    ) order by c.position, p.position, p.title)
      from fuin.masteries w
      join fuin.pages p on p.id = w.page_id
      join fuin.categories c on c.id = p.category_id
     where w.member_id = p_member_id
  ), '[]'::json);
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
    'requests_pending', (select count(*) from fuin.seal_requests where status = 'pending'),
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
      'masteries', (select count(*) from fuin.masteries w where w.member_id = x.id),
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
  if split_part(v_slug, '/', 1) in ('connexion', 'conclave', 'mon-compte', 'demandes', 'trame', 'assets', 'traducteur', 'kanji', 'suggestions', 'autre') then
    perform fuin.fail('FU422', 'Cet identifiant d''URL est réservé par le site.');
  end if;
  if v_kind not in ('seal', 'index', 'doc', 'memorial') then perform fuin.fail('FU422', 'Type de fiche invalide.'); end if;
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
--  DEMANDES DE CRÉATION DE SCEAU
-- =====================================================================
create or replace function fuin.can_request(m fuin.members) returns boolean
language sql stable set search_path = '' as $$
  select m.is_conclave or m.rank >= 3
$$;

-- Champs d'une demande, vérifiés (création comme modification)
create or replace function fuin.request_fields(p_req jsonb) returns fuin.seal_requests
language plpgsql stable set search_path = '' as $$
declare r fuin.seal_requests;
begin
  r.title := btrim(coalesce(p_req ->> 'title', ''));
  r.circle := nullif(p_req ->> 'circle', '')::smallint;
  r.kanji := btrim(coalesce(p_req ->> 'kanji', ''));
  r.description := btrim(coalesce(p_req ->> 'description', ''));
  r.content_md := coalesce(p_req ->> 'content_md', '');
  r.icon_svg := nullif(btrim(coalesce(p_req ->> 'icon_svg', '')), '');
  if r.title = '' then perform fuin.fail('FU422', 'Donne un nom à ton sceau.'); end if;
  if length(r.title) > 120 then perform fuin.fail('FU422', 'Nom trop long (120 caractères maximum).'); end if;
  if r.circle is not null and r.circle not between 1 and 5 then perform fuin.fail('FU422', 'Cercle invalide.'); end if;
  if length(r.kanji) > 60 then perform fuin.fail('FU422', 'Formule de kanjis trop longue.'); end if;
  if length(r.description) > 400 then perform fuin.fail('FU422', 'Description trop longue (400 caractères maximum).'); end if;
  if length(r.content_md) > 20000 then perform fuin.fail('FU422', 'Texte trop long.'); end if;
  if r.icon_svg is not null and (length(r.icon_svg) > 60000 or r.icon_svg !~* '^<svg') then
    perform fuin.fail('FU422', 'Visuel invalide.');
  end if;
  return r;
end $$;

-- Pas plus de 5 demandes en attente d'examen par shinobi
create or replace function fuin.request_check_pending(p_member uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select count(*) from fuin.seal_requests where member_id = p_member and status = 'pending') >= 5 then
    perform fuin.fail('FU422', 'Tu as déjà 5 demandes en attente. Patiente jusqu''à leur examen par le Conclave, ou garde celle-ci en brouillon.');
  end if;
end $$;

create or replace function fuin.request_json(r fuin.seal_requests, p_full boolean) returns json
language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'id', r.id, 'title', r.title, 'circle', r.circle, 'kanji', r.kanji, 'description', r.description,
    'content_md', r.content_md, 'icon_svg', r.icon_svg, 'status', r.status, 'review_note', r.review_note,
    'created_at', r.created_at, 'updated_at', r.updated_at, 'reviewed_at', r.reviewed_at,
    'reviewed_by', (select display_name from fuin.members where id = r.reviewed_by),
    'member', case when p_full then (
      select json_build_object('id', mm.id, 'name', mm.display_name, 'rank', mm.rank, 'is_conclave', mm.is_conclave)
        from fuin.members mm where mm.id = r.member_id) else null end
  )
$$;

-- Nouvelle demande : envoyée au Conclave, ou gardée en brouillon (p_req.draft = true)
create or replace function public.fuin_request_submit(p_token text, p_req jsonb)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  m fuin.members;
  f fuin.seal_requests;
  v_draft boolean := coalesce((p_req ->> 'draft')::boolean, false);
  v_id integer;
begin
  m := fuin.session_member(p_token);
  if not fuin.can_request(m) then
    perform fuin.fail('FU403', 'Les demandes de création de sceau s''ouvrent au 3ème cercle.');
  end if;
  f := fuin.request_fields(p_req);
  if (select count(*) from fuin.seal_requests where member_id = m.id and status in ('pending', 'draft')) >= 20 then
    perform fuin.fail('FU422', 'Tu as déjà 20 demandes en attente ou en brouillon. Supprime un brouillon avant d''en créer un autre.');
  end if;
  if not v_draft then perform fuin.request_check_pending(m.id); end if;
  insert into fuin.seal_requests(member_id, title, circle, kanji, description, content_md, icon_svg, status)
  values (m.id, f.title, f.circle, f.kanji, f.description, f.content_md, f.icon_svg,
          case when v_draft then 'draft' else 'pending' end)
  returning id into v_id;
  perform fuin.log(m, case when v_draft then 'request.draft' else 'request.create' end, f.title);
  return json_build_object('id', v_id);
end $$;

-- Modifier sa demande tant que le Conclave ne l'a pas examinée (brouillon ou en attente)
create or replace function public.fuin_request_update(p_token text, p_id integer, p_req jsonb)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  m fuin.members;
  f fuin.seal_requests;
  v_status text;
begin
  m := fuin.session_member(p_token);
  if not fuin.can_request(m) then
    perform fuin.fail('FU403', 'Les demandes de création de sceau s''ouvrent au 3ème cercle.');
  end if;
  f := fuin.request_fields(p_req);
  update fuin.seal_requests
     set title = f.title, circle = f.circle, kanji = f.kanji, description = f.description,
         content_md = f.content_md, icon_svg = f.icon_svg, updated_at = now()
   where id = p_id and member_id = m.id and status in ('draft', 'pending')
  returning status into v_status;
  if v_status is null then perform fuin.fail('FU404', 'Demande introuvable ou déjà examinée par le Conclave.'); end if;
  perform fuin.log(m, 'request.update', f.title);
  return json_build_object('ok', true, 'status', v_status);
end $$;

-- Annuler une demande en attente : elle quitte l'examen du Conclave et redevient un brouillon
create or replace function public.fuin_request_cancel(p_token text, p_id integer)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  m fuin.members;
  v_title text;
begin
  m := fuin.session_member(p_token);
  update fuin.seal_requests set status = 'draft', updated_at = now()
   where id = p_id and member_id = m.id and status = 'pending'
  returning title into v_title;
  if v_title is null then perform fuin.fail('FU404', 'Demande introuvable ou déjà examinée par le Conclave.'); end if;
  perform fuin.log(m, 'request.cancel', v_title);
  return json_build_object('ok', true);
end $$;

-- Envoyer un brouillon au Conclave
create or replace function public.fuin_request_send(p_token text, p_id integer)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  m fuin.members;
  v_title text;
begin
  m := fuin.session_member(p_token);
  if not fuin.can_request(m) then
    perform fuin.fail('FU403', 'Les demandes de création de sceau s''ouvrent au 3ème cercle.');
  end if;
  perform fuin.request_check_pending(m.id);
  update fuin.seal_requests set status = 'pending', created_at = now(), updated_at = now()
   where id = p_id and member_id = m.id and status = 'draft'
  returning title into v_title;
  if v_title is null then perform fuin.fail('FU404', 'Brouillon introuvable.'); end if;
  perform fuin.log(m, 'request.create', v_title);
  return json_build_object('ok', true);
end $$;

-- Supprimer définitivement un brouillon (ou une demande encore en attente)
create or replace function public.fuin_request_withdraw(p_token text, p_id integer)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  m fuin.members;
  v_title text;
begin
  m := fuin.session_member(p_token);
  delete from fuin.seal_requests where id = p_id and member_id = m.id and status in ('pending', 'draft')
  returning title into v_title;
  if v_title is null then perform fuin.fail('FU404', 'Demande introuvable ou déjà examinée.'); end if;
  perform fuin.log(m, 'request.withdraw', v_title);
  return json_build_object('ok', true);
end $$;

-- Le Conclave ne voit jamais les brouillons
create or replace function public.fuin_admin_requests(p_token text)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare m fuin.members;
begin
  m := fuin.require_conclave(p_token);
  return coalesce((select json_agg(fuin.request_json(r, true)
                     order by (r.status = 'pending') desc, coalesce(r.reviewed_at, r.created_at) desc)
                     from fuin.seal_requests r where r.status <> 'draft'), '[]'::json);
end $$;

create or replace function public.fuin_requests_mine(p_token text)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare m fuin.members;
begin
  m := fuin.session_member(p_token);
  if not fuin.can_request(m) then
    perform fuin.fail('FU403', 'Les demandes de création de sceau s''ouvrent au 3ème cercle.');
  end if;
  return coalesce((select json_agg(fuin.request_json(r, false) order by r.created_at desc)
                     from fuin.seal_requests r where r.member_id = m.id), '[]'::json);
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

-- =====================================================================
--  TRAMES (événements RP : énigmes et défis)
-- =====================================================================
-- Réponse normalisée : minuscules, sans accents ni ponctuation (kanjis conservés)
create or replace function fuin.answer_key(p text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select btrim(regexp_replace(
    translate(lower(coalesce(p, '')),
      'àáâãäåāçèéêëēìíîïīñòóôõöōùúûüūýÿœæ',
      'aaaaaaaceeeeeiiiiinoooooouuuuuyyoa'),
    '[^a-z0-9぀-ヿ㐀-鿿豈-﫿]+', ' ', 'g'))
$$;

-- Une ligne de réponse est soit une phrase exacte (à la ponctuation et aux accents près),
-- soit une liste de mots-clés séparés par « + » qui doivent tous apparaître.
create or replace function fuin.answer_matches(p_input text, p_answers jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  v_input text := fuin.answer_key(p_input);
  a text;
  k text;
  ok boolean;
  n integer;
begin
  if v_input = '' then return false; end if;
  for a in select jsonb_array_elements_text(coalesce(p_answers, '[]'::jsonb)) loop
    if position('+' in a) > 0 then
      ok := true;
      n := 0;
      foreach k in array string_to_array(a, '+') loop
        k := fuin.answer_key(k);
        if k <> '' then
          n := n + 1;
          if position(k in v_input) = 0 then ok := false; end if;
        end if;
      end loop;
      if ok and n > 0 then return true; end if;
    elsif fuin.answer_key(a) <> '' and fuin.answer_key(a) = v_input then
      return true;
    end if;
  end loop;
  return false;
end $$;

-- Kanjis d'une formule, un par case (les espaces ne comptent pas)
create or replace function fuin.kanji_chars(p text) returns text[]
language sql immutable parallel safe set search_path = '' as $$
  select case when regexp_replace(coalesce(p, ''), '\s+', '', 'g') = '' then '{}'::text[]
              else regexp_split_to_array(regexp_replace(coalesce(p, ''), '\s+', '', 'g'), '') end
$$;

-- Liste d'entiers distincts et triés tirée d'un tableau JSON
create or replace function fuin.int_list(j jsonb) returns integer[]
language sql immutable set search_path = '' as $$
  select coalesce(array(
    select distinct (x)::integer from jsonb_array_elements_text(case when jsonb_typeof(j) = 'array' then j else '[]'::jsonb end) x
     where x ~ '^-?[0-9]+$' order by 1), '{}')
$$;

create or replace function fuin.int_seq(j jsonb) returns integer[]
language sql immutable set search_path = '' as $$
  select coalesce(array(
    select (x)::integer from jsonb_array_elements_text(case when jsonb_typeof(j) = 'array' then j else '[]'::jsonb end)
           with ordinality e(x, o)
     where x ~ '^-?[0-9]+$' order by o), '{}')
$$;

create or replace function fuin.trame_grid(s jsonb) returns text[]
language sql immutable set search_path = '' as $$
  select coalesce(array(
    select c.ch
      from jsonb_array_elements_text(case when jsonb_typeof(s -> 'grid') = 'array' then s -> 'grid' else '[]'::jsonb end)
           with ordinality r(row_text, ro)
     cross join lateral unnest(fuin.kanji_chars(r.row_text)) with ordinality c(ch, co)
     order by r.ro, c.co), '{}')
$$;

create or replace function fuin.hand_signs() returns text[]
language sql immutable set search_path = '' as $$
  select array['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥']
$$;

-- Essais par joueur pour une étape (chaque étape a les siens, indépendants des autres)
create or replace function fuin.trame_max(s jsonb) returns integer
language sql immutable set search_path = '' as $$
  select coalesce(nullif(s ->> 'max_attempts', '')::integer,
                  case when s ->> 'kind' in ('cipher', 'riddle', 'choice', 'sequence', 'intruder', 'substitution') then 2
                       when s ->> 'kind' = 'mastermind' then 8
                       else 3 end)
$$;

-- Règles d'un désenclavement : verrous à briser, cercle requis, essais du joueur.
-- Les anciennes étapes (sans « locks ») gardent la règle du codex : verrous = cercle du sceau,
-- il faut au moins ce cercle, et autant d'essais que son propre cercle.
create or replace function fuin.trame_unseal_rules(s jsonb, m fuin.members,
                                                   out needed integer, out req integer, out allowed integer)
language sql stable set search_path = '' as $$
  select coalesce(nullif(s ->> 'locks', '')::integer, nullif(s ->> 'seal_circle', '')::integer, 3),
         case when s ? 'locks' then coalesce(nullif(s ->> 'min_rank', '')::integer, 1)
              else greatest(coalesce(nullif(s ->> 'min_rank', '')::integer, 3),
                            coalesce(nullif(s ->> 'seal_circle', '')::integer, 3)) end,
         case when s ->> 'attempts_mode' = 'fixed' then coalesce(nullif(s ->> 'max_attempts', '')::integer, 3)
              else m.rank end
$$;

-- Sceaux proposés dans une mise en situation : ceux choisis par le Conclave,
-- ou à défaut tous les sceaux que le joueur peut lire
create or replace function fuin.trame_seal_options(s jsonb, m fuin.members) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title, 'kanji', p.kanji)
                            order by c.position, p.position, p.title), '[]'::jsonb)
    from fuin.pages p join fuin.categories c on c.id = p.category_id
   where p.kind = 'seal'
     and case when cardinality(fuin.int_list(s -> 'choices')) > 0 then p.id = any(fuin.int_list(s -> 'choices'))
              else fuin.can_view_page(m, c, p) end
$$;

create or replace function fuin.try_jsonb(p text) returns jsonb
language plpgsql immutable set search_path = '' as $$
begin
  return p::jsonb;
exception when others then
  return null;
end $$;

create or replace function fuin.trame_visible(t fuin.trames, m fuin.members) returns boolean
language sql stable set search_path = '' as $$
  select m.is_conclave
      or (not t.test_only
          and t.status = 'active'
          and case when cardinality(t.restricted_to) > 0 then m.id = any(t.restricted_to)
                   else m.rank >= t.min_rank end)
$$;


-- Noms des shinobi à qui la trame est réservée
create or replace function fuin.trame_restricted_names(t fuin.trames) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(mm.display_name order by mm.display_name), '[]'::jsonb)
    from fuin.members mm where mm.id = any(t.restricted_to)
$$;

-- Une étape « texte » ne bloque jamais ; sinon il faut une résolution (la sienne, ou celle
-- de n'importe qui si la progression est commune).
create or replace function fuin.trame_step_solved(t fuin.trames, p_step integer, m fuin.members) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(t.steps -> p_step ->> 'kind', '') = 'text'
      or exists (select 1 from fuin.trame_solves s
                  where s.trame_id = t.id and s.step_index = p_step and (t.shared or s.member_id = m.id))
$$;

-- Étape en cours = première étape non résolue (ou le nombre d'étapes si tout est résolu)
create or replace function fuin.trame_current(t fuin.trames, m fuin.members) returns integer
language plpgsql stable security definer set search_path = '' as $$
declare
  i integer := 0;
  n integer := jsonb_array_length(t.steps);
begin
  while i < n loop
    if not fuin.trame_step_solved(t, i, m) then return i; end if;
    i := i + 1;
  end loop;
  return n;
end $$;

-- Palier d'une table de roll pour un résultat (réussite au-dessus de 50 si la table n'existe pas)
create or replace function fuin.roll_tier(p_table text, p_roll integer) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select tier from fuin.roll_tables rt, jsonb_array_elements(rt.tiers) tier
      where rt.slug = p_table and p_roll between (tier ->> 'min')::integer and (tier ->> 'max')::integer
      limit 1),
    case when p_roll > 50 then '{"label":"Réussite","tone":"success","effect":""}'::jsonb
         else '{"label":"Échec","tone":"neutral","effect":""}'::jsonb end)
$$;

create or replace function fuin.circle_label(r integer) returns text
language sql immutable set search_path = '' as $$
  select case when r = 1 then '1er cercle' else r || 'ème cercle' end
$$;

-- Kanjis étudiables d'une étape : l'inscription à déchiffrer ou la formule du sceau incomplet
create or replace function fuin.trame_study_chars(s jsonb) returns text[]
language sql immutable set search_path = '' as $$
  select case s ->> 'kind'
           when 'cipher' then fuin.kanji_chars(s ->> 'cipher_text')
           when 'missing' then fuin.kanji_chars(s ->> 'formula')
           else '{}'::text[] end
$$;

-- Ce que le joueur a découvert par ses rolls d'étude (jamais un kanji manquant lui-même)
create or replace function fuin.trame_study_json(t fuin.trames, p_step integer, s jsonb, m fuin.members, p_solved boolean)
returns jsonb language sql stable security definer set search_path = '' as $$
  with st as (
    select * from fuin.trame_studies x where x.trame_id = t.id and x.step_index = p_step and x.member_id = m.id
  ), chars as (
    select u.ch, (u.idx - 1)::integer as i from unnest(fuin.trame_study_chars(s)) with ordinality u(ch, idx)
  ), hints as (
    select coalesce(array_agg(h order by o), '{}') as list
      from jsonb_array_elements_text(case when jsonb_typeof(s -> 'hints') = 'array' then s -> 'hints' else '[]'::jsonb end) with ordinality e(h, o)
     where btrim(h) <> ''
  ), won as (
    select count(*) filter (where (st.target = -1 and st.success) or st.tone = 'crit-success')::integer as n from st
  )
  select jsonb_build_object(
    'rolls_used', (select count(*) from st),
    'rolls_max', coalesce(nullif(s ->> 'study_rolls', '')::integer, 0),
    'chars', coalesce((
      select jsonb_agg(jsonb_build_object(
        'i', c.i,
        'kanji', case when not p_solved and s ->> 'kind' = 'missing' and c.i = any(fuin.int_list(s -> 'missing')) then null else c.ch end,
        'studiable', btrim(coalesce(s -> 'meanings' ->> c.i, '')) <> '',
        'meaning', case when exists (select 1 from st where st.target = c.i and st.success) then nullif(btrim(coalesce(s -> 'meanings' ->> c.i, '')), '') end,
        'misread', exists (select 1 from st where st.target = c.i and st.tone = 'crit-fail')
              and not exists (select 1 from st where st.target = c.i and st.success)
      ) order by c.i) from chars c), '[]'::jsonb),
    'hints', to_jsonb((select list[1:least(cardinality(list), (select n from won))] from hints)),
    'hints_total', (select cardinality(list) from hints),
    'log', coalesce((select jsonb_agg(jsonb_build_object('target', st.target, 'roll', st.roll, 'label', st.label, 'tone', st.tone, 'effect', st.effect)
                                      order by st.created_at) from st), '[]'::jsonb))
$$;

create or replace function public.fuin_trame_study(p_token text, p_id integer, p_step integer, p_target integer)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  m fuin.members;
  t fuin.trames;
  s jsonb;
  maxr integer;
  used integer;
  chars text[];
  hints text[];
  before integer;
  after integer;
  v_roll integer;
  tier jsonb;
  ok boolean;
  v_target integer := coalesce(p_target, -1);
begin
  m := fuin.session_member(p_token);
  select * into t from fuin.trames where id = p_id for update;
  if not found or not fuin.trame_visible(t, m) then
    perform fuin.fail('FU404', 'Cette trame n''est pas ou plus accessible.');
  end if;
  if fuin.trame_current(t, m) <> p_step then
    perform fuin.fail('FU409', 'Cette étape est déjà franchie ou pas encore ouverte. Recharge la page.');
  end if;
  s := t.steps -> p_step;
  maxr := coalesce(nullif(s ->> 'study_rolls', '')::integer, 0);
  if maxr <= 0 then perform fuin.fail('FU422', 'Cette étape ne permet pas de roll d''étude.'); end if;
  select count(*) into used from fuin.trame_studies where trame_id = t.id and step_index = p_step and member_id = m.id;
  if used >= maxr then perform fuin.fail('FU422', 'Tu as utilisé tous tes rolls d''étude pour cette étape.'); end if;
  chars := fuin.trame_study_chars(s);
  hints := array(select h from jsonb_array_elements_text(case when jsonb_typeof(s -> 'hints') = 'array' then s -> 'hints' else '[]'::jsonb end) h where btrim(h) <> '');
  select count(*) filter (where (target = -1 and success) or tone = 'crit-success') into before
    from fuin.trame_studies where trame_id = t.id and step_index = p_step and member_id = m.id;
  if v_target >= 0 then
    if v_target >= cardinality(chars) or btrim(coalesce(s -> 'meanings' ->> v_target, '')) = '' then
      perform fuin.fail('FU422', 'Le Conclave n''a pas laissé de sens à découvrir pour ce kanji.');
    end if;
    if exists (select 1 from fuin.trame_studies where trame_id = t.id and step_index = p_step and member_id = m.id and target = v_target and success) then
      perform fuin.fail('FU409', 'Tu connais déjà le sens de ce kanji.');
    end if;
  elsif before >= cardinality(hints) then
    perform fuin.fail('FU422', 'Il n''y a plus d''indice à découvrir.');
  end if;

  v_roll := floor(random() * 100)::integer + 1;
  tier := fuin.roll_tier(coalesce(nullif(s ->> 'study_table', ''), 'dechiffrement'), v_roll);
  ok := (tier ->> 'tone') in ('success', 'crit-success');
  insert into fuin.trame_studies(trame_id, step_index, member_id, target, roll, label, tone, effect, success)
  values (t.id, p_step, m.id, v_target, v_roll, tier ->> 'label', tier ->> 'tone', tier ->> 'effect', ok);
  after := least(cardinality(hints), before + case when (v_target = -1 and ok) or tier ->> 'tone' = 'crit-success' then 1 else 0 end);
  return json_build_object(
    'roll', v_roll, 'label', tier ->> 'label', 'tone', tier ->> 'tone', 'effect', tier ->> 'effect', 'success', ok,
    'meaning', case when ok and v_target >= 0 then btrim(s -> 'meanings' ->> v_target) end,
    'hint', case when after > least(before, cardinality(hints)) then hints[after] end,
    'rolls_left', maxr - used - 1);
end $$;

-- Vue joueur : les étapes déjà franchies et l'étape en cours, jamais les réponses
create or replace function public.fuin_trame_view(p_token text, p_id integer)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  m fuin.members;
  t fuin.trames;
  n integer;
  cur integer;
  i integer := 0;
  s jsonb;
  st jsonb;
  steps jsonb := '[]'::jsonb;
  k text;
  solved boolean;
  reveal boolean;
  used integer;
  succ integer;
  rules record;
  chars text[];
  miss integer[];
  lastrow fuin.trame_attempts;
  signs boolean;
begin
  m := fuin.session_member(p_token);
  select * into t from fuin.trames where id = p_id;
  if not found or not fuin.trame_visible(t, m) then
    perform fuin.fail('FU404', 'Cette trame n''est pas ou plus accessible.');
  end if;
  n := jsonb_array_length(t.steps);
  cur := fuin.trame_current(t, m);

  while i < n and i <= cur loop
    s := t.steps -> i;
    k := coalesce(s ->> 'kind', '');
    solved := i < cur;
    reveal := coalesce((s ->> 'reveal')::boolean, true);
    st := jsonb_build_object(
      'index', i, 'kind', k, 'title', coalesce(s ->> 'title', ''),
      'prompt_md', coalesce(s ->> 'prompt_md', ''),
      'state', case when solved then 'solved' else 'current' end);
    select count(*) into used from fuin.trame_attempts a
     where a.trame_id = t.id and a.step_index = i and a.member_id = m.id;
    lastrow := null;
    select * into lastrow from fuin.trame_attempts a
     where a.trame_id = t.id and a.step_index = i and a.member_id = m.id
     order by a.created_at desc, a.id desc limit 1;

    if k in ('cipher', 'riddle', 'sequence', 'substitution') then
      st := st || jsonb_build_object(
        'cipher_text', case when k in ('cipher', 'substitution') then coalesce(s ->> 'cipher_text', '') else '' end,
        'attempts_used', used,
        'max_attempts', fuin.trame_max(s));
      if k = 'sequence' then
        st := st || jsonb_build_object(
          'items', case when jsonb_typeof(s -> 'items') = 'array' then s -> 'items' else '[]'::jsonb end,
          'options', case when jsonb_typeof(s -> 'options') = 'array' then s -> 'options' else '[]'::jsonb end);
      elsif k = 'substitution' then
        -- la table de chiffrement, sans les lettres que le Conclave a cachées (tant que l'étape n'est pas résolue)
        st := st || jsonb_build_object('key', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'k', x ->> 'k',
                   'l', case when solved or not coalesce((x ->> 'hidden')::boolean, false) then x ->> 'l' end) order by o)
            from jsonb_array_elements(case when jsonb_typeof(s -> 'key') = 'array' then s -> 'key' else '[]'::jsonb end)
                 with ordinality e(x, o)), '[]'::jsonb));
      end if;
      if solved and k in ('sequence', 'substitution') then
        st := st || jsonb_build_object('solution', s -> 'answers' ->> 0);
      end if;
    elsif k = 'unseal' then
      select * into rules from fuin.trame_unseal_rules(s, m);
      -- une réussite critique brise deux verrous
      select coalesce(sum(case when a.tone = 'crit-success' then 2 when a.success then 1 else 0 end), 0) into succ
        from fuin.trame_attempts a
       where a.trame_id = t.id and a.step_index = i and a.member_id = m.id;
      st := st || jsonb_build_object(
        'seal_svg', nullif(s ->> 'seal_svg', ''),
        'fails_total', (select count(*) from fuin.trame_attempts a
                         where a.trame_id = t.id and a.step_index = i and not a.success),
        'seal_circle', rules.needed,
        'locks', rules.needed,
        'required_rank', rules.req,
        'allowed', rules.allowed,
        'attempts_mode', case when s ->> 'attempts_mode' = 'fixed' then 'fixed' else 'rank' end,
        'attempts_used', used,
        'successes', succ,
        'eligible', m.is_conclave or m.rank >= rules.req,
        'rolls', coalesce((select jsonb_agg(jsonb_build_object('roll', a.roll, 'label', a.label, 'tone', a.tone, 'effect', a.effect)
                                            order by a.created_at)
                             from fuin.trame_attempts a
                            where a.trame_id = t.id and a.step_index = i and a.member_id = m.id), '[]'::jsonb));
    elsif k in ('missing', 'order', 'match', 'choice', 'situation', 'review', 'dial', 'mastermind', 'path', 'memory', 'intruder') then
      st := st || jsonb_build_object(
        'attempts_used', used,
        'max_attempts', fuin.trame_max(s),
        'reveal', reveal,
        'last', case when lastrow.id is not null and k <> 'review' then fuin.try_jsonb(lastrow.answer) end,
        'last_correct', case when lastrow.id is not null then lastrow.success end,
        'feedback', case when lastrow.id is not null and not lastrow.success and reveal and k not in ('review', 'mastermind')
                         then fuin.try_jsonb(lastrow.effect) end);
      if k = 'missing' then
        chars := fuin.kanji_chars(s ->> 'formula');
        miss := fuin.int_list(s -> 'missing');
        st := st || jsonb_build_object(
          'slots', (select jsonb_agg(case when not solved and (u.idx - 1) = any(miss) then null else to_jsonb(u.ch) end order by u.idx)
                      from unnest(chars) with ordinality u(ch, idx)),
          'pool', case when not solved and cardinality(fuin.kanji_chars(s ->> 'decoys')) > 0 then
                    (select jsonb_agg(v.ch order by md5(t.id || ':' || i || ':' || v.o || ':' || v.ch))
                       from unnest(array(select chars[mm + 1] from unnest(miss) mm) || fuin.kanji_chars(s ->> 'decoys'))
                            with ordinality v(ch, o)) end);
      elsif k = 'order' then
        chars := fuin.kanji_chars(s ->> 'formula');
        st := st || case when solved then jsonb_build_object('formula', to_jsonb(chars))
                         else jsonb_build_object('tiles', (select jsonb_agg(u.ch order by md5(t.id || ':' || i || ':' || u.o || ':' || u.ch))
                                                            from unnest(chars) with ordinality u(ch, o))) end;
      elsif k = 'match' then
        st := st || jsonb_build_object(
          'lefts', (select jsonb_agg(p ->> 'left' order by o) from jsonb_array_elements(s -> 'pairs') with ordinality e(p, o)),
          'rights', (select jsonb_agg(p ->> 'right' order by md5(t.id || ':' || i || ':' || o || ':' || (p ->> 'right')))
                       from jsonb_array_elements(s -> 'pairs') with ordinality e(p, o)));
        if solved then st := st || jsonb_build_object('pairs', s -> 'pairs'); end if;
      elsif k in ('choice', 'intruder') then
        st := st || jsonb_build_object(
          'options', coalesce(s -> 'options', '[]'::jsonb),
          'multiple', k = 'choice' and cardinality(fuin.int_list(s -> 'correct')) > 1);
        if solved then st := st || jsonb_build_object('correct', to_jsonb(fuin.int_list(s -> 'correct'))); end if;
      elsif k = 'situation' then
        st := st || jsonb_build_object(
          'situations', (select jsonb_agg(jsonb_build_object('text', coalesce(x ->> 'text', '')) order by o)
                           from jsonb_array_elements(s -> 'situations') with ordinality e(x, o)),
          'seals', fuin.trame_seal_options(s, m));
        if solved then
          st := st || jsonb_build_object('answers', (
            select jsonb_agg((select string_agg(p.title, ' ou ' order by p.title) from fuin.pages p
                               where p.id = any(fuin.int_list(x -> 'answers'))) order by o)
              from jsonb_array_elements(s -> 'situations') with ordinality e(x, o)));
        end if;
      elsif k = 'review' then
        st := st || jsonb_build_object(
          'submissions', coalesce((select jsonb_agg(jsonb_build_object('text', a.answer, 'status', a.label, 'note', a.effect, 'at', a.created_at)
                                                    order by a.created_at)
                                     from fuin.trame_attempts a
                                    where a.trame_id = t.id and a.step_index = i and a.member_id = m.id), '[]'::jsonb),
          'pending', exists (select 1 from fuin.trame_attempts a
                              where a.trame_id = t.id and a.step_index = i and a.member_id = m.id and a.label = 'pending'));
      elsif k = 'dial' then
        -- chaque cercle : le bon kanji mélangé aux leurres, toujours dans le même ordre pour une étape donnée
        st := st || jsonb_build_object('rings', coalesce((
          select jsonb_agg(jsonb_build_object('options', (
                   select jsonb_agg(v.ch order by md5(t.id || ':' || i || ':' || r.o || ':' || v.o || ':' || v.ch))
                     from unnest(array[btrim(r.x ->> 'answer')] || fuin.kanji_chars(r.x ->> 'decoys')) with ordinality v(ch, o)))
                 order by r.o)
            from jsonb_array_elements(s -> 'rings') with ordinality r(x, o)), '[]'::jsonb));
        if solved then
          st := st || jsonb_build_object('formula', (select jsonb_agg(btrim(r.x ->> 'answer') order by r.o)
                                                      from jsonb_array_elements(s -> 'rings') with ordinality r(x, o)));
        end if;
      elsif k = 'mastermind' then
        st := st || jsonb_build_object(
          'palette', to_jsonb(fuin.kanji_chars(s ->> 'palette')),
          'length', cardinality(fuin.kanji_chars(s ->> 'formula')),
          'history', coalesce((
            select jsonb_agg(jsonb_build_object(
                     'guess', fuin.try_jsonb(a.answer) -> 'guess',
                     'exact', (fuin.try_jsonb(a.effect) ->> 'exact')::integer,
                     'present', (fuin.try_jsonb(a.effect) ->> 'present')::integer) order by a.created_at, a.id)
              from fuin.trame_attempts a
             where a.trame_id = t.id and a.step_index = i and a.member_id = m.id), '[]'::jsonb));
        if solved then st := st || jsonb_build_object('formula', to_jsonb(fuin.kanji_chars(s ->> 'formula'))); end if;
      elsif k = 'path' then
        st := st || jsonb_build_object(
          'grid', (select jsonb_agg(to_jsonb(fuin.kanji_chars(r)) order by o)
                     from jsonb_array_elements_text(s -> 'grid') with ordinality e(r, o)),
          'length', cardinality(fuin.int_seq(s -> 'path')),
          'start', case when coalesce((s ->> 'show_start')::boolean, true) then (fuin.int_seq(s -> 'path'))[1] end);
        if solved then st := st || jsonb_build_object('path', to_jsonb(fuin.int_seq(s -> 'path'))); end if;
      elsif k = 'memory' then
        signs := coalesce((s ->> 'signs')::boolean, false);
        chars := fuin.kanji_chars(s ->> 'formula');
        st := st || jsonb_build_object(
          'sequence', to_jsonb(chars),
          'signs', signs,
          'show_seconds', coalesce(nullif(s ->> 'show_seconds', '')::integer, 5),
          'palette', case when signs then to_jsonb(fuin.hand_signs())
                          else (select jsonb_agg(v.ch order by md5(t.id || ':' || i || ':' || v.ch))
                                  from (select distinct ch from unnest(chars || fuin.kanji_chars(s ->> 'decoys')) ch) v) end);
        if solved then st := st || jsonb_build_object('formula', to_jsonb(chars)); end if;
      end if;
    end if;

    -- rolls d'étude : sens des kanjis et indices
    if coalesce(nullif(s ->> 'study_rolls', '')::integer, 0) > 0 then
      st := st || jsonb_build_object('study', fuin.trame_study_json(t, i, s, m, solved));
    end if;

    if solved then
      st := st || jsonb_build_object(
        'success_md', coalesce(s ->> 'success_md', ''),
        'solved_by', (select string_agg(mm.display_name, ', ' order by so.solved_at)
                        from fuin.trame_solves so join fuin.members mm on mm.id = so.member_id
                       where so.trame_id = t.id and so.step_index = i and (t.shared or so.member_id = m.id)));
    end if;
    steps := steps || jsonb_build_array(st);
    i := i + 1;
  end loop;

  return json_build_object(
    'trame', json_build_object('id', t.id, 'title', t.title, 'intro_md', t.intro_md, 'status', t.status,
                               'shared', t.shared, 'started_at', t.started_at, 'test_only', t.test_only,
                               'restricted_names', fuin.trame_restricted_names(t)),
    'steps', steps,
    'total', n,
    'remaining', greatest(0, n - cur - 1),
    'complete', cur >= n);
end $$;


-- Proposer une traduction ou une réponse (énigme) : essais limités par joueur et par étape
create or replace function public.fuin_trame_answer(p_token text, p_id integer, p_step integer, p_answer text)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  m fuin.members;
  t fuin.trames;
  s jsonb;
  used integer;
  maxa integer;
  ok boolean;
begin
  m := fuin.session_member(p_token);
  select * into t from fuin.trames where id = p_id for update;
  if not found or not fuin.trame_visible(t, m) then
    perform fuin.fail('FU404', 'Cette trame n''est pas ou plus accessible.');
  end if;
  if fuin.trame_current(t, m) <> p_step then
    perform fuin.fail('FU409', 'Cette étape est déjà franchie ou pas encore ouverte. Recharge la page.');
  end if;
  s := t.steps -> p_step;
  if coalesce(s ->> 'kind', '') not in ('cipher', 'riddle', 'sequence', 'substitution') then
    perform fuin.fail('FU422', 'Cette étape ne se résout pas par une réponse.');
  end if;
  if length(btrim(coalesce(p_answer, ''))) = 0 then perform fuin.fail('FU422', 'Écris ta réponse.'); end if;
  if length(p_answer) > 500 then perform fuin.fail('FU422', 'Réponse trop longue.'); end if;
  maxa := fuin.trame_max(s);
  select count(*) into used from fuin.trame_attempts
   where trame_id = t.id and step_index = p_step and member_id = m.id;
  if used >= maxa then perform fuin.fail('FU422', 'Tu as utilisé tous tes essais pour cette étape.'); end if;
  ok := fuin.answer_matches(p_answer, s -> 'answers');
  insert into fuin.trame_attempts(trame_id, step_index, member_id, kind, answer, success)
  values (t.id, p_step, m.id, s ->> 'kind', btrim(p_answer), ok);
  if ok then
    insert into fuin.trame_solves(trame_id, step_index, member_id) values (t.id, p_step, m.id) on conflict do nothing;
  end if;
  return json_build_object('correct', ok, 'attempts_left', maxa - used - 1);
end $$;

-- Tenter le désenclavement : le roll est tiré par la base (impossible à truquer)
create or replace function public.fuin_trame_unseal(p_token text, p_id integer, p_step integer)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  m fuin.members;
  t fuin.trames;
  s jsonb;
  rules record;
  used integer;
  succ integer;
  v_roll integer;
  tier jsonb;
  ok boolean;
  gained integer;
begin
  m := fuin.session_member(p_token);
  select * into t from fuin.trames where id = p_id for update;
  if not found or not fuin.trame_visible(t, m) then
    perform fuin.fail('FU404', 'Cette trame n''est pas ou plus accessible.');
  end if;
  if fuin.trame_current(t, m) <> p_step then
    perform fuin.fail('FU409', 'Ce sceau est déjà brisé ou pas encore accessible. Recharge la page.');
  end if;
  s := t.steps -> p_step;
  if coalesce(s ->> 'kind', '') <> 'unseal' then perform fuin.fail('FU422', 'Cette étape n''est pas un désenclavement.'); end if;
  select * into rules from fuin.trame_unseal_rules(s, m);
  if not m.is_conclave and m.rank < rules.req then
    perform fuin.fail('FU403', format('Seuls les shinobi du %s et plus peuvent tenter ce désenclavement.', fuin.circle_label(rules.req)));
  end if;
  select count(*), coalesce(sum(case when a.tone = 'crit-success' then 2 when a.success then 1 else 0 end), 0) into used, succ
    from fuin.trame_attempts a
   where a.trame_id = t.id and a.step_index = p_step and a.member_id = m.id;
  if used >= rules.allowed then
    perform fuin.fail('FU422', case when s ->> 'attempts_mode' = 'fixed' then 'Tu as épuisé tes essais pour ce sceau.'
                                    else 'Tu as épuisé tes essais (autant que ton cercle).' end);
  end if;
  v_roll := floor(random() * 100)::integer + 1;
  tier := fuin.roll_tier(coalesce(nullif(s ->> 'roll_table', ''), 'desenclavement'), v_roll);
  ok := (tier ->> 'tone') in ('success', 'crit-success');
  insert into fuin.trame_attempts(trame_id, step_index, member_id, kind, roll, label, tone, effect, success)
  values (t.id, p_step, m.id, 'unseal', v_roll, tier ->> 'label', tier ->> 'tone', tier ->> 'effect', ok);
  used := used + 1;
  -- une réussite critique brise deux verrous
  gained := case when tier ->> 'tone' = 'crit-success' then 2 when ok then 1 else 0 end;
  succ := succ + gained;
  if succ >= rules.needed then
    insert into fuin.trame_solves(trame_id, step_index, member_id) values (t.id, p_step, m.id) on conflict do nothing;
  end if;
  return json_build_object(
    'roll', v_roll, 'label', tier ->> 'label', 'tone', tier ->> 'tone', 'effect', tier ->> 'effect',
    'gained', gained, 'successes', succ, 'needed', rules.needed, 'attempts_used', used, 'allowed', rules.allowed,
    'broken', succ >= rules.needed);
end $$;

-- Épreuves à réponse structurée : kanjis manquants, ordre, associations, choix, mise en situation,
-- et réponse libre validée par le Conclave. Les essais sont propres à chaque étape.
create or replace function public.fuin_trame_submit(p_token text, p_id integer, p_step integer, p_payload jsonb)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  m fuin.members;
  t fuin.trames;
  s jsonb;
  k text;
  used integer;
  maxa integer;
  ok boolean := false;
  fb boolean[] := '{}';
  chars text[];
  miss integer[];
  picks text[];
  ipicks integer[];
  pairs jsonb;
  sits jsonb;
  j integer;
  v_text text;
  reveal boolean;
  pal text[];
  v_exact integer;
  v_present integer;
  grid text[];
  cols integer;
  target integer[];
  answer_out text;
  effect_out text;
begin
  m := fuin.session_member(p_token);
  select * into t from fuin.trames where id = p_id for update;
  if not found or not fuin.trame_visible(t, m) then
    perform fuin.fail('FU404', 'Cette trame n''est pas ou plus accessible.');
  end if;
  if fuin.trame_current(t, m) <> p_step then
    perform fuin.fail('FU409', 'Cette étape est déjà franchie ou pas encore ouverte. Recharge la page.');
  end if;
  s := t.steps -> p_step;
  k := coalesce(s ->> 'kind', '');
  if k not in ('missing', 'order', 'match', 'choice', 'situation', 'review', 'dial', 'mastermind', 'path', 'memory', 'intruder') then
    perform fuin.fail('FU422', 'Cette étape ne se résout pas ainsi.');
  end if;
  maxa := fuin.trame_max(s);
  reveal := coalesce((s ->> 'reveal')::boolean, true);
  select count(*) into used from fuin.trame_attempts
   where trame_id = t.id and step_index = p_step and member_id = m.id;
  if used >= maxa then perform fuin.fail('FU422', 'Tu as utilisé tous tes essais pour cette étape.'); end if;

  if k = 'review' then
    v_text := btrim(coalesce(p_payload ->> 'text', ''));
    if v_text = '' then perform fuin.fail('FU422', 'Écris ta réponse.'); end if;
    if length(v_text) > 4000 then perform fuin.fail('FU422', 'Réponse trop longue (4 000 caractères maximum).'); end if;
    if exists (select 1 from fuin.trame_attempts where trame_id = t.id and step_index = p_step and member_id = m.id and label = 'pending') then
      perform fuin.fail('FU409', 'Ta réponse attend déjà la validation du Conclave.');
    end if;
    insert into fuin.trame_attempts(trame_id, step_index, member_id, kind, answer, label, success)
    values (t.id, p_step, m.id, 'review', v_text, 'pending', false);
    return json_build_object('pending', true, 'attempts_left', maxa - used - 1);
  end if;

  answer_out := left(p_payload::text, 4000);

  if k = 'missing' then
    chars := fuin.kanji_chars(s ->> 'formula');
    miss := fuin.int_list(s -> 'missing');
    picks := array(select btrim(x) from jsonb_array_elements_text(coalesce(p_payload -> 'kanji', '[]'::jsonb)) x);
    if cardinality(picks) <> cardinality(miss) or exists (select 1 from unnest(picks) x where x = '') then
      perform fuin.fail('FU422', 'Complète toutes les cases vides.');
    end if;
    for j in 1 .. cardinality(miss) loop
      fb := fb || (picks[j] = chars[miss[j] + 1]);
    end loop;
  elsif k in ('order', 'memory') then
    chars := fuin.kanji_chars(s ->> 'formula');
    picks := array(select x from jsonb_array_elements_text(coalesce(p_payload -> 'order', '[]'::jsonb)) x);
    if cardinality(picks) <> cardinality(chars) then
      perform fuin.fail('FU422', case when k = 'memory' then 'Reproduis toute la séquence.' else 'Place tous les kanjis.' end);
    end if;
    for j in 1 .. cardinality(chars) loop
      fb := fb || (picks[j] = chars[j]);
    end loop;
  elsif k = 'match' then
    pairs := coalesce(s -> 'pairs', '[]'::jsonb);
    picks := array(select x from jsonb_array_elements_text(coalesce(p_payload -> 'picks', '[]'::jsonb)) x);
    if cardinality(picks) <> jsonb_array_length(pairs) or exists (select 1 from unnest(picks) x where btrim(x) = '') then
      perform fuin.fail('FU422', 'Associe chaque élément.');
    end if;
    for j in 1 .. jsonb_array_length(pairs) loop
      fb := fb || (fuin.answer_key(picks[j]) = fuin.answer_key(pairs -> (j - 1) ->> 'right'));
    end loop;
  elsif k in ('choice', 'intruder') then
    ipicks := fuin.int_list(p_payload -> 'picks');
    if cardinality(ipicks) = 0 then perform fuin.fail('FU422', 'Choisis une réponse.'); end if;
    if k = 'intruder' and cardinality(ipicks) <> 1 then perform fuin.fail('FU422', 'Désigne un seul intrus.'); end if;
    ok := ipicks = fuin.int_list(s -> 'correct');
  elsif k = 'situation' then
    sits := coalesce(s -> 'situations', '[]'::jsonb);
    ipicks := array(select case when x ~ '^[0-9]+$' then x::integer end
                      from jsonb_array_elements_text(coalesce(p_payload -> 'picks', '[]'::jsonb)) with ordinality e(x, o) order by o);
    if cardinality(ipicks) <> jsonb_array_length(sits) or exists (select 1 from unnest(ipicks) x where x is null) then
      perform fuin.fail('FU422', 'Choisis un sceau pour chaque situation.');
    end if;
    for j in 1 .. jsonb_array_length(sits) loop
      fb := fb || (ipicks[j] = any(fuin.int_list(sits -> (j - 1) -> 'answers')));
    end loop;
  elsif k = 'dial' then
    picks := array(select btrim(x) from jsonb_array_elements_text(coalesce(p_payload -> 'picks', '[]'::jsonb)) x);
    if cardinality(picks) <> jsonb_array_length(coalesce(s -> 'rings', '[]'::jsonb)) or exists (select 1 from unnest(picks) x where x = '') then
      perform fuin.fail('FU422', 'Tourne chaque cercle sur un kanji.');
    end if;
    for j in 1 .. cardinality(picks) loop
      fb := fb || (picks[j] = btrim(s -> 'rings' -> (j - 1) ->> 'answer'));
    end loop;
  elsif k = 'mastermind' then
    chars := fuin.kanji_chars(s ->> 'formula');
    pal := fuin.kanji_chars(s ->> 'palette');
    picks := array(select btrim(x) from jsonb_array_elements_text(coalesce(p_payload -> 'guess', '[]'::jsonb)) x);
    if cardinality(picks) <> cardinality(chars) then
      perform fuin.fail('FU422', format('Compose une formule de %s kanjis.', cardinality(chars)));
    end if;
    if exists (select 1 from unnest(picks) x where not (x = any(pal))) then
      perform fuin.fail('FU422', 'Utilise seulement les kanjis proposés.');
    end if;
    select count(*) into v_exact from generate_subscripts(chars, 1) g where picks[g] = chars[g];
    select coalesce(sum(least(a.n, b.n)), 0) - v_exact into v_present
      from (select x, count(*) as n from unnest(picks) x group by x) a
      join (select x, count(*) as n from unnest(chars) x group by x) b using (x);
    ok := v_exact = cardinality(chars);
    answer_out := jsonb_build_object('guess', to_jsonb(picks))::text;
    effect_out := jsonb_build_object('exact', v_exact, 'present', v_present)::text;
  elsif k = 'path' then
    grid := fuin.trame_grid(s);
    cols := cardinality(fuin.kanji_chars(s -> 'grid' ->> 0));
    target := fuin.int_seq(s -> 'path');
    ipicks := fuin.int_seq(p_payload -> 'cells');
    if cardinality(ipicks) = 0 then perform fuin.fail('FU422', 'Trace le flux case après case.'); end if;
    if cardinality(ipicks) > cardinality(grid)
       or exists (select 1 from unnest(ipicks) x where x < 0 or x >= cardinality(grid))
       or (select count(distinct x) from unnest(ipicks) x) <> cardinality(ipicks) then
      perform fuin.fail('FU422', 'Le flux ne peut passer qu''une fois par case.');
    end if;
    for j in 2 .. cardinality(ipicks) loop
      if abs(ipicks[j] / cols - ipicks[j - 1] / cols) + abs(ipicks[j] % cols - ipicks[j - 1] % cols) <> 1 then
        perform fuin.fail('FU422', 'Le flux passe d''une case à sa voisine (haut, bas, gauche ou droite).');
      end if;
    end loop;
    for j in 1 .. cardinality(target) loop
      fb := fb || (j <= cardinality(ipicks) and grid[ipicks[j] + 1] = grid[target[j] + 1]);
    end loop;
    ok := cardinality(ipicks) = cardinality(target) and false <> all(fb);
  end if;
  if k not in ('choice', 'intruder', 'mastermind', 'path') then ok := cardinality(fb) > 0 and false <> all(fb); end if;

  insert into fuin.trame_attempts(trame_id, step_index, member_id, kind, answer, label, effect, success)
  values (t.id, p_step, m.id, k, answer_out,
          case when k = 'mastermind' then v_exact || '/' || cardinality(chars)
               when cardinality(fb) > 0 then (select count(*) from unnest(fb) x where x) || '/' || cardinality(fb) end,
          coalesce(effect_out, case when cardinality(fb) > 0 then to_jsonb(fb)::text end), ok);
  if ok then
    insert into fuin.trame_solves(trame_id, step_index, member_id) values (t.id, p_step, m.id) on conflict do nothing;
  end if;
  return json_build_object(
    'correct', ok,
    'attempts_left', maxa - used - 1,
    'exact', case when k = 'mastermind' then v_exact end,
    'present', case when k = 'mastermind' then v_present end,
    'right', case when cardinality(fb) > 0 then (select count(*) from unnest(fb) x where x) end,
    'total', case when cardinality(fb) > 0 then cardinality(fb) end,
    'feedback', case when reveal and not ok and cardinality(fb) > 0 then to_jsonb(fb) end);
end $$;



-- ---------- Conclave ----------
create or replace function public.fuin_admin_trames(p_token text)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare m fuin.members;
begin
  m := fuin.require_conclave(p_token);
  return coalesce((select json_agg(json_build_object(
      'id', t.id, 'title', t.title, 'status', t.status, 'shared', t.shared, 'min_rank', t.min_rank,
      'test_only', t.test_only,
      'restricted_names', fuin.trame_restricted_names(t),
      'steps', jsonb_array_length(t.steps), 'started_at', t.started_at, 'ended_at', t.ended_at,
      'updated_at', t.updated_at,
      'participants', (select count(distinct a.member_id) from fuin.trame_attempts a where a.trame_id = t.id),
      'solves', (select count(*) from fuin.trame_solves so where so.trame_id = t.id),
      'pending_reviews', (select count(*) from fuin.trame_attempts a where a.trame_id = t.id and a.kind = 'review' and a.label = 'pending')
    ) order by (t.status = 'active') desc, t.updated_at desc)
    from fuin.trames t), '[]'::json);
end $$;

create or replace function public.fuin_admin_trame(p_token text, p_id integer)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  m fuin.members;
  t fuin.trames;
begin
  m := fuin.require_conclave(p_token);
  select * into t from fuin.trames where id = p_id;
  if not found then perform fuin.fail('FU404', 'Trame introuvable.'); end if;
  return json_build_object(
    'trame', json_build_object('id', t.id, 'title', t.title, 'intro_md', t.intro_md, 'status', t.status,
                               'shared', t.shared, 'min_rank', t.min_rank, 'steps', t.steps,
                               'test_only', t.test_only,
                               'restricted_to', to_jsonb(t.restricted_to),
                               'restricted_names', fuin.trame_restricted_names(t),
                               'started_at', t.started_at, 'ended_at', t.ended_at, 'updated_at', t.updated_at),
    'progress', coalesce((
      select json_agg(json_build_object(
        'index', i - 1,
        'attempts', (select count(*) from fuin.trame_attempts a where a.trame_id = t.id and a.step_index = i - 1),
        'participants', (select count(distinct a.member_id) from fuin.trame_attempts a where a.trame_id = t.id and a.step_index = i - 1),
        'solvers', coalesce((select json_agg(json_build_object('name', mm.display_name, 'at', so.solved_at) order by so.solved_at)
                               from fuin.trame_solves so join fuin.members mm on mm.id = so.member_id
                              where so.trame_id = t.id and so.step_index = i - 1), '[]'::json)
      ) order by i)
      from generate_series(1, jsonb_array_length(t.steps)) i
    ), '[]'::json),
    -- réponses libres qui attendent la validation du Conclave
    'reviews', coalesce((select json_agg(json_build_object(
        'id', a.id, 'step_index', a.step_index, 'member', mm.display_name, 'rank', mm.rank,
        'text', a.answer, 'created_at', a.created_at) order by a.created_at)
        from fuin.trame_attempts a join fuin.members mm on mm.id = a.member_id
       where a.trame_id = t.id and a.kind = 'review' and a.label = 'pending'), '[]'::json),
    'studies', coalesce((select json_agg(x) from (
        select st.id, st.step_index, st.target, st.roll, st.label, st.tone, st.success, st.created_at,
               mm.display_name as member, mm.rank
          from fuin.trame_studies st join fuin.members mm on mm.id = st.member_id
         where st.trame_id = t.id
         order by st.created_at desc
         limit 100) x), '[]'::json),
    'log', coalesce((select json_agg(x) from (
        select a.id, a.step_index, a.kind, a.answer, a.roll, a.label, a.tone, a.effect, a.success, a.created_at,
               mm.display_name as member, mm.rank
          from fuin.trame_attempts a join fuin.members mm on mm.id = a.member_id
         where a.trame_id = t.id
         order by a.created_at desc
         limit 200) x), '[]'::json)
  );
end $$;

-- Valider ou refuser une réponse libre
create or replace function public.fuin_admin_trame_review(p_token text, p_attempt bigint, p_ok boolean, p_note text default '')
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  m fuin.members;
  a fuin.trame_attempts;
  v_title text;
begin
  m := fuin.require_conclave(p_token);
  select * into a from fuin.trame_attempts where id = p_attempt for update;
  if not found or a.kind <> 'review' then perform fuin.fail('FU404', 'Réponse introuvable.'); end if;
  if a.label <> 'pending' then perform fuin.fail('FU409', 'Cette réponse a déjà été examinée.'); end if;
  if length(coalesce(p_note, '')) > 1000 then perform fuin.fail('FU422', 'Commentaire trop long.'); end if;
  update fuin.trame_attempts
     set label = case when p_ok then 'approved' else 'refused' end, success = coalesce(p_ok, false),
         effect = btrim(coalesce(p_note, ''))
   where id = p_attempt;
  if p_ok then
    insert into fuin.trame_solves(trame_id, step_index, member_id) values (a.trame_id, a.step_index, a.member_id) on conflict do nothing;
  end if;
  select title into v_title from fuin.trames where id = a.trame_id;
  perform fuin.log(m, case when p_ok then 'trame.approve' else 'trame.refuse' end, v_title,
                   jsonb_build_object('member', (select display_name from fuin.members where id = a.member_id), 'step', a.step_index + 1));
  return json_build_object('ok', true);
end $$;

create or replace function public.fuin_admin_trame_save(p_token text, p_trame jsonb)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  m fuin.members;
  v_id integer := nullif(p_trame ->> 'id', '')::integer;
  v_title text := btrim(coalesce(p_trame ->> 'title', ''));
  v_steps jsonb := coalesce(p_trame -> 'steps', '[]'::jsonb);
  v_min integer := coalesce(nullif(p_trame ->> 'min_rank', '')::integer, 1);
  v_test boolean := coalesce((p_trame ->> 'test_only')::boolean, false);
  v_only uuid[] := '{}';
  s jsonb;
  k text;
  pos integer := 0;
  nchars integer;
  x jsonb;
  cols integer;
  ncells integer;
  cells integer[];
  j integer;
begin
  m := fuin.require_conclave(p_token);
  if v_title = '' then perform fuin.fail('FU422', 'Donne un titre à la trame.'); end if;
  -- trame réservée : on ne garde que des membres qui existent
  if not v_test and jsonb_typeof(p_trame -> 'restricted_to') = 'array' then
    select coalesce(array_agg(mm.id order by mm.display_name), '{}') into v_only
      from fuin.members mm
     where mm.id::text in (select jsonb_array_elements_text(p_trame -> 'restricted_to'));
    if jsonb_array_length(p_trame -> 'restricted_to') > 0 and cardinality(v_only) = 0 then
      perform fuin.fail('FU422', 'Les shinobi choisis pour cette trame sont introuvables.');
    end if;
  end if;
  if v_min not between 1 and 5 then perform fuin.fail('FU422', 'Cercle minimum invalide.'); end if;
  if jsonb_typeof(v_steps) <> 'array' then perform fuin.fail('FU422', 'Étapes invalides.'); end if;
  if jsonb_array_length(v_steps) > 30 then perform fuin.fail('FU422', '30 étapes au maximum.'); end if;
  for s in select * from jsonb_array_elements(v_steps) loop
    pos := pos + 1;
    k := coalesce(s ->> 'kind', '');
    if k not in ('cipher', 'riddle', 'unseal', 'missing', 'situation', 'choice', 'order', 'match', 'review', 'text',
                 'dial', 'mastermind', 'path', 'sequence', 'memory', 'intruder', 'substitution') then
      perform fuin.fail('FU422', format('Étape %s : type inconnu.', pos));
    end if;
    if k not in ('text', 'unseal') and fuin.trame_max(s) not between 1 and 20 then
      perform fuin.fail('FU422', format('Étape %s : nombre d''essais entre 1 et 20.', pos));
    end if;
    if coalesce(nullif(s ->> 'study_rolls', '')::integer, 0) not between 0 and 10 then
      perform fuin.fail('FU422', format('Étape %s : entre 0 et 10 rolls d''étude.', pos));
    end if;
    if jsonb_typeof(s -> 'hints') = 'array' and (jsonb_array_length(s -> 'hints') > 10
       or exists (select 1 from jsonb_array_elements_text(s -> 'hints') h where length(h) > 500)) then
      perform fuin.fail('FU422', format('Étape %s : 10 indices au maximum, de 500 caractères chacun.', pos));
    end if;
    if jsonb_typeof(s -> 'meanings') = 'array'
       and exists (select 1 from jsonb_array_elements(s -> 'meanings') h where length(h #>> '{}') > 200) then
      perform fuin.fail('FU422', format('Étape %s : le sens d''un kanji tient en 200 caractères.', pos));
    end if;
    if k in ('cipher', 'riddle', 'sequence', 'substitution') then
      if jsonb_typeof(s -> 'answers') <> 'array'
         or not exists (select 1 from jsonb_array_elements_text(s -> 'answers') y where fuin.answer_key(y) <> '') then
        perform fuin.fail('FU422', format('Étape %s : indique au moins une réponse acceptée.', pos));
      end if;
      if k = 'sequence' then
        if jsonb_typeof(s -> 'items') <> 'array' or jsonb_array_length(s -> 'items') not between 2 and 12
           or exists (select 1 from jsonb_array_elements_text(s -> 'items') y where btrim(y) = '' or length(y) > 40) then
          perform fuin.fail('FU422', format('Étape %s : de 2 à 12 éléments dans la suite, de 40 caractères au plus.', pos));
        end if;
        if jsonb_typeof(s -> 'options') = 'array' and jsonb_array_length(s -> 'options') > 8 then
          perform fuin.fail('FU422', format('Étape %s : 8 propositions au maximum.', pos));
        end if;
      elsif k = 'substitution' then
        if btrim(coalesce(s ->> 'cipher_text', '')) = '' or length(s ->> 'cipher_text') > 1000 then
          perform fuin.fail('FU422', format('Étape %s : écris le message en clair pour générer le code.', pos));
        end if;
        if jsonb_typeof(s -> 'key') <> 'array' or jsonb_array_length(s -> 'key') not between 1 and 60 then
          perform fuin.fail('FU422', format('Étape %s : la table de chiffrement est vide.', pos));
        end if;
      end if;
    elsif k = 'unseal' then
      if s ? 'locks' then
        if coalesce(nullif(s ->> 'locks', '')::integer, 0) not between 1 and 10 then
          perform fuin.fail('FU422', format('Étape %s : entre 1 et 10 verrous à briser.', pos));
        end if;
      elsif coalesce((s ->> 'seal_circle')::integer, 3) not between 1 and 5 then
        perform fuin.fail('FU422', format('Étape %s : cercle du sceau entre 1 et 5.', pos));
      end if;
      if coalesce(nullif(s ->> 'min_rank', '')::integer, 1) not between 1 and 5 then
        perform fuin.fail('FU422', format('Étape %s : cercle minimum entre 1 et 5.', pos));
      end if;
      if s ->> 'attempts_mode' = 'fixed' and coalesce(nullif(s ->> 'max_attempts', '')::integer, 0) not between 1 and 30 then
        perform fuin.fail('FU422', format('Étape %s : entre 1 et 30 essais de désenclavement.', pos));
      end if;
      if coalesce(s ->> 'seal_svg', '') <> ''
         and (length(s ->> 'seal_svg') > 60000 or (s ->> 'seal_svg') !~* '^<svg') then
        perform fuin.fail('FU422', format('Étape %s : visuel du sceau invalide.', pos));
      end if;
    elsif k in ('missing', 'order') then
      nchars := cardinality(fuin.kanji_chars(s ->> 'formula'));
      if nchars not between 2 and 12 then
        perform fuin.fail('FU422', format('Étape %s : la formule doit compter de 2 à 12 kanjis.', pos));
      end if;
      if k = 'missing' then
        if cardinality(fuin.int_list(s -> 'missing')) = 0 then
          perform fuin.fail('FU422', format('Étape %s : choisis au moins un kanji à cacher.', pos));
        end if;
        if cardinality(fuin.int_list(s -> 'missing')) >= nchars
           or exists (select 1 from unnest(fuin.int_list(s -> 'missing')) y where y < 0 or y >= nchars) then
          perform fuin.fail('FU422', format('Étape %s : laisse au moins un kanji visible.', pos));
        end if;
        if cardinality(fuin.kanji_chars(s ->> 'decoys')) > 12 then
          perform fuin.fail('FU422', format('Étape %s : 12 kanjis leurres au maximum.', pos));
        end if;
      elsif (select count(distinct c) from unnest(fuin.kanji_chars(s ->> 'formula')) c) < 2 then
        perform fuin.fail('FU422', format('Étape %s : la formule doit contenir au moins deux kanjis différents.', pos));
      end if;
    elsif k = 'match' then
      if jsonb_typeof(s -> 'pairs') <> 'array' or jsonb_array_length(s -> 'pairs') not between 2 and 8 then
        perform fuin.fail('FU422', format('Étape %s : de 2 à 8 paires à associer.', pos));
      end if;
      if exists (select 1 from jsonb_array_elements(s -> 'pairs') y
                  where btrim(coalesce(y ->> 'left', '')) = '' or fuin.answer_key(y ->> 'right') = '') then
        perform fuin.fail('FU422', format('Étape %s : chaque paire doit avoir ses deux côtés.', pos));
      end if;
      if (select count(distinct fuin.answer_key(y ->> 'right')) from jsonb_array_elements(s -> 'pairs') y) < jsonb_array_length(s -> 'pairs') then
        perform fuin.fail('FU422', format('Étape %s : deux paires ont la même réponse.', pos));
      end if;
    elsif k in ('choice', 'intruder') then
      if jsonb_typeof(s -> 'options') <> 'array'
         or jsonb_array_length(s -> 'options') not between (case when k = 'intruder' then 3 else 2 end) and (case when k = 'intruder' then 9 else 8 end)
         or exists (select 1 from jsonb_array_elements_text(s -> 'options') y where btrim(y) = '') then
        perform fuin.fail('FU422', case when k = 'intruder' then format('Étape %s : de 3 à 9 éléments, tous remplis.', pos)
                                        else format('Étape %s : de 2 à 8 réponses possibles, toutes remplies.', pos) end);
      end if;
      if cardinality(fuin.int_list(s -> 'correct')) = 0
         or exists (select 1 from unnest(fuin.int_list(s -> 'correct')) y where y < 0 or y >= jsonb_array_length(s -> 'options')) then
        perform fuin.fail('FU422', case when k = 'intruder' then format('Étape %s : désigne l''intrus.', pos)
                                        else format('Étape %s : coche au moins une bonne réponse.', pos) end);
      end if;
      if k = 'intruder' and cardinality(fuin.int_list(s -> 'correct')) <> 1 then
        perform fuin.fail('FU422', format('Étape %s : un seul intrus.', pos));
      end if;
    elsif k = 'situation' then
      if jsonb_typeof(s -> 'situations') <> 'array' or jsonb_array_length(s -> 'situations') not between 1 and 8 then
        perform fuin.fail('FU422', format('Étape %s : de 1 à 8 mises en situation.', pos));
      end if;
      for x in select * from jsonb_array_elements(s -> 'situations') loop
        if btrim(coalesce(x ->> 'text', '')) = '' then
          perform fuin.fail('FU422', format('Étape %s : décris chaque mise en situation.', pos));
        end if;
        if cardinality(fuin.int_list(x -> 'answers')) = 0
           or exists (select 1 from unnest(fuin.int_list(x -> 'answers')) y
                       where not exists (select 1 from fuin.pages p where p.id = y and p.kind = 'seal')) then
          perform fuin.fail('FU422', format('Étape %s : choisis le bon sceau pour chaque situation.', pos));
        end if;
      end loop;
    elsif k = 'dial' then
      if jsonb_typeof(s -> 'rings') <> 'array' or jsonb_array_length(s -> 'rings') not between 2 and 6 then
        perform fuin.fail('FU422', format('Étape %s : de 2 à 6 cercles.', pos));
      end if;
      for x in select * from jsonb_array_elements(s -> 'rings') loop
        if btrim(coalesce(x ->> 'answer', '')) = '' or char_length(btrim(x ->> 'answer')) > 3 then
          perform fuin.fail('FU422', format('Étape %s : chaque cercle a un bon kanji (3 caractères au plus).', pos));
        end if;
        if cardinality(fuin.kanji_chars(x ->> 'decoys')) not between 1 and 9 then
          perform fuin.fail('FU422', format('Étape %s : de 1 à 9 kanjis leurres par cercle.', pos));
        end if;
        if btrim(x ->> 'answer') = any(fuin.kanji_chars(x ->> 'decoys')) then
          perform fuin.fail('FU422', format('Étape %s : le bon kanji d''un cercle se retrouve dans ses leurres.', pos));
        end if;
      end loop;
    elsif k = 'mastermind' then
      nchars := cardinality(fuin.kanji_chars(s ->> 'formula'));
      if nchars not between 3 and 6 then
        perform fuin.fail('FU422', format('Étape %s : la formule secrète compte de 3 à 6 kanjis.', pos));
      end if;
      if cardinality(fuin.kanji_chars(s ->> 'palette')) not between 3 and 8
         or (select count(distinct c) from unnest(fuin.kanji_chars(s ->> 'palette')) c) <> cardinality(fuin.kanji_chars(s ->> 'palette')) then
        perform fuin.fail('FU422', format('Étape %s : de 3 à 8 kanjis différents à proposer.', pos));
      end if;
      if exists (select 1 from unnest(fuin.kanji_chars(s ->> 'formula')) c where not (c = any(fuin.kanji_chars(s ->> 'palette')))) then
        perform fuin.fail('FU422', format('Étape %s : chaque kanji de la formule secrète doit être parmi les kanjis proposés.', pos));
      end if;
    elsif k = 'path' then
      if jsonb_typeof(s -> 'grid') <> 'array' or jsonb_array_length(s -> 'grid') not between 2 and 6 then
        perform fuin.fail('FU422', format('Étape %s : la grille a de 2 à 6 lignes.', pos));
      end if;
      cols := cardinality(fuin.kanji_chars(s -> 'grid' ->> 0));
      if cols not between 2 and 6
         or exists (select 1 from jsonb_array_elements_text(s -> 'grid') r where cardinality(fuin.kanji_chars(r)) <> cols) then
        perform fuin.fail('FU422', format('Étape %s : toutes les lignes de la grille ont le même nombre de kanjis (2 à 6).', pos));
      end if;
      ncells := cols * jsonb_array_length(s -> 'grid');
      cells := fuin.int_seq(s -> 'path');
      if cardinality(cells) < 2 then
        perform fuin.fail('FU422', format('Étape %s : trace le flux sur au moins deux cases.', pos));
      end if;
      if exists (select 1 from unnest(cells) c where c < 0 or c >= ncells)
         or (select count(distinct c) from unnest(cells) c) <> cardinality(cells) then
        perform fuin.fail('FU422', format('Étape %s : le flux passe une seule fois par case.', pos));
      end if;
      for j in 2 .. cardinality(cells) loop
        if abs(cells[j] / cols - cells[j - 1] / cols) + abs(cells[j] % cols - cells[j - 1] % cols) <> 1 then
          perform fuin.fail('FU422', format('Étape %s : le flux passe d''une case à sa voisine.', pos));
        end if;
      end loop;
    elsif k = 'memory' then
      nchars := cardinality(fuin.kanji_chars(s ->> 'formula'));
      if nchars not between 3 and 12 then
        perform fuin.fail('FU422', format('Étape %s : la séquence compte de 3 à 12 kanjis.', pos));
      end if;
      if cardinality(fuin.kanji_chars(s ->> 'decoys')) > 12 then
        perform fuin.fail('FU422', format('Étape %s : 12 kanjis leurres au maximum.', pos));
      end if;
      if coalesce(nullif(s ->> 'show_seconds', '')::integer, 5) not between 2 and 30 then
        perform fuin.fail('FU422', format('Étape %s : la séquence reste visible de 2 à 30 secondes.', pos));
      end if;
      if coalesce((s ->> 'signs')::boolean, false)
         and exists (select 1 from unnest(fuin.kanji_chars(s ->> 'formula')) c where not (c = any(fuin.hand_signs()))) then
        perform fuin.fail('FU422', format('Étape %s : en mode signes, la séquence n''utilise que les douze signes (子丑寅卯辰巳午未申酉戌亥).', pos));
      end if;
    end if;
  end loop;

  if v_id is null then
    insert into fuin.trames(title, intro_md, shared, min_rank, steps, restricted_to, test_only, created_by)
    values (v_title, coalesce(p_trame ->> 'intro_md', ''), coalesce((p_trame ->> 'shared')::boolean, true), v_min, v_steps,
            v_only, v_test, m.id)
    returning id into v_id;
  else
    update fuin.trames
       set title = v_title, intro_md = coalesce(p_trame ->> 'intro_md', ''),
           shared = coalesce((p_trame ->> 'shared')::boolean, true), min_rank = v_min, steps = v_steps,
           restricted_to = v_only, test_only = v_test, updated_at = now()
     where id = v_id;
    if not found then perform fuin.fail('FU404', 'Trame introuvable.'); end if;
  end if;
  perform fuin.log(m, 'trame.save', v_title);
  return json_build_object('id', v_id);
end $$;




-- start : ouvre la page aux joueurs · end : la ferme · reset : efface toute la progression
create or replace function public.fuin_admin_trame_status(p_token text, p_id integer, p_action text)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  m fuin.members;
  t fuin.trames;
begin
  m := fuin.require_conclave(p_token);
  select * into t from fuin.trames where id = p_id for update;
  if not found then perform fuin.fail('FU404', 'Trame introuvable.'); end if;
  if p_action = 'start' then
    if jsonb_array_length(t.steps) = 0 then perform fuin.fail('FU422', 'Ajoute au moins une étape avant d''ouvrir la trame.'); end if;
    update fuin.trames set status = 'active', started_at = now(), ended_at = null, updated_at = now() where id = p_id;
    perform fuin.log(m, 'trame.start', t.title);
  elsif p_action = 'end' then
    update fuin.trames set status = 'ended', ended_at = now(), updated_at = now() where id = p_id;
    perform fuin.log(m, 'trame.end', t.title);
  elsif p_action = 'reset' then
    delete from fuin.trame_attempts where trame_id = p_id;
    delete from fuin.trame_solves where trame_id = p_id;
    delete from fuin.trame_studies where trame_id = p_id;
    update fuin.trames set status = case when status = 'active' then 'active' else 'draft' end, updated_at = now() where id = p_id;
    perform fuin.log(m, 'trame.reset', t.title);
  else
    perform fuin.fail('FU422', 'Action inconnue.');
  end if;
  return json_build_object('ok', true);
end $$;

create or replace function public.fuin_admin_trame_delete(p_token text, p_id integer)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  m fuin.members;
  v_title text;
begin
  m := fuin.require_conclave(p_token);
  delete from fuin.trames where id = p_id returning title into v_title;
  if v_title is null then perform fuin.fail('FU404', 'Trame introuvable.'); end if;
  perform fuin.log(m, 'trame.delete', v_title);
  return json_build_object('ok', true);
end $$;

-- =====================================================================
--  Mémorial des Grands Maîtres et des Maîtres
-- =====================================================================
-- Champs libres d'une fiche, vérifiés (Conclave comme maître)
create or replace function fuin.memorial_check_fields(p_epithet text, p_origin text, p_era text, p_specialty text,
                                                      p_story text, p_image text)
returns void language plpgsql immutable set search_path = '' as $$
begin
  if length(p_epithet) > 120 or length(p_origin) > 120 or length(p_era) > 120 or length(p_specialty) > 160 then
    perform fuin.fail('FU422', 'Un des champs courts est trop long.');
  end if;
  if length(p_story) > 20000 then
    perform fuin.fail('FU422', 'L''histoire est trop longue (20 000 caractères maximum).');
  end if;
  if p_image is not null then
    if p_image ~ '^data:image/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$' then
      if length(p_image) > 600000 then
        perform fuin.fail('FU422', 'Image trop lourde : choisis une image plus petite.');
      end if;
    elsif p_image ~ '^https://[^\s"''<>]+$' then
      if length(p_image) > 1000 then perform fuin.fail('FU422', 'Adresse d''image trop longue.'); end if;
    else
      perform fuin.fail('FU422', 'Image invalide.');
    end if;
  end if;
end $$;

drop function if exists fuin.memorial_json(fuin.memorial);
create or replace function fuin.memorial_json(e fuin.memorial, m fuin.members)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', e.id, 'name', e.name, 'rank', e.rank, 'epithet', e.epithet, 'status', e.status,
    'origin', e.origin, 'era', e.era, 'specialty', e.specialty, 'story_md', e.story_md,
    'image', e.image, 'position', e.position,
    -- seul le Conclave sait quel shinobi est lié à quelle fiche
    'member_id', case when m.is_conclave then e.member_id end,
    'member_name', case when m.is_conclave then (select display_name from fuin.members where id = e.member_id) end,
    'mine', e.member_id is not distinct from m.id,
    'can_edit', m.is_conclave or e.member_id is not distinct from m.id)
$$;

-- Tous les membres connectés lisent le mémorial
create or replace function public.fuin_memorial(p_token text)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare m fuin.members;
begin
  m := fuin.session_member(p_token);
  return coalesce((select json_agg(fuin.memorial_json(e, m)
                                   order by case e.rank when 'grand_maitre' then 0 else 1 end, e.position, e.id)
                     from fuin.memorial e), '[]'::json);
end $$;

create or replace function public.fuin_admin_memorial_save(p_token text, p_entry jsonb)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  m fuin.members;
  old fuin.memorial;
  v_id integer := nullif(p_entry ->> 'id', '')::integer;
  v_name text := btrim(coalesce(p_entry ->> 'name', ''));
  v_rank text := coalesce(p_entry ->> 'rank', '');
  v_status text := coalesce(p_entry ->> 'status', '');
  v_epithet text := btrim(coalesce(p_entry ->> 'epithet', ''));
  v_origin text := btrim(coalesce(p_entry ->> 'origin', ''));
  v_era text := btrim(coalesce(p_entry ->> 'era', ''));
  v_specialty text := btrim(coalesce(p_entry ->> 'specialty', ''));
  v_story text := coalesce(p_entry ->> 'story_md', '');
  v_image text := nullif(btrim(coalesce(p_entry ->> 'image', '')), '');
  -- shinobi qui peut modifier lui-même cette fiche (absent du JSON : inchangé)
  v_has_member boolean := p_entry ? 'member_id';
  v_member uuid := nullif(p_entry ->> 'member_id', '')::uuid;
  v_pos integer;
begin
  m := fuin.require_conclave(p_token);
  if v_name = '' or length(v_name) > 80 then
    perform fuin.fail('FU422', 'Le nom est obligatoire (80 caractères maximum).');
  end if;
  if v_rank not in ('grand_maitre', 'maitre') then perform fuin.fail('FU422', 'Rang invalide.'); end if;
  if v_status not in ('', 'actif', 'retire', 'mort', 'disparu', 'traitre') then
    perform fuin.fail('FU422', 'Statut invalide.');
  end if;
  perform fuin.memorial_check_fields(v_epithet, v_origin, v_era, v_specialty, v_story, v_image);
  if v_has_member and v_member is not null then
    if not exists (select 1 from fuin.members where id = v_member) then perform fuin.fail('FU422', 'Shinobi inconnu.'); end if;
    if exists (select 1 from fuin.memorial where member_id = v_member and id is distinct from v_id) then
      perform fuin.fail('FU409', 'Ce shinobi a déjà sa fiche au mémorial.');
    end if;
  end if;

  if v_id is null then
    select coalesce(max(position), 0) + 1 into v_pos from fuin.memorial where rank = v_rank;
    insert into fuin.memorial(name, rank, epithet, status, origin, era, specialty, story_md, image, position, member_id, updated_by)
    values (v_name, v_rank, v_epithet, v_status, v_origin, v_era, v_specialty, v_story, v_image, v_pos,
            case when v_has_member then v_member end, m.id)
    returning id into v_id;
    perform fuin.log(m, 'memorial.create', v_name);
  else
    select * into old from fuin.memorial where id = v_id for update;
    if not found then perform fuin.fail('FU404', 'Cette entrée du mémorial n''existe plus.'); end if;
    v_pos := old.position;
    if old.rank <> v_rank then
      select coalesce(max(position), 0) + 1 into v_pos from fuin.memorial where rank = v_rank;
    end if;
    update fuin.memorial
       set name = v_name, rank = v_rank, epithet = v_epithet, status = v_status, origin = v_origin, era = v_era,
           specialty = v_specialty, story_md = v_story, image = v_image, position = v_pos,
           member_id = case when v_has_member then v_member else old.member_id end,
           updated_at = now(), updated_by = m.id
     where id = v_id;
    perform fuin.log(m, 'memorial.update', v_name);
  end if;
  return json_build_object('id', v_id);
end $$;

-- Un maître modifie SA fiche : portrait, titre, origine, époque, spécialité et histoire.
-- Le nom, le rang, le statut et le lien restent l'affaire du Conclave.
create or replace function public.fuin_memorial_own_save(p_token text, p_entry jsonb)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  m fuin.members;
  e fuin.memorial;
  v_id integer := nullif(p_entry ->> 'id', '')::integer;
  v_epithet text := btrim(coalesce(p_entry ->> 'epithet', ''));
  v_origin text := btrim(coalesce(p_entry ->> 'origin', ''));
  v_era text := btrim(coalesce(p_entry ->> 'era', ''));
  v_specialty text := btrim(coalesce(p_entry ->> 'specialty', ''));
  v_story text := coalesce(p_entry ->> 'story_md', '');
  v_image text := nullif(btrim(coalesce(p_entry ->> 'image', '')), '');
begin
  m := fuin.session_member(p_token);
  select * into e from fuin.memorial where id = v_id for update;
  if not found then perform fuin.fail('FU404', 'Cette entrée du mémorial n''existe plus.'); end if;
  if not m.is_conclave and e.member_id is distinct from m.id then
    perform fuin.fail('FU403', 'Tu ne peux modifier que ta propre fiche du mémorial.');
  end if;
  perform fuin.memorial_check_fields(v_epithet, v_origin, v_era, v_specialty, v_story, v_image);
  update fuin.memorial
     set epithet = v_epithet, origin = v_origin, era = v_era, specialty = v_specialty, story_md = v_story,
         image = v_image, updated_at = now(), updated_by = m.id
   where id = v_id;
  perform fuin.log(m, 'memorial.own_update', e.name);
  return json_build_object('id', v_id);
end $$;

create or replace function public.fuin_admin_memorial_delete(p_token text, p_id integer)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  m fuin.members;
  v_name text;
begin
  m := fuin.require_conclave(p_token);
  delete from fuin.memorial where id = p_id returning name into v_name;
  if v_name is null then perform fuin.fail('FU404', 'Cette entrée du mémorial n''existe plus.'); end if;
  perform fuin.log(m, 'memorial.delete', v_name);
  return json_build_object('ok', true);
end $$;

-- Déplace une entrée d'un cran (p_dir < 0 : vers le début) parmi celles du même rang
create or replace function public.fuin_admin_memorial_move(p_token text, p_id integer, p_dir integer)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  m fuin.members;
  e fuin.memorial;
  v_pos integer;
  d integer := case when p_dir < 0 then -1 else 1 end;
begin
  m := fuin.require_conclave(p_token);
  select * into e from fuin.memorial where id = p_id for update;
  if not found then perform fuin.fail('FU404', 'Cette entrée du mémorial n''existe plus.'); end if;
  update fuin.memorial x set position = r.rn
    from (select id, row_number() over (order by position, id) as rn from fuin.memorial where rank = e.rank) r
   where x.id = r.id;
  select position into v_pos from fuin.memorial where id = p_id;
  update fuin.memorial
     set position = case when position = v_pos then v_pos + d else v_pos end
   where rank = e.rank and position in (v_pos, v_pos + d);
  return json_build_object('ok', true);
end $$;

-- =====================================================================
--  Droits : seules les fonctions public.fuin_* sont appelables par le site
-- =====================================================================
revoke all on all tables in schema fuin from public;
revoke all on all functions in schema fuin from public;

-- =====================================================================
--  Suggestions pour le site
-- =====================================================================
create or replace function fuin.suggestion_json(s fuin.suggestions, m fuin.members) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', s.id, 'kind', s.kind, 'title', s.title, 'body', s.body, 'status', s.status,
    'reply', s.reply, 'replied_at', s.replied_at,
    'replied_by', (select x.display_name from fuin.members x where x.id = s.replied_by),
    'author', coalesce((select x.display_name from fuin.members x where x.id = s.member_id), 'Ancien membre'),
    'mine', s.member_id is not distinct from m.id,
    'votes', (select count(*) from fuin.suggestion_votes v where v.suggestion_id = s.id),
    'voted', exists (select 1 from fuin.suggestion_votes v where v.suggestion_id = s.id and v.member_id = m.id),
    'created_at', s.created_at, 'updated_at', s.updated_at)
$$;

create or replace function public.fuin_suggestions(p_token text)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare m fuin.members;
begin
  m := fuin.session_member(p_token);
  return coalesce((select json_agg(fuin.suggestion_json(s, m) order by s.created_at desc) from fuin.suggestions s), '[]'::json);
end $$;

create or replace function public.fuin_suggestion_save(p_token text, p_s jsonb)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  m fuin.members;
  s fuin.suggestions;
  v_id integer := nullif(p_s ->> 'id', '')::integer;
  v_kind text := coalesce(nullif(p_s ->> 'kind', ''), 'feature');
  v_title text := btrim(coalesce(p_s ->> 'title', ''));
  v_body text := btrim(coalesce(p_s ->> 'body', ''));
begin
  m := fuin.session_member(p_token);
  if v_kind not in ('feature', 'content', 'trame', 'bug', 'other') then perform fuin.fail('FU422', 'Type de suggestion inconnu.'); end if;
  if length(v_title) < 3 then perform fuin.fail('FU422', 'Donne un titre à ta suggestion (3 caractères au moins).'); end if;
  if length(v_title) > 120 then perform fuin.fail('FU422', 'Titre trop long (120 caractères au plus).'); end if;
  if length(v_body) > 4000 then perform fuin.fail('FU422', 'Description trop longue (4 000 caractères au plus).'); end if;
  if v_id is null then
    if not m.is_conclave and (select count(*) from fuin.suggestions x
                               where x.member_id = m.id and x.created_at > now() - interval '1 day') >= 10 then
      perform fuin.fail('FU422', 'Tu as déjà proposé 10 suggestions aujourd''hui. Reviens demain.');
    end if;
    insert into fuin.suggestions(member_id, kind, title, body) values (m.id, v_kind, v_title, v_body) returning * into s;
    perform fuin.log(m, 'suggestion.create', v_title);
  else
    select * into s from fuin.suggestions where id = v_id for update;
    if not found then perform fuin.fail('FU404', 'Suggestion introuvable.'); end if;
    if not m.is_conclave and s.member_id is distinct from m.id then
      perform fuin.fail('FU403', 'Tu ne peux modifier que tes propres suggestions.');
    end if;
    if not m.is_conclave and s.status <> 'new' then
      perform fuin.fail('FU409', 'Le Conclave a déjà répondu à cette suggestion : elle ne se modifie plus.');
    end if;
    update fuin.suggestions set kind = v_kind, title = v_title, body = v_body, updated_at = now()
     where id = v_id returning * into s;
  end if;
  return fuin.suggestion_json(s, m)::json;
end $$;

create or replace function public.fuin_suggestion_delete(p_token text, p_id integer)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  m fuin.members;
  s fuin.suggestions;
begin
  m := fuin.session_member(p_token);
  select * into s from fuin.suggestions where id = p_id;
  if not found then perform fuin.fail('FU404', 'Suggestion introuvable.'); end if;
  if not m.is_conclave and (s.member_id is distinct from m.id or s.status <> 'new') then
    perform fuin.fail('FU403', 'Tu ne peux retirer que tes suggestions qui attendent encore une réponse.');
  end if;
  delete from fuin.suggestions where id = p_id;
  perform fuin.log(m, 'suggestion.delete', s.title);
  return json_build_object('ok', true);
end $$;

create or replace function public.fuin_suggestion_vote(p_token text, p_id integer, p_on boolean)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  m fuin.members;
  s fuin.suggestions;
begin
  m := fuin.session_member(p_token);
  select * into s from fuin.suggestions where id = p_id;
  if not found then perform fuin.fail('FU404', 'Suggestion introuvable.'); end if;
  if s.member_id is not distinct from m.id then perform fuin.fail('FU422', 'Tu ne peux pas soutenir ta propre suggestion.'); end if;
  if p_on then
    insert into fuin.suggestion_votes(suggestion_id, member_id) values (p_id, m.id) on conflict do nothing;
  else
    delete from fuin.suggestion_votes where suggestion_id = p_id and member_id = m.id;
  end if;
  return json_build_object('votes', (select count(*) from fuin.suggestion_votes v where v.suggestion_id = p_id), 'voted', p_on);
end $$;

create or replace function public.fuin_admin_suggestion_answer(p_token text, p_id integer, p_status text, p_reply text default '')
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  m fuin.members;
  s fuin.suggestions;
  v_reply text := btrim(coalesce(p_reply, ''));
begin
  m := fuin.require_conclave(p_token);
  if p_status not in ('new', 'planned', 'done', 'refused') then perform fuin.fail('FU422', 'Statut inconnu.'); end if;
  if p_status = 'refused' and v_reply = '' then perform fuin.fail('FU422', 'Explique au membre pourquoi sa suggestion est refusée.'); end if;
  if length(v_reply) > 2000 then perform fuin.fail('FU422', 'Réponse trop longue (2 000 caractères au plus).'); end if;
  update fuin.suggestions
     set status = p_status, reply = v_reply,
         replied_by = case when v_reply <> '' or p_status <> 'new' then m.id end,
         replied_at = case when v_reply <> '' or p_status <> 'new' then now() end,
         updated_at = now()
   where id = p_id returning * into s;
  if not found then perform fuin.fail('FU404', 'Suggestion introuvable.'); end if;
  perform fuin.log(m, 'suggestion.answer', s.title, jsonb_build_object('status', p_status));
  return fuin.suggestion_json(s, m)::json;
end $$;

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

-- Tables de roll par défaut (à adapter dans Console → Outils de trame → Tables de roll)
insert into fuin.roll_tables(slug, name, description, tiers, position) values
('desenclavement', 'Désenclavement',
 'Un roll par essai. Il faut autant de réussites que le cercle du sceau, en autant d''essais que le cercle du désenclaveur. Une réussite critique compte pour deux. Effets à adapter par le Conclave.',
 '[
   {"min":1,"max":1,"label":"Échec critique","tone":"crit-fail","effect":"Le sceau se retourne contre le désenclaveur : violent retour de chakra (blessure grave ou perte de conscience selon le cercle du sceau). L''essai est perdu."},
   {"min":2,"max":15,"label":"Échec avec contrecoup","tone":"fail","effect":"Le sceau résiste et renvoie une partie du chakra : douleur vive, épuisement ou brûlure du kanji dans la paume."},
   {"min":16,"max":50,"label":"Échec","tone":"neutral","effect":"Le sceau tient bon, sans conséquence."},
   {"min":51,"max":90,"label":"Réussite","tone":"success","effect":"Un verrou du sceau cède."},
   {"min":91,"max":99,"label":"Belle réussite","tone":"success","effect":"Le verrou cède proprement et le désenclaveur comprend mieux la structure du sceau."},
   {"min":100,"max":100,"label":"Réussite critique","tone":"crit-success","effect":"Deux verrous se brisent net, sans le moindre contrecoup : la réussite critique compte double."}
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

-- Mémorial : la page dans Fondations et les maîtres déjà connus
insert into fuin.pages(category_id, slug, kind, title, description, content_md, position)
select c.id, 'memorial', 'memorial', 'Mémorial des maîtres',
       'Les Grands Maîtres et les Maîtres qui ont porté l''art du Fuinjutsu.',
       'Leurs noms sont gravés ici pour que leur héritage ne s''efface pas. Chaque fiche raconte un parcours : ceux qui ont élevé l''art du scellement, et ceux qui l''ont trahi.',
       3
  from fuin.categories c where c.slug = 'fondations'
on conflict (slug) do nothing;

insert into fuin.memorial(name, rank, status, position)
select v.name, v.rank, v.status, v.pos
  from (values ('Shiro Yara', 'grand_maitre', '', 1), ('Yugaku', 'grand_maitre', '', 2),
               ('Bruine', 'grand_maitre', '', 3), ('Brume', 'grand_maitre', '', 4),
               ('Izanari', 'grand_maitre', 'traitre', 5),
               ('Koma Kosajin', 'maitre', '', 1), ('Masuku Enko', 'maitre', '', 2), ('Soya', 'maitre', '', 3),
               ('Sôki Sabaku', 'maitre', '', 4), ('Kokurai Hanazora', 'maitre', '', 5)) as v(name, rank, status, pos)
 where not exists (select 1 from fuin.memorial);

-- Liaison automatique des fiches existantes à leur shinobi, par le nom
-- (« Prénom Nom » ou « Nom Prénom », accents et majuscules ignorés, ou un shinobi au seul prénom
-- égal au premier mot de la fiche), quand un seul shinobi correspond et qu'il n'a qu'une fiche.
with matches as (
  select e.id as eid, mb.id as mid
    from fuin.memorial e
    join fuin.members mb
      on fuin.name_key(e.name) in (mb.login_key, fuin.name_key(mb.nom || ' ' || mb.prenom))
      or (btrim(mb.nom) = '' and fuin.name_key(mb.prenom) = split_part(fuin.name_key(e.name), ' ', 1))
   where e.member_id is null
), uniq as (
  select eid, min(mid::text)::uuid as mid
    from matches
   where eid in (select eid from matches group by eid having count(*) = 1)
     and mid in (select mid from matches group by mid having count(*) = 1)
   group by eid
)
update fuin.memorial e set member_id = u.mid
  from uniq u
 where e.id = u.eid and not exists (select 1 from fuin.memorial o where o.member_id = u.mid);

notify pgrst, 'reload schema';
