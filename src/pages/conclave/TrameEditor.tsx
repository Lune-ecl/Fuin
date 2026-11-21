import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, type AdminMember, type AdminPageRow, type RollTable, type TrameAdmin, type TrameDef, type TrameStepDef, type TrameStepKind } from '../../lib/api';
import { AttemptsField, ChoiceFields, MatchFields, MissingFields, OrderFields, ReviewFields, SituationFields, StudyFields, UnsealFields } from './TrameStepFields';
import { useSession } from '../../lib/session';
import { circleLabel, formatDate, timeAgo } from '../../lib/format';
import Markdown from '../../components/Markdown';
import SealCreator from '../../components/SealCreator';
import { displaySealSvg } from '../../lib/sealDesign';
import { sanitizeSvg } from '../../lib/markdown';
import { Empty, ErrorState, Loader, RankPicker, Toggle, useConfirm, useToast } from '../../components/ui';
import { TRAME_STATUS } from './Trames';

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

/** Choix des shinobi qui ont accès à une trame réservée. */
function MemberPicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const [members, setMembers] = useState<AdminMember[] | null>(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    api
      .members()
      .then(setMembers)
      .catch(() => setMembers([]));
  }, []);
  if (!members) return <p className="muted small">Chargement des shinobi…</p>;
  const chosen = value.map((id) => members.find((m) => m.id === id)).filter((m): m is AdminMember => !!m);
  const matches = members
    .filter((m) => m.active && !m.is_conclave && !value.includes(m.id) && (!q.trim() || norm(m.display_name).includes(norm(q.trim()))))
    .sort((a, b) => a.display_name.localeCompare(b.display_name, 'fr'))
    .slice(0, q.trim() ? 12 : 8);
  return (
    <div className="member-picker">
      <div className="member-picker__chosen">
        {chosen.length ? (
          chosen.map((m) => (
            <button key={m.id} type="button" className="chip is-on" onClick={() => onChange(value.filter((id) => id !== m.id))} title="Retirer">
              {m.display_name} <span aria-hidden="true">✕</span>
            </button>
          ))
        ) : (
          <span className="muted small">Choisis au moins un shinobi : lui seul (et le Conclave) verra la trame.</span>
        )}
      </div>
      <input className="input-search" placeholder="Chercher un shinobi…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="member-picker__list">
        {matches.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => {
              onChange([...value, m.id]);
              setQ('');
            }}
          >
            <b>{m.display_name}</b>
            <small>{circleLabel(m.rank)}</small>
          </button>
        ))}
        {!matches.length && <span className="muted small">Aucun shinobi ne correspond.</span>}
      </div>
    </div>
  );
}

export type AccessMode = 'rank' | 'only' | 'test';

/** Qui voit la trame : tous les shinobi d'un cercle, ceux qu'on choisit, ou le Conclave seul (test). */
function Access({
  trame,
  update,
  mode,
  setMode,
}: {
  trame: TrameDef;
  update: (p: Partial<TrameDef>) => void;
  mode: AccessMode;
  setMode: (v: AccessMode) => void;
}) {
  const pick = (m: AccessMode) => {
    setMode(m);
    if (m === 'rank') update({ restricted_to: [], test_only: false });
    if (m === 'only') update({ test_only: false });
    if (m === 'test') update({ test_only: true });
  };
  return (
    <div className="field">
      <span>Qui a accès à la trame</span>
      <div className="segmented" role="radiogroup" aria-label="Accès à la trame">
        <button type="button" role="radio" aria-checked={mode === 'rank'} className={mode === 'rank' ? 'is-on' : ''} onClick={() => pick('rank')}>
          Tous les shinobi d’un cercle
        </button>
        <button type="button" role="radio" aria-checked={mode === 'only'} className={mode === 'only' ? 'is-on' : ''} onClick={() => pick('only')}>
          Shinobi choisis
        </button>
        <button type="button" role="radio" aria-checked={mode === 'test'} className={mode === 'test' ? 'is-on' : ''} onClick={() => pick('test')}>
          Conclave seulement (test)
        </button>
      </div>
      {mode === 'only' ? (
        <MemberPicker value={trame.restricted_to ?? []} onChange={(ids) => update({ restricted_to: ids })} />
      ) : mode === 'test' ? (
        <p className="muted small access-test">
          <i aria-hidden="true">試</i> Trame de test : même ouverte, seuls les membres du Conclave la voient et peuvent la jouer. Remets la progression à zéro
          après tes essais, puis choisis un autre accès pour la publier.
        </p>
      ) : (
        <div className="access-rank">
          <small className="muted">Accessible à partir du</small>
          <RankPicker value={trame.min_rank} onChange={(r) => update({ min_rank: r })} name="trame-min" />
        </div>
      )}
    </div>
  );
}

