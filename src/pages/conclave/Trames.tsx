import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { api, type CodexPage, type RollTable, type RollTier, type TrameRow, type TrameStatus } from '../../lib/api';
import { useSession } from '../../lib/session';
import { circleLabel, formatDate, slugify } from '../../lib/format';
import { coverage, d100, effectiveRoll, isSuccess, ranges, tierFor, TONES } from '../../lib/rolls';
import { copyToClipboard, Empty, ErrorState, Loader, useConfirm, useToast } from '../../components/ui';

type Tab = 'liste' | 'tables' | 'dechiffreur';
const CJK = /[㐀-鿿豈-﫿]/g;

export function useRollTables() {
  const [tables, setTables] = useState<RollTable[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError(null);
    try {
      setTables(await api.rollTables());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return { tables, error, load };
}

function TableSelect({ tables, value, onChange }: { tables: RollTable[]; value: string; onChange: (slug: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Table de roll">
      {tables.map((t) => (
        <option key={t.slug} value={t.slug}>
          {t.name}
        </option>
      ))}
    </select>
  );
}

function ToneChip({ tier }: { tier: RollTier | null }) {
  if (!tier) return <span className="tone tone--neutral">Hors table</span>;
  return <span className={`tone tone--${tier.tone}`}>{tier.label}</span>;
}

function CopyButton({ text, label = 'Copier le résumé' }: { text: string; label?: string }) {
  const toast = useToast();
  return (
    <button
      type="button"
      className="btn btn--ghost btn--sm"
      onClick={async () => {
        if (await copyToClipboard(text)) toast('Résumé copié');
      }}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Déchiffrement
// ---------------------------------------------------------------------------
interface DictEntry {
  text: string;
  reading: string;
  meaning: string;
  slug: string;
  title: string;
}

function buildDictionary(codex: CodexPage[]) {
  const chars = new Map<string, DictEntry>();
  const words = new Map<string, DictEntry>();
  const usedIn = new Map<string, { slug: string; title: string }[]>();
  const single = /\*\*([㐀-鿿豈-﫿])\*\*\s*\*\(([^)]+)\)\*\s*[—–-]+\s*([^\n]+)/g;
  const multi = /\*\*([㐀-鿿豈-﫿]{2,6})\*\*\s*\*\(([^)]+)\)\*\s*[—–-]+\s*([^\n]+)/g;
  codex.forEach((p) => {
    for (const m of p.content_md.matchAll(single)) {
      if (!chars.has(m[1])) chars.set(m[1], { text: m[1], reading: m[2].trim(), meaning: m[3].replace(/[\s:]+$/, '').trim(), slug: p.slug, title: p.title });
    }
    for (const m of p.content_md.matchAll(multi)) {
      if (!words.has(m[1])) words.set(m[1], { text: m[1], reading: m[2].trim(), meaning: m[3].replace(/[\s:]+$/, '').trim(), slug: p.slug, title: p.title });
    }
    if (p.kind === 'seal' && p.kanji) {
      new Set(p.kanji.match(CJK) ?? []).forEach((k) => usedIn.set(k, [...(usedIn.get(k) ?? []), { slug: p.slug, title: p.title }]));
    }
  });
  return { chars, words, usedIn };
}

function Decipher({ tables }: { tables: RollTable[] }) {
  const [codex, setCodex] = useState<CodexPage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [tableSlug, setTableSlug] = useState(tables.find((t) => t.slug === 'dechiffrement')?.slug ?? tables[0]?.slug ?? '');
  const [modifier, setModifier] = useState(0);
  const [rolls, setRolls] = useState<{ kanji: string; natural: number }[] | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setCodex(await api.codex());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const dict = useMemo(() => (codex ? buildDictionary(codex) : null), [codex]);
  const sequence = input.match(CJK) ?? [];
  const unique = [...new Set(sequence)];
  const flat = sequence.join('');
  const table = tables.find((t) => t.slug === tableSlug);

  const words = useMemo(() => (dict ? [...dict.words.values()].filter((w) => flat.includes(w.text)) : []), [dict, flat]);
  const uniqueKey = unique.join('');
  const matches = useMemo(() => {
    if (!codex || !uniqueKey) return [];
    const input = new Set([...uniqueKey]);
    return codex
      .filter((p) => p.kind === 'seal' && p.kanji)
      .map((p) => {
        const f = [...new Set(p.kanji!.match(CJK) ?? [])];
        const hit = f.filter((k) => input.has(k));
        return { page: p, formula: f, hit, score: f.length ? hit.length / f.length : 0 };
      })
      .filter((m) => m.hit.length > 0)
      .sort((a, b) => b.score - a.score || b.hit.length - a.hit.length)
      .slice(0, 8);
  }, [codex, uniqueKey]);

  if (error) return <ErrorState text={error} onRetry={load} />;
  if (!dict) return <Loader label="Ouverture des archives…" />;

  const meaningOf = (k: string) => dict.chars.get(k)?.meaning;
  const falseMeaning = (k: string) => {
    const others = [...dict.chars.values()].filter((e) => e.text !== k);
    return others.length ? others[Math.floor(Math.random() * others.length)].meaning : 'sens erroné';
  };
  const rolled = rolls?.map((r) => {
    const tier = tierFor(table, r.natural, modifier);
    let reading = '';
    if (tier?.tone === 'crit-fail') reading = `lu à tort comme « ${falseMeaning(r.kanji)} »`;
    else if (isSuccess(tier?.tone)) reading = meaningOf(r.kanji) ? `« ${meaningOf(r.kanji)} »` : 'compris, mais absent des archives';
    else reading = 'illisible';
    return { ...r, tier, reading };
  });
  const summary = rolled
    ? `Déchiffrement de « ${flat} »${modifier ? ` (modificateur ${modifier > 0 ? '+' : ''}${modifier})` : ''}\n` +
      rolled.map((r) => `${r.kanji} : roll ${r.natural} · ${r.tier?.label ?? '?'} · ${r.reading}`).join('\n')
    : '';

  return (
    <>
      <section className="panel">
        <h2 className="panel__title">Inscription à déchiffrer</h2>
        <p className="muted small">
          Colle les kanjis d’un sceau ou d’un texte. Le sens vient des {dict.chars.size} kanjis expliqués dans les fiches du Conclave.
        </p>
        <textarea
          className="decipher__input"
          lang="ja"
          rows={2}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setRolls(null);
          }}
          placeholder="黙 封 口 秘"
        />
      </section>

      {unique.length > 0 && (
        <>
          <section className="panel">
            <h2 className="panel__title">Lecture kanji par kanji</h2>
            <div className="kanji-grid">
              {unique.map((k) => {
                const e = dict.chars.get(k);
                const used = dict.usedIn.get(k) ?? [];
                return (
                  <div key={k} className={`kanji-card${e ? '' : ' is-unknown'}`}>
                    <span className="kanji-card__char" lang="ja">
                      {k}
                    </span>
                    {e ? (
                      <>
                        <em>{e.reading}</em>
                        <p>{e.meaning}</p>
                        <Link to={'/' + e.slug}>{e.title}</Link>
                      </>
                    ) : (
                      <>
                        <p className="muted">Absent des archives</p>
                        {used.length > 0 && <small>Présent dans : {used.map((u) => u.title).join(', ')}</small>}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            {words.length > 0 && (
              <div className="words">
                <p className="kicker">Mots composés reconnus</p>
                {words.map((w) => (
                  <p key={w.text}>
                    <b lang="ja">{w.text}</b> <em>({w.reading})</em> · {w.meaning} · <Link to={'/' + w.slug}>{w.title}</Link>
                  </p>
                ))}
              </div>
            )}
          </section>

          <section className="panel">
            <h2 className="panel__title">Sceaux correspondants</h2>
            {matches.length === 0 ? (
              <Empty glyph="無">Aucun sceau des archives n’utilise ces kanjis.</Empty>
            ) : (
              <ul className="match-list">
                {matches.map((m) => (
                  <li key={m.page.slug} className="match">
                    <div className="match__head">
                      <Link to={'/' + m.page.slug}>{m.page.title}</Link>
                      <small>{m.page.category}</small>
                      {m.score === 1 && <span className="tone tone--crit-success">Formule complète</span>}
                      <b>{Math.round(m.score * 100)} %</b>
                    </div>
                    <span className="gauge">
                      <i style={{ width: `${m.score * 100}%` }} />
                    </span>
                    <p className="match__formula" lang="ja">
                      {m.formula.map((k) => (
                        <span key={k} className={m.hit.includes(k) ? 'is-hit' : ''}>
                          {k}
                        </span>
                      ))}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel">
            <h2 className="panel__title">Simuler un déchiffrement</h2>
            <p className="muted small">Un roll par kanji, lu dans la table choisie. Les 1 et 100 naturels restent critiques.</p>
            <div className="tool-row">
              <label className="field">
                <span>Table</span>
                <TableSelect tables={tables} value={tableSlug} onChange={setTableSlug} />
              </label>
              <label className="field field--narrow">
                <span>Modificateur</span>
                <input type="number" value={modifier} onChange={(e) => setModifier(Number(e.target.value) || 0)} />
              </label>
              <button type="button" className="btn btn--red" onClick={() => setRolls(unique.map((k) => ({ kanji: k, natural: d100() })))}>
                Lancer les rolls
              </button>
            </div>
            {rolled && (
              <>
                <ul className="roll-list">
                  {rolled.map((r) => (
                    <li key={r.kanji} className={`roll roll--${r.tier?.tone ?? 'neutral'}`}>
                      <span className="roll__kanji" lang="ja">
                        {r.kanji}
                      </span>
                      <span className="roll__value">{r.natural}</span>
                      <ToneChip tier={r.tier} />
                      <span className="roll__text">{r.reading}</span>
                    </li>
                  ))}
                </ul>
                <div className="form-actions">
                  <CopyButton text={summary} />
                </div>
              </>
            )}
          </section>
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Tables de roll
// ---------------------------------------------------------------------------
function FreeRoll({ tables }: { tables: RollTable[] }) {
  const [tableSlug, setTableSlug] = useState(tables[0]?.slug ?? '');
  const [modifier, setModifier] = useState(0);
  const [last, setLast] = useState<number | null>(null);
  const [manual, setManual] = useState('');
  const table = tables.find((t) => t.slug === tableSlug);
  const tier = last !== null ? tierFor(table, last, modifier) : null;

  return (
    <section className="panel panel--accent">
      <h2 className="panel__title">Roll libre</h2>
      <div className="tool-row">
        <label className="field">
          <span>Table</span>
          <TableSelect tables={tables} value={tableSlug} onChange={setTableSlug} />
        </label>
        <label className="field field--narrow">
          <span>Modificateur</span>
          <input type="number" value={modifier} onChange={(e) => setModifier(Number(e.target.value) || 0)} />
        </label>
        <button type="button" className="btn btn--red" onClick={() => setLast(d100())}>
          Lancer 1d100
        </button>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(manual);
            if (n >= 1 && n <= 100) setLast(Math.round(n));
          }}
        >
          <input type="number" min={1} max={100} value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Roll fait en jeu" aria-label="Roll obtenu" />
          <button type="submit" className="btn btn--ghost btn--sm">
            Lire
          </button>
        </form>
      </div>
      {last !== null && (
        <div className={`free-roll roll--${tier?.tone ?? 'neutral'}`}>
          <span className="free-roll__value">{last}</span>
          <div>
            <ToneChip tier={tier} />
            {modifier !== 0 && last > 1 && last < 100 && <small className="muted"> lu comme {effectiveRoll(last, modifier)}</small>}
            <p>{tier?.effect ?? 'Aucun palier ne couvre ce résultat.'}</p>
          </div>
        </div>
      )}
    </section>
  );
}

function TableEditor({ initial, onSaved }: { initial: RollTable; onSaved: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [t, setT] = useState<RollTable>(initial);
  const [busy, setBusy] = useState(false);
  useEffect(() => setT(initial), [initial]);
  const dirty = JSON.stringify(t) !== JSON.stringify(initial);
  const cov = coverage(t.tiers);

  const setTier = (i: number, patch: Partial<RollTier>) =>
    setT((x) => ({ ...x, tiers: x.tiers.map((tier, j) => (j === i ? { ...tier, ...patch } : tier)) }));

  const save = async () => {
    setBusy(true);
    try {
      await api.rollTableSave({ ...t, slug: t.slug || slugify(t.name) });
      toast(`Table « ${t.name} » enregistrée`);
      onSaved();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!t.id) return onSaved();
    if (!(await confirm({ title: `Supprimer la table « ${t.name} » ?`, confirm: 'Supprimer', danger: true }))) return;
    try {
      await api.rollTableDelete(t.id);
      toast('Table supprimée');
      onSaved();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    }
  };

  return (
    <section className={`panel roll-table${dirty ? ' is-dirty' : ''}`}>
      <div className="field-row">
        <label className="field">
          <span>Nom de la table</span>
          <input value={t.name} onChange={(e) => setT({ ...t, name: e.target.value, slug: t.id ? t.slug : slugify(e.target.value) })} />
        </label>
        <label className="field">
          <span>Description</span>
          <input value={t.description} onChange={(e) => setT({ ...t, description: e.target.value })} />
        </label>
      </div>
      <div className="tier-list">
        <div className="tier tier--head">
          <span>De</span>
          <span>À</span>
          <span>Palier</span>
          <span>Type</span>
          <span>Effet</span>
          <span />
        </div>
        {t.tiers.map((tier, i) => (
          <div key={i} className={`tier tier--${tier.tone}`}>
            <input type="number" min={1} max={100} value={tier.min} onChange={(e) => setTier(i, { min: Number(e.target.value) })} aria-label="De" />
            <input type="number" min={1} max={100} value={tier.max} onChange={(e) => setTier(i, { max: Number(e.target.value) })} aria-label="À" />
            <input value={tier.label} onChange={(e) => setTier(i, { label: e.target.value })} aria-label="Palier" />
            <select value={tier.tone} onChange={(e) => setTier(i, { tone: e.target.value as RollTier['tone'] })} aria-label="Type">
              {TONES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <textarea rows={2} value={tier.effect} onChange={(e) => setTier(i, { effect: e.target.value })} aria-label="Effet" />
            <button type="button" className="icon-btn" onClick={() => setT({ ...t, tiers: t.tiers.filter((_, j) => j !== i) })} aria-label="Supprimer le palier">
              ✕
            </button>
          </div>
        ))}
      </div>
      {(cov.gaps.length > 0 || cov.overlaps.length > 0) && (
        <p className="form-error">
          {cov.gaps.length > 0 && `Résultats sans palier : ${ranges(cov.gaps)}. `}
          {cov.overlaps.length > 0 && `Paliers qui se chevauchent : ${ranges(cov.overlaps)}.`}
        </p>
      )}
      <div className="form-actions">
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => {
            const lastMax = t.tiers.reduce((m, x) => Math.max(m, x.max), 0);
            const min = Math.min(100, lastMax + 1);
            setT({ ...t, tiers: [...t.tiers, { min, max: 100, label: 'Nouveau palier', tone: 'neutral', effect: '' }] });
          }}
        >
          + Palier
        </button>
        <button type="button" className="btn btn--ghost btn--sm btn--danger-text" onClick={remove}>
          Supprimer la table
        </button>
        <button type="button" className="btn btn--red btn--sm" onClick={save} disabled={busy || (!dirty && t.id !== null)}>
          {t.id ? 'Enregistrer' : 'Créer'}
        </button>
      </div>
    </section>
  );
}

function Tables({ tables, reload }: { tables: RollTable[]; reload: () => void }) {
  const [draft, setDraft] = useState<RollTable | null>(null);
  return (
    <>
      {tables.length > 0 && <FreeRoll tables={tables} />}
      <div className="panel__row">
        <h2 className="panel__title">Tables du Conclave</h2>
        {!draft && (
          <button
            type="button"
            className="btn btn--red btn--sm"
            onClick={() =>
              setDraft({
                id: null,
                slug: '',
                name: '',
                description: '',
                tiers: [
                  { min: 1, max: 1, label: 'Échec critique', tone: 'crit-fail', effect: '' },
                  { min: 2, max: 50, label: 'Échec', tone: 'neutral', effect: '' },
                  { min: 51, max: 99, label: 'Réussite', tone: 'success', effect: '' },
                  { min: 100, max: 100, label: 'Réussite critique', tone: 'crit-success', effect: '' },
                ],
              })
            }
          >
            + Nouvelle table
          </button>
        )}
      </div>
      {draft && (
        <TableEditor
          initial={draft}
          onSaved={() => {
            setDraft(null);
            reload();
          }}
        />
      )}
      {tables.map((t) => (
        <TableEditor key={t.id} initial={t} onSaved={reload} />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Liste des trames
// ---------------------------------------------------------------------------
export const TRAME_STATUS: Record<TrameStatus, string> = { draft: 'Brouillon', active: 'En cours', ended: 'Terminée' };

function TrameList() {
  const toast = useToast();
  const confirm = useConfirm();
  const { refresh } = useSession();
  const [rows, setRows] = useState<TrameRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await api.adminTrames());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const setStatus = async (r: TrameRow, action: 'start' | 'end') => {
    if (
      action === 'end' &&
      !(await confirm({
        title: `Terminer « ${r.title} » ?`,
        text: 'La page de la trame disparaît pour les joueurs. La progression reste visible dans le suivi.',
        confirm: 'Terminer la trame',
      }))
    )
      return;
    try {
      await api.trameStatus(r.id, action);
      toast(action === 'start' ? `« ${r.title} » est ouverte aux joueurs` : `« ${r.title} » est terminée`);
      await load();
      await refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    }
  };

  if (error) return <ErrorState text={error} onRetry={load} />;
  if (!rows) return <Loader />;

  return (
    <>
      <div className="panel__row">
        <p className="muted">Chaque trame est une suite d’étapes : énigme à déchiffrer, désenclavement, récit. Ouverte, elle apparaît dans le menu des joueurs.</p>
        <Link to="/conclave/trames/nouvelle" className="btn btn--red">
          + Nouvelle trame
        </Link>
      </div>
      {rows.length === 0 ? (
        <Empty glyph="謎">Aucune trame pour l’instant. Crée la première avec « Nouvelle trame ».</Empty>
      ) : (
        <div className="trame-list">
          {rows.map((r) => (
            <article key={r.id} className={`trame-card trame-card--${r.status}`}>
              <div className="trame-card__top">
                <span className={`status status--trame-${r.status}`}>{TRAME_STATUS[r.status]}</span>
                <small className="muted">
                  {r.steps} étape{r.steps > 1 ? 's' : ''} · {r.shared ? 'progression commune' : 'progression personnelle'} ·{' '}
                  {r.restricted_names?.length ? `réservée à ${r.restricted_names.join(', ')}` : `dès le ${circleLabel(r.min_rank)}`}
                </small>
              </div>
              <h3>
                <Link to={`/conclave/trames/${r.id}`}>{r.title}</Link>
              </h3>
              <p className="muted small">
                {r.participants} participant{r.participants > 1 ? 's' : ''} · {r.solves} étape{r.solves > 1 ? 's' : ''} résolue{r.solves > 1 ? 's' : ''}
                {r.started_at && ` · ouverte le ${formatDate(r.started_at, true)}`}
              </p>
              <div className="request__actions">
                {r.status === 'active' ? (
                  <button type="button" className="btn btn--ghost btn--sm btn--danger-text" onClick={() => setStatus(r, 'end')}>
                    Terminer la trame
                  </button>
                ) : (
                  <button type="button" className="btn btn--red btn--sm" onClick={() => setStatus(r, 'start')} disabled={r.steps === 0}>
                    {r.status === 'ended' ? 'Rouvrir la trame' : 'Ouvrir la trame'}
                  </button>
                )}
                <Link to={`/conclave/trames/${r.id}`} className="btn btn--ghost btn--sm">
                  Modifier et suivre
                </Link>
                <Link to={`/trame/${r.id}`} className="btn btn--ghost btn--sm">
                  Voir comme un joueur
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

export default function Trames({ tab }: { tab: Tab }) {
  const { tables, error, load } = useRollTables();
  return (
    <div className="console">
      <header className="page-head">
        <p className="kicker">Console du Conclave</p>
        <h1>Trames</h1>
        <p className="muted">Énigmes et défis à ouvrir aux joueurs le temps d’un événement.</p>
      </header>
      <nav className="tabs">
        <NavLink to="/conclave/trames" end className={({ isActive }) => `tab${isActive ? ' is-on' : ''}`}>
          Trames
        </NavLink>
        <NavLink to="/conclave/trames/tables" className={({ isActive }) => `tab${isActive ? ' is-on' : ''}`}>
          Tables de roll
        </NavLink>
        <NavLink to="/conclave/trames/dechiffreur" className={({ isActive }) => `tab${isActive ? ' is-on' : ''}`}>
          Déchiffreur
        </NavLink>
      </nav>
      {tab === 'liste' ? (
        <TrameList />
      ) : error ? (
        <ErrorState text={error} onRetry={load} />
      ) : !tables ? (
        <Loader />
      ) : tab === 'dechiffreur' ? (
        <Decipher tables={tables} />
      ) : (
        <Tables tables={tables} reload={load} />
      )}
    </div>
  );
}
