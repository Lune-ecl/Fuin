import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { api, type TramePlayerStep, type TrameStudyResult, type TrameSubmitResult } from '../lib/api';
import { buildSealSvg, defaultDesign } from '../lib/sealDesign';
import { sanitizeSvg } from '../lib/markdown';
import { useBrushFont } from '../lib/useBrushFont';
import { formatDate } from '../lib/format';
import Markdown from './Markdown';
import { useToast } from './ui';
import { SolvedGame } from './TrameGames';

// ---------------------------------------------------------------------------
// Pièces communes
// ---------------------------------------------------------------------------
export function AttemptDots({ used, max }: { used: number; max: number }) {
  const left = Math.max(0, max - used);
  return (
    <div className="attempt-dots" aria-label={`${left} essai(s) restant(s) sur ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <i key={i} className={i < used ? 'is-used' : ''} />
      ))}
      <span>
        {left} essai{left > 1 ? 's' : ''} restant{left > 1 ? 's' : ''} pour cette étape
      </span>
    </div>
  );
}

export function Blocked({ shared }: { shared: boolean }) {
  return (
    <p className="step-blocked">
      Tu as utilisé tous tes essais pour cette étape.{shared ? ' Un autre shinobi peut encore la résoudre : la suite s’ouvrira alors pour tous.' : ''}
    </p>
  );
}

export interface StepProps {
  step: TramePlayerStep;
  trameId: number;
  shared: boolean;
  onDone: () => void;
}

/** Envoi d'une réponse, avec les messages communs à toutes les épreuves. */
export function useSubmit({ step, trameId, onDone }: StepProps) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);
  const send = async (payload: Record<string, unknown>, onResult?: (r: TrameSubmitResult) => void) => {
    setBusy(true);
    try {
      const r = await api.trameSubmit(trameId, step.index, payload);
      onResult?.(r);
      if (r.pending) toast('Réponse envoyée : le Conclave va l’examiner');
      else if (r.correct) toast('Juste ! L’étape suivante s’ouvre');
      else {
        setShake((x) => x + 1);
        const score =
          r.exact != null
            ? ` ${r.exact} lueur${r.exact > 1 ? 's' : ''} rouge${r.exact > 1 ? 's' : ''}, ${r.present ?? 0} blanche${(r.present ?? 0) > 1 ? 's' : ''}.`
            : r.total
              ? ` ${r.right} sur ${r.total} juste${(r.right ?? 0) > 1 ? 's' : ''}.`
              : '';
        toast(`Ce n’est pas ça.${score} ${r.attempts_left > 0 ? `${r.attempts_left} essai${r.attempts_left > 1 ? 's' : ''} restant${r.attempts_left > 1 ? 's' : ''}.` : 'Plus aucun essai.'}`, 'error');
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setBusy(false);
      onDone();
    }
  };
  return { busy, shake, send };
}

export const mark = (feedback: boolean[] | null | undefined, i: number) => (feedback ? (feedback[i] ? ' is-right' : ' is-wrong') : '');

// ---------------------------------------------------------------------------
// Kanjis manquants
// ---------------------------------------------------------------------------
/** Sceau dessiné avec la formule, les kanjis manquants remplacés par « ？ ». */
function FormulaSeal({ chars, active }: { chars: (string | null)[]; active: boolean }) {
  const text = chars.map((c) => c ?? '？');
  const font = useBrushFont(text.join(''));
  const svg = useMemo(() => {
    if (!font.ready) return '';
    // chaque kanji n'apparaît qu'une fois, au centre ; au-delà de six, ils restent dans les cases
    const d = {
      ...defaultDesign(''),
      ring: 'ticks',
      ringText: '',
      glyph: text.length <= 6 ? text.join('') : '',
      symbol: text.length <= 6 ? null : 'keyhole',
      glyphLayout: 'auto' as const,
      ornaments: ['inner'],
    };
    return sanitizeSvg(buildSealSvg(d, { embed: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [font.ready, font.version, text.join('|')]);
  return <div className={`formula-seal${active ? ' is-active' : ''}`} dangerouslySetInnerHTML={{ __html: svg }} />;
}

export function MissingStep(props: StepProps) {
  const { step, shared } = props;
  const slots = step.slots ?? [];
  const holes = slots.map((c, i) => (c === null ? i : -1)).filter((i) => i >= 0);
  const prev = step.last?.kanji ?? [];
  const [picks, setPicks] = useState<string[]>(() => holes.map((_, j) => prev[j] ?? ''));
  const { busy, shake, send } = useSubmit(props);
  const used = step.attempts_used ?? 0;
  const max = step.max_attempts ?? 3;
  const pool = step.pool ?? null;
  const left = max - used;
  const fb = step.feedback ?? null;
  const filled = picks.every((p) => p.trim());

  const preview = slots.map((c, i) => (c === null ? picks[holes.indexOf(i)] || null : c));
  const put = (k: string) => {
    const j = picks.findIndex((p) => !p);
    if (j >= 0) setPicks(picks.map((p, x) => (x === j ? k : p)));
  };

  return (
    <>
      <FormulaSeal chars={preview} active={false} />
      <div className={`kanji-slots${shake ? ' is-shaking' : ''}`} key={shake}>
        {slots.map((c, i) => {
          if (c !== null)
            return (
              <span key={i} className="kanji-slot is-fixed" lang="ja">
                {c}
              </span>
            );
          const j = holes.indexOf(i);
          return pool ? (
            <button
              key={i}
              type="button"
              className={`kanji-slot is-hole${picks[j] ? ' is-filled' : ''}${picks[j] === prev[j] ? mark(fb, j) : ''}`}
              lang="ja"
              onClick={() => setPicks(picks.map((p, x) => (x === j ? '' : p)))}
              title="Retirer ce kanji"
            >
              {picks[j] || '？'}
            </button>
          ) : (
            <input
              key={i}
              className={`kanji-slot is-hole${picks[j] === prev[j] ? mark(fb, j) : ''}`}
              lang="ja"
              value={picks[j]}
              onChange={(e) => setPicks(picks.map((p, x) => (x === j ? [...e.target.value.replace(/\s/g, '')].slice(-1).join('') : p)))}
              placeholder="？"
              aria-label={`Kanji manquant ${j + 1}`}
            />
          );
        })}
      </div>
      {pool && left > 0 && (
        <div className="kanji-pool" aria-label="Kanjis disponibles">
          {pool.map((k, i) => (
            <button key={i} type="button" className="kanji-pool__item" lang="ja" onClick={() => put(k)} disabled={picks.includes(k) && pool.filter((x) => x === k).length <= picks.filter((x) => x === k).length}>
              {k}
            </button>
          ))}
        </div>
      )}
      {left > 0 ? (
        <button type="button" className="btn btn--red" disabled={busy || !filled} onClick={() => void send({ kanji: picks })}>
          {busy ? 'Le sceau se reforme…' : 'Reconstruire le sceau'}
        </button>
      ) : (
        <Blocked shared={shared} />
      )}
      {fb && left > 0 && <p className="muted small">Les kanjis en vert sont à la bonne place.</p>}
      <AttemptDots used={used} max={max} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Ordre des kanjis
// ---------------------------------------------------------------------------
export function OrderStep(props: StepProps) {
  const { step, shared } = props;
  const tiles = step.tiles ?? [];
  const [placed, setPlaced] = useState<number[]>([]);
  const { busy, shake, send } = useSubmit(props);
  const used = step.attempts_used ?? 0;
  const max = step.max_attempts ?? 3;
  const left = max - used;
  const fb = step.feedback ?? null;
  const prev = step.last?.order ?? [];

  return (
    <>
      {fb && prev.length > 0 && (
        <div className="kanji-slots kanji-slots--small" aria-label="Ton dernier essai">
          {prev.map((k, i) => (
            <span key={i} className={`kanji-slot is-fixed${mark(fb, i)}`} lang="ja">
              {k}
            </span>
          ))}
        </div>
      )}
      <div className={`kanji-slots${shake ? ' is-shaking' : ''}`} key={shake} aria-label="Ton ordre">
        {tiles.map((_, i) => (
          <button key={i} type="button" className={`kanji-slot is-hole${placed[i] !== undefined ? ' is-filled' : ''}`} lang="ja" onClick={() => setPlaced(placed.filter((_, x) => x !== i))} disabled={placed[i] === undefined}>
            {placed[i] !== undefined ? tiles[placed[i]] : i + 1}
          </button>
        ))}
      </div>
      {left > 0 && (
        <div className="kanji-pool">
          {tiles.map((k, i) => (
            <button key={i} type="button" className="kanji-pool__item" lang="ja" disabled={placed.includes(i)} onClick={() => setPlaced([...placed, i])}>
              {k}
            </button>
          ))}
        </div>
      )}
      {left > 0 ? (
        <div className="request__actions">
          <button type="button" className="btn btn--red" disabled={busy || placed.length !== tiles.length} onClick={() => void send({ order: placed.map((i) => tiles[i]) }, () => setPlaced([]))}>
            {busy ? 'Vérification…' : 'Valider l’ordre'}
          </button>
          {placed.length > 0 && (
            <button type="button" className="btn btn--ghost" onClick={() => setPlaced([])}>
              Recommencer
            </button>
          )}
        </div>
      ) : (
        <Blocked shared={shared} />
      )}
      <AttemptDots used={used} max={max} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Associations
// ---------------------------------------------------------------------------
export function MatchStep(props: StepProps) {
  const { step, shared } = props;
  const lefts = step.lefts ?? [];
  const rights = step.rights ?? [];
  const prev = (step.last?.picks ?? []) as string[];
  const [picks, setPicks] = useState<string[]>(() => lefts.map((_, i) => prev[i] ?? ''));
  const { busy, shake, send } = useSubmit(props);
  const used = step.attempts_used ?? 0;
  const max = step.max_attempts ?? 3;
  const left = max - used;
  const fb = step.feedback ?? null;

  return (
    <>
      <div className={`match-list${shake ? ' is-shaking' : ''}`} key={shake}>
        {lefts.map((l, i) => (
          <label key={i} className={`match-row${picks[i] && picks[i] === prev[i] ? mark(fb, i) : ''}`}>
            <span className="match-row__left" lang="ja">
              {l}
            </span>
            <i aria-hidden="true">→</i>
            <select value={picks[i]} onChange={(e) => setPicks(picks.map((p, x) => (x === i ? e.target.value : p)))} disabled={left <= 0}>
              <option value="">Choisir…</option>
              {rights.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      {left > 0 ? (
        <button type="button" className="btn btn--red" disabled={busy || picks.some((p) => !p)} onClick={() => void send({ picks })}>
          {busy ? 'Vérification…' : 'Valider les associations'}
        </button>
      ) : (
        <Blocked shared={shared} />
      )}
      <AttemptDots used={used} max={max} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Question à choix
// ---------------------------------------------------------------------------
export function ChoiceStep(props: StepProps) {
  const { step, shared } = props;
  const options = step.options ?? [];
  const multiple = !!step.multiple;
  const [picks, setPicks] = useState<number[]>([]);
  const { busy, shake, send } = useSubmit(props);
  const used = step.attempts_used ?? 0;
  const max = step.max_attempts ?? 2;
  const left = max - used;
  const toggle = (i: number) => setPicks(multiple ? (picks.includes(i) ? picks.filter((x) => x !== i) : [...picks, i]) : [i]);

  return (
    <>
      <p className="muted small">{multiple ? 'Plusieurs réponses sont justes : coche-les toutes.' : 'Une seule réponse est juste.'}</p>
      <div className={`choice-list${shake ? ' is-shaking' : ''}`} key={shake} role={multiple ? 'group' : 'radiogroup'}>
        {options.map((o, i) => (
          <button key={i} type="button" role={multiple ? 'checkbox' : 'radio'} aria-checked={picks.includes(i)} className={`choice${picks.includes(i) ? ' is-on' : ''}`} onClick={() => toggle(i)} disabled={left <= 0}>
            <span className={`choice__box${multiple ? '' : ' is-round'}`} aria-hidden="true">
              {picks.includes(i) ? '✓' : ''}
            </span>
            {o}
          </button>
        ))}
      </div>
      {left > 0 ? (
        <button type="button" className="btn btn--red" disabled={busy || !picks.length} onClick={() => void send({ picks }, () => setPicks([]))}>
          {busy ? 'Vérification…' : 'Répondre'}
        </button>
      ) : (
        <Blocked shared={shared} />
      )}
      <AttemptDots used={used} max={max} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Mise en situation
// ---------------------------------------------------------------------------
export function SituationStep(props: StepProps) {
  const { step, shared } = props;
  const sits = step.situations ?? [];
  const seals = step.seals ?? [];
  const prev = (step.last?.picks ?? []).map(Number);
  const [picks, setPicks] = useState<number[]>(() => sits.map((_, i) => prev[i] || 0));
  const { busy, shake, send } = useSubmit(props);
  const used = step.attempts_used ?? 0;
  const max = step.max_attempts ?? 3;
  const left = max - used;
  const fb = step.feedback ?? null;

  return (
    <>
      <ol className={`situations${shake ? ' is-shaking' : ''}`} key={shake}>
        {sits.map((x, i) => (
          <li key={i} className={`situation${picks[i] && picks[i] === prev[i] ? mark(fb, i) : ''}`}>
            <span className="situation__num">{i + 1}</span>
            <div>
              <Markdown source={x.text} />
              <select value={picks[i] || ''} onChange={(e) => setPicks(picks.map((p, j) => (j === i ? Number(e.target.value) : p)))} disabled={left <= 0} aria-label={`Sceau pour la situation ${i + 1}`}>
                <option value="">Quel sceau utiliser ?</option>
                {seals.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                    {s.kanji ? ` · ${s.kanji.replace(/\s+/g, '')}` : ''}
                  </option>
                ))}
              </select>
            </div>
          </li>
        ))}
      </ol>
      {left > 0 ? (
        <button type="button" className="btn btn--red" disabled={busy || picks.some((p) => !p)} onClick={() => void send({ picks })}>
          {busy ? 'Vérification…' : 'Valider mes choix'}
        </button>
      ) : (
        <Blocked shared={shared} />
      )}
      {fb && left > 0 && <p className="muted small">Les situations en vert ont le bon sceau.</p>}
      <AttemptDots used={used} max={max} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Réponse libre validée par le Conclave
// ---------------------------------------------------------------------------
const REVIEW_STATUS = { pending: 'En attente du Conclave', approved: 'Validée', refused: 'Refusée' } as const;

export function ReviewStep(props: StepProps) {
  const { step, shared } = props;
  const [text, setText] = useState('');
  const { busy, send } = useSubmit(props);
  const used = step.attempts_used ?? 0;
  const max = step.max_attempts ?? 3;
  const left = max - used;
  const subs = step.submissions ?? [];

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (text.trim()) void send({ text }, (r) => r.pending && setText(''));
  };

  return (
    <>
      {subs.length > 0 && <ReviewHistory subs={subs} />}
      {step.pending ? (
        <p className="step-pending">
          <i aria-hidden="true" />
          Ta réponse attend la validation du Conclave. La suite s’ouvrira dès qu’elle sera acceptée.
        </p>
      ) : left > 0 ? (
        <form className="form review-form" onSubmit={submit}>
          <textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} placeholder="Ta réponse, telle que ton shinobi la donnerait…" />
          <div className="form-actions">
            <button type="submit" className="btn btn--red" disabled={busy || !text.trim()}>
              {busy ? 'Envoi…' : 'Envoyer au Conclave'}
            </button>
          </div>
        </form>
      ) : (
        <Blocked shared={shared} />
      )}
      <AttemptDots used={used} max={max} />
    </>
  );
}

function ReviewHistory({ subs }: { subs: NonNullable<TramePlayerStep['submissions']> }) {
  return (
    <ul className="review-history">
      {subs.map((s, i) => (
        <li key={i} className={`review-item review-item--${s.status}`}>
          <div className="review-item__head">
            <span className={`status status--${s.status === 'approved' ? 'approved' : s.status === 'refused' ? 'refused' : 'pending'}`}>{REVIEW_STATUS[s.status]}</span>
            <small>{formatDate(s.at, true)}</small>
          </div>
          <p>{s.text}</p>
          {s.note && (
            <p className="review-item__note">
              <b>Le Conclave :</b> {s.note}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Étape résolue : ce que l'épreuve révèle
// ---------------------------------------------------------------------------
export function SolvedChallenge({ step }: { step: TramePlayerStep }): ReactNode {
  if (step.kind === 'missing' && step.slots) return <FormulaSeal chars={step.slots} active />;
  if (step.kind === 'order' && step.formula)
    return (
      <div className="kanji-slots kanji-slots--small">
        {step.formula.map((k, i) => (
          <span key={i} className="kanji-slot is-fixed is-right" lang="ja">
            {k}
          </span>
        ))}
      </div>
    );
  if (step.kind === 'match' && step.pairs)
    return (
      <ul className="solved-list">
        {step.pairs.map((p, i) => (
          <li key={i}>
            <b lang="ja">{p.left}</b> → {p.right}
          </li>
        ))}
      </ul>
    );
  if (step.kind === 'choice' && step.options && step.correct)
    return (
      <ul className="solved-list">
        {step.correct.map((i) => (
          <li key={i}>✓ {step.options![i]}</li>
        ))}
      </ul>
    );
  if (step.kind === 'situation' && step.situations && step.answers)
    return (
      <ol className="solved-list">
        {step.situations.map((x, i) => (
          <li key={i}>
            <span className="muted">{x.text.length > 90 ? `${x.text.slice(0, 90)}…` : x.text}</span> → <b>{step.answers![i]}</b>
          </li>
        ))}
      </ol>
    );
  if (step.kind === 'review' && step.submissions) return <ReviewHistory subs={step.submissions.filter((s) => s.status === 'approved')} />;
  return <SolvedGame step={step} />;
}

// ---------------------------------------------------------------------------
// Rolls d'étude : comprendre un kanji, trouver un indice
// ---------------------------------------------------------------------------
export function StudyPanel({ step, trameId, onDone }: { step: TramePlayerStep; trameId: number; onDone: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState<number | null>(null);
  const [last, setLast] = useState<(TrameStudyResult & { target: number }) | null>(null);
  const study = step.study;
  if (!study) return null;
  const left = Math.max(0, study.rolls_max - study.rolls_used);
  const hintsLeft = study.hints_total - study.hints.length;
  const roll = async (target: number) => {
    setBusy(target);
    try {
      const r = await api.trameStudy(trameId, step.index, target);
      setLast({ ...r, target });
      if (r.meaning) toast(`Sens découvert : ${r.meaning}`);
      else if (r.hint) toast('Un indice se révèle');
      else if (r.tone === 'crit-fail') toast('Contresens : tu lui prêtes un faux sens…', 'error');
      else toast('Le sens t’échappe encore.', 'error');
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setBusy(null);
      onDone();
    }
  };
  const label = (target: number) => {
    if (target < 0) return 'un indice';
    const ch = study.chars.find((c) => c.i === target);
    return ch?.kanji ? `le kanji ${ch.kanji}` : `le kanji manquant n°${study.chars.filter((c) => !c.kanji && c.i <= target).length}`;
  };
  return (
    <details className="study" open>
      <summary>
        <span className="study__glyph" aria-hidden="true">
          読
        </span>
        <b>Étude des kanjis</b>
        <small>
          {left} roll{left > 1 ? 's' : ''} d’étude restant{left > 1 ? 's' : ''} sur {study.rolls_max}
        </small>
      </summary>
      <p className="muted small">
        Lance un roll de déchiffrement sur un kanji pour en comprendre le sens{study.hints_total ? ', ou cherche un indice' : ''}. Une réussite critique donne en plus un
        indice. Ces rolls ne retirent aucun essai de réponse.
      </p>
      {study.chars.length > 0 && (
        <div className="study__chars">
          {study.chars.map((c) => {
            const can = c.studiable && !c.meaning && left > 0;
            return (
              <button key={c.i} type="button" className={`study-char${c.meaning ? ' is-known' : ''}${c.misread ? ' is-misread' : ''}`} disabled={!can || busy !== null} onClick={() => void roll(c.i)} title={can ? 'Étudier ce kanji' : undefined}>
                <span className="study-char__k" lang="ja">
                  {c.kanji ?? '？'}
                </span>
                <span className="study-char__m">{c.meaning ?? (c.misread ? 'mal lu…' : c.studiable ? (busy === c.i ? '…' : 'étudier') : '—')}</span>
              </button>
            );
          })}
        </div>
      )}
      {study.hints.length > 0 && (
        <ol className="study__hints">
          {study.hints.map((h, i) => (
            <li key={i}>{h}</li>
          ))}
        </ol>
      )}
      {hintsLeft > 0 && left > 0 && (
        <button type="button" className="btn btn--ghost btn--sm" disabled={busy !== null} onClick={() => void roll(-1)}>
          {busy === -1 ? 'Recherche…' : `Chercher un indice (${hintsLeft} à découvrir)`}
        </button>
      )}
      {last && (
        <p className={`study__last roll--${last.tone}`}>
          <span className="roll__value">{last.roll}</span>
          <span className={`tone tone--${last.tone}`}>{last.label}</span> sur {label(last.target)}
          {last.effect && <span className="muted"> · {last.effect}</span>}
        </p>
      )}
    </details>
  );
}
