-- =====================================================================
--  密  Migration 008 — Trames réservées et réussite critique double
-- ---------------------------------------------------------------------
--  À exécuter UNE FOIS dans Supabase → SQL Editor (après la 007).
--  · Une trame peut être réservée à des shinobi choisis : eux seuls (et le
--    Conclave) la voient, quel que soit leur cercle.
--  · Au désenclavement, une réussite critique brise deux verrous.
-- =====================================================================

alter table fuin.trames add column if not exists restricted_to uuid[] not null default '{}';

create or replace function fuin.trame_visible(t fuin.trames, m fuin.members) returns boolean
language sql stable set search_path = '' as $$
  select m.is_conclave
      or (t.status = 'active'
          and case when cardinality(t.restricted_to) > 0 then m.id = any(t.restricted_to)
                   else m.rank >= t.min_rank end)
$$;

create or replace function fuin.trame_restricted_names(t fuin.trames) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(mm.display_name order by mm.display_name), '[]'::jsonb)
    from fuin.members mm where mm.id = any(t.restricted_to)
$$;


create or replace function public.fuin_bootstrap(p_token text)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare m fuin.members;
begin
  m := fuin.session_member(p_token);
  return json_build_object(
    'member', fuin.member_json(m),
    'requests_pending', case when m.is_conclave
                          then (select count(*) from fuin.seal_requests where status = 'pending') end,
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
  used integer;
  succ integer;
  req integer;
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
    st := jsonb_build_object(
      'index', i, 'kind', s ->> 'kind', 'title', coalesce(s ->> 'title', ''),
      'prompt_md', coalesce(s ->> 'prompt_md', ''),
      'state', case when i < cur then 'solved' else 'current' end);
    if s ->> 'kind' = 'cipher' then
      select count(*) into used from fuin.trame_attempts a
       where a.trame_id = t.id and a.step_index = i and a.member_id = m.id;
      st := st || jsonb_build_object(
        'cipher_text', coalesce(s ->> 'cipher_text', ''),
        'attempts_used', used,
        'max_attempts', coalesce((s ->> 'max_attempts')::integer, 2));
    elsif s ->> 'kind' = 'unseal' then
      -- une réussite critique brise deux verrous
      select count(*), coalesce(sum(case when a.tone = 'crit-success' then 2 when a.success then 1 else 0 end), 0) into used, succ from fuin.trame_attempts a
       where a.trame_id = t.id and a.step_index = i and a.member_id = m.id;
      req := greatest(coalesce((s ->> 'min_rank')::integer, 3), coalesce((s ->> 'seal_circle')::integer, 3));
      st := st || jsonb_build_object(
        'seal_svg', nullif(s ->> 'seal_svg', ''),
        'fails_total', (select count(*) from fuin.trame_attempts a
                         where a.trame_id = t.id and a.step_index = i and not a.success),
        'seal_circle', coalesce((s ->> 'seal_circle')::integer, 3),
        'required_rank', req,
        'allowed', m.rank,
        'attempts_used', used,
        'successes', succ,
        'eligible', m.is_conclave or m.rank >= req,
        'rolls', coalesce((select jsonb_agg(jsonb_build_object('roll', a.roll, 'label', a.label, 'tone', a.tone, 'effect', a.effect)
                                            order by a.created_at)
                             from fuin.trame_attempts a
                            where a.trame_id = t.id and a.step_index = i and a.member_id = m.id), '[]'::jsonb));
    end if;
    if i < cur then
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
                               'shared', t.shared, 'started_at', t.started_at,
                               'restricted_names', fuin.trame_restricted_names(t)),
    'steps', steps,
    'total', n,
    'remaining', greatest(0, n - cur - 1),
    'complete', cur >= n);
end $$;

create or replace function public.fuin_trame_unseal(p_token text, p_id integer, p_step integer)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  m fuin.members;
  t fuin.trames;
  s jsonb;
  needed integer;
  req integer;
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
  needed := coalesce((s ->> 'seal_circle')::integer, 3);
  req := greatest(coalesce((s ->> 'min_rank')::integer, 3), needed);
  if not m.is_conclave and m.rank < req then
    perform fuin.fail('FU403', format('Seuls les shinobi du %s et plus peuvent tenter ce désenclavement.', fuin.circle_label(req)));
  end if;
  select count(*), coalesce(sum(case when a.tone = 'crit-success' then 2 when a.success then 1 else 0 end), 0) into used, succ from fuin.trame_attempts a
   where a.trame_id = t.id and a.step_index = p_step and a.member_id = m.id;
  if used >= m.rank then
    perform fuin.fail('FU422', 'Tu as épuisé tes essais (autant que ton cercle).');
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
  if succ >= needed then
    insert into fuin.trame_solves(trame_id, step_index, member_id) values (t.id, p_step, m.id) on conflict do nothing;
  end if;
  return json_build_object(
    'roll', v_roll, 'label', tier ->> 'label', 'tone', tier ->> 'tone', 'effect', tier ->> 'effect',
    'gained', gained, 'successes', succ, 'needed', needed, 'attempts_used', used, 'allowed', m.rank, 'broken', succ >= needed);
end $$;

