import { useEffect, useMemo, useState } from 'react';
import { fold, loadKanjiDict, loadRareKanji, readingLabel, romaji, type KanjiInfo } from '../lib/kanjiDict';
import { KANJI, prepareWords, segment, shortEnglish, shortFrench, type Token } from '../lib/japonais';
import { LEXIQUE } from '../lib/lexique';
import { copyToClipboard, ErrorState, Loader, useToast } from '../components/ui';

type Mode = 'read' | 'search';
type KanjiOf = (k: string) => KanjiInfo | undefined;

const STORE = 'fuin.traducteur';
const EXAMPLES = ['封印を解く', '火遁の術', '我が魂を封じる', '呪いが解けた', '魑魅魍魎'];

function readStore(): { mode: Mode; text: string; query: string; mine: string } {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) ?? 'null') as Partial<{ mode: Mode; text: string; query: string; mine: string }> | null;
    return { mode: v?.mode === 'search' ? 'search' : 'read', text: v?.text ?? '', query: v?.query ?? '', mine: v?.mine ?? '' };
  } catch {
    return { mode: 'read', text: '', query: '', mine: '' };
  }
}

const kanjiMeaning = (info: KanjiInfo | undefined, n = 2) => (info ? info.meanings.slice(0, n).join(', ') : '');

/** Lecture du dictionnaire (mot de base) ou du kanji seul. */
function readingOf(t: Token, kanjiOf: KanjiOf): string {
  if (t.kind === 'word') return t.lex?.reading ?? t.items?.[0]?.reading ?? '';
  if (t.kind === 'kanji') {
    const info = kanjiOf(t.text);
    return (info?.kun[0] ?? info?.on[0] ?? '').replace(/[.\-]/g, '');
  }
  if (t.kind === 'particle' || t.kind === 'kana') return t.text;
  return '';
}

/** Lecture de la forme écrite dans le texte : 解いた → といた (lecture de 解く, terminaison du texte). */
function surfaceReading(t: Token, kanjiOf: KanjiOf): string {
  const r = readingOf(t, kanjiOf);
  if (!t.base || t.base === t.text) return r;
  let p = 0;
  while (p < t.base.length && t.base[p] === t.text[p]) p++;
  const tail = t.base.slice(p);
  return r.endsWith(tail) ? r.slice(0, r.length - tail.length) + t.text.slice(p) : r;
}

interface Gloss {
  fr?: string;
  en?: string;
  note?: string;
}

function glossOf(t: Token, kanjiOf: KanjiOf): Gloss {
  if (t.kind === 'particle') return { fr: t.particle };
  if (t.kind === 'kanji') {
    const info = kanjiOf(t.text);
    if (!info) return {};
    return info.english ? { en: kanjiMeaning(info) } : { fr: kanjiMeaning(info) };
  }
  if (t.kind !== 'word') return {};
  const base = t.base ?? t.text;
  const note = t.form;
  if (t.lex) return { fr: shortFrench(t.lex.fr), note };
  // un kanji seul : le sens en français de KANJIDIC2 plutôt que l'anglais de JMdict
  const single = [...base].length === 1 && KANJI.test(base) ? kanjiOf(base) : undefined;
  if (single && !single.english) return { fr: kanjiMeaning(single), note };
  if (t.items?.length) return { en: shortEnglish(t.items[0].meaning), note };
  return { note };
}

function KanjiCard({ k, info, words }: { k: string; info?: KanjiInfo; words: string[] }) {
  return (
    <article className={`tr-card${info ? '' : ' is-unknown'}`}>
      <div className="tr-card__head">
        <span className="tr-card__kanji" lang="ja">
          {k}
        </span>
        <div className="tr-card__read">
          {info?.on.length ? <small>On : {info.on.slice(0, 3).map(readingLabel).join(' · ')}</small> : null}
          {info?.kun.length ? <small>Kun : {info.kun.slice(0, 3).map(readingLabel).join(' · ')}</small> : null}
        </div>
      </div>
      {info ? (
        <div className="tr-card__dict">
          <span className="tr-tag">{info.english ? 'Sens (en anglais)' : 'Sens'}</span>
          <p>{info.meanings.slice(0, 8).join(', ')}</p>
          <small className="muted">
            {info.strokes} trait{info.strokes > 1 ? 's' : ''}
            {info.jlpt ? ` · JLPT N${info.jlpt}` : ''}
            {info.grade && info.grade <= 6 ? ` · ${info.grade}e année d’école` : info.grade === 8 ? ' · kanji usuel' : info.grade ? ' · kanji des noms' : ' · kanji rare'}
          </small>
        </div>
      ) : (
        <p className="muted">Ce kanji n’est pas dans le dictionnaire.</p>
      )}
      {words.length > 0 && (
        <p className="tr-card__in">
          Dans : <span lang="ja">{words.join('、')}</span>
        </p>
      )}
    </article>
  );
}