const KIND: Record<TrameStepKind, { label: string; glyph: string; hint: string }> = {
  cipher: { label: 'Inscription à déchiffrer', glyph: '謎', hint: 'Un texte en kanjis à traduire, avec un nombre d’essais limité.' },
  riddle: { label: 'Énigme', glyph: '問', hint: 'Une question ou une devinette, réponse libre vérifiée par le site.' },
  unseal: { label: 'Désenclavement', glyph: '封', hint: 'Un sceau à briser par des rolls : verrous et essais au choix.' },
  missing: { label: 'Kanjis manquants', glyph: '欠', hint: 'Un sceau incomplet : retrouver les kanjis qui manquent pour l’activer.' },
  situation: { label: 'Mise en situation', glyph: '境', hint: 'Des situations : trouver le sceau à utiliser pour chacune.' },
  order: { label: 'Ordre des kanjis', glyph: '順', hint: 'Les kanjis d’une formule mélangés : les remettre dans l’ordre.' },
  match: { label: 'Associations', glyph: '合', hint: 'Relier chaque kanji (ou sceau) à son sens.' },
  choice: { label: 'Question à choix', glyph: '択', hint: 'Une question avec une ou plusieurs bonnes réponses à cocher.' },
  review: { label: 'Épreuve du Conclave', glyph: '議', hint: 'Une réponse libre que le Conclave valide ou refuse lui-même.' },
  text: { label: 'Récit ou récompense', glyph: '巻', hint: 'Un texte qui s’affiche quand les joueurs y arrivent.' },
};

function newStep(kind: TrameStepKind): TrameStepDef {
  const base = { kind, title: KIND[kind].label, prompt_md: '', success_md: '' };
  switch (kind) {
    case 'cipher':
      return { ...base, title: 'L’inscription', prompt_md: 'Une inscription est gravée sur la pierre. Que dit-elle ?', cipher_text: '', answers: [], max_attempts: 2, study_rolls: 3 };
    case 'riddle':
      return { ...base, title: 'L’énigme', prompt_md: 'Le gardien pose sa question…', answers: [], max_attempts: 2 };
    case 'unseal':
      return {
        ...base,
        title: 'Le sceau',
        prompt_md: 'Un sceau verrouille le passage. Les shinobi qui maîtrisent le désenclavement peuvent tenter de le briser.',
        locks: 3,
        min_rank: 3,
        attempts_mode: 'rank',
        roll_table: 'desenclavement',
      };
    case 'missing':
      return { ...base, title: 'Le sceau incomplet', prompt_md: 'Des kanjis ont été effacés du sceau. Retrouve-les pour le reconstruire et l’activer.', formula: '', missing: [], decoys: '', max_attempts: 3, reveal: true, study_rolls: 3 };
    case 'situation':
      return { ...base, title: 'Sur le terrain', prompt_md: 'Pour chaque situation, choisis le sceau qu’il faut adapter.', situations: [{ text: '', answers: [] }], choices: [], max_attempts: 3, reveal: true };
    case 'order':
      return { ...base, title: 'L’ordre de tracé', prompt_md: 'Les kanjis du sceau ont été mélangés. Remets-les dans l’ordre.', formula: '', max_attempts: 3, reveal: true };
    case 'match':
      return {
        ...base,
        title: 'Les sens cachés',
        prompt_md: 'Relie chaque kanji à son sens.',
        pairs: [
          { left: '', right: '' },
          { left: '', right: '' },
          { left: '', right: '' },
        ],
        max_attempts: 3,
        reveal: true,
      };
    case 'choice':
      return { ...base, title: 'La question', prompt_md: '', options: ['', '', ''], correct: [], max_attempts: 2 };
    case 'review':
      return { ...base, title: 'Devant le Conclave', prompt_md: 'Explique comment ton shinobi s’y prend.', max_attempts: 3 };
    default:
      return { ...base, title: '', prompt_md: '' };
  }
}

// anciennes étapes de désenclavement : verrous = cercle du sceau, cercle requis au moins égal
function upgradeStep(s: TrameStepDef): TrameStepDef {
  if (s.kind !== 'unseal' || s.locks !== undefined) return s;
  const circle = s.seal_circle ?? 3;
  return { ...s, locks: circle, min_rank: Math.max(s.min_rank ?? 3, circle), attempts_mode: 'rank' };
}

