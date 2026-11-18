import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, type AdminCategory, type AdminPageRow, type EditablePage } from '../../lib/api';
import { useSession } from '../../lib/session';
import { circleLabel, formatDate, normalize, RANKS, slugify, timeAgo } from '../../lib/format';
import { sanitizeSvg } from '../../lib/markdown';
import Markdown from '../../components/Markdown';
import { Empty, ErrorState, Loader, SealBadge, Toggle, useConfirm, useToast } from '../../components/ui';

const KIND_LABEL: Record<EditablePage['kind'], string> = {
  seal: 'Sceau',
  index: 'Vue d’ensemble du cercle',
  doc: 'Dossier / règles',
};

// ---------------------------------------------------------------------------
// Liste des fiches
// ---------------------------------------------------------------------------
export function EditorList() {
  const [rows, setRows] = useState<AdminPageRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');

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

  const groups = useMemo(() => {
    const nq = normalize(q.trim());
    const m = new Map<string, AdminPageRow[]>();
    (rows ?? [])
      .filter((r) => !nq || normalize(`${r.title} ${r.slug} ${r.kanji ?? ''}`).includes(nq) || (r.kanji ?? '').includes(q.trim()))
      .forEach((r) => {
        const k = `${r.category_glyph} ${r.category_name}`;
        m.set(k, [...(m.get(k) ?? []), r]);
      });
    return [...m.entries()];
  }, [rows, q]);

  if (error) return <ErrorState text={error} onRetry={load} />;
  if (!rows) return <Loader label="Déroulement des parchemins…" />;

  return (
    <div className="console">
      <header className="page-head page-head--row">
        <div>
          <p className="kicker">Console du Conclave</p>
          <h1>Éditeur de sceaux</h1>
          <p className="muted">Kanjis, définitions, règles : chaque fiche est une page du grimoire.</p>
        </div>
        <Link to="/conclave/sceaux/nouveau" className="btn btn--red">
          + Nouvelle fiche
        </Link>
      </header>
      <section className="panel">
        <div className="toolbar">
          <input className="input-search" type="search" placeholder="Rechercher un sceau, un kanji, une URL…" value={q} onChange={(e) => setQ(e.target.value)} />
          <span className="muted small">{rows.length} fiches</span>
        </div>
        {groups.length === 0 && <Empty glyph="巻">Aucune fiche trouvée.</Empty>}
        {groups.map(([name, list]) => (
          <div key={name} className="editor-group">
            <h3 className="editor-group__title">{name}</h3>
            <ul className="editor-list">
              {list.map((r) => (
                <li key={r.id}>
                  <Link to={`/conclave/sceaux/${r.id}`} className={`editor-row${r.hidden ? ' is-hidden' : ''}`}>
                    <span className="editor-row__kanji" lang="ja">
                      {r.kanji?.split(' ').slice(0, 2).join('') || (r.kind === 'index' ? '総' : r.kind === 'doc' ? '典' : '封')}
                    </span>
                    <span className="editor-row__main">
                      <b>{r.title}</b>
                      <small>/{r.slug}</small>
                    </span>
                    <span className="editor-row__tags">
                      {r.kind !== 'seal' && <span className="tag tag--ghost">{r.kind === 'index' ? 'index' : 'dossier'}</span>}
                      {r.hidden && <span className="badge badge--draft">brouillon</span>}
                      {r.min_rank && <span className="tag tag--ghost">{circleLabel(r.min_rank)}+</span>}
                      <SealBadge badge={r.badge} slotted={r.slotted} />
                    </span>
                    <span className="editor-row__date" title={r.updated_by ? `par ${r.updated_by}` : undefined}>
                      {timeAgo(r.updated_at)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
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
  const { refresh } = useSession();

  const [cats, setCats] = useState<AdminCategory[] | null>(null);
  const [page, setPage] = useState<EditablePage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [view, setView] = useState<'edit' | 'preview'>('edit');
  const [dirty, setDirty] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);

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

  const save = async (e?: FormEvent) => {
    e?.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const r = await api.pageSave(page);
      toast(isNew ? 'Fiche créée' : 'Fiche enregistrée');
      setDirty(false);
      await refresh();
      if (isNew) navigate(`/conclave/sceaux/${r.id}`, { replace: true });
      else setPage((p) => (p ? { ...p, slug: r.slug } : p));
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
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

  const icon = sanitizeSvg(page.icon_svg);

  return (
    <form className="console editor" onSubmit={save} onKeyDown={(e) => {
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
          <button type="submit" className="btn btn--red" disabled={saving}>
            {saving ? 'Enregistrement…' : dirty ? 'Enregistrer •' : 'Enregistrer'}
          </button>
        </div>
      </header>
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
                <option value="mj">MJ (réservé aux MJ)</option>
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
          <label className="field">
            <span>Ordre dans le sommaire</span>
            <input type="number" value={page.position ?? ''} onChange={(e) => set('position', e.target.value === '' ? null : Number(e.target.value))} placeholder="auto" />
          </label>
          <Toggle
            checked={page.hidden}
            onChange={(v) => set('hidden', v)}
            label="Brouillon"
            hint="Invisible des joueurs, visible du Conclave"
          />
          <div className="field">
            <span>Icône (SVG)</span>
            <div className="icon-field">
              <div className="seal-icon seal-icon--sm" dangerouslySetInnerHTML={{ __html: icon || '<span>封</span>' }} />
              <textarea rows={4} className="mono" value={page.icon_svg ?? ''} onChange={(e) => set('icon_svg', e.target.value)} placeholder="<svg …>…</svg>" />
            </div>
            {!page.icon_svg && (
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => set('icon_svg', ICON_PRESET)}>
                Utiliser une icône de base
              </button>
            )}
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
    </form>
  );
}
