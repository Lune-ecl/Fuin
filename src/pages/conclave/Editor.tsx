import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, type AdminCategory, type AdminPageRow, type EditablePage } from '../../lib/api';
import { useSession } from '../../lib/session';
import { circleLabel, formatDate, normalize, RANKS, slugify, timeAgo } from '../../lib/format';
import { sanitizeSvg } from '../../lib/markdown';
import Markdown from '../../components/Markdown';
import SealCreator from '../../components/SealCreator';
import { displaySealSvg, parseDesign } from '../../lib/sealDesign';
import { Empty, ErrorState, Loader, SealBadge, useConfirm, useToast } from '../../components/ui';

const KIND_LABEL: Record<EditablePage['kind'], string> = {
  seal: 'Sceau',
  index: 'Vue d’ensemble du cercle',
  doc: 'Dossier / règles',
  memorial: 'Mémorial des maîtres',
};

// ---------------------------------------------------------------------------
// Liste des fiches
// ---------------------------------------------------------------------------
type KindFilter = 'all' | 'seal' | 'page' | 'hidden';

const KIND_FILTERS: { key: KindFilter; label: string }[] = [
  { key: 'all', label: 'Tout' },
  { key: 'seal', label: 'Sceaux' },
  { key: 'page', label: 'Pages et dossiers' },
  { key: 'hidden', label: 'Brouillons' },
];

const LIST_KEY = 'fuin.editeur.liste';

interface ListPrefs {
  picked: number[];
  kind: KindFilter;
  open: number[];
}

// filtres et catégories dépliées : un confort propre à ce navigateur
function readPrefs(): ListPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(LIST_KEY) ?? 'null') as Partial<ListPrefs> | null;
    const nums = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number') : []);
    return {
      picked: nums(raw?.picked),
      kind: KIND_FILTERS.some((k) => k.key === raw?.kind) ? (raw?.kind as KindFilter) : 'all',
      open: nums(raw?.open),
    };
  } catch {
    return { picked: [], kind: 'all', open: [] };
  }
}

const rowGlyph = (r: AdminPageRow) =>
  r.kanji?.split(' ').slice(0, 2).join('') || (r.kind === 'index' ? '総' : r.kind === 'doc' ? '典' : r.kind === 'memorial' ? '記' : '封');

function EditorRow({ r }: { r: AdminPageRow }) {
  return (
    <li>
      <Link to={`/conclave/sceaux/${r.id}`} className={`editor-row${r.hidden ? ' is-hidden' : ''}`}>
        <span className="editor-row__kanji" lang="ja">
          {rowGlyph(r)}
        </span>
        <span className="editor-row__main">
          <b>{r.title}</b>
          <small>/{r.slug}</small>
        </span>
        <span className="editor-row__tags">
          {r.kind !== 'seal' && <span className="tag tag--ghost">{r.kind === 'index' ? 'index' : r.kind === 'memorial' ? 'mémorial' : 'dossier'}</span>}
          {r.hidden && <span className="badge badge--draft">brouillon</span>}
          {r.min_rank && <span className="tag tag--ghost">{circleLabel(r.min_rank)}+</span>}
          <SealBadge badge={r.badge} slotted={r.slotted} />
        </span>
        <span className="editor-row__date" title={r.updated_by ? `par ${r.updated_by}` : undefined}>
          {timeAgo(r.updated_at)}
        </span>
      </Link>
    </li>
  );
}