function emptyTrame(): TrameDef {
  return { id: null, title: '', intro_md: '', shared: true, min_rank: 1, test_only: false, steps: [newStep('cipher'), newStep('unseal')] };
}

function StepEditor({
  step,
  index,
  count,
  tables,
  seals,
  onChange,
  onMove,
  onRemove,
  draftKey,
}: {
  step: TrameStepDef;
  index: number;
  count: number;
  tables: RollTable[];
  /** sceaux du codex, pour les mises en situation */
  seals: AdminPageRow[];
  draftKey: string;
  onChange: (s: TrameStepDef) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const set = <K extends keyof TrameStepDef>(k: K, v: TrameStepDef[K]) => onChange({ ...step, [k]: v });
  const patch = (p: Partial<TrameStepDef>) => onChange({ ...step, ...p });
  const k = KIND[step.kind];
  const [creator, setCreator] = useState(false);
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

      {(step.kind === 'cipher' || step.kind === 'riddle') && (
        <>
          {step.kind === 'cipher' && (
            <label className="field">
              <span>Texte à déchiffrer</span>
              <textarea className="cipher-input" lang="ja" rows={2} value={step.cipher_text ?? ''} onChange={(e) => set('cipher_text', e.target.value)} placeholder="黙 封 口 秘" />
            </label>
          )}
          <label className="field">
            <span>{step.kind === 'cipher' ? 'Traductions acceptées' : 'Réponses acceptées'} (une par ligne, cachées aux joueurs)</span>
            <textarea
              rows={3}
              value={(step.answers ?? []).join('\n')}
              onChange={(e) => set('answers', e.target.value.split('\n'))}
              placeholder={step.kind === 'cipher' ? 'garder le silence et sceller la bouche\nsilence + bouche' : 'le silence\nsilence'}
            />
            <small className="muted">
              Une phrase exacte (majuscules, accents et ponctuation ignorés), ou des mots-clés séparés par « + » qui doivent tous apparaître.
            </small>
          </label>
          <AttemptsField step={step} set={set} fallback={2} />
        </>
      )}

      {step.kind === 'unseal' && (
        <div className="step-seal">
          <div className="seal-icon seal-icon--md" dangerouslySetInnerHTML={{ __html: sanitizeSvg(displaySealSvg(step.seal_svg ?? null, '封 印')) }} />
          <div className="step-seal__actions">
            <span className="field__label">Visuel du sceau</span>
            <div className="request__actions">
              <button type="button" className="btn btn--red btn--sm" onClick={() => setCreator(true)}>
                {step.seal_svg ? 'Modifier le visuel du sceau' : 'Créer le visuel du sceau'}
              </button>
              {step.seal_svg && (
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => set('seal_svg', '')}>
                  Retirer
                </button>
              )}
            </div>
            <small className="muted">
              Les joueurs voient ce sceau : il rougeoie plus fort à chaque roll raté, se fissure à chaque verrou brisé et vole en éclats
              quand il cède. Sans visuel, un sceau est dessiné automatiquement.
            </small>
          </div>
          <SealCreator
            open={creator}
            initialSvg={step.seal_svg ?? null}
            kanji="封 印"
            onClose={() => setCreator(false)}
            onUse={(svg) => set('seal_svg', svg)}
            fileName={step.title || 'sceau-de-trame'}
            kicker="Sceau de la trame"
            useLabel="Utiliser ce sceau"
            draftKey={draftKey}
          />
        </div>
      )}

      {step.kind === 'unseal' && <UnsealFields step={step} patch={patch} index={index} tables={tables} />}
      {step.kind === 'missing' && <MissingFields step={step} patch={patch} />}
      {step.kind === 'order' && <OrderFields step={step} patch={patch} />}
      {step.kind === 'match' && <MatchFields step={step} patch={patch} />}
      {step.kind === 'choice' && <ChoiceFields step={step} patch={patch} />}
      {step.kind === 'situation' && <SituationFields step={step} patch={patch} seals={seals} />}
      {step.kind === 'review' && <ReviewFields step={step} patch={patch} />}
      {['cipher', 'riddle', 'missing', 'situation', 'choice', 'order', 'match'].includes(step.kind) && <StudyFields step={step} patch={patch} tables={tables} />}

      {step.kind !== 'text' && (
        <label className="field">
          <span>Texte révélé quand l’étape est résolue</span>
          <textarea rows={3} value={step.success_md ?? ''} onChange={(e) => set('success_md', e.target.value)} placeholder="La porte de pierre s’ouvre dans un grondement…" />
        </label>
      )}
    </section>
  );
}

