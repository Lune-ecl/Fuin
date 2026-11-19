-- =====================================================================
--  封  Migration 005 — Trames (énigmes et défis du Conclave)
-- ---------------------------------------------------------------------
--  À exécuter UNE FOIS dans Supabase → SQL Editor (après la 004).
--  • Le Conclave crée des trames faites d'étapes : texte à déchiffrer
--    (essais limités), désenclavement (rolls tirés par la base), texte.
--  • Une trame ouverte apparaît aux joueurs dans le menu ; terminée,
--    elle disparaît.
-- =====================================================================

-- Trames : événements RP du Conclave, composés d'étapes (déchiffrement, désenclavement, texte)
create table if not exists fuin.trames (
  id         serial primary key,
  title      text not null check (length(btrim(title)) between 1 and 120),
  intro_md   text not null default '',
  status     text not null default 'draft' check (status in ('draft', 'active', 'ended')),
  shared     boolean not null default true,
  min_rank   smallint not null default 1 check (min_rank between 1 and 5),
  steps      jsonb not null default '[]'::jsonb,
  started_at timestamptz,
  ended_at   timestamptz,
  created_by uuid references fuin.members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table fuin.trames enable row level security;

create table if not exists fuin.trame_attempts (
  id         bigserial primary key,
  trame_id   integer not null references fuin.trames(id) on delete cascade,
  step_index integer not null,
  member_id  uuid not null references fuin.members(id) on delete cascade,
  kind       text not null check (kind in ('cipher', 'unseal')),
  answer     text,
  roll       integer,
  label      text,
  tone       text,
  effect     text,
  success    boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists trame_attempts_idx on fuin.trame_attempts(trame_id, step_index, member_id);
alter table fuin.trame_attempts enable row level security;

create table if not exists fuin.trame_solves (
  trame_id   integer not null references fuin.trames(id) on delete cascade,
  step_index integer not null,
  member_id  uuid not null references fuin.members(id) on delete cascade,
  solved_at  timestamptz not null default now(),
  primary key (trame_id, step_index, member_id)
);
alter table fuin.trame_solves enable row level security;

-- =====================================================================
--  TRAMES (événements RP : énigmes et défis)
-- =====================================================================
-- Réponse normalisée : minuscules, sans accents ni ponctuation (kanjis conservés)
create or replace function fuin.answer_key(p text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select btrim(regexp_replace(
    translate(lower(coalesce(p, '')),
      'àáâãäåāçèéêëēìíîïīñòóôõöōùúûüūýÿœæ',
      'aaaaaaaceeeeeiiiiinoooooouuuuuyyoa'),
    '[^a-z0-9぀-ヿ㐀-鿿豈-﫿]+', ' ', 'g'))
$$;

-- Une ligne de réponse est soit une phrase exacte (à la ponctuation et aux accents près),
-- soit une liste de mots-clés séparés par « + » qui doivent tous apparaître.
create or replace function fuin.answer_matches(p_input text, p_answers jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  v_input text := fuin.answer_key(p_input);
  a text;
  k text;
  ok boolean;
  n integer;
begin
  if v_input = '' then return false; end if;
  for a in select jsonb_array_elements_text(coalesce(p_answers, '[]'::jsonb)) loop
    if position('+' in a) > 0 then
      ok := true;
      n := 0;
      foreach k in array string_to_array(a, '+') loop
        k := fuin.answer_key(k);
        if k <> '' then
          n := n + 1;
          if position(k in v_input) = 0 then ok := false; end if;
        end if;
      end loop;
      if ok and n > 0 then return true; end if;
    elsif fuin.answer_key(a) <> '' and fuin.answer_key(a) = v_input then
      return true;
    end if;
  end loop;
  return false;
end $$;

create or replace function fuin.trame_visible(t fuin.trames, m fuin.members) returns boolean
language sql stable set search_path = '' as $$
  select m.is_conclave or (t.status = 'active' and m.rank >= t.min_rank)
$$;

-- Une étape « texte » ne bloque jamais ; sinon il faut une résolution (la sienne, ou celle
-- de n'importe qui si la progression est commune).
create or replace function fuin.trame_step_solved(t fuin.trames, p_step integer, m fuin.members) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(t.steps -> p_step ->> 'kind', '') = 'text'
      or exists (select 1 from fuin.trame_solves s
                  where s.trame_id = t.id and s.step_index = p_step and (t.shared or s.member_id = m.id))
$$;

-- Étape en cours = première étape non résolue (ou le nombre d'étapes si tout est résolu)
create or replace function fuin.trame_current(t fuin.trames, m fuin.members) returns integer
language plpgsql stable security definer set search_path = '' as $$
declare
  i integer := 0;
  n integer := jsonb_array_length(t.steps);
begin
  while i < n loop
    if not fuin.trame_step_solved(t, i, m) then return i; end if;
    i := i + 1;
  end loop;
  return n;
end $$;

-- Palier d'une table de roll pour un résultat (réussite au-dessus de 50 si la table n'existe pas)
create or replace function fuin.roll_tier(p_table text, p_roll integer) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select tier from fuin.roll_tables rt, jsonb_array_elements(rt.tiers) tier
      where rt.slug = p_table and p_roll between (tier ->> 'min')::integer and (tier ->> 'max')::integer
      limit 1),
    case when p_roll > 50 then '{"label":"Réussite","tone":"success","effect":""}'::jsonb
         else '{"label":"Échec","tone":"neutral","effect":""}'::jsonb end)
$$;

create or replace function fuin.circle_label(r integer) returns text
language sql immutable set search_path = '' as $$
  select case when r = 1 then '1er cercle' else r || 'ème cercle' end
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
      select count(*), count(*) filter (where a.success) into used, succ from fuin.trame_attempts a
       where a.trame_id = t.id and a.step_index = i and a.member_id = m.id;
      req := greatest(coalesce((s ->> 'min_rank')::integer, 3), coalesce((s ->> 'seal_circle')::integer, 3));
      st := st || jsonb_build_object(
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
                               'shared', t.shared, 'started_at', t.started_at),
    'steps', steps,
    'total', n,
    'remaining', greatest(0, n - cur - 1),
    'complete', cur >= n);
end $$;

-- Proposer une traduction (nombre d'essais limité par joueur)
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
  if coalesce(s ->> 'kind', '') <> 'cipher' then perform fuin.fail('FU422', 'Cette étape ne se résout pas par une réponse.'); end if;
  if length(btrim(coalesce(p_answer, ''))) = 0 then perform fuin.fail('FU422', 'Écris ta traduction.'); end if;
  if length(p_answer) > 500 then perform fuin.fail('FU422', 'Réponse trop longue.'); end if;
  maxa := coalesce((s ->> 'max_attempts')::integer, 2);
  select count(*) into used from fuin.trame_attempts
   where trame_id = t.id and step_index = p_step and member_id = m.id;
  if used >= maxa then perform fuin.fail('FU422', 'Tu as utilisé tous tes essais pour cette énigme.'); end if;
  ok := fuin.answer_matches(p_answer, s -> 'answers');
  insert into fuin.trame_attempts(trame_id, step_index, member_id, kind, answer, success)
  values (t.id, p_step, m.id, 'cipher', btrim(p_answer), ok);
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
  needed integer;
  req integer;
  used integer;
  succ integer;
  v_roll integer;
  tier jsonb;
  ok boolean;
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
  select count(*), count(*) filter (where success) into used, succ from fuin.trame_attempts
   where trame_id = t.id and step_index = p_step and member_id = m.id;
  if used >= m.rank then
    perform fuin.fail('FU422', 'Tu as épuisé tes essais (autant que ton cercle).');
  end if;
  v_roll := floor(random() * 100)::integer + 1;
  tier := fuin.roll_tier(coalesce(nullif(s ->> 'roll_table', ''), 'desenclavement'), v_roll);
  ok := (tier ->> 'tone') in ('success', 'crit-success');
  insert into fuin.trame_attempts(trame_id, step_index, member_id, kind, roll, label, tone, effect, success)
  values (t.id, p_step, m.id, 'unseal', v_roll, tier ->> 'label', tier ->> 'tone', tier ->> 'effect', ok);
  used := used + 1;
  if ok then succ := succ + 1; end if;
  if succ >= needed then
    insert into fuin.trame_solves(trame_id, step_index, member_id) values (t.id, p_step, m.id) on conflict do nothing;
  end if;
  return json_build_object(
    'roll', v_roll, 'label', tier ->> 'label', 'tone', tier ->> 'tone', 'effect', tier ->> 'effect',
    'successes', succ, 'needed', needed, 'attempts_used', used, 'allowed', m.rank, 'broken', succ >= needed);
end $$;

-- ---------- Conclave ----------
create or replace function public.fuin_admin_trames(p_token text)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare m fuin.members;
begin
  m := fuin.require_conclave(p_token);
  return coalesce((select json_agg(json_build_object(
      'id', t.id, 'title', t.title, 'status', t.status, 'shared', t.shared, 'min_rank', t.min_rank,
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
  s jsonb;
  k text;
  pos integer := 0;
begin
  m := fuin.require_conclave(p_token);
  if v_title = '' then perform fuin.fail('FU422', 'Donne un titre à la trame.'); end if;
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
    end if;
  end loop;

  if v_id is null then
    insert into fuin.trames(title, intro_md, shared, min_rank, steps, created_by)
    values (v_title, coalesce(p_trame ->> 'intro_md', ''), coalesce((p_trame ->> 'shared')::boolean, true), v_min, v_steps, m.id)
    returning id into v_id;
  else
    update fuin.trames
       set title = v_title, intro_md = coalesce(p_trame ->> 'intro_md', ''),
           shared = coalesce((p_trame ->> 'shared')::boolean, true), min_rank = v_min, steps = v_steps, updated_at = now()
     where id = v_id;
    if not found then perform fuin.fail('FU404', 'Trame introuvable.'); end if;
  end if;
  perform fuin.log(m, 'trame.save', v_title);
  return json_build_object('id', v_id);
end $$;

-- start : ouvre la page aux joueurs · end : la ferme · reset : efface toute la progression
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
    update fuin.trames set status = case when status = 'active' then 'active' else 'draft' end, updated_at = now() where id = p_id;
    perform fuin.log(m, 'trame.reset', t.title);
  else
    perform fuin.fail('FU422', 'Action inconnue.');
  end if;
  return json_build_object('ok', true);
end $$;

create or replace function public.fuin_admin_trame_delete(p_token text, p_id integer)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  m fuin.members;
  v_title text;
begin
  m := fuin.require_conclave(p_token);
  delete from fuin.trames where id = p_id returning title into v_title;
  if v_title is null then perform fuin.fail('FU404', 'Trame introuvable.'); end if;
  perform fuin.log(m, 'trame.delete', v_title);
  return json_build_object('ok', true);
end $$;


-- Session + sommaire du grimoire filtré selon le cercle du membre
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
                                where t.status = 'active' and (m.is_conclave or m.rank >= t.min_rank)), '[]'::json),
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
  if v_kind not in ('seal', 'index', 'doc') then perform fuin.fail('FU422', 'Type de fiche invalide.'); end if;
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

-- =====================================================================
--  Droits : seules les fonctions public.fuin_* sont appelables par le site
-- =====================================================================
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

select 'Migration 005 appliquée : les trames sont prêtes.' as resultat;
