import { useMemo, useState } from 'react';
import type { AdminPageRow, RollTable, TrameStepDef } from '../../lib/api';
import { circleLabel } from '../../lib/format';
import { RankPicker, Toggle } from '../../components/ui';

type Set = <K extends keyof TrameStepDef>(k: K, v: TrameStepDef[K]) => void;
/** plusieurs champs d'un coup (sinon le second changement effacerait le premier) */
export type Patch = (p: Partial<TrameStepDef>) => void;
const setter =
  (patch: Patch): Set =>
  (k, v) =>
    patch({ [k]: v } as Partial<TrameStepDef>);

const kanjiOf = (s: string | undefined) => [...(s ?? '').replace(/\s+/g, '')];

/** Essais par joueur : propres à l'étape, jamais retirés par les autres étapes. */
export function AttemptsField({ step, set, fallback, max = 20 }: { step: TrameStepDef; set: Set; fallback: number; max?: number }) {
  return (
    <label className="field field--narrow">
      <span>Essais par joueur</span>
      <input
        type="number"
        min={1}
        max={max}
        value={step.max_attempts ?? fallback}
        onChange={(e) => set('max_attempts', Math.min(max, Math.max(1, Number(e.target.value) || fallback)))}
      />
      <small className="muted">Pour cette étape seulement</small>
    </label>
  );
}

export function RevealField({ step, set }: { step: TrameStepDef; set: Set }) {
  return (
    <Toggle
      checked={step.reveal ?? true}
      onChange={(v) => set('reveal', v)}
      label="Montrer les bonnes cases après un essai raté"
      hint={step.reveal ?? true ? 'Le joueur voit ce qu’il a juste et ce qu’il doit corriger' : 'Le joueur sait seulement que c’est faux'}
    />
  );
}