export function EditorList() {
  const [rows, setRows] = useState<AdminPageRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [prefs, setPrefs] = useState<ListPrefs>(readPrefs);
  const { picked, kind, open } = prefs;

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await api.pages());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    try {
      localStorage.setItem(LIST_KEY, JSON.stringify(prefs));
    } catch {
      /* stockage indisponible : les filtres repartent à zéro au prochain passage */
    }
  }, [prefs]);

  const update = (patch: Partial<ListPrefs>) => setPrefs((p) => ({ ...p, ...patch }));
  const toggle = (list: number[], id: number) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  // catégories dans l'ordre du grimoire, avec leurs compteurs
  const categories = useMemo(() => {
    const m = new Map<number, { id: number; name: string; glyph: string; total: number; hidden: number }>();
    (rows ?? []).forEach((r) => {
      const c = m.get(r.category_id) ?? { id: r.category_id, name: r.category_name, glyph: r.category_glyph, total: 0, hidden: 0 };
      c.total += 1;
      if (r.hidden) c.hidden += 1;
      m.set(r.category_id, c);
    });
    return [...m.values()];
  }, [rows]);

  const recent = useMemo(() => [...(rows ?? [])].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 6), [rows]);

  const nq = normalize(q.trim());
  const searching = nq.length > 0;
  const filtered = useMemo(
    () =>
      (rows ?? []).filter(
        (r) =>
          (!picked.length || picked.includes(r.category_id)) &&
          (kind === 'all' || (kind === 'seal' ? r.kind === 'seal' : kind === 'page' ? r.kind !== 'seal' : r.hidden)) &&
          (!nq || normalize(`${r.title} ${r.slug} ${r.kanji ?? ''}`).includes(nq) || (r.kanji ?? '').includes(q.trim())),
      ),
    [rows, picked, kind, nq, q],
  );
  const groups = categories.map((c) => ({ ...c, items: filtered.filter((r) => r.category_id === c.id) })).filter((g) => g.items.length > 0);

  // une recherche, un cercle coché ou un filtre de type déplie d'office les catégories concernées
  const forced = searching || picked.length > 0 || kind !== 'all';
  const isOpen = (id: number) => forced || open.includes(id);
  const allOpen = groups.every((g) => open.includes(g.id));
  const filtering = searching || picked.length > 0 || kind !== 'all';

  if (error) return <ErrorState text={error} onRetry={load} />;
  if (!rows) return <Loader label="Déroulement des parchemins…" />;

  return (
    <div className="console">
      <header className="page-head page-head--row">
        <div>
          <p className="kicker">Console du Conclave</p>
          <h1>Éditeur de sceaux</h1>
          <p className="muted">Kanjis, définitions, règles : chaque fiche est une page du Conclave.</p>
        </div>
        <Link to="/conclave/sceaux/nouveau" className="btn btn--red">
          + Nouvelle fiche
        </Link>
      </header>

      {!filtering && recent.length > 0 && (
        <section className="editor-recent" aria-label="Fiches modifiées récemment">
          <span className="editor-recent__label">Modifiées récemment</span>
          <div className="editor-recent__list">
            {recent.map((r) => (
              <Link key={r.id} to={`/conclave/sceaux/${r.id}`} className="editor-recent__item">
                <span lang="ja">{rowGlyph(r)}</span>
                <b>{r.title}</b>
                <small>{timeAgo(r.updated_at)}</small>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="panel">
        <div className="toolbar">
          <input className="input-search" type="search" placeholder="Rechercher un sceau, un kanji, une URL…" value={q} onChange={(e) => setQ(e.target.value)} />
          <span className="muted small">{filtering ? `${filtered.length} / ${rows.length} fiches` : `${rows.length} fiches`}</span>
        </div>

        <div className="editor-filters">
          <div className="editor-filters__row editor-filters__row--chips" role="group" aria-label="Cercles et catégories">
            <button type="button" className={`chip${picked.length === 0 ? ' is-on' : ''}`} aria-pressed={picked.length === 0} onClick={() => update({ picked: [] })}>
              Tout
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`chip editor-chip${picked.includes(c.id) ? ' is-on' : ''}`}
                aria-pressed={picked.includes(c.id)}
                onClick={() => update({ picked: toggle(picked, c.id) })}
              >
                <i aria-hidden="true">{picked.includes(c.id) ? '✓' : c.glyph}</i> {c.name} <span>{c.total}</span>
              </button>
            ))}
          </div>
          <div className="editor-filters__row">
            <div className="segmented segmented--small" role="radiogroup" aria-label="Type de fiche">
              {KIND_FILTERS.map((k) => (
                <button key={k.key} type="button" role="radio" aria-checked={kind === k.key} className={kind === k.key ? 'is-on' : ''} onClick={() => update({ kind: k.key })}>
                  {k.label}
                </button>
              ))}
            </div>
            {filtering ? (
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => {
                  setQ('');
                  update({ picked: [], kind: 'all' });
                }}
              >
                Effacer les filtres
              </button>
            ) : (
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => update({ open: allOpen ? [] : groups.map((g) => g.id) })}>
                {allOpen ? 'Tout replier' : 'Tout déplier'}
              </button>
            )}
          </div>
        </div>

        {groups.length === 0 && <Empty glyph="巻">Aucune fiche ne correspond.</Empty>}
        {groups.map((g) => {
          const on = isOpen(g.id);
          return (
            <div key={g.id} className={`editor-group${on ? ' is-open' : ''}`}>
              <div className="editor-group__head">
                <button
                  type="button"
                  className="editor-group__toggle"
                  aria-expanded={on}
                  disabled={forced}
                  onClick={() => update({ open: toggle(open, g.id) })}
                >
                  <span className="editor-group__glyph" aria-hidden="true">
                    {g.glyph}
                  </span>
                  <span className="editor-group__title">{g.name}</span>
                  <span className="editor-group__count">
                    {filtering ? `${g.items.length} / ${g.total}` : g.total} fiche{g.total > 1 ? 's' : ''}
                    {g.hidden > 0 && !filtering && <em> · {g.hidden} brouillon{g.hidden > 1 ? 's' : ''}</em>}
                  </span>
                  {!forced && (
                    <span className="editor-group__chevron" aria-hidden="true">
                      ▾
                    </span>
                  )}
                </button>
                <Link to={`/conclave/sceaux/nouveau?categorie=${g.id}`} className="icon-btn" title={`Nouvelle fiche dans ${g.name}`} aria-label={`Nouvelle fiche dans ${g.name}`}>
                  +
                </Link>
              </div>
              {on && (
                <ul className="editor-list">
                  {g.items.map((r) => (
                    <EditorRow key={r.id} r={r} />
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Éditeur d'une fiche
// ---------------------------------------------------------------------------
const SNIPPETS: { label: string; title: string; text: string; block?: boolean }[] = [
  { label: 'H2', title: 'Titre de section', text: '## Titre', block: true },
  { label: 'G', title: 'Gras', text: '**texte**' },
  { label: 'I', title: 'Italique', text: '*texte*' },
  { label: '•', title: 'Liste', text: '- Élément\n- Élément', block: true },
  { label: '⊞', title: 'Tableau', text: '| Cercle | Kanjis | Activation |\n| --- | --- | --- |\n| 1er cercle | 封 印 | Contact |', block: true },
  { label: 'Note', title: 'Encadré note', text: ':::note[Titre]\nTexte de l’encadré.\n:::', block: true },
  { label: 'Danger', title: 'Encadré danger', text: ':::danger[Attention]\nTexte de l’encadré.\n:::', block: true },
  { label: 'Kanji', title: 'Paire de kanjis', text: '**封印** *(fūin)* — sceller :\n\n- **封** *(fū)* — sceller\n- **印** *(in)* — sceau / marque', block: true },
];

const ICON_PRESET = `<svg width="64" height="64" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="24" cy="24" r="21" opacity="0.3"/>
  <rect x="14" y="14" width="20" height="20" rx="2"/>
  <path d="M14 24 H34 M24 14 V34"/>
</svg>`;

const TEMPLATE = `| Cercle | Kanjis | Activation |
| --- | --- | --- |
| 1er cercle | 封 印 | Contact direct |

## Définition

Décris ici l’effet du sceau.

## Kanjis

**封印** *(fūin)* — sceller :

- **封** *(fū)* — sceller
- **印** *(in)* — sceau / marque

## Règles

- Règle 1
- Règle 2
`;

function emptyPage(categoryId: number): EditablePage {
  return {
    id: null,
    category_id: categoryId,
    slug: '',
    kind: 'seal',
    title: '',
    nav_title: '',
    description: '',
    badge: null,
    kanji: '',
    icon_svg: '',
    content_md: TEMPLATE,
    min_rank: null,
    hidden: true,
    position: null,
  };
}

export function PageEditor() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const isNew = !id || id === 'nouveau';
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { refresh, member } = useSession();

  const [cats, setCats] = useState<AdminCategory[] | null>(null);
  const [page, setPage] = useState<EditablePage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<null | 'save' | 'publish' | 'draft'>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [view, setView] = useState<'edit' | 'preview'>('edit');
  const [dirty, setDirty] = useState(false);
  const [creatorOpen, setCreatorOpen] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const form = useRef<HTMLFormElement>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const c = await api.categories();
      setCats(c);
      if (isNew) {
        const wanted = Number(params.get('categorie'));
        setPage(emptyPage(c.find((x) => x.id === wanted)?.id ?? c.find((x) => x.slug === 'premier-cercle')?.id ?? c[0]?.id ?? 0));
        setSlugTouched(false);
      } else {
        setPage(await api.pageGet(Number(id)));
        setSlugTouched(true);
      }
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [id, isNew, params]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  if (error) return <ErrorState text={error} onRetry={load} />;
  if (!page || !cats) return <Loader label="Ouverture du parchemin…" />;

  const cat = cats.find((c) => c.id === page.category_id);
  const autoSlug = (title: string, catId: number, kind: EditablePage['kind']) => {
    const c = cats.find((x) => x.id === catId);
    if (!c) return slugify(title);
    if (kind === 'index') return c.slug;
    if (kind === 'doc' && c.slug === 'fondations') return slugify(title);
    return `${c.slug}/${slugify(title)}`;
  };

  const set = <K extends keyof EditablePage>(k: K, v: EditablePage[K]) => {
    setDirty(true);
    setPage((p) => {
      if (!p) return p;
      const next = { ...p, [k]: v };
      if (!slugTouched && (k === 'title' || k === 'category_id' || k === 'kind')) {
        next.slug = autoSlug(next.title, next.category_id, next.kind);
      }
      return next;
    });
  };

  const insert = (snippet: (typeof SNIPPETS)[number]) => {
    const ta = textarea.current;
    if (!ta) return;
    const { selectionStart: s, selectionEnd: e, value } = ta;
    const before = value.slice(0, s);
    const pre = snippet.block && before && !before.endsWith('\n\n') ? (before.endsWith('\n') ? '\n' : '\n\n') : '';
    const text = pre + snippet.text + (snippet.block ? '\n' : '');
    const next = before + text + value.slice(e);
    set('content_md', next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = s + text.length;
    });
  };

  /** Enregistre la fiche ; « hidden » change son état : false = publier, true = repasser en brouillon. */
  const save = async (e?: FormEvent, hidden?: boolean) => {
    e?.preventDefault();
    if (hidden !== undefined && form.current && !form.current.reportValidity()) return;
    const next = hidden === undefined ? page : { ...page, hidden };
    const what = page.kind === 'seal' ? 'Sceau' : 'Fiche';
    setSaving(hidden === false ? 'publish' : hidden === true ? 'draft' : 'save');
    setFormError(null);
    try {
      const r = await api.pageSave(next);
      toast(
        hidden === false
          ? `${what} publié${what === 'Fiche' ? 'e' : ''} : les joueurs peuvent ${what === 'Sceau' ? 'le' : 'la'} voir`
          : hidden === true
            ? 'Repassé en brouillon : invisible des joueurs'
            : next.hidden
              ? 'Brouillon enregistré · pas encore visible des joueurs'
              : isNew
                ? 'Fiche créée'
                : 'Fiche enregistrée',
      );
      setDirty(false);
      await refresh();
      if (isNew) navigate(`/conclave/sceaux/${r.id}`, { replace: true });
      setPage((p) => (p ? { ...p, slug: r.slug, hidden: next.hidden } : p));
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(null);
    }
  };

  const remove = async () => {
    if (!page.id) return;
    const ok = await confirm({
      title: `Supprimer « ${page.title} » ?`,
      text: 'La fiche et ses slots éventuels seront définitivement effacés.',
      confirm: 'Supprimer',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.pageDelete(page.id);
      toast('Fiche supprimée');
      await refresh();
      navigate('/conclave/sceaux');
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  return (
    <form ref={form} className="console editor" onSubmit={save} onKeyDown={(e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void save();
      }
    }}>
      <header className="page-head page-head--row">
        <div>
          <Link to="/conclave/sceaux" className="crumb">
            ← Éditeur de sceaux
          </Link>
          <h1>{isNew ? 'Nouvelle fiche' : page.title || 'Sans titre'}</h1>
          {!isNew && page.updated_at && <p className="muted small">Dernière modification le {formatDate(page.updated_at, true)}</p>}
        </div>
        <div className="editor__actions">
          {!isNew && (
            <Link to={'/' + page.slug} className="btn btn--ghost">
              Voir la page
            </Link>
          )}
          {page.hidden ? (
            <>
              <button type="submit" className="btn btn--ghost" disabled={!!saving}>
                {saving === 'save' ? 'Enregistrement…' : `Enregistrer le brouillon${dirty ? ' •' : ''}`}
              </button>
              <button type="button" className="btn btn--red" disabled={!!saving} onClick={() => void save(undefined, false)}>
                {saving === 'publish' ? 'Publication…' : 'Publier sur le site'}
              </button>
            </>
          ) : (
            <button type="submit" className="btn btn--red" disabled={!!saving}>
              {saving === 'save' ? 'Enregistrement…' : dirty ? 'Enregistrer •' : 'Enregistrer'}
            </button>
          )}
        </div>
      </header>
      <div className={`publish-state ${page.hidden ? 'is-draft' : 'is-live'}`}>
        <i aria-hidden="true">{page.hidden ? '稿' : '公'}</i>
        <p>
          {page.hidden ? (
            <>
              <b>Brouillon</b> Seul le Conclave voit cette fiche. Appuie sur « Publier sur le site » pour l’envoyer aux joueurs.
            </>
          ) : isNew ? (
            <>
              <b>Publiée dès l’enregistrement</b> Les joueurs la verront selon le cercle de la catégorie.
            </>
          ) : (
            <>
              <b>Publiée</b> Visible des joueurs, selon le cercle de la catégorie.
            </>
          )}
          {page.badge === 'mj' && <em> Badge MJ : même publiée, elle reste réservée au Conclave.</em>}
        </p>
        {!page.hidden && (
          <button type="button" className="link-btn" disabled={!!saving} onClick={() => (isNew ? set('hidden', true) : void save(undefined, true))}>
            {saving === 'draft' ? 'En cours…' : 'Repasser en brouillon'}
          </button>
        )}
      </div>
      {formError && <p className="form-error">{formError}</p>}

      <div className="editor__grid">
        <section className="panel editor__meta">
          <label className="field">
            <span>Titre</span>
            <input value={page.title} onChange={(e) => set('title', e.target.value)} required placeholder="Sceau de …" />
          </label>
          <label className="field">
            <span>Titre court (sommaire)</span>
            <input value={page.nav_title ?? ''} onChange={(e) => set('nav_title', e.target.value)} placeholder="Laisser vide = titre" />
          </label>
          <div className="field-row">
            <label className="field">
              <span>Catégorie</span>
              <select value={page.category_id} onChange={(e) => set('category_id', Number(e.target.value))}>
                {cats.map((c) => (
                  <option key={c.id} value={c.id ?? 0}>
                    {c.glyph} {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Type</span>
              <select value={page.kind} onChange={(e) => set('kind', e.target.value as EditablePage['kind'])}>
                {(Object.keys(KIND_LABEL) as EditablePage['kind'][]).map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {page.kind === 'memorial' && (
            <p className="muted small">
              Le texte ci-dessous sert d’introduction. Les maîtres, leurs portraits et leurs histoires s’ajoutent directement sur la page du
              mémorial.
            </p>
          )}
          <label className="field">
            <span>Adresse de la page</span>
            <div className="field__prefix">
              <i>/</i>
              <input
                value={page.slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  set('slug', e.target.value.toLowerCase());
                }}
                required
                placeholder="premier-cercle/mon-sceau"
              />
            </div>
          </label>
          <label className="field">
            <span>Formule de kanjis</span>
            <input className="input-kanji" lang="ja" value={page.kanji ?? ''} onChange={(e) => set('kanji', e.target.value)} placeholder="封 印" />
          </label>
          <label className="field">
            <span>Description courte</span>
            <textarea rows={2} value={page.description} onChange={(e) => set('description', e.target.value)} placeholder="Une phrase qui résume le sceau." />
          </label>
          <div className="field-row">
            <label className="field">
              <span>Badge</span>
              <select value={page.badge ?? ''} onChange={(e) => set('badge', (e.target.value || null) as EditablePage['badge'])}>
                <option value="">Aucun</option>
                <option value="mj">MJ · invisible des joueurs</option>
              </select>
            </label>
            <label className="field">
              <span>Cercle minimum</span>
              <select value={page.min_rank ?? ''} onChange={(e) => set('min_rank', e.target.value ? Number(e.target.value) : null)}>
                <option value="">Celui de la catégorie ({cat ? circleLabel(cat.min_rank) : '—'})</option>
                {RANKS.map((r) => (
                  <option key={r} value={r}>
                    {circleLabel(r)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {page.badge === 'mj' && (
            <p className="muted small">Sceau MJ : seul le Conclave peut le voir, quelle que soit sa catégorie.</p>
          )}
          <label className="field">
            <span>Ordre dans le sommaire</span>
            <input type="number" value={page.position ?? ''} onChange={(e) => set('position', e.target.value === '' ? null : Number(e.target.value))} placeholder="auto" />
          </label>
          <div className="field">
            <span>Visuel du sceau</span>
            <div className="icon-field">
              <div
                className="seal-icon seal-icon--md"
                dangerouslySetInnerHTML={{
                  __html: sanitizeSvg(displaySealSvg(page.icon_svg, page.kanji)),
                }}
              />
              <div className="icon-field__actions">
                <button type="button" className="btn btn--red btn--sm" onClick={() => setCreatorOpen(true)}>
                  {parseDesign(page.icon_svg) ? 'Modifier le visuel' : 'Créer le visuel'}
                </button>
                {!page.icon_svg && <small className="muted">Sans visuel, un sceau est dessiné automatiquement avec la formule.</small>}
                {page.icon_svg && (
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => set('icon_svg', '')}>
                    Retirer le visuel
                  </button>
                )}
              </div>
            </div>
            <details className="md-help">
              <summary>SVG avancé</summary>
              <textarea rows={4} className="mono icon-field__svg" value={page.icon_svg ?? ''} onChange={(e) => set('icon_svg', e.target.value)} placeholder="<svg …>…</svg>" />
              {!page.icon_svg && (
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => set('icon_svg', ICON_PRESET)}>
                  Utiliser une icône simple
                </button>
              )}
            </details>
          </div>
          {!isNew && (
            <button type="button" className="btn btn--ghost btn--danger-text btn--block" onClick={remove}>
              Supprimer cette fiche
            </button>
          )}
        </section>

        <section className="panel editor__body">
          <div className="editor__tabs">
            <div className="tabs tabs--small">
              <button type="button" className={`tab${view === 'edit' ? ' is-on' : ''}`} onClick={() => setView('edit')}>
                Rédaction
              </button>
              <button type="button" className={`tab${view === 'preview' ? ' is-on' : ''}`} onClick={() => setView('preview')}>
                Aperçu
              </button>
            </div>
            {view === 'edit' && (
              <div className="snippets">
                {SNIPPETS.map((s) => (
                  <button key={s.label} type="button" title={s.title} onClick={() => insert(s)}>
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className={`editor__panes is-${view}`}>
            <textarea
              ref={textarea}
              className="editor__textarea mono"
              value={page.content_md}
              onChange={(e) => set('content_md', e.target.value)}
              spellCheck
              aria-label="Contenu (markdown)"
            />
            <div className="editor__preview archive__content">
              {page.kanji && page.kind === 'seal' && (
                <div className="formula">
                  <div>
                    <p className="kicker">Formule de kanjis</p>
                    <p className="formula__kanji" lang="ja">
                      {page.kanji}
                    </p>
                  </div>
                </div>
              )}
              <Markdown source={page.content_md} />
            </div>
          </div>
          <details className="md-help">
            <summary>Aide à la mise en forme</summary>
            <div className="md-help__grid">
              <code>## Titre</code>
              <span>Titre de section</span>
              <code>**gras** · *italique*</code>
              <span>Mise en valeur</span>
              <code>- élément</code>
              <span>Liste à puces</span>
              <code>| A | B |{'\n'}| --- | --- |{'\n'}| 1 | 2 |</code>
              <span>Tableau</span>
              <code>:::danger[Titre]{'\n'}Texte{'\n'}:::</code>
              <span>Encadré (note, tip, caution, danger)</span>
              <code>[texte](/troisieme-cercle/silence)</code>
              <span>Lien vers une autre fiche</span>
            </div>
          </details>
        </section>
      </div>
      <SealCreator
        open={creatorOpen}
        initialSvg={page.icon_svg}
        kanji={page.kanji}
        onClose={() => setCreatorOpen(false)}
        onUse={(svg) => set('icon_svg', svg)}
        fileName={page.title || 'sceau'}
        draftKey={`fiche.${member?.id ?? 'conclave'}.${page.id ?? 'nouvelle'}.visuel`}
      />
    </form>
  );
}
