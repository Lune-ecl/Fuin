-- =====================================================================
--  封  Migration 002 — Catégorie « Sceaux MJ » + veille anti-pause
-- ---------------------------------------------------------------------
--  À exécuter UNE FOIS dans Supabase → SQL Editor (ré-exécutable sans risque).
--  1. Crée la catégorie « Sceaux MJ », réservée au Conclave, et y range
--     tous les sceaux portant le badge MJ.
--  2. Règle de sécurité : un sceau MJ n'est JAMAIS visible d'un joueur,
--     quelle que soit sa catégorie.
--  3. Ajoute la fonction fuin_ping() appelée chaque jour par GitHub pour
--     que Supabase ne mette pas la base en pause.
-- =====================================================================

-- 1. Catégorie Sceaux MJ (placée juste après le 5e cercle)
update fuin.categories
   set position = position + 1
 where position >= 7
   and not exists (select 1 from fuin.categories where slug = 'sceaux-mj');

insert into fuin.categories(slug, name, glyph, tagline, min_rank, conclave_only, show_on_home, position)
values ('sceaux-mj', 'Sceaux MJ', '禁', 'Sceaux réservés aux Maîtres de Jeu.', 5, true, false, 7)
on conflict (slug) do nothing;

insert into fuin.pages(category_id, slug, kind, title, nav_title, description, content_md, position)
select id, 'sceaux-mj', 'index', 'Sceaux MJ', 'Sceaux MJ',
       'Sceaux réservés aux Maîtres de Jeu, invisibles des joueurs.',
       $md$Les **sceaux MJ** ne s'apprennent pas comme les autres : ils sont réservés aux **Maîtres de Jeu** et n'apparaissent jamais aux joueurs, quel que soit leur cercle.

:::danger[Usage encadré]
Toute utilisation passe par une **validation du staff / MJ Fuin** et se joue en **scène encadrée** ou événementielle.
:::
$md$, 0
from fuin.categories where slug = 'sceaux-mj'
on conflict (slug) do nothing;

-- Déplacement : ordre conservé (cercle d'origine, puis position d'origine)
update fuin.pages p
   set category_id = (select id from fuin.categories where slug = 'sceaux-mj'),
       position = (select c.position from fuin.categories c where c.id = p.category_id) * 100 + p.position,
       updated_at = now()
 where p.badge = 'mj'
   and p.kind = 'seal'
   and p.category_id <> (select id from fuin.categories where slug = 'sceaux-mj');

-- 2. Un sceau MJ n'est jamais visible d'un joueur
create or replace function fuin.can_view_page(m fuin.members, c fuin.categories, p fuin.pages) returns boolean
language sql stable set search_path = '' as $$
  select m.is_conclave
      or (not p.hidden
          and p.badge is distinct from 'mj'
          and not c.conclave_only
          and m.rank >= greatest(c.min_rank, coalesce(p.min_rank, 1)))
$$;

-- Message de refus adapté aux sceaux MJ
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
    if p.hidden then
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
      'description', p.description, 'content_md', p.content_md, 'hidden', p.hidden,
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

-- 3. Veille anti-pause
create table if not exists fuin.keepalive (
  id        smallint primary key default 1 check (id = 1),
  pinged_at timestamptz not null default now(),
  pings     bigint not null default 0
);
alter table fuin.keepalive enable row level security;

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

revoke all on function public.fuin_ping() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'grant execute on function public.fuin_ping() to anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.fuin_ping() to authenticated';
  end if;
end $$;

insert into fuin.audit_log(actor_name, action, target, details)
select 'Système', 'category.save', 'Sceaux MJ',
       jsonb_build_object('min_rank', 5, 'conclave_only', true)
where not exists (select 1 from fuin.audit_log where target = 'Sceaux MJ' and actor_name = 'Système');

notify pgrst, 'reload schema';

select 'Migration 002 appliquée : '
       || (select count(*) from fuin.pages p join fuin.categories c on c.id = p.category_id
            where c.slug = 'sceaux-mj' and p.kind = 'seal')
       || ' sceaux MJ rangés, veille anti-pause prête.' as resultat;
