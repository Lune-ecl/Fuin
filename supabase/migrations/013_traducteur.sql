-- =====================================================================
--  訳  Migration 013 — Traducteur de kanjis
-- ---------------------------------------------------------------------
--  À exécuter UNE FOIS dans Supabase → SQL Editor (après la 012).
--  · Le traducteur de kanjis (/traducteur) est une page du site, ouverte
--    à tous, même sans compte : ses dictionnaires sont servis par le site.
--  · Les adresses « traducteur » et « kanji » sont réservées par le site,
--    pour qu'aucune fiche ne prenne leur place.
-- =====================================================================

-- Le traducteur fonctionne entièrement dans le navigateur (dictionnaires servis par le site) :
-- la fonction d'une première version, si elle a été installée, n'est plus utilisée.
drop function if exists public.fuin_glossary(text);

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
  if split_part(v_slug, '/', 1) in ('connexion', 'conclave', 'mon-compte', 'demandes', 'trame', 'assets', 'traducteur', 'kanji') then
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

notify pgrst, 'reload schema';

select 'Migration 013 appliquée : traducteur de kanjis prêt.' as resultat;
