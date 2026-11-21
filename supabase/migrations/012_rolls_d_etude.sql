-- =====================================================================
--  読  Migration 012 — Trames : rolls d'étude (sens des kanjis et indices)
-- ---------------------------------------------------------------------
--  À exécuter UNE FOIS dans Supabase → SQL Editor (après la 011).
--  · Dans une étape, le joueur peut lancer des rolls d'étude (table de
--    déchiffrement par défaut) : une réussite révèle le sens d'un kanji
--    choisi par le Conclave, ou l'indice suivant ; une réussite critique
--    donne les deux.
-- =====================================================================

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

    if k in ('cipher', 'riddle') then
      st := st || jsonb_build_object(
        'cipher_text', case when k = 'cipher' then coalesce(s ->> 'cipher_text', '') else '' end,
        'attempts_used', used,
        'max_attempts', fuin.trame_max(s));
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
    elsif k in ('missing', 'order', 'match', 'choice', 'situation', 'review') then
      st := st || jsonb_build_object(
        'attempts_used', used,
        'max_attempts', fuin.trame_max(s),
        'reveal', reveal,
        'last', case when lastrow.id is not null and k <> 'review' then fuin.try_jsonb(lastrow.answer) end,
        'last_correct', case when lastrow.id is not null then lastrow.success end,
        'feedback', case when lastrow.id is not null and not lastrow.success and reveal and k <> 'review'
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
      elsif k = 'choice' then
        st := st || jsonb_build_object(
          'options', coalesce(s -> 'options', '[]'::jsonb),
          'multiple', cardinality(fuin.int_list(s -> 'correct')) > 1);
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
    if k not in ('cipher', 'riddle', 'unseal', 'missing', 'situation', 'choice', 'order', 'match', 'review', 'text') then
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
    if k in ('cipher', 'riddle') then
      if jsonb_typeof(s -> 'answers') <> 'array'
         or not exists (select 1 from jsonb_array_elements_text(s -> 'answers') y where fuin.answer_key(y) <> '') then
        perform fuin.fail('FU422', format('Étape %s : indique au moins une réponse acceptée.', pos));
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
    elsif k = 'choice' then
      if jsonb_typeof(s -> 'options') <> 'array' or jsonb_array_length(s -> 'options') not between 2 and 8
         or exists (select 1 from jsonb_array_elements_text(s -> 'options') y where btrim(y) = '') then
        perform fuin.fail('FU422', format('Étape %s : de 2 à 8 réponses possibles, toutes remplies.', pos));
      end if;
      if cardinality(fuin.int_list(s -> 'correct')) = 0
         or exists (select 1 from unnest(fuin.int_list(s -> 'correct')) y where y < 0 or y >= jsonb_array_length(s -> 'options')) then
        perform fuin.fail('FU422', format('Étape %s : coche au moins une bonne réponse.', pos));
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

select 'Migration 012 appliquée : rolls d''étude prêts.' as resultat;
