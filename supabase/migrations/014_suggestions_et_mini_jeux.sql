-- =====================================================================
--  案  Migration 014 — Suggestions et mini-jeux des trames
-- ---------------------------------------------------------------------
--  À exécuter UNE FOIS dans Supabase → SQL Editor (après la 013).
--  · Suggestions : chaque membre propose une amélioration du site
--    (fonctionnalité, contenu, trames, problème…), les autres peuvent la
--    soutenir, le Conclave répond et lui donne un statut.
--  · Trames : sept mini-jeux de plus, vérifiés par la base comme les
--    autres épreuves : verrou à cercles, résonance du sceau, flux de
--    chakra, suite logique, mémoire du sceau, l'intrus et code du Conclave.
--  · Les adresses « suggestions » et « autre » sont réservées par le site.
-- =====================================================================

-- ---------------------------------------------------------------------
--  Suggestions
-- ---------------------------------------------------------------------
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

-- Toutes les suggestions : chacun voit celles des autres, pour les soutenir plutôt que les répéter
create or replace function public.fuin_suggestions(p_token text)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare m fuin.members;
begin
  m := fuin.session_member(p_token);
  return coalesce((select json_agg(fuin.suggestion_json(s, m) order by s.created_at desc) from fuin.suggestions s), '[]'::json);
end $$;

-- Proposer une suggestion, ou modifier la sienne tant que le Conclave n'y a pas répondu
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

-- Soutenir (ou ne plus soutenir) la suggestion d'un autre membre
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

-- Le Conclave répond : statut (nouvelle, prévue, faite, refusée) et mot d'explication
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

-- Démarrage du site : nombre de suggestions sans réponse pour le Conclave
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

-- ---------------------------------------------------------------------
--  Trames : nouveaux mini-jeux
-- ---------------------------------------------------------------------
alter table fuin.trame_attempts drop constraint if exists trame_attempts_kind_check;
alter table fuin.trame_attempts add constraint trame_attempts_kind_check
  check (kind in ('cipher', 'riddle', 'unseal', 'missing', 'situation', 'choice', 'order', 'match', 'review',
                  'dial', 'mastermind', 'path', 'sequence', 'memory', 'intruder', 'substitution'));

-- Liste d'entiers dans l'ordre donné (doublons gardés) : le tracé d'un flux de chakra
create or replace function fuin.int_seq(j jsonb) returns integer[]
language sql immutable set search_path = '' as $$
  select coalesce(array(
    select (x)::integer from jsonb_array_elements_text(case when jsonb_typeof(j) = 'array' then j else '[]'::jsonb end)
           with ordinality e(x, o)
     where x ~ '^-?[0-9]+$' order by o), '{}')
$$;

-- Grille d'un flux de chakra, case par case (ligne après ligne)
create or replace function fuin.trame_grid(s jsonb) returns text[]
language sql immutable set search_path = '' as $$
  select coalesce(array(
    select c.ch
      from jsonb_array_elements_text(case when jsonb_typeof(s -> 'grid') = 'array' then s -> 'grid' else '[]'::jsonb end)
           with ordinality r(row_text, ro)
     cross join lateral unnest(fuin.kanji_chars(r.row_text)) with ordinality c(ch, co)
     order by r.ro, c.co), '{}')
$$;

-- Les douze signes des mains (mémoire du sceau en mode « signes »)
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

-- Proposer une réponse écrite (inscription, énigme, suite logique, code du Conclave) :
-- essais limités par joueur et par étape
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

-- Épreuves à réponse structurée : kanjis manquants, ordre, associations, choix, mise en situation,
-- réponse libre validée par le Conclave, et les mini-jeux. Les essais sont propres à chaque étape.
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

-- Les adresses du site ne peuvent pas être prises par une fiche
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

select 'Migration 014 appliquée : suggestions et mini-jeux des trames prêts.' as resultat;
