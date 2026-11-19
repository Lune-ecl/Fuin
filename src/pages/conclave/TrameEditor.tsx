import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, type RollTable, type TrameAdmin, type TrameDef, type TrameStepDef, type TrameStepKind } from '../../lib/api';
import { useSession } from '../../lib/session';
import { circleLabel, formatDate, timeAgo } from '../../lib/format';
import Markdown from '../../components/Markdown';
import { Empty, ErrorState, Loader, RankPicker, Toggle, useConfirm, useToast } from '../../components/ui';
import { TRAME_STATUS } from './Trames';

const KIND: Record<TrameStepKind, { label: string; glyph: string; hint: string }> = {
  cipher: { label: 'Énigme à déchiffrer', glyph: '謎', hint: 'Un texte à traduire, avec un nombre d’essais limité.' },
  unseal: { label: 'Désenclavement', glyph: '封', hint: 'Un sceau à briser par des rolls tirés par le site.' },
  text: { label: 'Récit ou récompense', glyph: '巻', hint: 'Un texte qui s’affiche quand les joueurs y arrivent.' },
};

function newStep(kind: TrameStepKind): TrameStepDef {
  if (kind === 'cipher')
    return { kind, title: 'L’inscription', prompt_md: 'Une inscription est gravée sur la pierre. Que dit-elle ?', cipher_text: '', answers: [], max_attempts: 2, success_md: '' };
  if (kind === 'unseal')
    return { kind, title: 'Le sceau', prompt_md: 'Un sceau verrouille le passage. Les shinobi qui maîtrisent le désenclavement peuvent tenter de le briser.', seal_circle: 3, min_rank: 3, roll_table: 'desenclavement', success_md: '' };
  return { kind, title: '', prompt_md: '' };
}

function emptyTrame(): TrameDef {
  return { id: null, title: '', intro_md: '', shared: true, min_rank: 1, steps: [newStep('cipher'), newStep('unseal')] };
}

