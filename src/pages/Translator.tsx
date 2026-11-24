import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Glossary } from '../lib/api';
import { fold, kanjiOf, loadKanjiDict, readingLabel, type KanjiInfo } from '../lib/kanjiDict';
import { copyToClipboard, ErrorState, Loader, useToast } from '../components/ui';

type Mode = 'read' | 'search';
type Entry = Glossary['entries'][number];

const STORE = 'fuin.traducteur';

function readStore(): { mode: Mode; text: string; query: string; formula: string } {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) ?? 'null') as Partial<{ mode: Mode; text: string; query: string; formula: string }> | null;
    return { mode: v?.mode === 'search' ? 'search' : 'read', text: v?.text ?? '', query: v?.query ?? '', formula: v?.formula ?? '' };
  } catch {
    return { mode: 'read', text: '', query: '', formula: '' };
  }
}

/** Découpe une suite de kanjis : les mots expliqués dans les fiches d'abord (le plus long), sinon kanji par kanji. */
function segment(chars: string[], words: Map<string, Entry>): string[] {
  const max = Math.max(1, ...[...words.keys()].map((w) => [...w].length));
  const out: string[] = [];
  let i = 0;
  while (i < chars.length) {
    let taken = 1;
    for (let len = Math.min(max, chars.length - i); len >= 2; len--) {
      if (words.has(chars.slice(i, i + len).join(''))) {
        taken = len;
        break;
      }
    }
    out.push(chars.slice(i, i + taken).join(''));
    i += taken;
  }
  return out;
}

const shortMeaning = (info?: KanjiInfo) => (info ? info.meanings.slice(0, 2).join(', ') : '');

function KanjiCard({ k, codex, info, seals }: { k: string; codex?: Entry; info?: KanjiInfo; seals: Glossary['seals'] }) {
  const usedIn = seals.filter((s) => s.kanji.includes(k));
  return (
    <article className={`tr-card${codex || info ? '' : ' is-unknown'}`}>
      <div className="tr-card__head">
        <span className="tr-card__kanji" lang="ja">
          {k}
        </span>
        <div className="tr-card__read">
          {codex?.r && <b>{codex.r}</b>}
          {info?.on.length ? <small>On : {info.on.slice(0, 3).map(readingLabel).join(' · ')}</small> : null}
          {info?.kun.length ? <small>Kun : {info.kun.slice(0, 3).map(readingLabel).join(' · ')}</small> : null}
        </div>
      </div>
      {codex && (
        <div className="tr-card__codex">
          <span className="tr-tag tr-tag--codex">Archives du Conclave</span>
          <p>{codex.m}</p>
          <Link to={`/${codex.slug}`}>{codex.title} ↗</Link>
        </div>
      )}
      {info && (
        <div className="tr-card__dict">
          <span className="tr-tag">{info.english ? 'Dictionnaire (en anglais)' : 'Dictionnaire'}</span>
          <p>{info.meanings.slice(0, 8).join(', ')}</p>
          <small className="muted">
            {info.strokes} trait{info.strokes > 1 ? 's' : ''}
            {info.jlpt ? ` · JLPT N${info.jlpt}` : ''}
            {info.grade && info.grade <= 6 ? ` · ${info.grade}e année d’école` : info.grade ? ' · jōyō' : ''}
          </small>
        </div>
      )}
      {!codex && !info && <p className="muted">Ce kanji n’est ni dans les archives ni dans le dictionnaire.</p>}
      {usedIn.length > 0 && (
        <p className="tr-card__seals">
          Dans : {usedIn.slice(0, 4).map((s, i) => (
            <span key={s.slug}>
              {i ? ', ' : ''}
              <Link to={`/${s.slug}`}>{s.title}</Link>
            </span>
          ))}
          {usedIn.length > 4 ? ` +${usedIn.length - 4}` : ''}
        </p>
      )}
    </article>
  );
}

