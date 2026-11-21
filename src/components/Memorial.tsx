import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { api, type AdminMember, type MemorialEntry, type MemorialRank, type MemorialStatus } from '../lib/api';
import { useSession } from '../lib/session';
import { excerpt } from '../lib/markdown';
import { fileToPortrait } from '../lib/imageResize';
import Markdown from './Markdown';
import { ErrorState, Loader, Modal, useConfirm, useToast } from './ui';

export const MEMORIAL_STATUS: Record<Exclude<MemorialStatus, ''>, { label: string; glyph: string }> = {
  actif: { label: 'En fonction', glyph: '現' },
  retire: { label: 'Retiré', glyph: '退' },
  mort: { label: 'Décédé', glyph: '故' },
  disparu: { label: 'Disparu', glyph: '失' },
  traitre: { label: 'Traître', glyph: '叛' },
};

const RANKS: { key: MemorialRank; title: string; kicker: string; glyph: string; single: string; add: string; empty: string }[] = [
  {
    key: 'grand_maitre',
    title: 'Les Grands Maîtres',
    kicker: 'Le plus haut rang de l’art',
    glyph: '大師',
    single: 'Grand Maître',
    add: 'Ajouter un Grand Maître',
    empty: 'Aucun Grand Maître n’est encore inscrit.',
  },
  {
    key: 'maitre',
    title: 'Les Maîtres',
    kicker: 'Gardiens et passeurs du savoir',
    glyph: '師',
    single: 'Maître',
    add: 'Ajouter un Maître',
    empty: 'Aucun Maître n’est encore inscrit.',
  },
];

const rankInfo = (r: MemorialRank) => RANKS.find((x) => x.key === r) ?? RANKS[1];

const blank = (rank: MemorialRank): MemorialEntry => ({
  id: null,
  name: '',
  rank,
  epithet: '',
  status: '',
  origin: '',
  era: '',
  specialty: '',
  story_md: '',
  image: null,
  member_id: null,
});

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? '?').slice(0, 2)).toUpperCase();
}

function Portrait({ entry }: { entry: Pick<MemorialEntry, 'image' | 'name' | 'rank'> }) {
  if (entry.image) return <img src={entry.image} alt={`Portrait de ${entry.name || 'ce maître'}`} loading="lazy" draggable={false} />;
  return (
    <span className="memorial-void" aria-hidden="true">
      <i>{rankInfo(entry.rank).glyph}</i>
      <b>{initials(entry.name || '?')}</b>
    </span>
  );
}

