-- =====================================================================
--  封  Migration 006 — Sceau vivant des étapes de désenclavement
-- ---------------------------------------------------------------------
--  À exécuter UNE FOIS dans Supabase → SQL Editor (après la 005).
--  L'étape de désenclavement peut porter un sceau dessiné dans le créateur ;
--  il s'affiche aux joueurs, rougeoie davantage à chaque roll raté,
--  se fissure à chaque verrou brisé et vole en éclats quand il cède.
-- =====================================================================

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
                               'shared', t.shared, 'started_at', t.started_at),
    'steps', steps,
    'total', n,
    'remaining', greatest(0, n - cur - 1),
    'complete', cur >= n);
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
      if coalesce(s ->> 'seal_svg', '') <> ''
         and (length(s ->> 'seal_svg') > 60000 or (s ->> 'seal_svg') !~* '^<svg') then
        perform fuin.fail('FU422', format('Étape %s : visuel du sceau invalide.', pos));
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

notify pgrst, 'reload schema';

select 'Migration 006 appliquée : les sceaux des trames sont prêts.' as resultat;
