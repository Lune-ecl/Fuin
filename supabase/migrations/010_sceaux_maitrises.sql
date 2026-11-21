-- =====================================================================
--  修  Migration 010 — Demandes au 3ème cercle et sceaux maîtrisés
-- ---------------------------------------------------------------------
--  À exécuter UNE FOIS dans Supabase → SQL Editor (après la 009).
--  · Les demandes de création de sceau s'ouvrent désormais au 3ème cercle.
--  · Chaque shinobi peut cocher les sceaux qu'il maîtrise (parmi ceux
--    qu'il peut lire) ; le Conclave voit qui maîtrise quoi.
-- =====================================================================

-- Demandes de création : dès le 3ème cercle
create or replace function fuin.can_request(m fuin.members) returns boolean
language sql stable set search_path = '' as $$
  select m.is_conclave or m.rank >= 3
$$;

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

-- =====================================================================
--  Sceaux maîtrisés
-- =====================================================================
-- Sceaux qu'un shinobi déclare maîtriser (il coche lui-même, parmi ceux qu'il peut lire)
create table if not exists fuin.masteries (
  member_id  uuid not null references fuin.members(id) on delete cascade,
  page_id    integer not null references fuin.pages(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (member_id, page_id)
);
create index if not exists masteries_page_idx on fuin.masteries(page_id);
alter table fuin.masteries enable row level security;

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

select 'Migration 010 appliquée : demandes au 3ème cercle et sceaux maîtrisés prêts.' as resultat;
