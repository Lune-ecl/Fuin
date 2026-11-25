// Mini-jeux des trames, côté joueur : verrou à cercles, résonance du sceau, flux de chakra,
// suite logique, mémoire du sceau, l'intrus et code du Conclave. La base vérifie chaque réponse.
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { api, type TramePlayerStep } from '../lib/api';
import { signName } from '../lib/trameKinds';
import { AttemptDots, Blocked, mark, useSubmit, type StepProps } from './TrameChallenges';
import { useToast } from './ui';

const mod = (n: number, m: number) => ((n % m) + m) % m;

// ---------------------------------------------------------------------------
// Verrou à cercles
// ---------------------------------------------------------------------------
/** Sceau à cercles tournants : le kanji choisi de chaque cercle vient se placer sous la marque, en haut. */
export function DialSeal({
  rings,
  turns,
  feedback,
  onTurn,
  open,
}: {
  rings: string[][];
  /** nombre de crans tournés pour chaque cercle (peut dépasser le nombre de kanjis) */
  turns: number[];
  feedback?: boolean[] | null;
  onTurn?: (ring: number) => void;
  open?: boolean;
}) {
  const n = rings.length;
  const inner = 26;
  const outer = 94;
  const w = (outer - inner) / Math.max(1, n);
  return (
    <svg className={`dial-seal${open ? ' is-open' : ''}`} viewBox="0 0 200 200" role="img" aria-label="Verrou à cercles">
      <circle cx="100" cy="100" r={outer + 3} className="dial-seal__rim" />
      {rings.map((opts, j) => {
        const r = inner + w * (j + 0.5);
        const step = 360 / opts.length;
        const size = Math.min(w * 0.62, ((2 * Math.PI * r) / opts.length) * 0.62, 22);
        const state = feedback ? (feedback[j] ? ' is-right' : ' is-wrong') : '';
        return (
          <g key={j} className={`dial-ring${state}${onTurn ? ' is-turnable' : ''}`} onClick={onTurn ? () => onTurn(j) : undefined}>
            <circle cx="100" cy="100" r={inner + w * (j + 1)} className="dial-ring__edge" />
            <circle cx="100" cy="100" r={r} className="dial-ring__track" style={{ strokeWidth: w - 2 }} />
            <g className="dial-ring__spin" style={{ transform: `rotate(${-(turns[j] ?? 0) * step}deg)` }}>
              {opts.map((k, i) => {
                const a = ((i * step - 90) * Math.PI) / 180;
                const x = 100 + r * Math.cos(a);
                const y = 100 + r * Math.sin(a);
                return (
                  <text key={i} x={x} y={y} className="dial-ring__k" style={{ fontSize: size }} transform={`rotate(${i * step} ${x} ${y})`} textAnchor="middle" dominantBaseline="central">
                    {k}
                  </text>
                );
              })}
            </g>
          </g>
        );
      })}
      <circle cx="100" cy="100" r={inner - 3} className="dial-seal__core" />
      <text x="100" y="100" className="dial-seal__glyph" textAnchor="middle" dominantBaseline="central">
        {open ? '開' : '鍵'}
      </text>
      <rect x="88" y={100 - outer} width="24" height={outer - inner + 2} rx="6" className="dial-seal__window" />
      <path d={`M100 ${100 - outer - 6} l-6 -7 h12 z`} className="dial-seal__mark" />
    </svg>
  );
}

