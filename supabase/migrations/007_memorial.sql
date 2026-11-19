-- =====================================================================
--  記  Migration 007 — Mémorial des Grands Maîtres et des Maîtres
-- ---------------------------------------------------------------------
--  À exécuter UNE FOIS dans Supabase → SQL Editor (après la 006).
--  Ajoute la page « Mémorial des maîtres » dans Fondations : portraits,
--  titres, statuts et histoires, que le Conclave ajoute, modifie,
--  réordonne ou retire directement depuis la page.
-- =====================================================================

-- Nouveau type de fiche : memorial
alter table fuin.pages drop constraint if exists pages_kind_check;
alter table fuin.pages add constraint pages_kind_check check (kind in ('seal', 'index', 'doc', 'memorial'));

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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references fuin.members(id) on delete set null
);
create index if not exists memorial_rank_idx on fuin.memorial(rank, position);
alter table fuin.memorial enable row level security;

create or replace function fuin.memorial_json(e fuin.memorial)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', e.id, 'name', e.name, 'rank', e.rank, 'epithet', e.epithet, 'status', e.status,
    'origin', e.origin, 'era', e.era, 'specialty', e.specialty, 'story_md', e.story_md,
    'image', e.image, 'position', e.position)
$$;

-- Tous les membres connectés lisent le mémorial
create or replace function public.fuin_memorial(p_token text)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare m fuin.members;
begin
  m := fuin.session_member(p_token);
  return coalesce((select json_agg(fuin.memorial_json(e)
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
  if length(v_epithet) > 120 or length(v_origin) > 120 or length(v_era) > 120 or length(v_specialty) > 160 then
    perform fuin.fail('FU422', 'Un des champs courts est trop long.');
  end if;
  if length(v_story) > 20000 then
    perform fuin.fail('FU422', 'L''histoire est trop longue (20 000 caractères maximum).');
  end if;
  if v_image is not null then
    if v_image ~ '^data:image/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$' then
      if length(v_image) > 600000 then
        perform fuin.fail('FU422', 'Image trop lourde : choisis une image plus petite.');
      end if;
    elsif v_image ~ '^https://[^\s"''<>]+$' then
      if length(v_image) > 1000 then perform fuin.fail('FU422', 'Adresse d''image trop longue.'); end if;
    else
      perform fuin.fail('FU422', 'Image invalide.');
    end if;
  end if;

  if v_id is null then
    select coalesce(max(position), 0) + 1 into v_pos from fuin.memorial where rank = v_rank;
    insert into fuin.memorial(name, rank, epithet, status, origin, era, specialty, story_md, image, position, updated_by)
    values (v_name, v_rank, v_epithet, v_status, v_origin, v_era, v_specialty, v_story, v_image, v_pos, m.id)
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
           updated_at = now(), updated_by = m.id
     where id = v_id;
    perform fuin.log(m, 'memorial.update', v_name);
  end if;
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

-- La fiche accepte désormais le type « memorial »
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
  if split_part(v_slug, '/', 1) in ('connexion', 'conclave', 'mon-compte', 'demandes', 'trame', 'assets') then
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

-- Droits : seules les fonctions public.fuin_* sont appelables par le site
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

notify pgrst, 'reload schema';

select 'Migration 007 appliquée : le mémorial des maîtres est prêt.' as resultat;