function StatusBadge({ status }: { status: MemorialStatus }) {
  if (!status) return null;
  const s = MEMORIAL_STATUS[status];
  return (
    <span className={`memorial-status memorial-status--${status}`}>
      <i aria-hidden="true">{s.glyph}</i>
      {s.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Carte
// ---------------------------------------------------------------------------
function Card({
  entry,
  index,
  count,
  conclave,
  onOpen,
  onEdit,
  onMove,
  onDelete,
}: {
  entry: MemorialEntry;
  index: number;
  count: number;
  conclave: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
}) {
  const big = entry.rank === 'grand_maitre';
  const meta = [entry.origin, entry.era].filter(Boolean).join(' · ');
  return (
    <article
      className={`memorial-card memorial-card--${entry.rank}${entry.status ? ` is-${entry.status}` : ''}${entry.mine ? ' is-mine' : ''}`}
      style={{ animationDelay: `${index * 70}ms` }}
    >
      <button type="button" className="memorial-card__open" onClick={onOpen} aria-label={`Ouvrir la fiche de ${entry.name}`}>
        <span className="memorial-card__portrait">
          <Portrait entry={entry} />
          <span className="memorial-card__rank" aria-hidden="true">
            {rankInfo(entry.rank).glyph}
          </span>
          {entry.status === 'traitre' && (
            <span className="memorial-stamp" aria-hidden="true">
              叛
            </span>
          )}
          <StatusBadge status={entry.status} />
        </span>
        <span className="memorial-card__body">
          <span className="memorial-card__name">{entry.name}</span>
          {entry.epithet && <span className="memorial-card__epithet">« {entry.epithet} »</span>}
          {meta && <span className="memorial-card__meta">{meta}</span>}
          {big && entry.story_md && <span className="memorial-card__excerpt">{excerpt(entry.story_md, 150)}</span>}
          <span className="memorial-card__more">
            {entry.story_md ? 'Lire son histoire' : 'Voir la fiche'} <i aria-hidden="true">→</i>
          </span>
        </span>
      </button>
      {!conclave && entry.can_edit && (
        <button type="button" className="memorial-card__mine" onClick={onEdit} title="Modifier ma fiche">
          <span aria-hidden="true">✎</span> Ma fiche
        </button>
      )}
      {conclave && (
        <div className="memorial-card__tools" aria-label={`Gérer ${entry.name}`}>
          <button type="button" className="icon-btn" onClick={() => onMove(-1)} disabled={index === 0} title="Déplacer avant" aria-label="Déplacer avant">
            ←
          </button>
          <button type="button" className="icon-btn" onClick={() => onMove(1)} disabled={index === count - 1} title="Déplacer après" aria-label="Déplacer après">
            →
          </button>
          <button type="button" className="icon-btn" onClick={onEdit} title="Modifier" aria-label="Modifier">
            ✎
          </button>
          <button type="button" className="icon-btn icon-btn--danger" onClick={onDelete} title="Retirer du mémorial" aria-label="Retirer du mémorial">
            ✕
          </button>
        </div>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------
// Fiche détaillée
// ---------------------------------------------------------------------------
function Detail({ entry, conclave, onClose, onEdit }: { entry: MemorialEntry | null; conclave: boolean; onClose: () => void; onEdit: () => void }) {
  const info = entry ? rankInfo(entry.rank) : RANKS[0];
  const rows: [string, string][] = entry
    ? ([
        ['Rang', info.single],
        ['Statut', entry.status ? MEMORIAL_STATUS[entry.status].label : ''],
        ['Village ou clan', entry.origin],
        ['Époque', entry.era],
        ['Spécialité', entry.specialty],
      ] as [string, string][]).filter(([, v]) => v)
    : [];
  return (
    <Modal open={!!entry} onClose={onClose} title={entry?.name ?? ''} kicker={info.single} wide>
      {entry && (
        <div className={`memorial-detail${entry.status ? ` is-${entry.status}` : ''}`}>
          <div className="memorial-detail__portrait">
            <span className="memorial-card__portrait">
              <Portrait entry={entry} />
              {entry.status === 'traitre' && (
                <span className="memorial-stamp" aria-hidden="true">
                  叛
                </span>
              )}
            </span>
          </div>
          <div className="memorial-detail__body">
            {entry.epithet && <p className="memorial-detail__epithet">« {entry.epithet} »</p>}
            <dl className="memorial-detail__facts">
              {rows.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <div className="memorial-detail__story">
              <p className="kicker">Son histoire</p>
              {entry.story_md.trim() ? <Markdown source={entry.story_md} /> : <p className="muted">Son histoire reste à écrire.</p>}
            </div>
            {(conclave || entry.can_edit) && (
              <div className="form-actions">
                <button type="button" className={`btn btn--sm ${conclave ? 'btn--ghost' : 'btn--red'}`} onClick={onEdit}>
                  {conclave ? 'Modifier la fiche' : 'Modifier ma fiche'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Formulaire du Conclave
// ---------------------------------------------------------------------------
function EditForm({
  entry,
  own,
  onClose,
  onSaved,
  onDelete,
}: {
  entry: MemorialEntry | null;
  /** le maître modifie sa propre fiche : nom, rang, statut et lien restent au Conclave */
  own: boolean;
  onClose: () => void;
  onSaved: () => void;
  onDelete: (e: MemorialEntry) => void;
}) {
  const toast = useToast();
  const [d, setD] = useState<MemorialEntry | null>(entry);
  const [members, setMembers] = useState<AdminMember[] | null>(null);

  // le Conclave choisit quel shinobi peut modifier cette fiche
  useEffect(() => {
    if (!entry || own || members) return;
    api
      .members()
      .then(setMembers)
      .catch(() => setMembers([]));
  }, [entry, own, members]);
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => setD(entry), [entry]);

  const set = <K extends keyof MemorialEntry>(k: K, v: MemorialEntry[K]) => setD((p) => (p ? { ...p, [k]: v } : p));

  const takeFile = async (file: File | undefined) => {
    if (!file) return;
    setPreparing(true);
    try {
      set('image', await fileToPortrait(file));
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setPreparing(false);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    void takeFile(e.dataTransfer.files?.[0]);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!d) return;
    setBusy(true);
    try {
      if (own) await api.memorialOwnSave(d);
      else await api.memorialSave({ ...d, member_id: d.member_id ?? null });
      toast(own ? 'Ta fiche est à jour' : d.id ? 'Fiche mise à jour' : `${d.name} rejoint le mémorial`);
      onSaved();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const isUrl = !!d?.image && d.image.startsWith('https://');

  return (
    <Modal
      open={!!entry}
      onClose={onClose}
      title={own ? `Ma fiche · ${entry?.name ?? ''}` : entry?.id ? `Modifier ${entry.name}` : 'Nouvelle entrée du mémorial'}
      kicker="Mémorial des maîtres"
      wide
    >
      {d && (
        <form className="memorial-form" onSubmit={save}>
          <div className="memorial-form__grid">
            <div
              className={`memorial-drop${dragOver ? ' is-over' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
            >
              <span className="memorial-card__portrait">
                <Portrait entry={d} />
                {preparing && <span className="memorial-drop__busy">Préparation…</span>}
              </span>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                hidden
                onChange={(e) => {
                  void takeFile(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              <div className="memorial-drop__actions">
                <button type="button" className="btn btn--red btn--sm" onClick={() => fileRef.current?.click()} disabled={preparing}>
                  {d.image ? 'Changer l’image' : 'Choisir une image'}
                </button>
                {d.image && (
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => set('image', null)}>
                    Retirer
                  </button>
                )}
              </div>
              <small className="muted">Glisse une image ici ou choisis-la. Elle est réduite automatiquement.</small>
              <label className="field">
                <span>Ou adresse d’une image</span>
                <input
                  type="url"
                  placeholder="https://…"
                  value={isUrl ? d.image ?? '' : ''}
                  onChange={(e) => set('image', e.target.value.trim() || null)}
                />
              </label>
            </div>

            <div className="memorial-form__fields">
              {own ? (
                <div className="memorial-form__locked">
                  <b>{d.name}</b>
                  <span>
                    {rankInfo(d.rank).single}
                    {d.status ? ` · ${MEMORIAL_STATUS[d.status].label}` : ''}
                  </span>
                  <small className="muted">Ton nom, ton rang et ton statut sont tenus par le Conclave. Le reste de la fiche est à toi.</small>
                </div>
              ) : (
                <>
                <label className="field">
                  <span>Nom</span>
                  <input value={d.name} onChange={(e) => set('name', e.target.value)} maxLength={80} required autoFocus placeholder="Shiro Yara" />
                </label>
                <div className="field">
                  <span>Rang</span>
                  <div className="segmented" role="radiogroup" aria-label="Rang">
                    {RANKS.map((r) => (
                      <button
                        key={r.key}
                        type="button"
                        role="radio"
                        aria-checked={d.rank === r.key}
                        className={d.rank === r.key ? 'is-on' : ''}
                        onClick={() => set('rank', r.key)}
                      >
                        <i aria-hidden="true">{r.glyph}</i> {r.single}
                      </button>
                    ))}
                  </div>
                </div>
                  <label className="field">
                    <span>Shinobi lié à la fiche</span>
                    <select value={d.member_id ?? ''} onChange={(e) => set('member_id', e.target.value || null)} disabled={!members}>
                      <option value="">{members ? 'Aucun : seul le Conclave modifie cette fiche' : 'Chargement des shinobi…'}</option>
                      {d.member_id && members && !members.some((m) => m.id === d.member_id) && (
                        <option value={d.member_id}>{d.member_name ?? 'Shinobi lié'}</option>
                      )}
                      {(members ?? [])
                        .filter((m) => m.active || m.id === d.member_id)
                        .sort((a, b) => a.display_name.localeCompare(b.display_name, 'fr'))
                        .map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.display_name}
                          </option>
                        ))}
                    </select>
                    <small className="muted">Ce shinobi pourra modifier lui-même son portrait, son titre, son origine, sa spécialité et son histoire.</small>
                  </label>
                </>
              )}
              <div className="memorial-form__row">
                <label className="field">
                  <span>Titre ou surnom</span>
                  <input value={d.epithet} onChange={(e) => set('epithet', e.target.value)} maxLength={120} placeholder="Le Scelleur blanc" />
                </label>
                {!own && (
                  <label className="field">
                    <span>Statut</span>
                    <select value={d.status} onChange={(e) => set('status', e.target.value as MemorialStatus)}>
                      <option value="">Non précisé</option>
                      {(Object.keys(MEMORIAL_STATUS) as Exclude<MemorialStatus, ''>[]).map((k) => (
                        <option key={k} value={k}>
                          {MEMORIAL_STATUS[k].label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              <div className="memorial-form__row">
                <label className="field">
                  <span>Village ou clan</span>
                  <input value={d.origin} onChange={(e) => set('origin', e.target.value)} maxLength={120} />
                </label>
                <label className="field">
                  <span>Époque</span>
                  <input value={d.era} onChange={(e) => set('era', e.target.value)} maxLength={120} placeholder="Ex. : de l’an 2 à l’an 6" />
                </label>
              </div>
              <label className="field">
                <span>Spécialité</span>
                <input value={d.specialty} onChange={(e) => set('specialty', e.target.value)} maxLength={160} placeholder="Sceaux de barrière, désenclavement…" />
              </label>
              <label className="field">
                <span>Son histoire</span>
                <textarea
                  value={d.story_md}
                  onChange={(e) => set('story_md', e.target.value)}
                  rows={9}
                  maxLength={20000}
                  placeholder="Son parcours, ses hauts faits, ses élèves, sa chute…"
                />
                <small className="muted">Mise en forme possible : **gras**, *italique*, listes, &gt; citations.</small>
              </label>
            </div>
          </div>
          <div className="form-actions">
            {d.id && !own && (
              <button type="button" className="btn btn--danger-text memorial-form__delete" onClick={() => onDelete(d)}>
                Retirer du mémorial
              </button>
            )}
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className="btn btn--red" disabled={busy || preparing || !d.name.trim()}>
              {busy ? 'Enregistrement…' : own ? 'Enregistrer ma fiche' : d.id ? 'Enregistrer' : 'Ajouter au mémorial'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Mémorial
// ---------------------------------------------------------------------------
export default function Memorial() {
  const { member } = useSession();
  const conclave = !!member?.is_conclave;
  const toast = useToast();
  const confirm = useConfirm();
  const [list, setList] = useState<MemorialEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<MemorialEntry | null>(null);
  const [edit, setEdit] = useState<MemorialEntry | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setList(await api.memorial());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const move = async (e: MemorialEntry, dir: -1 | 1) => {
    if (!e.id) return;
    try {
      await api.memorialMove(e.id, dir);
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const remove = async (e: MemorialEntry) => {
    if (!e.id) return;
    const ok = await confirm({
      title: `Retirer ${e.name} du mémorial ?`,
      text: 'Sa fiche, son portrait et son histoire seront effacés.',
      confirm: 'Retirer',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.memorialDelete(e.id);
      toast(`${e.name} a été retiré du mémorial`);
      setEdit(null);
      setOpen(null);
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  if (error) return <ErrorState text={error} onRetry={load} />;
  if (!list) return <Loader label="Ouverture du mémorial…" />;

  return (
    <div className="memorial">
      {RANKS.map((r) => {
        const items = list.filter((e) => e.rank === r.key);
        return (
          <section key={r.key} className={`memorial-section memorial-section--${r.key}`}>
            <header className="memorial-section__head">
              <span className="memorial-section__glyph" aria-hidden="true">
                {r.glyph}
              </span>
              <div>
                <p className="kicker">{r.kicker}</p>
                <h2>{r.title}</h2>
              </div>
              <span className="memorial-section__line" aria-hidden="true" />
              <span className="memorial-section__count">{String(items.length).padStart(2, '0')}</span>
            </header>
            <div className={`memorial-grid memorial-grid--${r.key}`}>
              {items.map((e, i) => (
                <Card
                  key={e.id}
                  entry={e}
                  index={i}
                  count={items.length}
                  conclave={conclave}
                  onOpen={() => setOpen(e)}
                  onEdit={() => setEdit(e)}
                  onMove={(dir) => void move(e, dir)}
                  onDelete={() => void remove(e)}
                />
              ))}
              {conclave && (
                <button type="button" className={`memorial-add memorial-add--${r.key}`} onClick={() => setEdit(blank(r.key))}>
                  <i aria-hidden="true">＋</i>
                  {r.add}
                </button>
              )}
            </div>
            {!items.length && !conclave && <p className="muted memorial-empty">{r.empty}</p>}
          </section>
        );
      })}

      <Detail
        entry={open}
        conclave={conclave}
        onClose={() => setOpen(null)}
        onEdit={() => {
          setEdit(open);
          setOpen(null);
        }}
      />
      <EditForm
        entry={edit}
        own={!conclave}
        onClose={() => setEdit(null)}
        onSaved={() => {
          setEdit(null);
          void load();
        }}
        onDelete={(e) => void remove(e)}
      />
    </div>
  );
}