/** Ce qu'a répondu un joueur, lisible quelle que soit l'épreuve. */
function attemptText(l: TrameAdmin['log'][number], step: TrameStepDef | undefined): string {
  if (l.kind === 'unseal') return '';
  if (l.kind === 'cipher' || l.kind === 'riddle' || l.kind === 'review') return l.answer ? `« ${l.answer} »` : '';
  let a: { kanji?: string[]; order?: string[]; picks?: (string | number)[] } = {};
  try {
    a = JSON.parse(l.answer ?? '{}');
  } catch {
    return l.answer ?? '';
  }
  if (l.kind === 'missing') return (a.kanji ?? []).join(' ');
  if (l.kind === 'order') return (a.order ?? []).join(' ');
  if (l.kind === 'match') return (a.picks ?? []).join(' · ');
  if (l.kind === 'choice') return (a.picks ?? []).map((i) => step?.options?.[Number(i)] ?? `#${i}`).join(' · ');
  if (l.kind === 'situation') return `${(a.picks ?? []).length} situation(s)`;
  return '';
}

function attemptTone(l: TrameAdmin['log'][number]): string {
  if (l.kind === 'unseal') return l.tone ?? 'neutral';
  if (l.kind === 'review') return l.label === 'approved' ? 'success' : l.label === 'refused' ? 'fail' : 'neutral';
  return l.success ? 'success' : 'fail';
}

function attemptLabel(l: TrameAdmin['log'][number]): string {
  if (l.kind === 'unseal') return `roll ${l.roll} · ${l.label}`;
  if (l.kind === 'review') return l.label === 'approved' ? 'validée' : l.label === 'refused' ? 'refusée' : 'à valider';
  return `${l.success ? 'juste' : 'faux'}${l.label ? ` · ${l.label}` : ''}`;
}

