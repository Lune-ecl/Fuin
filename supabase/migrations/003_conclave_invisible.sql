-- =====================================================================
--  封  Migration 003 — Catégories du Conclave invisibles des joueurs
-- ---------------------------------------------------------------------
--  À exécuter UNE FOIS dans Supabase → SQL Editor (après la 002).
--  • Les catégories « réservées au Conclave » (Sceaux MJ, Sceaux de clan)
--    n'apparaissent plus du tout aux joueurs (ni grisées, ni verrouillées).
--  • Une adresse directe vers un sceau MJ, de clan ou brouillon renvoie
--    « archive introuvable » à un joueur.
--  • Les pages d'ensemble des cercles ne citent plus les sceaux MJ aux joueurs
--    (le Conclave voit toujours le texte complet).
-- =====================================================================

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

revoke all on function fuin.strip_secret(fuin.members, text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function fuin.strip_secret(fuin.members, text) from anon';
  end if;
end $$;

notify pgrst, 'reload schema';

select 'Migration 003 appliquée : catégories du Conclave invisibles des joueurs.' as resultat;