function StepEditor({
  step,
  index,
  count,
  tables,
  onChange,
  onMove,
  onRemove,
}: {
  step: TrameStepDef;
  index: number;
  count: number;
  tables: RollTable[];
  onChange: (s: TrameStepDef) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const set = <K extends keyof TrameStepDef>(k: K, v: TrameStepDef[K]) => onChange({ ...step, [k]: v });
  const k = KIND[step.kind];
  return (
    <section className={`step-card step-card--${step.kind}`}>
      <header className="step-card__head">
        <span className="step-card__glyph">{k.glyph}</span>
        <div>
          <p className="kicker">Étape {index + 1}</p>
          <b>{k.label}</b>
        </div>
        <div className="step-card__tools">
          <button type="button" className="icon-btn" onClick={() => onMove(-1)} disabled={index === 0} aria-label="Monter">
            ↑
          </button>
          <button type="button" className="icon-btn" onClick={() => onMove(1)} disabled={index === count - 1} aria-label="Descendre">
            ↓
          </button>
          <button type="button" className="icon-btn" onClick={onRemove} aria-label="Supprimer l’étape">
            ✕
          </button>
        </div>
      </header>

      <label className="field">
        <span>Titre</span>
        <input value={step.title} onChange={(e) => set('title', e.target.value)} />
      </label>
      <label className="field">
        <span>{step.kind === 'text' ? 'Texte' : 'Consigne'}</span>
        <textarea rows={step.kind === 'text' ? 5 : 3} value={step.prompt_md} onChange={(e) => set('prompt_md', e.target.value)} />
      </label>

      {step.kind === 'cipher' && (
        <>
          <label className="field">
            <span>Texte à déchiffrer</span>
            <textarea className="cipher-input" lang="ja" rows={2} value={step.cipher_text ?? ''} onChange={(e) => set('cipher_text', e.target.value)} placeholder="黙 封 口 秘" />
          </label>
          <label className="field">
            <span>Traductions acceptées (une par ligne, cachées aux joueurs)</span>
            <textarea
              rows={3}
              value={(step.answers ?? []).join('\n')}
              onChange={(e) => set('answers', e.target.value.split('\n'))}
              placeholder={'garder le silence et sceller la bouche\nsilence + bouche'}
            />
            <small className="muted">
              Une phrase exacte (majuscules, accents et ponctuation ignorés), ou des mots-clés séparés par « + » qui doivent tous apparaître.
            </small>
          </label>
          <label className="field field--narrow">
            <span>Essais par joueur</span>
            <input type="number" min={1} max={10} value={step.max_attempts ?? 2} onChange={(e) => set('max_attempts', Number(e.target.value) || 2)} />
          </label>
        </>
      )}

      {step.kind === 'unseal' && (
        <div className="step-card__grid">
          <div className="field">
            <span>Cercle du sceau (verrous à briser)</span>
            <RankPicker value={step.seal_circle ?? 3} onChange={(r) => set('seal_circle', r)} name={`seal-${index}`} />
          </div>
          <div className="field">
            <span>Cercle minimum pour tenter</span>
            <RankPicker value={step.min_rank ?? 3} onChange={(r) => set('min_rank', r)} name={`min-${index}`} />
          </div>
          <label className="field">
            <span>Table de roll</span>
            <select value={step.roll_table ?? 'desenclavement'} onChange={(e) => set('roll_table', e.target.value)}>
              {tables.map((t) => (
                <option key={t.slug} value={t.slug}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <p className="muted small step-card__note">
            Peut tenter : à partir du {circleLabel(Math.max(step.min_rank ?? 3, step.seal_circle ?? 3))}. Chaque joueur a autant d’essais que son cercle.
          </p>
        </div>
      )}

      {step.kind !== 'text' && (
        <label className="field">
          <span>Texte révélé quand l’étape est résolue</span>
          <textarea rows={3} value={step.success_md ?? ''} onChange={(e) => set('success_md', e.target.value)} placeholder="La porte de pierre s’ouvre dans un grondement…" />
        </label>
      )}
    </section>
  );
}

function Tracking({ data, onRefresh }: { data: TrameAdmin; onRefresh: () => void }) {
  useEffect(() => {
    const t = window.setInterval(onRefresh, 10000);
    return () => window.clearInterval(t);
  }, [onRefresh]);
  const steps = data.trame.steps;
  return (
    <>
      <section className="panel">
        <h2 className="panel__title">Progression</h2>
        <p className="muted small">Actualisé toutes les 10 secondes.</p>
        <ol className="track-list">
          {steps.map((s, i) => {
            const p = data.progress[i];
            return (
              <li key={i} className="track">
                <span className="step-card__glyph">{KIND[s.kind].glyph}</span>
                <div>
                  <b>
                    {i + 1}. {s.title || KIND[s.kind].label}
                  </b>
                  {s.kind === 'text' ? (
                    <small>Récit, toujours visible une fois atteint.</small>
                  ) : (
                    <small>
                      {p?.attempts ?? 0} tentative{(p?.attempts ?? 0) > 1 ? 's' : ''} · {p?.participants ?? 0} shinobi
                    </small>
                  )}
                  {(p?.solvers.length ?? 0) > 0 && (
                    <p className="track__solvers">Résolu par {p!.solvers.map((x) => `${x.name} (${timeAgo(x.at)})`).join(', ')}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </section>
      <section className="panel">
        <h2 className="panel__title">Journal des tentatives</h2>
        {data.log.length === 0 ? (
          <Empty glyph="録">Personne n’a encore tenté sa chance.</Empty>
        ) : (
          <ul className="roll-list">
            {data.log.map((l) => (
              <li key={l.id} className={`roll roll--${l.kind === 'unseal' ? l.tone ?? 'neutral' : l.success ? 'success' : 'neutral'}`}>
                <span className="roll__index">{timeAgo(l.created_at)}</span>
                <span className="roll__who">
                  {l.member} <small>C{l.rank}</small>
                </span>
                <span className={`tone tone--${l.kind === 'unseal' ? l.tone ?? 'neutral' : l.success ? 'success' : 'fail'}`}>
                  Étape {l.step_index + 1} · {l.kind === 'unseal' ? `roll ${l.roll} · ${l.label}` : l.success ? 'juste' : 'faux'}
                </span>
                <span className="roll__text">{l.kind === 'cipher' ? `« ${l.answer} »` : ''}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

export default function TrameEditor() {
  const { id } = useParams();
  const isNew = !id || id === 'nouvelle';
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { refresh } = useSession();
  const [trame, setTrame] = useState<TrameDef | null>(isNew ? emptyTrame() : null);
  const [admin, setAdmin] = useState<TrameAdmin | null>(null);
  const [tables, setTables] = useState<RollTable[]>([]);
  const [tab, setTab] = useState<'build' | 'track'>('build');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    try {
      const [t, a] = await Promise.all([api.rollTables(), isNew ? Promise.resolve(null) : api.adminTrame(Number(id))]);
      setTables(t);
      if (a) {
        setAdmin(a);
        setTrame((cur) => (cur && dirty ? cur : a.trame));
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [id, isNew, dirty]);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshTracking = useCallback(async () => {
    if (isNew) return;
    try {
      setAdmin(await api.adminTrame(Number(id)));
    } catch {
      /* réessai au prochain tour */
    }
  }, [id, isNew]);

  if (error) return <ErrorState text={error} onRetry={load} />;
  if (!trame) return <Loader label="Ouverture de la trame…" />;

  const update = (patch: Partial<TrameDef>) => {
    setDirty(true);
    setTrame((t) => (t ? { ...t, ...patch } : t));
  };
  const setStep = (i: number, s: TrameStepDef) => update({ steps: trame.steps.map((x, j) => (j === i ? s : x)) });
  const move = (i: number, dir: -1 | 1) => {
    const steps = [...trame.steps];
    const j = i + dir;
    if (j < 0 || j >= steps.length) return;
    [steps[i], steps[j]] = [steps[j], steps[i]];
    update({ steps });
  };

  const save = async (): Promise<number | null> => {
    setBusy(true);
    try {
      const clean = { ...trame, steps: trame.steps.map((s) => ({ ...s, answers: s.answers?.map((a) => a.trim()).filter(Boolean) })) };
      const r = await api.trameSave(clean);
      toast('Trame enregistrée');
      setDirty(false);
      if (isNew) navigate(`/conclave/trames/${r.id}`, { replace: true });
      else await load();
      return r.id;
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const status = async (action: 'start' | 'end' | 'reset') => {
    const texts = {
      start: { title: 'Ouvrir la trame aux joueurs ?', text: 'Une page « Trame en cours » apparaîtra dans leur menu.', confirm: 'Ouvrir' },
      end: { title: 'Terminer la trame ?', text: 'La page disparaît pour les joueurs. Le suivi reste consultable ici.', confirm: 'Terminer' },
      reset: { title: 'Remettre la progression à zéro ?', text: 'Toutes les réponses, tous les rolls et toutes les résolutions seront effacés.', confirm: 'Tout effacer' },
    }[action];
    if (!(await confirm({ ...texts, danger: action === 'reset' }))) return;
    let tid = trame.id;
    if (dirty || !tid) tid = await save();
    if (!tid) return;
    try {
      await api.trameStatus(tid, action);
      toast(action === 'start' ? 'La trame est ouverte aux joueurs' : action === 'end' ? 'La trame est terminée' : 'Progression effacée');
      await load();
      await refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    }
  };

  const remove = async () => {
    if (!trame.id) return navigate('/conclave/trames');
    if (!(await confirm({ title: `Supprimer « ${trame.title} » ?`, text: 'La trame et toute sa progression seront effacées.', confirm: 'Supprimer', danger: true }))) return;
    try {
      await api.trameDelete(trame.id);
      toast('Trame supprimée');
      await refresh();
      navigate('/conclave/trames');
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    }
  };

  const st = admin?.trame.status ?? 'draft';

  return (
    <div className="console">
      <header className="page-head page-head--row">
        <div>
          <Link to="/conclave/trames" className="crumb">
            ← Trames
          </Link>
          <h1>{isNew ? 'Nouvelle trame' : trame.title || 'Sans titre'}</h1>
          {!isNew && (
            <p className="muted small">
              <span className={`status status--trame-${st}`}>{TRAME_STATUS[st]}</span>
              {admin?.trame.started_at && ` · ouverte le ${formatDate(admin.trame.started_at, true)}`}
            </p>
          )}
        </div>
        <div className="editor__actions">
          {!isNew && (
            <Link to={`/trame/${trame.id}`} className="btn btn--ghost">
              Voir comme un joueur
            </Link>
          )}
          {st === 'active' ? (
            <button type="button" className="btn btn--ghost btn--danger-text" onClick={() => status('end')}>
              Terminer la trame
            </button>
          ) : (
            <button type="button" className="btn btn--ghost" onClick={() => status('start')} disabled={trame.steps.length === 0}>
              {st === 'ended' ? 'Rouvrir la trame' : 'Ouvrir la trame'}
            </button>
          )}
          <button type="button" className="btn btn--red" onClick={() => void save()} disabled={busy}>
            {busy ? 'Enregistrement…' : dirty ? 'Enregistrer •' : 'Enregistrer'}
          </button>
        </div>
      </header>

      {!isNew && (
        <nav className="tabs">
          <button type="button" className={`tab${tab === 'build' ? ' is-on' : ''}`} onClick={() => setTab('build')}>
            Construction
          </button>
          <button type="button" className={`tab${tab === 'track' ? ' is-on' : ''}`} onClick={() => setTab('track')}>
            Suivi en direct
          </button>
        </nav>
      )}

      {tab === 'track' && admin ? (
        <Tracking data={admin} onRefresh={refreshTracking} />
      ) : (
        <>
          {st === 'active' && (
            <div className="callout callout--caution">
              <span className="callout__title">Trame ouverte</span>
              <div className="callout__body">Modifier ou réordonner les étapes pendant la trame peut perturber la progression des joueurs.</div>
            </div>
          )}
          <section className="panel">
            <label className="field">
              <span>Titre de la trame</span>
              <input value={trame.title} onChange={(e) => update({ title: e.target.value })} placeholder="Le sceau du temple oublié" maxLength={120} />
            </label>
            <label className="field">
              <span>Introduction (affichée en haut de la page)</span>
              <textarea rows={4} value={trame.intro_md} onChange={(e) => update({ intro_md: e.target.value })} />
            </label>
            {trame.intro_md && (
              <details className="md-help">
                <summary>Aperçu de l’introduction</summary>
                <Markdown source={trame.intro_md} />
              </details>
            )}
            <div className="step-card__grid">
              <div className="field">
                <span>Accessible à partir du</span>
                <RankPicker value={trame.min_rank} onChange={(r) => update({ min_rank: r })} name="trame-min" />
              </div>
              <Toggle
                checked={trame.shared}
                onChange={(v) => update({ shared: v })}
                label="Progression commune"
                hint={trame.shared ? 'Dès qu’un shinobi résout une étape, la suite s’ouvre pour tous' : 'Chaque shinobi avance de son côté'}
              />
            </div>
          </section>

          {trame.steps.map((s, i) => (
            <StepEditor
              key={i}
              step={s}
              index={i}
              count={trame.steps.length}
              tables={tables}
              onChange={(n) => setStep(i, n)}
              onMove={(dir) => move(i, dir)}
              onRemove={() => update({ steps: trame.steps.filter((_, j) => j !== i) })}
            />
          ))}

          <section className="panel add-steps">
            <p className="kicker">Ajouter une étape</p>
            <div className="add-steps__grid">
              {(Object.keys(KIND) as TrameStepKind[]).map((k) => (
                <button key={k} type="button" className="add-step" onClick={() => update({ steps: [...trame.steps, newStep(k)] })}>
                  <span>{KIND[k].glyph}</span>
                  <b>{KIND[k].label}</b>
                  <small>{KIND[k].hint}</small>
                </button>
              ))}
            </div>
          </section>

          {!isNew && (
            <div className="form-actions">
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => status('reset')}>
                Remettre la progression à zéro
              </button>
              <button type="button" className="btn btn--ghost btn--sm btn--danger-text" onClick={remove}>
                Supprimer la trame
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