/** Traducteur de kanjis, ouvert à tous les membres. */
export default function Translator() {
  const toast = useToast();
  const [initial] = useState(readStore);
  const [mode, setMode] = useState<Mode>(initial.mode);
  const [text, setText] = useState(initial.text);
  const [query, setQuery] = useState(initial.query);
  const [formula, setFormula] = useState(initial.formula);
  const [dict, setDict] = useState<Map<string, KanjiInfo> | null>(null);
  const [glossary, setGlossary] = useState<Glossary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    Promise.all([loadKanjiDict(), api.glossary().catch(() => ({ entries: [], seals: [] }) as Glossary)])
      .then(([d, g]) => {
        setDict(d);
        setGlossary(g);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };
  useEffect(load, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify({ mode, text, query, formula }));
    } catch {
      /* confort seulement */
    }
  }, [mode, text, query, formula]);

  const codexChars = useMemo(() => new Map((glossary?.entries ?? []).filter((e) => [...e.t].length === 1).map((e) => [e.t, e])), [glossary]);
  const codexWords = useMemo(() => new Map((glossary?.entries ?? []).filter((e) => [...e.t].length > 1).map((e) => [e.t, e])), [glossary]);

  const chars = kanjiOf(text);
  const segments = useMemo(() => segment(chars, codexWords), [chars.join(''), codexWords]); // eslint-disable-line react-hooks/exhaustive-deps
  const unique = [...new Set(chars)];

  const translation = segments.map((seg) => {
    const w = codexWords.get(seg);
    if (w) return { seg, meaning: w.m, codex: true };
    const c = codexChars.get(seg);
    if (c) return { seg, meaning: c.m.split(/[/,;]/)[0].trim(), codex: true };
    const info = dict?.get(seg);
    return { seg, meaning: info ? shortMeaning(info) : '?', codex: false };
  });
  const translationText = translation.map((t) => `${t.seg} ${t.meaning}`).join(' · ');

  const seals = glossary?.seals ?? [];
  const sealMatches = useMemo(() => {
    const set = new Set(unique);
    if (!set.size) return [];
    return seals
      .map((s) => {
        const f = [...new Set(kanjiOf(s.kanji))];
        const hit = f.filter((k) => set.has(k));
        return { s, f, hit, score: f.length ? hit.length / f.length : 0 };
      })
      .filter((m) => m.hit.length > 0)
      .sort((a, b) => b.score - a.score || b.hit.length - a.hit.length)
      .slice(0, 6);
  }, [unique.join(''), seals]); // eslint-disable-line react-hooks/exhaustive-deps

  // recherche par le sens : archives d'abord, puis dictionnaire (mot exact, début de mot, puis contenu)
  const results = useMemo(() => {
    const q = fold(query.trim());
    if (q.length < 2 || !dict) return [];
    // niveau de correspondance, un peu meilleur quand c'est le premier sens du kanji (魂 « âme » avant 神 « divinité, esprit, âme »)
    const rank = (meanings: string[]) => {
      let best = 9;
      meanings.forEach((m, i) => {
        const f = fold(m.trim());
        const words = f.split(/[^a-z0-9]+/).filter(Boolean);
        const level = f === q ? 0 : words.includes(q) ? 1 : words.some((w) => w.startsWith(q)) ? 2 : f.includes(q) ? 3 : 9;
        if (level < 9) best = Math.min(best, level + Math.min(i, 4) * 0.1);
      });
      return best;
    };
    const fromCodex = (glossary?.entries ?? [])
      .map((e) => ({ k: e.t, meaning: e.m, codex: e, info: [...e.t].length === 1 ? dict.get(e.t) : undefined, score: rank(e.m.split(/[/,;]/)) }))
      .filter((r) => r.score < 9);
    const seen = new Set(fromCodex.map((r) => r.k));
    const fromDict = [...dict.values()]
      .filter((i) => !seen.has(i.kanji))
      .map((i) => ({ k: i.kanji, meaning: i.meanings.slice(0, 4).join(', '), codex: undefined as Entry | undefined, info: i, score: rank(i.meanings) + (i.english ? 0.5 : 0) }))
      .filter((r) => r.score < 9)
      .sort((a, b) => a.score - b.score || (a.info.freq || 9999) - (b.info.freq || 9999));
    return [...fromCodex.sort((a, b) => a.score - b.score), ...fromDict].slice(0, 60);
  }, [query, dict, glossary]);

  if (error) return <ErrorState text={error} onRetry={load} />;
  if (!dict || !glossary) return <Loader label="Ouverture du dictionnaire…" />;

  const copy = async (t: string) => {
    if (await copyToClipboard(t)) toast('Copié');
  };

  return (
    <div className="console translator">
      <header className="page-head">
        <p className="kicker">Archives du Conclave</p>
        <h1>Traducteur de kanjis</h1>
        <p className="muted">
          Colle des kanjis pour en lire le sens, ou cherche un mot français pour trouver ses kanjis. Les sens propres au Conclave (fiches que tu peux lire) passent
          avant le dictionnaire général.
        </p>
      </header>

      <div className="segmented translator__modes" role="tablist" aria-label="Sens de la traduction">
        <button type="button" role="tab" aria-selected={mode === 'read'} className={mode === 'read' ? 'is-on' : ''} onClick={() => setMode('read')}>
          Kanjis → français
        </button>
        <button type="button" role="tab" aria-selected={mode === 'search'} className={mode === 'search' ? 'is-on' : ''} onClick={() => setMode('search')}>
          Français → kanjis
        </button>
      </div>

      {mode === 'read' ? (
        <>
          <section className="panel">
            <label className="field">
              <span>Kanjis à traduire</span>
              <textarea className="translator__input" lang="ja" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="封印結界" />
            </label>
            {chars.length > 0 && (
              <div className="translator__result">
                <p className="kicker">Traduction</p>
                <p className="translator__line">
                  {translation.map((t, i) => (
                    <span key={i} className={t.codex ? 'is-codex' : ''}>
                      <b lang="ja">{t.seg}</b> {t.meaning}
                    </span>
                  ))}
                </p>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => void copy(translationText)}>
                  Copier la traduction
                </button>
              </div>
            )}
          </section>

          {chars.length > 0 && (
            <>
              {segments.some((s) => codexWords.has(s)) && (
                <section className="panel">
                  <h2 className="panel__title">Mots reconnus</h2>
                  <div className="tr-words">
                    {segments
                      .filter((s, i, a) => codexWords.has(s) && a.indexOf(s) === i)
                      .map((s) => {
                        const w = codexWords.get(s)!;
                        return (
                          <div key={s} className="tr-word">
                            <span lang="ja">{s}</span>
                            <div>
                              <b>{w.m}</b>
                              <small>
                                {w.r} · <Link to={`/${w.slug}`}>{w.title}</Link>
                              </small>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </section>
              )}
              <section className="panel">
                <h2 className="panel__title">Kanji par kanji</h2>
                <div className="tr-grid">
                  {unique.map((k) => (
                    <KanjiCard key={k} k={k} codex={codexChars.get(k)} info={dict.get(k)} seals={seals} />
                  ))}
                </div>
              </section>
              {sealMatches.length > 0 && (
                <section className="panel">
                  <h2 className="panel__title">Sceaux qui utilisent ces kanjis</h2>
                  <ul className="tr-seals">
                    {sealMatches.map((m) => (
                      <li key={m.s.slug}>
                        <Link to={`/${m.s.slug}`}>{m.s.title}</Link>
                        <span lang="ja">
                          {m.f.map((k) => (
                            <i key={k} className={m.hit.includes(k) ? 'is-hit' : ''}>
                              {k}
                            </i>
                          ))}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </>
      ) : (
        <>
          <section className="panel">
            <label className="field">
              <span>Mot français</span>
              <input className="input-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="sceller, âme, feu, protection…" />
            </label>
            {formula && (
              <div className="translator__formula">
                <span className="kicker">Ma formule</span>
                <b lang="ja">{formula}</b>
                <div className="request__actions">
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => void copy(formula)}>
                    Copier
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => {
                      setText(formula);
                      setMode('read');
                    }}
                  >
                    Traduire
                  </button>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => setFormula([...formula].slice(0, -1).join(''))}>
                    ⌫
                  </button>
                  <button type="button" className="btn btn--ghost btn--sm btn--danger-text" onClick={() => setFormula('')}>
                    Vider
                  </button>
                </div>
              </div>
            )}
          </section>
          {query.trim().length >= 2 && (
            <section className="panel">
              <h2 className="panel__title">
                {results.length} résultat{results.length > 1 ? 's' : ''}
                {results.length === 60 ? ' (les plus courants)' : ''}
              </h2>
              {results.length === 0 ? (
                <p className="muted">Aucun kanji ne porte ce sens. Essaie un synonyme ou un mot plus court.</p>
              ) : (
                <>
                  <p className="muted small">Clique sur un kanji pour l’ajouter à ta formule.</p>
                  <div className="tr-results">
                    {results.map((r) => (
                      <button key={r.k} type="button" className={`tr-result${r.codex ? ' is-codex' : ''}`} onClick={() => setFormula((f) => (f + r.k).slice(0, 24))} title="Ajouter à ma formule">
                        <span lang="ja">{r.k}</span>
                        <b>{r.meaning}</b>
                        <small>
                          {r.codex ? `Archives · ${r.codex.title}` : r.info?.english ? 'Dictionnaire (en anglais)' : 'Dictionnaire'}
                          {r.info?.on[0] ? ` · ${readingLabel(r.info.on[0])}` : r.codex?.r ? ` · ${r.codex.r}` : ''}
                        </small>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </section>
          )}
        </>
      )}

      <p className="translator__credits muted small">
        Dictionnaire général : extrait de KANJIDIC2, © Electronic Dictionary Research and Development Group, licence{' '}
        <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.fr" target="_blank" rel="noreferrer">
          CC BY-SA 4.0
        </a>
        . Sens propres au Conclave : fiches du site.
      </p>
    </div>
  );
}
