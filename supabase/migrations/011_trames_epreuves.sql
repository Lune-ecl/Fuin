-- =====================================================================
--  謎  Migration 011 — Trames : essais par étape, nouvelles épreuves, tests
-- ---------------------------------------------------------------------
--  À exécuter UNE FOIS dans Supabase → SQL Editor (après la 010).
--  · Chaque étape a ses propres essais ; au désenclavement, le Conclave
--    choisit le nombre de verrous (1 à 10) et le nombre d'essais (fixe ou
--    selon le cercle du joueur).
--  · Nouvelles épreuves : kanjis manquants, mise en situation, énigme,
--    question à choix, ordre des kanjis, associations et réponse libre
--    validée par le Conclave.
--  · Trames de test : visibles du Conclave seulement, même ouvertes.
-- =====================================================================

alter table fuin.trames add column if not exists test_only boolean not null default false;
alter table fuin.trame_attempts drop constraint if exists trame_attempts_kind_check;
alter table fuin.trame_attempts add constraint trame_attempts_kind_check
  check (kind in ('cipher', 'riddle', 'unseal', 'missing', 'situation', 'choice', 'order', 'match', 'review'));

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

-- Essais par joueur pour une étape (chaque étape a les siens, indépendants des autres)
create or replace function fuin.trame_max(s jsonb) returns integer
language sql immutable set search_path = '' as $$
  select coalesce(nullif(s ->> 'max_attempts', '')::integer,
                  case when s ->> 'kind' in ('cipher', 'riddle', 'choice') then 2 else 3 end)
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
  if coalesce(s ->> 'kind', '') not in ('cipher', 'riddle') then perform fuin.fail('FU422', 'Cette étape ne se résout pas par une réponse.'); end if;
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
  if k not in ('missing', 'order', 'match', 'choice', 'situation', 'review') then
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
  elsif k = 'order' then
    chars := fuin.kanji_chars(s ->> 'formula');
    picks := array(select x from jsonb_array_elements_text(coalesce(p_payload -> 'order', '[]'::jsonb)) x);
    if cardinality(picks) <> cardinality(chars) then perform fuin.fail('FU422', 'Place tous les kanjis.'); end if;
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
  elsif k = 'choice' then
    ipicks := fuin.int_list(p_payload -> 'picks');
    if cardinality(ipicks) = 0 then perform fuin.fail('FU422', 'Choisis une réponse.'); end if;
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
  end if;
  if k <> 'choice' then ok := cardinality(fb) > 0 and false <> all(fb); end if;

  insert into fuin.trame_attempts(trame_id, step_index, member_id, kind, answer, label, effect, success)
  values (t.id, p_step, m.id, k, left(p_payload::text, 4000),
          case when cardinality(fb) > 0 then (select count(*) from unnest(fb) x where x) || '/' || cardinality(fb) end,
          case when cardinality(fb) > 0 then to_jsonb(fb)::text end, ok);
  if ok then
    insert into fuin.trame_solves(trame_id, step_index, member_id) values (t.id, p_step, m.id) on conflict do nothing;
  end if;
  return json_build_object(
    'correct', ok,
    'attempts_left', maxa - used - 1,
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

select 'Migration 011 appliquée : nouvelles épreuves et trames de test prêtes.' as resultat;
