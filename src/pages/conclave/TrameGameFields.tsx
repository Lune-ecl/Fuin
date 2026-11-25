// Réglages des mini-jeux dans l'éditeur de trame.
import { useState } from 'react';
import type { TrameStepDef } from '../../lib/api';
import { HAND_SIGNS, signName } from '../../lib/trameKinds';
import { buildKey, CODE_POOL, encode, hideSome, plainText } from '../../lib/substitution';
import { DialSeal, PathGrid } from '../../components/TrameGames';
import { Toggle } from '../../components/ui';
import { AttemptsField, RevealField, type Patch } from './TrameStepFields';

type Set = <K extends keyof TrameStepDef>(k: K, v: TrameStepDef[K]) => void;
const setter =
  (patch: Patch): Set =>
  (k, v) =>
    patch({ [k]: v } as Partial<TrameStepDef>);
const kanjiOf = (s: string | undefined) => [...(s ?? '').replace(/\s+/g, '')];
const lines = (s: string) => s.split('\n');

/** Réponses acceptées, une par ligne (communes aux réponses écrites). */
function AnswersField({ step, set, label, placeholder }: { step: TrameStepDef; set: Set; label: string; placeholder: string }) {
  return (
    <label className="field">
      <span>{label} (une par ligne, cachées aux joueurs)</span>
      <textarea rows={3} value={(step.answers ?? []).join('\n')} onChange={(e) => set('answers', lines(e.target.value))} placeholder={placeholder} />
      <small className="muted">Accents, majuscules et ponctuation ignorés. Des mots-clés séparés par « + » doivent tous apparaître.</small>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Verrou à cercles
// ---------------------------------------------------------------------------
const DECOY_POOL = [...'封印結界魂雷縛解門鍵血火水風土光闇影月星天地心命夢刃鎖霊鬼龍陣符札禁呪開閉'];

function randomDecoys(answer: string, n = 3) {
  const pool = DECOY_POOL.filter((k) => k !== answer);
  const out: string[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return out.join('');
}

export function DialFields({ step, patch }: { step: TrameStepDef; patch: Patch }) {
  const set = setter(patch);
  const rings = step.rings ?? [];
  const [formula, setFormula] = useState('');
  const put = (i: number, p: Partial<{ answer: string; decoys: string }>) => set('rings', rings.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const preview = rings.map((r) => [r.answer.trim() || '？', ...kanjiOf(r.decoys).filter((k) => k !== r.answer.trim())]);
  return (
    <>
      <div className="dial-editor">
        <div className="field">
          <span>Cercles, du centre vers le bord (2 à 6)</span>
          <div className="pair-list">
            {rings.map((r, i) => (
              <div key={i} className="pair-row pair-row--dial">
                <small className="muted">{i + 1}</small>
                <input className="cipher-input" lang="ja" value={r.answer} onChange={(e) => put(i, { answer: e.target.value.trim().slice(0, 3) })} placeholder="封" aria-label={`Bon kanji du cercle ${i + 1}`} />
                <input lang="ja" value={r.decoys} onChange={(e) => put(i, { decoys: e.target.value })} placeholder="leurres : 印 結 雷" maxLength={30} aria-label={`Leurres du cercle ${i + 1}`} />
                <button type="button" className="icon-btn" title="Tirer des leurres au hasard" onClick={() => put(i, { decoys: randomDecoys(r.answer.trim()) })}>
                  ⟳
                </button>
                <button type="button" className="icon-btn" onClick={() => set('rings', rings.filter((_, j) => j !== i))} disabled={rings.length <= 2} aria-label="Retirer le cercle">
                  ✕
                </button>
              </div>
            ))}
          </div>
          {rings.length < 6 && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => set('rings', [...rings, { answer: '', decoys: '' }])}>
              + Ajouter un cercle
            </button>
          )}
          <div className="situation-editor__add">
            <input lang="ja" value={formula} onChange={(e) => setFormula(e.target.value)} placeholder="Ou une formule entière : 解 封 開" maxLength={12} aria-label="Formule pour créer les cercles" />
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              disabled={kanjiOf(formula).length < 2}
              onClick={() => {
                set('rings', kanjiOf(formula).slice(0, 6).map((k) => ({ answer: k, decoys: randomDecoys(k) })));
                setFormula('');
              }}
            >
              Créer les cercles
            </button>
          </div>
          <small className="muted">Chaque cercle porte son bon kanji et 1 à 9 leurres. Les joueurs voient les kanjis mélangés et tournent chaque cercle.</small>
        </div>
        <div className="dial-editor__preview">
          <DialSeal rings={preview} turns={preview.map(() => 0)} />
          <small className="muted">Aperçu, bons kanjis sous la marque</small>
        </div>
      </div>
      <div className="step-card__grid">
        <AttemptsField step={step} set={set} fallback={3} />
        <RevealField step={step} set={set} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Résonance du sceau
// ---------------------------------------------------------------------------
export function MastermindFields({ step, patch }: { step: TrameStepDef; patch: Patch }) {
  const set = setter(patch);
  const secret = kanjiOf(step.formula);
  const palette = kanjiOf(step.palette);
  const missing = [...new Set(secret.filter((k) => !palette.includes(k)))];
  const dupes = palette.length !== new Set(palette).size;
  return (
    <>
      <div className="step-card__grid">
        <label className="field">
          <span>Formule secrète (3 à 6 kanjis)</span>
          <input className="cipher-input" lang="ja" value={step.formula ?? ''} onChange={(e) => set('formula', e.target.value)} placeholder="封 印 結" maxLength={20} />
        </label>
        <label className="field">
          <span>Kanjis proposés (3 à 8, tous différents)</span>
          <input className="cipher-input" lang="ja" value={step.palette ?? ''} onChange={(e) => set('palette', e.target.value)} placeholder="封 印 結 界 魂" maxLength={30} />
        </label>
      </div>
      {missing.length > 0 && (
        <p className="field-warning">
          La formule utilise {missing.join(' ')}, absent{missing.length > 1 ? 's' : ''} des kanjis proposés.{' '}
          <button type="button" className="link-btn" onClick={() => set('palette', [...palette, ...missing].join(''))}>
            Les ajouter
          </button>
        </p>
      )}
      {dupes && <p className="field-warning">Un kanji proposé apparaît deux fois.</p>}
      <small className="muted">
        Plus il y a de kanjis proposés et de cases, plus c’est difficile. Comptez 6 essais pour 3 cases parmi 5 kanjis, 10 pour 4 cases parmi 6.
      </small>
      <AttemptsField step={step} set={set} fallback={8} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Flux de chakra
// ---------------------------------------------------------------------------
export function PathFields({ step, patch }: { step: TrameStepDef; patch: Patch }) {
  const set = setter(patch);
  const grid = (step.grid ?? []).map(kanjiOf);
  const cols = grid[0]?.length ?? 0;
  const even = grid.length >= 2 && cols >= 2 && grid.every((r) => r.length === cols);
  const path = (step.path ?? []).filter((i) => i < grid.length * cols);
  const flat = grid.flat();
  const click = (i: number) => {
    if (path[path.length - 1] === i) return set('path', path.slice(0, -1));
    if (path.includes(i)) return;
    const last = path[path.length - 1];
    if (last !== undefined && Math.abs(Math.floor(i / cols) - Math.floor(last / cols)) + Math.abs((i % cols) - (last % cols)) !== 1) return;
    set('path', [...path, i]);
  };
  return (
    <>
      <div className="dial-editor">
        <label className="field">
          <span>Grille : une ligne par rangée (2 à 6 rangées de 2 à 6 kanjis)</span>
          <textarea
            className="cipher-input"
            lang="ja"
            rows={4}
            value={(step.grid ?? []).join('\n')}
            onChange={(e) => patch({ grid: lines(e.target.value).slice(0, 6), path: [] })}
            placeholder={'封印魂\n雷結火\n水界風'}
          />
          <small className="muted">Changer la grille efface le tracé. Mets des kanjis leurres autour du chemin pour brouiller les pistes.</small>
        </label>
        {even ? (
          <div className="dial-editor__preview dial-editor__preview--grid">
            <PathGrid grid={grid} path={path} onCell={click} />
            <small className="muted">Touche les cases dans l’ordre du flux (la dernière pour revenir en arrière)</small>
          </div>
        ) : (
          <p className="muted small">Toutes les rangées doivent avoir le même nombre de kanjis.</p>
        )}
      </div>
      {even && (
        <p className="chakra-trace">
          <span className="muted small">Formule du flux :</span> <b lang="ja">{path.map((i) => flat[i]).join(' ') || '…'}</b>
          {path.length > 0 && (
            <button type="button" className="link-btn" onClick={() => set('path', [])}>
              Effacer le tracé
            </button>
          )}
        </p>
      )}
      <div className="step-card__grid">
        <Toggle
          checked={step.show_start ?? true}
          onChange={(v) => set('show_start', v)}
          label="Montrer la case de départ"
          hint={step.show_start ?? true ? 'La première case brille pour les joueurs' : 'Les joueurs cherchent aussi le point de départ'}
        />
        <AttemptsField step={step} set={set} fallback={3} />
        <RevealField step={step} set={set} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Suite logique
// ---------------------------------------------------------------------------
export function SequenceFields({ step, patch }: { step: TrameStepDef; patch: Patch }) {
  const set = setter(patch);
  const items = step.items ?? [];
  const put = (i: number, v: string) => set('items', items.map((x, j) => (j === i ? v : x)));
  return (
    <>
      <div className="field">
        <span>Éléments de la suite (2 à 12) : « ? » marque la case à trouver</span>
        <div className="sequence-editor">
          {items.map((x, i) => (
            <span key={i} className={`sequence-editor__item${x.trim() === '?' ? ' is-hole' : ''}`}>
              <input lang="ja" value={x} onChange={(e) => put(i, e.target.value)} maxLength={40} aria-label={`Élément ${i + 1}`} />
              <button type="button" className="icon-btn" onClick={() => set('items', items.filter((_, j) => j !== i))} disabled={items.length <= 2} aria-label="Retirer">
                ✕
              </button>
            </span>
          ))}
          {items.length < 12 && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => set('items', [...items, ''])}>
              +
            </button>
          )}
        </div>
        <small className="muted">Sans « ? », la case à trouver s’ajoute à la fin de la suite.</small>
      </div>
      <AnswersField step={step} set={set} label="Réponses acceptées" placeholder={'四\nquatre'} />
      <label className="field">
        <span>Propositions à toucher (facultatif, séparées par des virgules)</span>
        <input
          value={(step.options ?? []).join(', ')}
          onChange={(e) =>
            set(
              'options',
              e.target.value
                .split(',')
                .map((o) => o.trim())
                .filter(Boolean)
                .slice(0, 8),
            )
          }
          placeholder="四, 五, 王, 十"
        />
        <small className="muted">Les joueurs peuvent aussi écrire leur réponse eux-mêmes.</small>
      </label>
      <AttemptsField step={step} set={set} fallback={2} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Mémoire du sceau
// ---------------------------------------------------------------------------
export function MemoryFields({ step, patch }: { step: TrameStepDef; patch: Patch }) {
  const set = setter(patch);
  const signs = !!step.signs;
  const seq = kanjiOf(step.formula);
  const bad = signs ? seq.filter((k) => !HAND_SIGNS.some((s) => s.k === k)) : [];
  return (
    <>
      <div className="segmented segmented--small" role="radiogroup" aria-label="Type de séquence">
        <button type="button" role="radio" aria-checked={!signs} className={!signs ? 'is-on' : ''} onClick={() => set('signs', false)}>
          Kanjis
        </button>
        <button type="button" role="radio" aria-checked={signs} className={signs ? 'is-on' : ''} onClick={() => patch({ signs: true, decoys: '' })}>
          Signes des mains
        </button>
      </div>
      <label className="field">
        <span>Séquence à retenir (3 à 12)</span>
        <input className="cipher-input" lang="ja" value={step.formula ?? ''} onChange={(e) => set('formula', e.target.value)} placeholder={signs ? '寅 巳 申 亥' : '封 魂 雷 縛'} maxLength={40} />
      </label>
      {signs && (
        <div className="field">
          <span>Ajouter un signe</span>
          <div className="kanji-pool kanji-pool--signs">
            {HAND_SIGNS.map((s) => (
              <button key={s.k} type="button" className="kanji-pool__item" onClick={() => set('formula', (step.formula ?? '') + s.k)} disabled={seq.length >= 12}>
                <span lang="ja">{s.k}</span>
                <small>{s.name}</small>
              </button>
            ))}
            <button type="button" className="kanji-pool__item" onClick={() => set('formula', seq.slice(0, -1).join(''))} disabled={!seq.length} aria-label="Retirer le dernier signe">
              ⌫
            </button>
          </div>
          {seq.length > 0 && <small className="muted">{seq.map(signName).join(' → ')}</small>}
          {bad.length > 0 && <p className="field-warning">{bad.join(' ')} : pas un des douze signes.</p>}
        </div>
      )}
      {!signs && (
        <label className="field">
          <span>Kanjis leurres (facultatif)</span>
          <input className="cipher-input" lang="ja" value={step.decoys ?? ''} onChange={(e) => set('decoys', e.target.value)} placeholder="印 界 火" maxLength={30} />
          <small className="muted">Mélangés aux kanjis de la séquence au moment de la reproduire. En mode signes, les douze signes sont toujours proposés.</small>
        </label>
      )}
      <div className="step-card__grid">
        <label className="field field--narrow">
          <span>Secondes d’affichage</span>
          <input type="number" min={2} max={30} value={step.show_seconds ?? 5} onChange={(e) => set('show_seconds', Math.min(30, Math.max(2, Number(e.target.value) || 5)))} />
          <small className="muted">Une observation par essai</small>
        </label>
        <AttemptsField step={step} set={set} fallback={3} />
        <RevealField step={step} set={set} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// L'intrus
// ---------------------------------------------------------------------------
export function IntruderFields({ step, patch }: { step: TrameStepDef; patch: Patch }) {
  const set = setter(patch);
  const options = step.options ?? [];
  const intrus = step.correct?.[0];
  const remove = (i: number) =>
    patch({ options: options.filter((_, j) => j !== i), correct: intrus === undefined || intrus === i ? [] : [intrus > i ? intrus - 1 : intrus] });
  return (
    <>
      <div className="field">
        <span>Éléments (3 à 9) : coche l’intrus</span>
        <div className="pair-list">
          {options.map((o, i) => (
            <div key={i} className="pair-row pair-row--choice">
              <button type="button" className={`choice__box is-round${intrus === i ? ' is-on' : ''}`} onClick={() => set('correct', [i])} aria-label={intrus === i ? 'Intrus' : 'Désigner comme intrus'} aria-pressed={intrus === i}>
                {intrus === i ? '✓' : ''}
              </button>
              <input lang="ja" value={o} onChange={(e) => set('options', options.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`Élément ${i + 1}`} maxLength={60} />
              <button type="button" className="icon-btn" onClick={() => remove(i)} disabled={options.length <= 3} aria-label="Retirer">
                ✕
              </button>
            </div>
          ))}
        </div>
        {options.length < 9 && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => set('options', [...options, ''])}>
            + Ajouter un élément
          </button>
        )}
        <small className="muted">Explique la règle commune dans le texte révélé quand l’étape est résolue.</small>
      </div>
      <AttemptsField step={step} set={set} fallback={2} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Code du Conclave
// ---------------------------------------------------------------------------
export function SubstitutionFields({ step, patch }: { step: TrameStepDef; patch: Patch }) {
  const set = setter(patch);
  const message = step.answers?.[0] ?? '';
  const extra = (step.answers ?? []).slice(1);
  const key = step.key ?? [];
  const rebuild = (msg: string, reshuffle = false) => {
    const k = buildKey(msg, key, reshuffle);
    patch({ answers: [msg, ...extra], key: k, cipher_text: encode(msg, k) });
  };
  return (
    <>
      <label className="field">
        <span>Message en clair</span>
        <input value={message} onChange={(e) => rebuild(e.target.value)} placeholder="Le sceau cède à minuit" maxLength={200} />
        <small className="muted">
          Les lettres deviennent des kanjis ({CODE_POOL.length} kanjis du fuin), les accents disparaissent : « {plainText(message) || '…'} ».
        </small>
      </label>
      {key.length > 0 && (
        <>
          <p className="cipher-text cipher-text--code" lang="ja">
            {step.cipher_text}
          </p>
          <div className="field">
            <span>Table de chiffrement : touche une lettre pour la cacher aux joueurs</span>
            <div className="code-key code-key--editor">
              {key.map((e) => (
                <button
                  key={e.l}
                  type="button"
                  className={`code-key__cell${e.hidden ? ' is-hidden' : ''}`}
                  onClick={() => set('key', key.map((x) => (x.l === e.l ? { ...x, hidden: !x.hidden } : x)))}
                  aria-pressed={!!e.hidden}
                >
                  <b lang="ja">{e.k}</b>
                  <span>{e.hidden ? `(${e.l})` : e.l}</span>
                </button>
              ))}
            </div>
            <small className="muted">
              {key.filter((e) => e.hidden).length} lettre(s) cachée(s) : les joueurs devront les deviner d’après les mots.
            </small>
            <div className="request__actions">
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => rebuild(message, true)}>
                Mélanger les kanjis
              </button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => set('key', hideSome(key))}>
                Cacher quelques lettres au hasard
              </button>
            </div>
          </div>
        </>
      )}
      <label className="field">
        <span>Autres réponses acceptées (une par ligne)</span>
        <textarea rows={2} value={extra.join('\n')} onChange={(e) => set('answers', [message, ...lines(e.target.value)])} placeholder="sceau + minuit" />
      </label>
      <AttemptsField step={step} set={set} fallback={2} />
    </>
  );
}
