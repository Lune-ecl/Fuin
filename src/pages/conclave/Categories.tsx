import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type AdminCategory } from '../../lib/api';
import { useSession } from '../../lib/session';
import { slugify } from '../../lib/format';
import { ErrorState, Loader, RankPicker, Toggle, useConfirm, useToast } from '../../components/ui';

function CategoryCard({ initial, onSaved, onDeleted }: { initial: AdminCategory; onSaved: () => void; onDeleted: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [c, setC] = useState(initial);
  const [busy, setBusy] = useState(false);
  const isNew = c.id === null;
  const dirty = JSON.stringify(c) !== JSON.stringify(initial);

  useEffect(() => setC(initial), [initial]);

  const set = <K extends keyof AdminCategory>(k: K, v: AdminCategory[K]) =>
    setC((x) => ({ ...x, [k]: v, ...(isNew && k === 'name' ? { slug: slugify(String(v)) } : {}) }));

  const save = async () => {
    setBusy(true);
    try {
      await api.categorySave(c);
      toast(`${c.name} enregistré`);
      onSaved();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!c.id) return onDeleted();
    if (!(await confirm({ title: `Supprimer la catégorie « ${c.name} » ?`, confirm: 'Supprimer', danger: true }))) return;
    try {
      await api.categoryDelete(c.id);
      toast('Catégorie supprimée');
      onSaved();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    }
  };

  return (
    <section className={`panel cat-card${dirty ? ' is-dirty' : ''}`}>
      <div className="cat-card__head">
        <input className="cat-card__glyph" value={c.glyph} onChange={(e) => set('glyph', e.target.value)} maxLength={2} aria-label="Kanji de la catégorie" lang="ja" />
        <div className="cat-card__names">
          <input className="cat-card__name" value={c.name} onChange={(e) => set('name', e.target.value)} placeholder="Nom de la catégorie" aria-label="Nom" />
          <input className="cat-card__tagline" value={c.tagline} onChange={(e) => set('tagline', e.target.value)} placeholder="Accroche (accueil)" aria-label="Accroche" />
        </div>
        <span className="muted small">{c.page_count ?? 0} fiche(s)</span>
      </div>
      <div className="cat-card__grid">
        <div className="field">
          <span>Cercle requis pour lire</span>
          <RankPicker value={c.min_rank} onChange={(r) => set('min_rank', r)} name={`cat-${c.id ?? 'new'}`} />
        </div>
        <div className="cat-card__toggles">
          <Toggle checked={c.conclave_only} onChange={(v) => set('conclave_only', v)} label="Réservé au Conclave" hint="Ignore le cercle requis" />
          <Toggle checked={c.show_on_home} onChange={(v) => set('show_on_home', v)} label="Carte sur l’accueil" />
        </div>
        <label className="field">
          <span>Identifiant</span>
          <input value={c.slug} onChange={(e) => set('slug', e.target.value.toLowerCase())} />
        </label>
        <label className="field">
          <span>Ordre</span>
          <input type="number" value={c.position} onChange={(e) => set('position', Number(e.target.value))} />
        </label>
      </div>
      <div className="form-actions">
        {c.id && (
          <Link to={`/conclave/sceaux/nouveau?categorie=${c.id}`} className="btn btn--ghost btn--sm">
            + Fiche dans cette catégorie
          </Link>
        )}
        {(c.page_count ?? 0) === 0 && (
          <button type="button" className="btn btn--ghost btn--sm btn--danger-text" onClick={remove}>
            Supprimer
          </button>
        )}
        <button type="button" className="btn btn--red btn--sm" onClick={save} disabled={busy || (!dirty && !isNew)}>
          {isNew ? 'Créer' : 'Enregistrer'}
        </button>
      </div>
    </section>
  );
}

export default function Categories() {
  const { refresh } = useSession();
  const [cats, setCats] = useState<AdminCategory[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<AdminCategory | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setCats(await api.categories());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <ErrorState text={error} onRetry={load} />;
  if (!cats) return <Loader />;

  const saved = async () => {
    setDraft(null);
    await load();
    await refresh();
  };

  return (
    <div className="console">
      <header className="page-head page-head--row">
        <div>
          <p className="kicker">Console du Conclave</p>
          <h1>Catégories & droits</h1>
          <p className="muted">
            Un shinobi lit une catégorie si son cercle est <b>supérieur ou égal</b> au cercle requis. Le Conclave voit tout.
          </p>
        </div>
        {!draft && (
          <button
            type="button"
            className="btn btn--red"
            onClick={() =>
              setDraft({
                id: null,
                slug: '',
                name: '',
                glyph: '封',
                tagline: '',
                min_rank: 1,
                conclave_only: false,
                show_on_home: true,
                position: (cats.at(-1)?.position ?? 0) + 1,
              })
            }
          >
            + Nouvelle catégorie
          </button>
        )}
      </header>
      <div className="cat-cards">
        {draft && <CategoryCard initial={draft} onSaved={saved} onDeleted={() => setDraft(null)} />}
        {cats.map((c) => (
          <CategoryCard key={c.id} initial={c} onSaved={saved} onDeleted={saved} />
        ))}
      </div>
    </div>
  );
}