// ---------------------------------------------------------------------------
// Désenclavement
// ---------------------------------------------------------------------------
export function UnsealFields({ step, patch, index, tables }: { step: TrameStepDef; patch: Patch; index: number; tables: RollTable[] }) {
  const set = setter(patch);
  const fixed = step.attempts_mode === 'fixed';
  const locks = step.locks ?? step.seal_circle ?? 3;
  return (
    <div className="step-card__grid">
      <label className="field field--narrow">
        <span>Cercles à désenclaver</span>
        <input type="number" min={1} max={10} value={locks} onChange={(e) => set('locks', Math.min(10, Math.max(1, Number(e.target.value) || 1)))} />
        <small className="muted">Verrous à briser (1 à 10)</small>
      </label>
      <div className="field">
        <span>Cercle minimum pour tenter</span>
        <RankPicker value={step.min_rank ?? 1} onChange={(r) => set('min_rank', r)} name={`min-${index}`} />
      </div>
      <div className="field">
        <span>Essais par joueur</span>
        <div className="segmented segmented--small" role="radiogroup" aria-label="Essais du désenclavement">
          <button type="button" role="radio" aria-checked={!fixed} className={!fixed ? 'is-on' : ''} onClick={() => set('attempts_mode', 'rank')}>
            Selon son cercle
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={fixed}
            className={fixed ? 'is-on' : ''}
            onClick={() => patch({ attempts_mode: 'fixed', max_attempts: step.max_attempts ?? 5 })}
          >
            Nombre fixe
          </button>
        </div>
        {fixed && (
          <input
            className="input-inline"
            type="number"
            min={1}
            max={30}
            value={step.max_attempts ?? 5}
            onChange={(e) => set('max_attempts', Math.min(30, Math.max(1, Number(e.target.value) || 5)))}
            aria-label="Nombre d’essais"
          />
        )}
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
        {locks} verrou{locks > 1 ? 's' : ''} à briser, à partir du {circleLabel(step.min_rank ?? 1)} ·{' '}
        {fixed ? `${step.max_attempts ?? 5} essai${(step.max_attempts ?? 5) > 1 ? 's' : ''} par joueur` : 'autant d’essais que son cercle'}. Une réussite critique
        brise deux verrous. Ces essais ne comptent que pour ce sceau.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Kanjis manquants
// ---------------------------------------------------------------------------
export function MissingFields({ step, patch }: { step: TrameStepDef; patch: Patch }) {
  const set = setter(patch);
  const chars = kanjiOf(step.formula);
  const missing = (step.missing ?? []).filter((i) => i < chars.length);
  const toggle = (i: number) => set('missing', missing.includes(i) ? missing.filter((x) => x !== i) : [...missing, i].sort((a, b) => a - b));
  return (
    <>
      <label className="field">
        <span>Formule complète du sceau</span>
        <input
          className="cipher-input"
          lang="ja"
          value={step.formula ?? ''}
          onChange={(e) => {
            const n = kanjiOf(e.target.value).length;
            patch({ formula: e.target.value, missing: missing.filter((i) => i < n) });
          }}
          placeholder="封 印 結 界"
          maxLength={40}
        />
      </label>
      {chars.length > 0 && (
        <div className="field">
          <span>Clique sur les kanjis à faire disparaître</span>
          <div className="kanji-slots kanji-slots--editor">
            {chars.map((c, i) => (
              <button key={i} type="button" className={`kanji-slot${missing.includes(i) ? ' is-hole is-picked' : ' is-fixed'}`} lang="ja" onClick={() => toggle(i)} title={missing.includes(i) ? 'Remettre ce kanji' : 'Cacher ce kanji'}>
                {missing.includes(i) ? '？' : c}
              </button>
            ))}
          </div>
          <small className="muted">
            {missing.length
              ? `Les joueurs voient : ${chars.map((c, i) => (missing.includes(i) ? '？' : c)).join(' ')} · réponse : ${missing.map((i) => chars[i]).join(' ')}`
              : 'Aucun kanji caché pour l’instant.'}
          </small>
        </div>
      )}
      <label className="field">
        <span>Kanjis leurres (facultatif)</span>
        <input className="cipher-input" lang="ja" value={step.decoys ?? ''} onChange={(e) => set('decoys', e.target.value)} placeholder="火 水 禁" maxLength={40} />
        <small className="muted">
          Avec des leurres, les joueurs choisissent parmi une réserve (les bons kanjis mélangés aux leurres). Sans leurre, ils écrivent les kanjis eux-mêmes.
        </small>
      </label>
      <div className="step-card__grid">
        <AttemptsField step={step} set={set} fallback={3} />
        <RevealField step={step} set={set} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Ordre des kanjis
// ---------------------------------------------------------------------------
export function OrderFields({ step, patch }: { step: TrameStepDef; patch: Patch }) {
  const set = setter(patch);
  return (
    <>
      <label className="field">
        <span>Formule dans le bon ordre</span>
        <input className="cipher-input" lang="ja" value={step.formula ?? ''} onChange={(e) => set('formula', e.target.value)} placeholder="封 印 結 界" maxLength={40} />
        <small className="muted">Les joueurs reçoivent ces kanjis mélangés et doivent les remettre dans l’ordre de tracé.</small>
      </label>
      <div className="step-card__grid">
        <AttemptsField step={step} set={set} fallback={3} />
        <RevealField step={step} set={set} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Associations
// ---------------------------------------------------------------------------
export function MatchFields({ step, patch }: { step: TrameStepDef; patch: Patch }) {
  const set = setter(patch);
  const pairs = step.pairs ?? [];
  const put = (i: number, side: 'left' | 'right', v: string) => set('pairs', pairs.map((p, j) => (j === i ? { ...p, [side]: v } : p)));
  return (
    <>
      <div className="field">
        <span>Paires à associer (de 2 à 8)</span>
        <div className="pair-list">
          {pairs.map((p, i) => (
            <div key={i} className="pair-row">
              <input lang="ja" value={p.left} onChange={(e) => put(i, 'left', e.target.value)} placeholder="封" maxLength={60} aria-label={`Élément ${i + 1}`} />
              <i aria-hidden="true">↔</i>
              <input value={p.right} onChange={(e) => put(i, 'right', e.target.value)} placeholder="sceller" maxLength={80} aria-label={`Correspondance ${i + 1}`} />
              <button type="button" className="icon-btn" onClick={() => set('pairs', pairs.filter((_, j) => j !== i))} disabled={pairs.length <= 2} aria-label="Retirer la paire">
                ✕
              </button>
            </div>
          ))}
        </div>
        {pairs.length < 8 && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => set('pairs', [...pairs, { left: '', right: '' }])}>
            + Ajouter une paire
          </button>
        )}
        <small className="muted">Les joueurs voient la colonne de gauche dans l’ordre et doivent retrouver la bonne correspondance de chaque élément.</small>
      </div>
      <div className="step-card__grid">
        <AttemptsField step={step} set={set} fallback={3} />
        <RevealField step={step} set={set} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Question à choix
// ---------------------------------------------------------------------------
export function ChoiceFields({ step, patch }: { step: TrameStepDef; patch: Patch }) {
  const set = setter(patch);
  const options = step.options ?? [];
  const correct = step.correct ?? [];
  const remove = (i: number) =>
    patch({ options: options.filter((_, j) => j !== i), correct: correct.filter((c) => c !== i).map((c) => (c > i ? c - 1 : c)) });
  return (
    <>
      <div className="field">
        <span>Réponses possibles (coche les bonnes)</span>
        <div className="pair-list">
          {options.map((o, i) => (
            <div key={i} className="pair-row pair-row--choice">
              <button
                type="button"
                className={`choice__box${correct.includes(i) ? ' is-on' : ''}`}
                onClick={() => set('correct', correct.includes(i) ? correct.filter((c) => c !== i) : [...correct, i].sort((a, b) => a - b))}
                aria-label={correct.includes(i) ? 'Bonne réponse' : 'Mauvaise réponse'}
                aria-pressed={correct.includes(i)}
              >
                {correct.includes(i) ? '✓' : ''}
              </button>
              <input value={o} onChange={(e) => set('options', options.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`Réponse ${i + 1}`} maxLength={200} />
              <button type="button" className="icon-btn" onClick={() => remove(i)} disabled={options.length <= 2} aria-label="Retirer la réponse">
                ✕
              </button>
            </div>
          ))}
        </div>
        {options.length < 8 && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => set('options', [...options, ''])}>
            + Ajouter une réponse
          </button>
        )}
        <small className="muted">
          {correct.length > 1 ? 'Plusieurs bonnes réponses : les joueurs doivent toutes les cocher.' : 'Une seule bonne réponse : les joueurs en choisissent une.'}
        </small>
      </div>
      <AttemptsField step={step} set={set} fallback={2} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Mise en situation
// ---------------------------------------------------------------------------
function SealSelect({ seals, value, onChange, placeholder }: { seals: AdminPageRow[]; value: number | ''; onChange: (id: number) => void; placeholder: string }) {
  const groups = useMemo(() => {
    const m = new Map<string, AdminPageRow[]>();
    seals.forEach((s) => m.set(s.category_name, [...(m.get(s.category_name) ?? []), s]));
    return [...m.entries()];
  }, [seals]);
  return (
    <select value={value} onChange={(e) => onChange(Number(e.target.value))}>
      <option value="">{placeholder}</option>
      {groups.map(([cat, list]) => (
        <optgroup key={cat} label={cat}>
          {list.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
              {s.kanji ? ` · ${s.kanji.replace(/\s+/g, '')}` : ''}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

export function SituationFields({ step, patch, seals }: { step: TrameStepDef; patch: Patch; seals: AdminPageRow[] }) {
  const set = setter(patch);
  const sits = step.situations ?? [];
  const choices = step.choices ?? [];
  const [adding, setAdding] = useState<number | ''>('');
  const title = (id: number) => seals.find((s) => s.id === id)?.title ?? `Fiche ${id}`;
  const put = (i: number, p: Partial<{ text: string; answers: number[] }>) => set('situations', sits.map((x, j) => (j === i ? { ...x, ...p } : x)));
  return (
    <>
      <div className="field">
        <span>Mises en situation (de 1 à 8)</span>
        <ol className="situation-editor">
          {sits.map((x, i) => (
            <li key={i}>
              <textarea rows={3} value={x.text} onChange={(e) => put(i, { text: e.target.value })} placeholder="Un convoi doit traverser une forêt sans être repéré…" maxLength={2000} />
              <div className="situation-editor__answer">
                <small className="muted">Bon sceau :</small>
                <SealSelect
                  seals={seals}
                  value={x.answers[0] ?? ''}
                  onChange={(id) =>
                    // un bon sceau fait toujours partie des sceaux proposés
                    patch({
                      situations: sits.map((y, j) => (j === i ? { ...y, answers: id ? [id] : [] } : y)),
                      ...(id && choices.length && !choices.includes(id) ? { choices: [...choices, id] } : {}),
                    })
                  }
                  placeholder="Choisir le sceau attendu…"
                />
                <button type="button" className="icon-btn" onClick={() => set('situations', sits.filter((_, j) => j !== i))} disabled={sits.length <= 1} aria-label="Retirer la situation">
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ol>
        {sits.length < 8 && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => set('situations', [...sits, { text: '', answers: [] }])}>
            + Ajouter une situation
          </button>
        )}
      </div>
      <div className="field">
        <span>Sceaux proposés aux joueurs</span>
        {choices.length ? (
          <div className="member-picker__chosen">
            {choices.map((id) => (
              <button key={id} type="button" className="chip is-on" onClick={() => set('choices', choices.filter((c) => c !== id))} title="Retirer">
                {title(id)} <span aria-hidden="true">✕</span>
              </button>
            ))}
          </div>
        ) : (
          <small className="muted">Aucun choix imposé : les joueurs choisissent parmi tous les sceaux de leur cercle.</small>
        )}
        <div className="situation-editor__add">
          <SealSelect seals={seals.filter((s) => !choices.includes(s.id))} value={adding} onChange={(id) => setAdding(id || '')} placeholder="Ajouter un sceau à la liste…" />
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={!adding}
            onClick={() => {
              if (!adding) return;
              const answers = sits.flatMap((x) => x.answers);
              set('choices', [...new Set([...choices, ...answers, adding])]);
              setAdding('');
            }}
          >
            Ajouter
          </button>
        </div>
        <small className="muted">Mets quelques leurres pour corser l’épreuve. Les bons sceaux sont ajoutés d’office à la liste.</small>
      </div>
      <div className="step-card__grid">
        <AttemptsField step={step} set={set} fallback={3} />
        <RevealField step={step} set={set} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Réponse validée par le Conclave
// ---------------------------------------------------------------------------
export function ReviewFields({ step, patch }: { step: TrameStepDef; patch: Patch }) {
  const set = setter(patch);
  return (
    <>
      <p className="muted small">
        Le joueur écrit une réponse libre (sa façon de poser le sceau, sa stratégie, une réplique RP…). Elle arrive dans l’onglet « Suivi en direct », où le
        Conclave la valide ou la refuse avec un commentaire. Un refus compte comme un essai.
      </p>
      <AttemptsField step={step} set={set} fallback={3} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Rolls d'étude : sens des kanjis et indices
// ---------------------------------------------------------------------------
export function StudyFields({ step, patch, tables }: { step: TrameStepDef; patch: Patch; tables: RollTable[] }) {
  const set = setter(patch);
  const rolls = step.study_rolls ?? 0;
  const chars = step.kind === 'cipher' ? kanjiOf(step.cipher_text) : step.kind === 'missing' ? kanjiOf(step.formula) : [];
  const meanings = step.meanings ?? [];
  const hidden = step.kind === 'missing' ? step.missing ?? [] : [];
  return (
    <details className="study-editor" open={rolls > 0}>
      <summary>
        <span aria-hidden="true">読</span> Rolls d’étude <small>{rolls ? `${rolls} par joueur` : 'désactivés'}</small>
      </summary>
      <p className="muted small">
        Le joueur lance un roll (table de déchiffrement par défaut) pour comprendre le sens d’un kanji ou découvrir un indice. Une réussite révèle le sens choisi,
        une réussite critique donne en plus l’indice suivant. Ces rolls ne retirent aucun essai de réponse.
      </p>
      <div className="step-card__grid">
        <label className="field field--narrow">
          <span>Rolls d’étude par joueur</span>
          <input type="number" min={0} max={10} value={rolls} onChange={(e) => set('study_rolls', Math.min(10, Math.max(0, Number(e.target.value) || 0)))} />
          <small className="muted">0 : pas de roll d’étude</small>
        </label>
        <label className="field">
          <span>Table de roll</span>
          <select value={step.study_table ?? 'dechiffrement'} onChange={(e) => set('study_table', e.target.value)}>
            {tables.map((t) => (
              <option key={t.slug} value={t.slug}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {chars.length > 0 && (
        <div className="field">
          <span>Sens de chaque kanji (laisse vide un kanji qu’on ne peut pas étudier)</span>
          <div className="meaning-list">
            {chars.map((ch, i) => (
              <label key={i} className={`meaning-row${hidden.includes(i) ? ' is-hidden' : ''}`}>
                <b lang="ja">{ch}</b>
                <input
                  value={meanings[i] ?? ''}
                  onChange={(e) => {
                    const next = chars.map((_, j) => (j === i ? e.target.value : meanings[j] ?? ''));
                    set('meanings', next);
                  }}
                  placeholder={hidden.includes(i) ? 'sens du kanji manquant (gros indice)' : 'sens'}
                  maxLength={200}
                />
              </label>
            ))}
          </div>
        </div>
      )}
      <label className="field">
        <span>Indices (un par ligne, révélés dans l’ordre)</span>
        <textarea rows={3} value={(step.hints ?? []).join('\n')} onChange={(e) => set('hints', e.target.value.split('\n'))} placeholder={'Le premier kanji manquant évoque ce que l’on enferme.\nLe second trace une limite.'} />
      </label>
    </details>
  );
}
