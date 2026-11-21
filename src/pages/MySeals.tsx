import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type MasteryGroup, type MasteryPage } from '../lib/api';
import { useSession } from '../lib/session';
import { normalize } from '../lib/format';
import { sanitizeSvg } from '../lib/markdown';
import { displaySealSvg, sealGlyphs } from '../lib/sealDesign';
import { useBrushFont } from '../lib/useBrushFont';
import { Empty, ErrorState, Loader, SealBadge, useToast } from '../components/ui';

type Filter = 'all' | 'mastered' | 'todo';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Tous' },
  { key: 'mastered', label: 'Maîtrisés' },
  { key: 'todo', label: 'À apprendre' },
];

function Progress({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <span className="mastery-progress" role="img" aria-label={`${done} sur ${total}`}>
      <span style={{ width: `${pct}%` }} />
    </span>
  );
}

function SealCard({ p, ready, busy, onToggle }: { p: MasteryPage; ready: boolean; busy: boolean; onToggle: () => void }) {
  return (
    <div className={`mastery-card${p.mastered ? ' is-on' : ''}`}>
      <label className="mastery-card__check">
        <input type="checkbox" checked={p.mastered} onChange={onToggle} disabled={busy} />
        <span className="mastery__box" aria-hidden="true">
          {p.mastered ? '✓' : ''}
        </span>
        <span className="mastery-card__seal seal-icon" dangerouslySetInnerHTML={{ __html: ready ? sanitizeSvg(displaySealSvg(p.icon_svg, p.kanji)) : '' }} />
        <span className="mastery-card__text">
          <b>{p.title}</b>
          {p.kanji && (
            <small lang="ja" className="mastery-card__kanji">
              {p.kanji.replace(/\s+/g, ' ')}
            </small>
          )}
        </span>
      </label>
      <div className="mastery-card__foot">
        <SealBadge badge={p.badge} slotted={false} />
        <Link to={`/${p.slug}`} className="mastery-card__read">
          Lire la fiche ↗
        </Link>
      </div>
    </div>
  );
}

/** Mon compte · Mes sceaux maîtrisés : le shinobi coche les sceaux qu'il connaît. */
export default function MySeals() {
  const { member } = useSession();
  const toast = useToast();
  const [groups, setGroups] = useState<MasteryGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setGroups(await api.masteries());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const font = useBrushFont(groups ? groups.flatMap((g) => g.pages.map((p) => sealGlyphs(p.icon_svg, p.kanji))).join('') : '');

  const setMastered = (id: number, on: boolean) =>
    setGroups((gs) => gs?.map((g) => ({ ...g, pages: g.pages.map((p) => (p.id === id ? { ...p, mastered: on } : p)) })) ?? gs);

  const toggle = async (p: MasteryPage) => {
    const next = !p.mastered;
    setMastered(p.id, next);
    setBusy(p.id);
    try {
      await api.masterySet(p.id, next);
    } catch (e) {
      setMastered(p.id, !next);
      toast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  const all = useMemo(() => groups?.flatMap((g) => g.pages) ?? [], [groups]);
  const doneCount = all.filter((p) => p.mastered).length;
  const nq = normalize(q.trim());

  if (!member) return null;
  if (error) return <ErrorState text={error} onRetry={load} />;
  if (!groups) return <Loader label="Lecture de tes sceaux…" />;

  const shown = groups
    .map((g) => ({
      ...g,
      done: g.pages.filter((p) => p.mastered).length,
      list: g.pages.filter(
        (p) =>
          (filter === 'all' || (filter === 'mastered' ? p.mastered : !p.mastered)) &&
          (!nq || normalize(`${p.title} ${p.kanji ?? ''}`).includes(nq) || (p.kanji ?? '').includes(q.trim())),
      ),
    }))
    .filter((g) => g.list.length > 0);

  return (
    <div className="console">
      <header className="page-head page-head--row">
        <div>
          <Link to="/mon-compte" className="crumb">
            ← Mon compte
          </Link>
          <h1>Mes sceaux maîtrisés</h1>
          <p className="muted">Coche les sceaux que ton shinobi maîtrise. Le Conclave peut consulter cette liste.</p>
        </div>
        <div className="mastery-total">
          <b>
            {doneCount}
            <small> / {all.length}</small>
          </b>
          <span>sceaux maîtrisés</span>
          <Progress done={doneCount} total={all.length} />
        </div>
      </header>

      <section className="panel">
        <div className="toolbar">
          <input className="input-search" type="search" placeholder="Chercher un sceau ou un kanji…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="segmented segmented--small" role="radiogroup" aria-label="Filtrer">
            {FILTERS.map((f) => (
              <button key={f.key} type="button" role="radio" aria-checked={filter === f.key} className={filter === f.key ? 'is-on' : ''} onClick={() => setFilter(f.key)}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {all.length === 0 ? (
          <Empty glyph="封">Aucun sceau n’est encore ouvert à ton cercle.</Empty>
        ) : shown.length === 0 ? (
          <Empty glyph="封">{filter === 'mastered' && !nq ? 'Tu n’as encore coché aucun sceau.' : 'Aucun sceau ne correspond.'}</Empty>
        ) : (
          shown.map((g) => (
            <section key={g.id} className="mastery-group">
              <header className="mastery-group__head">
                <span className="mastery-group__glyph" aria-hidden="true">
                  {g.glyph}
                </span>
                <h2>{g.name}</h2>
                <span className="mastery-group__count">
                  {g.done} / {g.pages.length}
                </span>
                <Progress done={g.done} total={g.pages.length} />
              </header>
              <div className="mastery-grid">
                {g.list.map((p) => (
                  <SealCard key={p.id} p={p} ready={font.ready} busy={busy === p.id} onToggle={() => void toggle(p)} />
                ))}
              </div>
            </section>
          ))
        )}
      </section>
    </div>
  );
}