create or replace function public.fuin_admin_trames(p_token text)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare m fuin.members;
begin
  m := fuin.require_conclave(p_token);
  return coalesce((select json_agg(json_build_object(
      'id', t.id, 'title', t.title, 'status', t.status, 'shared', t.shared, 'min_rank', t.min_rank,
      'restricted_names', fuin.trame_restricted_names(t),
      'steps', jsonb_array_length(t.steps), 'started_at', t.started_at, 'ended_at', t.ended_at,
      'updated_at', t.updated_at,
      'participants', (select count(distinct a.member_id) from fuin.trame_attempts a where a.trame_id = t.id),
      'solves', (select count(*) from fuin.trame_solves so where so.trame_id = t.id)
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
    'log', coalesce((select json_agg(x) from (
        select a.id, a.step_index, a.kind, a.answer, a.roll, a.label, a.tone, a.success, a.created_at,
               mm.display_name as member, mm.rank
          from fuin.trame_attempts a join fuin.members mm on mm.id = a.member_id
         where a.trame_id = t.id
         order by a.created_at desc
         limit 200) x), '[]'::json)
  );
end $$;

create or replace function public.fuin_admin_trame_save(p_token text, p_trame jsonb)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  m fuin.members;
  v_id integer := nullif(p_trame ->> 'id', '')::integer;
  v_title text := btrim(coalesce(p_trame ->> 'title', ''));
  v_steps jsonb := coalesce(p_trame -> 'steps', '[]'::jsonb);
  v_min integer := coalesce(nullif(p_trame ->> 'min_rank', '')::integer, 1);
  v_only uuid[] := '{}';
  s jsonb;
  k text;
  pos integer := 0;
begin
  m := fuin.require_conclave(p_token);
  if v_title = '' then perform fuin.fail('FU422', 'Donne un titre à la trame.'); end if;
  -- trame réservée : on ne garde que des membres qui existent
  if jsonb_typeof(p_trame -> 'restricted_to') = 'array' then
    select coalesce(array_agg(mm.id order by mm.display_name), '{}') into v_only
      from fuin.members mm
     where mm.id::text in (select jsonb_array_elements_text(p_trame -> 'restricted_to'));
    if jsonb_array_length(p_trame -> 'restricted_to') > 0 and cardinality(v_only) = 0 then
      perform fuin.fail('FU422', 'Les shinobi choisis pour cette trame sont introuvables.');
    end if;
  end if;
  if v_min not between 1 and 5 then perform fuin.fail('FU422', 'Cercle minimum invalide.'); end if;
  if jsonb_typeof(v_steps) <> 'array' then perform fuin.fail('FU422', 'Étapes invalides.'); end if;
  if jsonb_array_length(v_steps) > 20 then perform fuin.fail('FU422', '20 étapes au maximum.'); end if;
  for s in select * from jsonb_array_elements(v_steps) loop
    pos := pos + 1;
    k := coalesce(s ->> 'kind', '');
    if k not in ('cipher', 'unseal', 'text') then
      perform fuin.fail('FU422', format('Étape %s : type inconnu.', pos));
    end if;
    if k = 'cipher' then
      if jsonb_typeof(s -> 'answers') <> 'array'
         or not exists (select 1 from jsonb_array_elements_text(s -> 'answers') x where fuin.answer_key(x) <> '') then
        perform fuin.fail('FU422', format('Étape %s : indique au moins une traduction acceptée.', pos));
      end if;
      if coalesce((s ->> 'max_attempts')::integer, 2) not between 1 and 10 then
        perform fuin.fail('FU422', format('Étape %s : nombre d''essais entre 1 et 10.', pos));
      end if;
    elsif k = 'unseal' then
      if coalesce((s ->> 'seal_circle')::integer, 3) not between 1 and 5
         or coalesce((s ->> 'min_rank')::integer, 3) not between 1 and 5 then
        perform fuin.fail('FU422', format('Étape %s : cercles entre 1 et 5.', pos));
      end if;
      if coalesce(s ->> 'seal_svg', '') <> ''
         and (length(s ->> 'seal_svg') > 60000 or (s ->> 'seal_svg') !~* '^<svg') then
        perform fuin.fail('FU422', format('Étape %s : visuel du sceau invalide.', pos));
      end if;
    end if;
  end loop;

  if v_id is null then
    insert into fuin.trames(title, intro_md, shared, min_rank, steps, restricted_to, created_by)
    values (v_title, coalesce(p_trame ->> 'intro_md', ''), coalesce((p_trame ->> 'shared')::boolean, true), v_min, v_steps,
            v_only, m.id)
    returning id into v_id;
  else
    update fuin.trames
       set title = v_title, intro_md = coalesce(p_trame ->> 'intro_md', ''),
           shared = coalesce((p_trame ->> 'shared')::boolean, true), min_rank = v_min, steps = v_steps,
           restricted_to = v_only, updated_at = now()
     where id = v_id;
    if not found then perform fuin.fail('FU404', 'Trame introuvable.'); end if;
  end if;
  perform fuin.log(m, 'trame.save', v_title);
  return json_build_object('id', v_id);
end $$;

-- Textes de la table de désenclavement (seulement s'ils n'ont pas été modifiés)
update fuin.roll_tables
   set description = 'Un roll par essai. Il faut autant de réussites que le cercle du sceau, en autant d''essais que le cercle du désenclaveur. Une réussite critique compte pour deux. Effets à adapter par le Conclave.'
 where slug = 'desenclavement'
   and description = 'Un roll par essai. Il faut autant de réussites que le cercle du sceau, en autant d''essais que le cercle du désenclaveur. Effets à adapter par le Conclave.';

update fuin.roll_tables
   set tiers = (select jsonb_agg(case when e ->> 'tone' = 'crit-success'
                                       and e ->> 'effect' = 'Le verrou se brise net, sans le moindre contrecoup.'
                                      then jsonb_set(e, '{effect}', to_jsonb('Deux verrous se brisent net, sans le moindre contrecoup : la réussite critique compte double.'::text))
                                      else e end order by x.ord)
                  from jsonb_array_elements(tiers) with ordinality as x(e, ord))
 where slug = 'desenclavement';

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

notify pgrst, 'reload schema';

select 'Migration 008 appliquée : trames réservées et réussite critique double prêtes.' as resultat;