/** Traducteur de kanjis, ouvert à tous (même sans compte). */
export default function Translator() {
  const toast = useToast();
  const [initial] = useState(readStore);
  const [mode, setMode] = useState<Mode>(initial.mode);
  const [text, setText] = useState(initial.text);
  const [query, setQuery] = useState(initial.query);
  const [mine, setMine] = useState(initial.mine);
  const [dict, setDict] = useState<Map<string, KanjiInfo> | null>(null);
  const [rare, setRare] = useState<Map<string, KanjiInfo> | null>(null);
  const [error, setError] = useState<string | null>(null);
  // texte dont les pièces du dictionnaire de mots sont chargées (la traduction suit la frappe sans clignoter)
  const [readyText, setReadyText] = useState<string | null>(null);
  const [wordsFailed, setWordsFailed] = useState(false);

  const load = () => {
    setError(null);
    loadKanjiDict()
      .then(setDict)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };
  useEffect(load, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify({ mode, text, query, mine }));
    } catch {
      /* confort seulement */
    }
  }, [mode, text, query, mine]);

  useEffect(() => {
    let live = true;
    const timer = window.setTimeout(() => {
      prepareWords(text)
        .then(() => live && setWordsFailed(false))
        .catch(() => live && setWordsFailed(true))
        .finally(() => live && setReadyText(text));
    }, 150);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [text]);

  useEffect(() => {
    if (!dict || rare) return;
    if ([...text].some((ch) => KANJI.test(ch) && !dict.has(ch))) loadRareKanji().then(setRare).catch(() => undefined);
  }, [text, dict, rare]);

  const kanjiOf: KanjiOf = (k) => dict?.get(k) ?? rare?.get(k);
  const shown = readyText ?? '';
  const tokens = useMemo(() => segment(shown), [shown]);
  const loadingWords = readyText !== text;

  const words = useMemo(() => {
    const seen = new Set<string>();
    return tokens.filter((t) => {
      if (t.kind !== 'word') return false;
      const key = t.base ?? t.text;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [tokens]);

  const kanjis = useMemo(() => [...new Set([...shown].filter((ch) => KANJI.test(ch)))], [shown]);

  // recherche par le sens : lexique d'abord, puis kanjis (sens exact, mot entier, début de mot, puis contenu)
  const results = useMemo(() => {
    const q = fold(query.trim());
    if (q.length < 2 || !dict) return [];
    const rank = (meanings: string[]) => {
      let best = 9;
      meanings.forEach((m, i) => {
        const f = fold(m.trim());
        const ws = f.split(/[^a-z0-9]+/).filter(Boolean);
        // « contient » seulement pour une recherche assez longue (« âme » ne doit pas trouver « lame »)
        const level = f === q ? 0 : ws.includes(q) ? 1 : ws.some((w) => w.startsWith(q)) ? 2 : q.length >= 4 && f.includes(q) ? 3 : 9;
        if (level < 9) best = Math.min(best, level + Math.min(i, 4) * 0.1);
      });
      return best;
    };
    const fromLex = [...LEXIQUE.values()]
      .map((e) => ({ jp: e.written, fr: e.fr, reading: e.reading, word: true, score: rank(e.fr.split(/[,;]/)) }))
      .filter((r) => r.score < 9);
    const seen = new Set(fromLex.map((r) => r.jp));
    const fromKanji = [...dict.values()]
      .filter((i) => !i.english && !seen.has(i.kanji))
      .map((i) => ({ jp: i.kanji, fr: i.meanings.slice(0, 4).join(', '), reading: i.kun[0] ?? i.on[0] ?? '', word: false, score: rank(i.meanings), freq: i.freq || 9999 }))
      .filter((r) => r.score < 9)
      .sort((a, b) => a.score - b.score || a.freq - b.freq);
    return [...fromLex.sort((a, b) => a.score - b.score), ...fromKanji].slice(0, 60);
  }, [query, dict]);

  if (error) return <ErrorState text={error} onRetry={load} />;
  if (!dict) return <Loader label="Ouverture du dictionnaire…" />;

  const copy = async (t: string) => {
    if (await copyToClipboard(t)) toast('Copié');
  };

  const glosses = tokens.map((t) => ({ t, g: glossOf(t, kanjiOf), read: surfaceReading(t, kanjiOf) }));
  const plain = glosses
    .map(({ t, g }) => (t.kind === 'other' ? t.text.trim() : (g.fr ?? g.en ?? t.text) + (g.note ? ` (${g.note})` : '')))
    .filter((s) => s && !/^\(.*\)$/.test(s))
    .join(' · ');
  const hasEnglish = glosses.some(({ g }) => !g.fr && g.en);
  const hasJapanese = tokens.some((t) => t.kind !== 'other');

  return (
    <div className="console translator">
      <header className="page-head">
        <p className="kicker">Outil</p>
        <h1>Traducteur de kanjis</h1>
        <p className="muted">
          Colle un kanji, un mot ou une phrase en japonais vus sur le serveur : le traducteur les découpe en mots, donne le sens de chacun et le détail de chaque
          kanji.
        </p>
      </header>

      <div className="segmented translator__modes" role="tablist" aria-label="Sens de la traduction">
        <button type="button" role="tab" aria-selected={mode === 'read'} className={mode === 'read' ? 'is-on' : ''} onClick={() => setMode('read')}>
          Japonais → français
        </button>
        <button type="button" role="tab" aria-selected={mode === 'search'} className={mode === 'search' ? 'is-on' : ''} onClick={() => setMode('search')}>
          Français → japonais
        </button>
      </div>

      {mode === 'read' ? (
        <>
          <section className="panel">
            <label className="field">
              <span>Texte japonais</span>
              <textarea className="translator__input" lang="ja" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="封印を解く" />
            </label>
            {!text.trim() ? (
              <p className="translator__examples">
                <span className="muted">Exemples :</span>
                {EXAMPLES.map((ex) => (
                  <button key={ex} type="button" className="chip" lang="ja" onClick={() => setText(ex)}>
                    {ex}
                  </button>
                ))}
              </p>
            ) : (
              <button type="button" className="btn btn--ghost btn--sm translator__clear" onClick={() => setText('')}>
                Effacer
              </button>
            )}

            {hasJapanese && (
              <div className={`translator__result${loadingWords ? ' is-loading' : ''}`}>
                <p className="kicker">Traduction mot à mot</p>
                <div className="tr-gloss">
                  {glosses.map(({ t, g, read }, i) =>
                    t.kind === 'other' ? (
                      <span key={i} className="tr-tok tr-tok--sep">
                        {t.text}
                      </span>
                    ) : (
                      <span key={i} className={`tr-tok tr-tok--${t.kind}`}>
                        <small className="tr-tok__read">{read ? romaji(read) : ' '}</small>
                        <b className="tr-tok__jp" lang="ja">
                          {t.text}
                        </b>
                        <span className="tr-tok__fr">{g.fr ?? (g.en ? <i>{g.en}</i> : '?')}</span>
                        {g.note && <em className="tr-tok__note">{g.note}</em>}
                      </span>
                    ),
                  )}
                </div>
                <p className="translator__plain">{plain}</p>
                <div className="translator__actions">
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => void copy(plain)}>
                    Copier la traduction
                  </button>
                  {loadingWords && <span className="muted small">Recherche des mots…</span>}
                  {wordsFailed && !loadingWords && <span className="muted small">Dictionnaire de mots injoignable : kanji par kanji seulement.</span>}
                </div>
                {hasEnglish && <p className="muted small translator__legend">En italique : sens en anglais (pas encore de traduction française pour ce mot).</p>}
              </div>
            )}
          </section>

          {words.length > 0 && (
            <section className="panel">
              <h2 className="panel__title">Mots</h2>
              <div className="tr-words">
                {words.map((t) => {
                  const base = t.base ?? t.text;
                  const reading = t.lex?.reading ?? t.items?.[0]?.reading ?? '';
                  const parts = [...base].filter((ch) => KANJI.test(ch));
                  return (
                    <div key={base} className="tr-word">
                      <span className="tr-word__jp" lang="ja">
                        {base}
                      </span>
                      <div className="tr-word__body">
                        <p className="tr-word__read">
                          <span lang="ja">{reading}</span> · {romaji(reading)}
                        </p>
                        {t.form && (
                          <p className="tr-word__form">
                            Dans le texte : <span lang="ja">{t.text}</span> ({t.form})
                          </p>
                        )}
                        {t.lex && <p className="tr-word__fr">{t.lex.fr}</p>}
                        {t.items?.length ? (
                          t.lex ? (
                            <details className="tr-word__en">
                              <summary>Sens détaillés (anglais)</summary>
                              <ul>
                                {t.items.map((it, i) => (
                                  <li key={i}>
                                    <span lang="ja">{it.reading}</span> : {it.meaning}
                                  </li>
                                ))}
                              </ul>
                            </details>
                          ) : (
                            <div className="tr-word__en">
                              <span className="tr-tag">En anglais</span>
                              <ul>
                                {t.items.map((it, i) => (
                                  <li key={i}>
                                    {t.items!.length > 1 && <span lang="ja">{it.reading} : </span>}
                                    {it.meaning}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )
                        ) : null}
                        {parts.length > 1 && (
                          <p className="tr-word__parts">
                            {parts.map((k, i) => (
                              <span key={i}>
                                <b lang="ja">{k}</b> {kanjiMeaning(kanjiOf(k), 1) || '?'}
                              </span>
                            ))}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {kanjis.length > 0 && (
            <section className="panel">
              <h2 className="panel__title">Kanji par kanji</h2>
              <div className="tr-grid">
                {kanjis.map((k) => (
                  <KanjiCard key={k} k={k} info={kanjiOf(k)} words={words.map((w) => w.base ?? w.text).filter((w) => w !== k && w.includes(k))} />
                ))}
              </div>
            </section>
          )}
        </>
      ) : (
        <>
          <section className="panel">
            <label className="field">
              <span>Mot français</span>
              <input className="input-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="âme, feu, sceller, protéger…" />
            </label>
            {mine && (
              <div className="translator__mine">
                <span className="kicker">Mon texte</span>
                <b lang="ja">{mine}</b>
                <div className="translator__actions">
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => void copy(mine)}>
                    Copier
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => {
                      setText(mine);
                      setMode('read');
                    }}
                  >
                    Traduire
                  </button>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => setMine([...mine].slice(0, -1).join(''))} aria-label="Effacer le dernier caractère">
                    ⌫
                  </button>
                  <button type="button" className="btn btn--ghost btn--sm btn--danger-text" onClick={() => setMine('')}>
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
                <p className="muted">Rien ne porte ce sens. Essaie un synonyme ou un mot plus court.</p>
              ) : (
                <>
                  <p className="muted small">Clique sur un résultat pour l’ajouter à ton texte.</p>
                  <div className="tr-results">
                    {results.map((r) => (
                      <button key={r.jp} type="button" className={`tr-result${r.word ? ' is-word' : ''}`} onClick={() => setMine((m) => (m + r.jp).slice(0, 40))} title="Ajouter à mon texte">
                        <span lang="ja">{r.jp}</span>
                        <b>{r.fr}</b>
                        <small>
                          {r.word ? 'Mot' : 'Kanji'}
                          {r.reading ? ` · ${readingLabel(r.reading)}` : ''}
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
        Kanjis : KANJIDIC2 · mots : JMdict (sens en anglais), propriété de l’Electronic Dictionary Research and Development Group, utilisés selon{' '}
        <a href="https://www.edrdg.org/edrdg/licence.html" target="_blank" rel="noreferrer">
          sa licence
        </a>{' '}
        (
        <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.fr" target="_blank" rel="noreferrer">
          CC BY-SA 4.0
        </a>
        ) · lexique français : Fuinjutsu.
      </p>
    </div>
  );
}