/** Réponses libres à valider ou refuser. */
function Reviews({ data, onDone }: { data: TrameAdmin; onDone: () => void }) {
  const toast = useToast();
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const list = data.reviews ?? [];
  if (!list.length) return null;
  const decide = async (id: number, ok: boolean) => {
    if (!ok && !(notes[id] ?? '').trim()) {
      toast('Explique au shinobi pourquoi sa réponse est refusée.', 'error');
      return;
    }
    setBusy(id);
    try {
      await api.trameReview(id, ok, notes[id] ?? '');
      toast(ok ? 'Réponse validée : la suite s’ouvre' : 'Réponse refusée');
      onDone();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setBusy(null);
    }
  };
  return (
    <section className="panel panel--accent">
      <h2 className="panel__title">
        Réponses à valider <span className="count-badge">{list.length}</span>
      </h2>
      <ul className="review-queue">
        {list.map((r) => (
          <li key={r.id} className="review-queue__item">
            <p className="review-queue__head">
              <b>{r.member}</b> <small>C{r.rank}</small> · étape {r.step_index + 1} · {data.trame.steps[r.step_index]?.title} · {timeAgo(r.created_at)}
            </p>
            <blockquote>{r.text}</blockquote>
            <input
              value={notes[r.id] ?? ''}
              onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })}
              placeholder="Commentaire pour le shinobi (obligatoire en cas de refus)"
              maxLength={1000}
            />
            <div className="request__actions">
              <button type="button" className="btn btn--red btn--sm" disabled={busy === r.id} onClick={() => void decide(r.id, true)}>
                Valider
              </button>
              <button type="button" className="btn btn--ghost btn--sm btn--danger-text" disabled={busy === r.id} onClick={() => void decide(r.id, false)}>
                Refuser
              </button>
            </div>
          </li>
        ))}
      </ul>
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
      <Reviews data={data} onDone={onRefresh} />
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
      {(data.studies?.length ?? 0) > 0 && (
        <section className="panel">
          <h2 className="panel__title">Rolls d’étude</h2>
          <ul className="roll-list">
            {data.studies!.map((r) => (
              <li key={r.id} className={`roll roll--${r.tone}`}>
                <span className="roll__index">{timeAgo(r.created_at)}</span>
                <span className="roll__who">
                  {r.member} <small>C{r.rank}</small>
                </span>
                <span className={`tone tone--${r.tone}`}>
                  Étape {r.step_index + 1} · roll {r.roll} · {r.label}
                </span>
                <span className="roll__text">{r.target < 0 ? 'indice' : `kanji n°${r.target + 1}`}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="panel">
        <h2 className="panel__title">Journal des tentatives</h2>
        {data.log.length === 0 ? (
          <Empty glyph="録">Personne n’a encore tenté sa chance.</Empty>
        ) : (
          <ul className="roll-list">
            {data.log.map((l) => (
              <li key={l.id} className={`roll roll--${attemptTone(l) === 'fail' ? 'neutral' : attemptTone(l)}`}>
                <span className="roll__index">{timeAgo(l.created_at)}</span>
                <span className="roll__who">
                  {l.member} <small>C{l.rank}</small>
                </span>
                <span className={`tone tone--${attemptTone(l)}`}>
                  Étape {l.step_index + 1} · {attemptLabel(l)}
                </span>
                <span className="roll__text">{attemptText(l, steps[l.step_index])}</span>
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
  const { refresh, member } = useSession();
  const [trame, setTrame] = useState<TrameDef | null>(isNew ? emptyTrame() : null);
  const [admin, setAdmin] = useState<TrameAdmin | null>(null);
  const [tables, setTables] = useState<RollTable[]>([]);
  const [seals, setSeals] = useState<AdminPageRow[]>([]);
  const [tab, setTab] = useState<'build' | 'track'>('build');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    try {
      const [t, a, pages] = await Promise.all([
        api.rollTables(),
        isNew ? Promise.resolve(null) : api.adminTrame(Number(id)),
        api.pages().catch(() => [] as AdminPageRow[]),
      ]);
      setTables(t);
      setSeals(pages.filter((p) => p.kind === 'seal'));
      if (a) {
        setAdmin(a);
        setTrame((cur) => (cur && dirty ? cur : { ...a.trame, steps: a.trame.steps.map(upgradeStep) }));
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

  // accès : un cercle, des shinobi choisis, ou le Conclave seul (trame de test)
  const [mode, setMode] = useState<AccessMode>('rank');
  useEffect(() => {
    if (trame?.test_only) setMode('test');
    else if ((trame?.restricted_to?.length ?? 0) > 0) setMode('only');
  }, [trame?.test_only, trame?.restricted_to]);

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
    if (mode === 'only' && !trame.restricted_to?.length) {
      toast('Choisis au moins un shinobi pour cette trame réservée.', 'error');
      return null;
    }
    setBusy(true);
    try {
      const clean = {
        ...trame,
        test_only: mode === 'test',
        restricted_to: mode === 'only' ? trame.restricted_to : [],
        steps: trame.steps.map((s) => ({
          ...s,
          answers: s.answers?.map((a) => a.trim()).filter(Boolean),
          options: s.options?.map((o) => o.trim()),
          pairs: s.pairs?.map((p) => ({ left: p.left.trim(), right: p.right.trim() })),
          hints: s.hints?.map((h) => h.trim()).filter(Boolean),
          meanings: s.meanings?.map((m) => m.trim()),
        })),
      };
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
      start:
        mode === 'test'
          ? { title: 'Ouvrir la trame de test ?', text: 'Elle apparaîtra dans le menu des membres du Conclave seulement.', confirm: 'Ouvrir' }
          : { title: 'Ouvrir la trame aux joueurs ?', text: 'Une page « Trame en cours » apparaîtra dans leur menu.', confirm: 'Ouvrir' },
      end: { title: 'Terminer la trame ?', text: 'La page disparaît pour les joueurs. Le suivi reste consultable ici.', confirm: 'Terminer' },
      reset: { title: 'Remettre la progression à zéro ?', text: 'Toutes les réponses, tous les rolls et toutes les résolutions seront effacés.', confirm: 'Tout effacer' },
    }[action];
    if (!(await confirm({ ...texts, danger: action === 'reset' }))) return;
    let tid = trame.id;
    if (dirty || !tid) tid = await save();
    if (!tid) return;
    try {
      await api.trameStatus(tid, action);
      toast(action === 'start' ? (mode === 'test' ? 'Trame de test ouverte au Conclave' : 'La trame est ouverte aux joueurs') : action === 'end' ? 'La trame est terminée' : 'Progression effacée');
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
            <Access trame={trame} update={update} mode={mode} setMode={setMode} />
            <div className="step-card__grid">
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
              seals={seals}
              onChange={(n) => setStep(i, n)}
              onMove={(dir) => move(i, dir)}
              onRemove={() => update({ steps: trame.steps.filter((_, j) => j !== i) })}
              draftKey={`trame.${member?.id ?? 'conclave'}.${trame.id ?? 'nouvelle'}.etape${i}.visuel`}
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