export function DialStep(props: StepProps) {
  const { step, shared } = props;
  const rings = (step.rings ?? []).map((r) => r.options);
  const prev = (step.last?.picks ?? []) as string[];
  // on reprend la position du dernier essai
  const [turns, setTurns] = useState<number[]>(() => rings.map((opts, j) => Math.max(0, opts.indexOf(prev[j] ?? ''))));
  const { busy, shake, send } = useSubmit(props);
  const used = step.attempts_used ?? 0;
  const max = step.max_attempts ?? 3;
  const left = max - used;
  const fb = step.feedback ?? null;
  const picks = rings.map((opts, j) => opts[mod(turns[j] ?? 0, opts.length)]);
  const sameAsLast = prev.length === picks.length && picks.every((p, j) => p === prev[j]);
  const turn = (j: number, d: number) => setTurns((t) => t.map((x, i) => (i === j ? x + d : x)));

  return (
    <>
      <div className={`dial${shake ? ' is-shaking' : ''}`} key={shake}>
        <DialSeal rings={rings} turns={turns} feedback={sameAsLast ? fb : null} onTurn={left > 0 ? (j) => turn(j, 1) : undefined} />
        <ol className="dial__controls">
          {rings.map((_, j) => (
            <li key={j} className={sameAsLast ? mark(fb, j) : ''}>
              <span className="muted small">{j === 0 ? 'Cercle du centre' : j === rings.length - 1 ? 'Cercle du bord' : `Cercle ${j + 1}`}</span>
              <button type="button" className="icon-btn" onClick={() => turn(j, -1)} disabled={left <= 0} aria-label={`Tourner le cercle ${j + 1} vers la gauche`}>
                ‹
              </button>
              <b lang="ja">{picks[j]}</b>
              <button type="button" className="icon-btn" onClick={() => turn(j, 1)} disabled={left <= 0} aria-label={`Tourner le cercle ${j + 1} vers la droite`}>
                ›
              </button>
            </li>
          ))}
        </ol>
      </div>
      {left > 0 ? (
        <button type="button" className="btn btn--red" disabled={busy} onClick={() => void send({ picks })}>
          {busy ? 'Le verrou tourne…' : 'Ouvrir le verrou'}
        </button>
      ) : (
        <Blocked shared={shared} />
      )}
      {fb && left > 0 && sameAsLast && <p className="muted small">Les cercles en vert sont sur le bon kanji.</p>}
      <AttemptDots used={used} max={max} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Résonance du sceau
// ---------------------------------------------------------------------------
function Glows({ exact, present, length }: { exact: number; present: number; length: number }) {
  return (
    <span className="glows" aria-label={`${exact} bien placé${exact > 1 ? 's' : ''}, ${present} mal placé${present > 1 ? 's' : ''}`}>
      {Array.from({ length }, (_, i) => (
        <i key={i} className={i < exact ? 'is-exact' : i < exact + present ? 'is-present' : ''} />
      ))}
    </span>
  );
}

export function MastermindStep(props: StepProps) {
  const { step, shared } = props;
  const palette = step.palette ?? [];
  const length = step.length ?? 3;
  const history = step.history ?? [];
  const [guess, setGuess] = useState<string[]>([]);
  const { busy, shake, send } = useSubmit(props);
  const used = step.attempts_used ?? 0;
  const max = step.max_attempts ?? 8;
  const left = max - used;

  return (
    <>
      {history.length > 0 && (
        <ol className="resonance-history">
          {history.map((h, i) => (
            <li key={i}>
              <span className="muted small">{i + 1}.</span>
              <span className="resonance-history__guess" lang="ja">
                {h.guess.join('')}
              </span>
              <Glows exact={h.exact} present={h.present} length={length} />
            </li>
          ))}
        </ol>
      )}
      {left > 0 ? (
        <>
          <div className={`kanji-slots${shake ? ' is-shaking' : ''}`} key={shake} aria-label="Ta formule">
            {Array.from({ length }, (_, i) => (
              <button key={i} type="button" className={`kanji-slot is-hole${guess[i] ? ' is-filled' : ''}`} lang="ja" onClick={() => setGuess(guess.filter((_, x) => x !== i))} disabled={!guess[i]}>
                {guess[i] ?? i + 1}
              </button>
            ))}
          </div>
          <div className="kanji-pool">
            {palette.map((k) => (
              <button key={k} type="button" className="kanji-pool__item" lang="ja" disabled={guess.length >= length} onClick={() => setGuess([...guess, k])}>
                {k}
              </button>
            ))}
          </div>
          <div className="request__actions">
            <button type="button" className="btn btn--red" disabled={busy || guess.length !== length} onClick={() => void send({ guess }, () => setGuess([]))}>
              {busy ? 'Le sceau résonne…' : 'Faire résonner le sceau'}
            </button>
            {guess.length > 0 && (
              <button type="button" className="btn btn--ghost" onClick={() => setGuess([])}>
                Effacer
              </button>
            )}
          </div>
          <p className="muted small glows-legend">
            <Glows exact={1} present={0} length={1} /> bon kanji à la bonne place · <Glows exact={0} present={1} length={1} /> bon kanji, mauvaise place. Un kanji
            peut revenir plusieurs fois.
          </p>
        </>
      ) : (
        <Blocked shared={shared} />
      )}
      <AttemptDots used={used} max={max} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Flux de chakra
// ---------------------------------------------------------------------------
/** Grille de kanjis avec le tracé du flux (lignes rouges entre les cases). */
export function PathGrid({
  grid,
  path,
  start,
  marks,
  onCell,
  done,
}: {
  grid: string[][];
  path: number[];
  start?: number | null;
  marks?: boolean[] | null;
  onCell?: (i: number) => void;
  done?: boolean;
}) {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const points = path.map((i) => `${(i % cols) + 0.5},${Math.floor(i / cols) + 0.5}`).join(' ');
  return (
    <div className={`chakra-grid${done ? ' is-done' : ''}`} style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, aspectRatio: `${cols} / ${rows}` }}>
      <svg className="chakra-grid__flow" viewBox={`0 0 ${cols} ${rows}`} preserveAspectRatio="none" aria-hidden="true">
        {path.length > 1 && <polyline points={points} />}
      </svg>
      {grid.flat().map((k, i) => {
        const at = path.indexOf(i);
        return (
          <button
            key={i}
            type="button"
            className={`chakra-cell${at >= 0 ? ' is-on' : ''}${i === start && at < 0 ? ' is-start' : ''}${at >= 0 && marks ? (marks[at] ? ' is-right' : ' is-wrong') : ''}`}
            lang="ja"
            onClick={onCell ? () => onCell(i) : undefined}
            disabled={!onCell}
            aria-label={`${k}${at >= 0 ? `, étape ${at + 1}` : ''}`}
          >
            {k}
            {at >= 0 && <small>{at + 1}</small>}
          </button>
        );
      })}
    </div>
  );
}

export function PathStep(props: StepProps) {
  const { step, shared } = props;
  const toast = useToast();
  const grid = step.grid ?? [];
  const cols = grid[0]?.length ?? 1;
  const length = step.length ?? 0;
  const prevCells = ((step.last as { cells?: number[] } | null)?.cells ?? []).map(Number);
  const [path, setPath] = useState<number[]>([]);
  const { busy, shake, send } = useSubmit(props);
  const used = step.attempts_used ?? 0;
  const max = step.max_attempts ?? 3;
  const left = max - used;
  const fb = step.feedback ?? null;
  const flat = grid.flat();

  const click = (i: number) => {
    if (path[path.length - 1] === i) return setPath(path.slice(0, -1));
    if (path.includes(i)) return toast('Le flux ne repasse jamais par la même case. Touche la dernière case pour revenir en arrière.', 'error');
    const last = path[path.length - 1];
    if (last !== undefined && Math.abs(Math.floor(i / cols) - Math.floor(last / cols)) + Math.abs((i % cols) - (last % cols)) !== 1)
      return toast('Le flux passe d’une case à sa voisine (haut, bas, gauche ou droite).', 'error');
    if (path.length >= length) return toast(`Le flux traverse ${length} cases.`, 'error');
    setPath([...path, i]);
  };

  return (
    <>
      <div className={shake ? 'is-shaking' : ''} key={shake}>
        <PathGrid grid={grid} path={path.length || !prevCells.length ? path : prevCells} start={step.start} marks={!path.length && prevCells.length ? fb : null} onCell={left > 0 ? click : undefined} />
      </div>
      <p className="chakra-trace">
        <span className="muted small">
          Flux tracé ({path.length}/{length}) :
        </span>{' '}
        <b lang="ja">{path.map((i) => flat[i]).join(' ') || '…'}</b>
      </p>
      {left > 0 ? (
        <div className="request__actions">
          <button type="button" className="btn btn--red" disabled={busy || path.length !== length} onClick={() => void send({ cells: path }, () => setPath([]))}>
            {busy ? 'Le chakra circule…' : 'Libérer le flux'}
          </button>
          {path.length > 0 && (
            <button type="button" className="btn btn--ghost" onClick={() => setPath([])}>
              Recommencer
            </button>
          )}
        </div>
      ) : (
        <Blocked shared={shared} />
      )}
      {!path.length && prevCells.length > 0 && fb && left > 0 && <p className="muted small">Ton dernier tracé : les cases en vert sont justes. Touche une case pour recommencer.</p>}
      <AttemptDots used={used} max={max} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Réponses écrites : suite logique et code du Conclave
// ---------------------------------------------------------------------------
function useAnswer({ step, trameId, onDone }: StepProps) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [wrong, setWrong] = useState(0);
  const submit = async (answer: string, after?: () => void) => {
    if (!answer.trim() || busy) return;
    setBusy(true);
    try {
      const r = await api.trameAnswer(trameId, step.index, answer);
      if (r.correct) {
        toast('Juste ! L’étape suivante s’ouvre');
        after?.();
      } else {
        setWrong((w) => w + 1);
        toast(`Ce n’est pas ça. ${r.attempts_left > 0 ? `${r.attempts_left} essai${r.attempts_left > 1 ? 's' : ''} restant${r.attempts_left > 1 ? 's' : ''}.` : 'Plus aucun essai.'}`, 'error');
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setBusy(false);
      onDone();
    }
  };
  return { busy, wrong, submit };
}

function AnswerForm({ value, setValue, onSubmit, busy, wrong, placeholder }: { value: string; setValue: (v: string) => void; onSubmit: () => void; busy: boolean; wrong: number; placeholder: string }) {
  const go = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };
  return (
    <form key={wrong} className={`cipher-form${wrong ? ' is-shaking' : ''}`} onSubmit={go}>
      <input value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} maxLength={500} aria-label="Ta réponse" autoComplete="off" />
      <button type="submit" className="btn btn--red" disabled={busy || !value.trim()}>
        {busy ? 'Vérification…' : 'Proposer'}
      </button>
    </form>
  );
}

function SequenceRow({ items, fill }: { items: string[]; fill?: string }) {
  return (
    <div className="sequence-row" lang="ja">
      {items.map((x, i) => (
        <span key={i} className={`sequence-item${x.trim() === '?' ? ' is-hole' : ''}`}>
          {x.trim() === '?' ? fill || '?' : x}
        </span>
      ))}
    </div>
  );
}

export function SequenceStep(props: StepProps) {
  const { step, shared } = props;
  const [answer, setAnswer] = useState('');
  const { busy, wrong, submit } = useAnswer(props);
  const used = step.attempts_used ?? 0;
  const max = step.max_attempts ?? 2;
  const left = max - used;
  const items = step.items ?? [];
  return (
    <>
      <SequenceRow items={items.some((x) => x.trim() === '?') ? items : [...items, '?']} fill={answer.trim()} />
      {left > 0 ? (
        <>
          {(step.options?.length ?? 0) > 0 && (
            <div className="kanji-pool">
              {step.options!.map((o) => (
                <button key={o} type="button" className={`kanji-pool__item${answer === o ? ' is-on' : ''}`} lang="ja" onClick={() => setAnswer(o)}>
                  {o}
                </button>
              ))}
            </div>
          )}
          <AnswerForm value={answer} setValue={setAnswer} onSubmit={() => void submit(answer, () => setAnswer(''))} busy={busy} wrong={wrong} placeholder="Ce qui remplace le « ? »…" />
        </>
      ) : (
        <Blocked shared={shared} />
      )}
      <AttemptDots used={used} max={max} />
    </>
  );
}

export function SubstitutionStep(props: StepProps) {
  const { step, shared } = props;
  const key = step.key ?? [];
  const [guesses, setGuesses] = useState<Record<string, string>>({});
  const [answer, setAnswer] = useState('');
  const { busy, wrong, submit } = useAnswer(props);
  const used = step.attempts_used ?? 0;
  const max = step.max_attempts ?? 2;
  const left = max - used;
  const letterOf = (k: string) => key.find((e) => e.k === k)?.l ?? guesses[k] ?? null;
  const decoded = [...(step.cipher_text ?? '')].map((c) => (c === ' ' ? ' ' : key.some((e) => e.k === c) ? letterOf(c) || '_' : c)).join('');

  return (
    <>
      <p className="cipher-text cipher-text--code" lang="ja">
        {step.cipher_text}
      </p>
      <div className="code-key" aria-label="Table de chiffrement">
        {key.map((e) => (
          <label key={e.k} className={`code-key__cell${e.l ? '' : ' is-hidden'}`}>
            <b lang="ja">{e.k}</b>
            {e.l ? (
              <span>{e.l}</span>
            ) : (
              <input
                value={guesses[e.k] ?? ''}
                onChange={(ev) => setGuesses({ ...guesses, [e.k]: ev.target.value.toLowerCase().replace(/[^a-z]/g, '').slice(-1) })}
                placeholder="?"
                aria-label={`Lettre de ${e.k}`}
                disabled={left <= 0}
              />
            )}
          </label>
        ))}
      </div>
      <p className="code-decoded">
        <span className="muted small">Décodage :</span> <b>{decoded}</b>
      </p>
      {left > 0 ? (
        <>
          {!decoded.includes('_') && answer !== decoded && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setAnswer(decoded)}>
              Reprendre ce décodage comme réponse
            </button>
          )}
          <AnswerForm value={answer} setValue={setAnswer} onSubmit={() => void submit(answer, () => setAnswer(''))} busy={busy} wrong={wrong} placeholder="Le message en clair…" />
        </>
      ) : (
        <Blocked shared={shared} />
      )}
      <AttemptDots used={used} max={max} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Mémoire du sceau
// ---------------------------------------------------------------------------
function SignTile({ k, signs }: { k: string; signs: boolean }) {
  return (
    <>
      <span lang="ja">{k}</span>
      {signs && <small>{signName(k)}</small>}
    </>
  );
}

export function MemoryStep(props: StepProps) {
  const { step, shared } = props;
  const sequence = step.sequence ?? [];
  const palette = step.palette ?? [];
  const signs = !!step.signs;
  const seconds = step.show_seconds ?? 5;
  const prev = (step.last?.order ?? []) as string[];
  const [phase, setPhase] = useState<'ready' | 'showing' | 'answer'>('ready');
  const [placed, setPlaced] = useState<string[]>([]);
  const timer = useRef<number | null>(null);
  const { busy, shake, send } = useSubmit(props);
  const used = step.attempts_used ?? 0;
  const max = step.max_attempts ?? 3;
  const left = max - used;
  const fb = step.feedback ?? null;

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  const observe = () => {
    setPhase('showing');
    timer.current = window.setTimeout(() => setPhase('answer'), seconds * 1000);
  };

  if (left <= 0)
    return (
      <>
        <Blocked shared={shared} />
        <AttemptDots used={used} max={max} />
      </>
    );

  return (
    <>
      {fb && prev.length > 0 && phase === 'ready' && (
        <div className="kanji-slots kanji-slots--small" aria-label="Ton dernier essai">
          {prev.map((k, i) => (
            <span key={i} className={`kanji-slot is-fixed${mark(fb, i)}`} lang="ja">
              {k}
            </span>
          ))}
        </div>
      )}
      {phase === 'ready' && (
        <div className="memory-ready">
          <p className="muted small">
            La séquence ({sequence.length} {signs ? 'signes' : 'kanjis'}) reste visible {seconds} seconde{seconds > 1 ? 's' : ''}. Tu ne peux l’observer qu’une fois par
            essai.
          </p>
          <button type="button" className="btn btn--red" onClick={observe}>
            Observer la séquence
          </button>
        </div>
      )}
      {phase === 'showing' && (
        <div className="memory-show">
          <div className={`memory-seq${signs ? ' is-signs' : ''}`}>
            {sequence.map((k, i) => (
              <span key={i} className="memory-seq__item" style={{ animationDelay: `${i * 0.12}s` }}>
                <SignTile k={k} signs={signs} />
              </span>
            ))}
          </div>
          <span className="memory-timer" style={{ animationDuration: `${seconds}s` }} />
        </div>
      )}
      {phase === 'answer' && (
        <>
          <div className={`kanji-slots${shake ? ' is-shaking' : ''}`} key={shake} aria-label="Ta séquence">
            {sequence.map((_, i) => (
              <button key={i} type="button" className={`kanji-slot is-hole${placed[i] ? ' is-filled' : ''}`} lang="ja" onClick={() => setPlaced(placed.filter((_, x) => x !== i))} disabled={!placed[i]}>
                {placed[i] ?? i + 1}
              </button>
            ))}
          </div>
          <div className={`kanji-pool${signs ? ' kanji-pool--signs' : ''}`}>
            {palette.map((k) => (
              <button key={k} type="button" className="kanji-pool__item" onClick={() => setPlaced([...placed, k])} disabled={placed.length >= sequence.length}>
                <SignTile k={k} signs={signs} />
              </button>
            ))}
          </div>
          <div className="request__actions">
            <button type="button" className="btn btn--red" disabled={busy || placed.length !== sequence.length} onClick={() => void send({ order: placed })}>
              {busy ? 'Vérification…' : 'Valider la séquence'}
            </button>
            {placed.length > 0 && (
              <button type="button" className="btn btn--ghost" onClick={() => setPlaced([])}>
                Effacer
              </button>
            )}
          </div>
        </>
      )}
      <AttemptDots used={used} max={max} />
    </>
  );
}

// ---------------------------------------------------------------------------
// L'intrus
// ---------------------------------------------------------------------------
export function IntruderStep(props: StepProps) {
  const { step, shared } = props;
  const options = step.options ?? [];
  const [pick, setPick] = useState<number | null>(null);
  const { busy, shake, send } = useSubmit(props);
  const used = step.attempts_used ?? 0;
  const max = step.max_attempts ?? 2;
  const left = max - used;
  return (
    <>
      <div className={`intruder-grid${shake ? ' is-shaking' : ''}`} key={shake}>
        {options.map((o, i) => (
          <button key={i} type="button" className={`intruder-tile${pick === i ? ' is-on' : ''}${[...o].length > 3 ? ' is-long' : ''}`} lang="ja" onClick={() => setPick(i)} disabled={left <= 0} aria-pressed={pick === i}>
            {o}
          </button>
        ))}
      </div>
      {left > 0 ? (
        <button type="button" className="btn btn--red" disabled={busy || pick === null} onClick={() => void send({ picks: [pick] }, () => setPick(null))}>
          {busy ? 'Vérification…' : 'C’est l’intrus'}
        </button>
      ) : (
        <Blocked shared={shared} />
      )}
      <AttemptDots used={used} max={max} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Étapes résolues
// ---------------------------------------------------------------------------
function Formula({ chars, signs }: { chars: string[]; signs?: boolean }) {
  return (
    <div className={`kanji-slots kanji-slots--small${signs ? ' kanji-slots--signs' : ''}`}>
      {chars.map((k, i) => (
        <span key={i} className="kanji-slot is-fixed is-right" lang="ja">
          {k}
          {signs && <small>{signName(k)}</small>}
        </span>
      ))}
    </div>
  );
}

export function SolvedGame({ step }: { step: TramePlayerStep }): ReactNode {
  const turnsOpen = useMemo(() => (step.rings ?? []).map((r, j) => Math.max(0, r.options.indexOf(step.formula?.[j] ?? ''))), [step.rings, step.formula]);
  if (step.kind === 'dial' && step.rings && step.formula)
    return (
      <div className="dial dial--done">
        <DialSeal rings={step.rings.map((r) => r.options)} turns={turnsOpen} open />
      </div>
    );
  if ((step.kind === 'mastermind' || step.kind === 'memory') && step.formula) return <Formula chars={step.formula} signs={step.kind === 'memory' && step.signs} />;
  if (step.kind === 'path' && step.grid && step.path) return <PathGrid grid={step.grid} path={step.path} done />;
  if (step.kind === 'sequence' && step.items) return <SequenceRow items={step.items.some((x) => x.trim() === '?') ? step.items : [...step.items, '?']} fill={step.solution} />;
  if (step.kind === 'intruder' && step.options && step.correct)
    return (
      <div className="intruder-grid intruder-grid--done">
        {step.options.map((o, i) => (
          <span key={i} className={`intruder-tile${step.correct!.includes(i) ? ' is-right' : ''}`} lang="ja">
            {o}
          </span>
        ))}
      </div>
    );
  if (step.kind === 'substitution')
    return (
      <>
        <p className="cipher-text cipher-text--done" lang="ja">
          {step.cipher_text}
        </p>
        {step.solution && <p className="code-decoded">« {step.solution} »</p>}
      </>
    );
  return null;
}
