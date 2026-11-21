-- =====================================================================
--  願  Migration 009 — Demandes modifiables et fiches du mémorial
-- ---------------------------------------------------------------------
--  À exécuter UNE FOIS dans Supabase → SQL Editor (après la 008).
--  · Demandes de création de sceau : le shinobi peut modifier sa demande
--    tant que le Conclave ne l'a pas examinée, l'annuler (elle redevient
--    un brouillon, rien n'est perdu), la renvoyer ou la supprimer.
--    Les brouillons restent invisibles pour le Conclave.
--  · Mémorial : chaque fiche peut être liée à un shinobi, qui modifie
--    lui-même son portrait, son titre et son histoire. Les fiches dont le
--    nom correspond exactement à un shinobi sont liées automatiquement.
-- =====================================================================

-- Brouillons de demandes
alter table fuin.seal_requests drop constraint if exists seal_requests_status_check;
alter table fuin.seal_requests add constraint seal_requests_status_check
  check (status in ('draft', 'pending', 'approved', 'refused'));

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
    perform fuin.fail('FU403', 'Les demandes de création de sceau s''ouvrent au 4ème cercle.');
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
    perform fuin.fail('FU403', 'Les demandes de création de sceau s''ouvrent au 4ème cercle.');
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
    perform fuin.fail('FU403', 'Les demandes de création de sceau s''ouvrent au 4ème cercle.');
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

-- =====================================================================
--  Mémorial : chaque maître modifie sa fiche
-- =====================================================================
-- Le maître lié à une fiche peut la modifier lui-même
alter table fuin.memorial add column if not exists member_id uuid references fuin.members(id) on delete set null;
create unique index if not exists memorial_member_idx on fuin.memorial(member_id) where member_id is not null;

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

select 'Migration 009 appliquée : demandes modifiables et fiches du mémorial ouvertes à leurs maîtres.' as resultat,
       (select count(*) from fuin.memorial where member_id is not null) as fiches_liees;
