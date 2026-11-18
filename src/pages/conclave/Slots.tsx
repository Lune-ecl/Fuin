import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, NavLink, useSearchParams } from 'react-router-dom';
import { api, type AdminSeal, type AdminSlots, type Village } from '../../lib/api';
import { useSession } from '../../lib/session';
import { Empty, ErrorState, Loader, useConfirm, useToast } from '../../components/ui';

type Tab = 'suivi' | 'catalogue' | 'config';

const capOf = (s: AdminSeal, villageId: number) => s.caps.find((c) => c.village_id === villageId)?.cap ?? 0;
const totalCap = (s: AdminSeal) => s.caps.reduce((n, c) => n + c.cap, 0);

function useSlots() {
  const [data, setData] = useState<AdminSlots | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api.slots());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return { data, error, load };
}

// ---------------------------------------------------------------------------
// Suivi
// ---------------------------------------------------------------------------
function AssignForm({ seal, village, data, onDone }: { seal: AdminSeal; village: Village; data: AdminSlots; onDone: () => void }) {
  const toast = useToast();
  const [memberId, setMemberId] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const taken = new Set(seal.assignments.map((a) => a.member_id));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!memberId) return;
    setBusy(true);
    try {
      await api.slotAssign(seal.page_id, village.id, memberId, note);
      toast(`Slot attribué · ${seal.title} (${village.name})`);
      setMemberId('');
      setNote('');
      onDone();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="assign" onSubmit={submit}>
      <select value={memberId} onChange={(e) => setMemberId(e.target.value)} aria-label={`Assigner un shinobi (${village.name})`} required>
        <option value="">Assigner…</option>
        {data.members
          .filter((m) => !taken.has(m.id))
          .map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} · C{m.rank}
              {m.is_conclave ? ' · Conclave' : ''}
            </option>
          ))}
      </select>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="note" aria-label="Note" />
      <button type="submit" className="btn btn--red btn--sm" disabled={busy || !memberId} aria-label="Attribuer">
        +
      </button>
    </form>
  );
}

function Suivi({ data, reload }: { data: AdminSlots; reload: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const flagged = data.seals.filter((s) => s.flagged);
  const active = flagged.filter((s) => totalCap(s) > 0);
  const empty = flagged.filter((s) => totalCap(s) === 0);
  const taken = active.reduce((n, s) => n + s.assignments.length, 0);
  const total = active.reduce((n, s) => n + totalCap(s), 0);
  const fullVillages = active.reduce(
    (n, s) => n + data.villages.filter((v) => capOf(s, v.id) > 0 && s.assignments.filter((a) => a.village_id === v.id).length >= capOf(s, v.id)).length,
    0,
  );

  const unassign = async (id: number, name: string, title: string) => {
    if (!(await confirm({ title: `Libérer le slot de ${name} ?`, text: `${name} perdra sa place sur « ${title} ».`, confirm: 'Libérer' }))) return;
    try {
      await api.slotUnassign(id);
      toast(`Slot libéré · ${title}`);
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    }
  };

  return (
    <>
      <div className="stats stats--3">
        <div className="stat">
          <b>{active.length}</b>
          <span>Sceaux slottés</span>
        </div>
        <div className="stat">
          <b>
            {taken}
            <small>/{total}</small>
          </b>
          <span>Places occupées</span>
        </div>
        <div className="stat">
          <b>{fullVillages}</b>
          <span>Villages complets</span>
        </div>
      </div>

      {active.length === 0 && <Empty glyph="枠">Aucun sceau n’a encore de places. Va dans Configuration pour en slotter un.</Empty>}

      <div className="slot-list">
        {active.map((s) => (
          <section key={s.page_id} className="slot-card">
            <header className="slot-card__head">
              <div>
                <span className="kicker">{s.category.name}</span>
                <h3>
                  <Link to={'/' + s.slug}>{s.title}</Link>
                </h3>
              </div>
              <span className="slot-card__count">
                {s.assignments.length}/{totalCap(s)}
              </span>
            </header>
            {s.notes && <p className="slot-card__notes">{s.notes}</p>}
            <div className="slot-villages">
              {data.villages
                .filter((v) => capOf(s, v.id) > 0 || s.assignments.some((a) => a.village_id === v.id))
                .map((v) => {
                  const cap = capOf(s, v.id);
                  const occ = s.assignments.filter((a) => a.village_id === v.id);
                  const full = occ.length >= cap;
                  return (
                    <div key={v.id} className={`slot-village${full ? ' is-full' : ''}`}>
                      <div className="slot-village__head">
                        <b>{v.name}</b>
                        <span>
                          {occ.length}/{cap}
                        </span>
                      </div>
                      <span className="gauge">
                        <i style={{ width: `${cap ? Math.min(100, (occ.length / cap) * 100) : 100}%` }} />
                      </span>
                      <ul className="occupants">
                        {occ.map((a) => (
                          <li key={a.id} className="occupant" title={a.note || undefined}>
                            <span>{a.member_name}</span>
                            {a.note && <em>{a.note}</em>}
                            <button type="button" onClick={() => unassign(a.id, a.member_name, s.title)} aria-label={`Retirer ${a.member_name}`}>
                              ✕
                            </button>
                          </li>
                        ))}
                      </ul>
                      {!full && <AssignForm seal={s} village={v} data={data} onDone={reload} />}
                    </div>
                  );
                })}
            </div>
          </section>
        ))}
      </div>

      {empty.length > 0 && (
        <section className="panel">
          <h2 className="panel__title">Slottés sans places définies · {empty.length}</h2>
          <p className="muted small">Ces sceaux sont dans le système mais aucune place n’est ouverte (souvent les sceaux MJ).</p>
          <div className="tag-cloud">
            {empty.map((s) => (
              <Link key={s.page_id} to={`/conclave/slots/configuration?sceau=${s.page_id}`} className="tag tag--ghost">
                {s.title}
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------
function Catalogue({ data, reload }: { data: AdminSlots; reload: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const groups = useMemo(() => {
    const m = new Map<string, AdminSeal[]>();
    data.seals.forEach((s) => {
      const k = s.category.name;
      m.set(k, [...(m.get(k) ?? []), s]);
    });
    return [...m.entries()];
  }, [data]);
  const flaggedCount = data.seals.filter((s) => s.flagged).length;

  const flag = async (s: AdminSeal, v: boolean) => {
    if (
      !v &&
      s.assignments.length > 0 &&
      !(await confirm({
        title: `Retirer « ${s.title} » des slots ?`,
        text: `Les ${s.assignments.length} place(s) occupée(s) seront libérées.`,
        confirm: 'Retirer',
        danger: true,
      }))
    )
      return;
    try {
      await api.slotFlag(s.page_id, v);
      toast(v ? `${s.title} ajouté au système de slots` : `${s.title} retiré des slots`);
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    }
  };

  return (
    <>
      <div className="stats stats--3">
        <div className="stat">
          <b>{data.seals.length}</b>
          <span>Sceaux</span>
        </div>
        <div className="stat">
          <b>{flaggedCount}</b>
          <span>Dans le système</span>
        </div>
        <div className="stat">
          <b>{data.seals.length - flaggedCount}</b>
          <span>Libres</span>
        </div>
      </div>
      {groups.map(([name, seals]) => (
        <section key={name} className="panel">
          <h2 className="panel__title">
            <span className="glyph-inline">{seals[0].category.glyph}</span> {name}
          </h2>
          <ul className="cat-list">
            {seals.map((s) => {
              const cap = totalCap(s);
              return (
                <li key={s.page_id} className="cat-row">
                  <div className="cat-row__main">
                    <Link to={'/' + s.slug} className="cat-row__title">
                      {s.title}
                    </Link>
                    {s.badge === 'mj' && <span className="badge badge--mj">MJ</span>}
                    {s.flagged ? (
                      cap > 0 ? (
                        <span className="badge badge--slot">
                          SLOT {s.assignments.length}/{cap}
                        </span>
                      ) : (
                        <span className="tag tag--ghost">dans le système · 0 place</span>
                      )
                    ) : (
                      <span className="tag tag--ghost">non slotté</span>
                    )}
                  </div>
                  {s.assignments.length > 0 && <p className="cat-row__who">{s.assignments.map((a) => a.member_name).join(', ')}</p>}
                  <div className="cat-row__actions">
                    {s.flagged ? (
                      <>
                        <Link to={`/conclave/slots/configuration?sceau=${s.page_id}`} className="btn btn--ghost btn--sm">
                          Places
                        </Link>
                        <button type="button" className="btn btn--ghost btn--sm btn--danger-text" onClick={() => flag(s, false)}>
                          Retirer
                        </button>
                      </>
                    ) : (
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => flag(s, true)}>
                        Slotter
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
function SealConfig({ seal, villages, reload, highlight }: { seal: AdminSeal; villages: Village[]; reload: () => void; highlight: boolean }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [caps, setCaps] = useState<Record<number, number>>({});
  const [notes, setNotes] = useState(seal.notes);
  const [all, setAll] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCaps(Object.fromEntries(villages.map((v) => [v.id, capOf(seal, v.id)])));
    setNotes(seal.notes);
  }, [seal, villages]);

  useEffect(() => {
    if (highlight) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlight]);

  const dirty = villages.some((v) => (caps[v.id] ?? 0) !== capOf(seal, v.id)) || notes !== seal.notes;

  const save = async () => {
    try {
      await api.slotCaps(seal.page_id, caps);
      if (notes !== seal.notes) await api.slotNotes(seal.page_id, notes);
      toast(`Places enregistrées · ${seal.title}`);
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    }
  };

  const unflag = async () => {
    const ok = await confirm({
      title: `Retirer « ${seal.title} » des slots ?`,
      text: seal.assignments.length
        ? `Les ${seal.assignments.length} place(s) occupée(s) seront libérées. Le sceau redeviendra libre.`
        : 'Le sceau redeviendra libre (aucune limite de porteurs).',
      confirm: 'Retirer',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.slotFlag(seal.page_id, false);
      toast(`${seal.title} retiré des slots`);
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    }
  };

  return (
    <div ref={ref} className={`slot-config${highlight ? ' is-highlight' : ''}`}>
      <div className="slot-config__top">
        <div>
          <span className="kicker">{seal.category.name}</span>
          <strong>{seal.title}</strong>
          {seal.badge === 'mj' && <span className="badge badge--mj">MJ</span>}
        </div>
        <button type="button" className="btn btn--ghost btn--sm btn--danger-text" onClick={unflag}>
          Retirer
        </button>
      </div>
      <div className="caps-grid">
        {villages.map((v) => {
          const occ = seal.assignments.filter((a) => a.village_id === v.id).length;
          return (
            <label key={v.id} className="cap">
              <span>
                {v.name}
                {occ > 0 && <em> · {occ} occupé{occ > 1 ? 's' : ''}</em>}
              </span>
              <div className="stepper">
                <button type="button" onClick={() => setCaps((c) => ({ ...c, [v.id]: Math.max(occ, (c[v.id] ?? 0) - 1) }))} aria-label={`Retirer une place à ${v.name}`}>
                  −
                </button>
                <input
                  type="number"
                  min={occ}
                  value={caps[v.id] ?? 0}
                  onChange={(e) => setCaps((c) => ({ ...c, [v.id]: Math.max(0, Number(e.target.value) || 0) }))}
                />
                <button type="button" onClick={() => setCaps((c) => ({ ...c, [v.id]: (c[v.id] ?? 0) + 1 }))} aria-label={`Ajouter une place à ${v.name}`}>
                  +
                </button>
              </div>
            </label>
          );
        })}
      </div>
      <div className="slot-config__extra">
        <div className="inline-form">
          <input type="number" min={0} value={all} onChange={(e) => setAll(e.target.value)} placeholder="n" aria-label="Places pour tous les villages" />
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => all !== '' && setCaps(Object.fromEntries(villages.map((v) => [v.id, Math.max(0, Number(all) || 0)])))}
          >
            Appliquer à tous
          </button>
        </div>
        <input className="slot-config__notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Note interne (facultatif)" />
        <button type="button" className="btn btn--red btn--sm" onClick={save} disabled={!dirty}>
          Enregistrer
        </button>
      </div>
    </div>
  );
}

function Config({ data, reload }: { data: AdminSlots; reload: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [params] = useSearchParams();
  const focus = Number(params.get('sceau')) || null;
  const [newVillage, setNewVillage] = useState('');
  const [toFlag, setToFlag] = useState('');
  const [editing, setEditing] = useState<{ id: number; name: string } | null>(null);
  const flagged = data.seals.filter((s) => s.flagged);
  const free = data.seals.filter((s) => !s.flagged);
  const focusSeal = focus ? data.seals.find((s) => s.page_id === focus) : null;

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast(ok);
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    }
  };

  return (
    <>
      {focusSeal && !focusSeal.flagged && (
        <section className="panel panel--accent">
          <h2 className="panel__title">Slotter « {focusSeal.title} » ?</h2>
          <p className="muted small">Ajoute-le au système puis fixe le nombre de places par village.</p>
          <button type="button" className="btn btn--red" onClick={() => run(() => api.slotFlag(focusSeal.page_id, true), `${focusSeal.title} ajouté aux slots`)}>
            Ajouter au système de slots
          </button>
        </section>
      )}

      <section className="panel">
        <h2 className="panel__title">Villages · {data.villages.length}</h2>
        <div className="village-list">
          {data.villages.map((v) =>
            editing?.id === v.id ? (
              <form
                key={v.id}
                className="village-chip is-editing"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(() => api.villageSave(v.id, editing.name), 'Village renommé').then(() => setEditing(null));
                }}
              >
                <input value={editing.name} onChange={(e) => setEditing({ id: v.id, name: e.target.value })} autoFocus aria-label="Nouveau nom" />
                <button type="submit" aria-label="Valider">
                  ✓
                </button>
                <button type="button" onClick={() => setEditing(null)} aria-label="Annuler">
                  ✕
                </button>
              </form>
            ) : (
              <div key={v.id} className="village-chip">
                <button type="button" className="village-chip__name" onClick={() => setEditing({ id: v.id, name: v.name })} title="Renommer">
                  {v.name}
                </button>
                <button
                  type="button"
                  aria-label={`Supprimer ${v.name}`}
                  onClick={async () => {
                    if (
                      await confirm({
                        title: `Supprimer le village ${v.name} ?`,
                        text: 'Toutes les places et attributions liées à ce village seront effacées.',
                        confirm: 'Supprimer',
                        danger: true,
                      })
                    )
                      void run(() => api.villageDelete(v.id), `${v.name} supprimé`);
                  }}
                >
                  ✕
                </button>
              </div>
            ),
          )}
        </div>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newVillage.trim()) return;
            void run(() => api.villageSave(null, newVillage), `${newVillage} ajouté`).then(() => setNewVillage(''));
          }}
        >
          <input value={newVillage} onChange={(e) => setNewVillage(e.target.value)} placeholder="Nouveau village (Kiri, Iwa, Kumo…)" aria-label="Nouveau village" />
          <button type="submit" className="btn btn--ghost btn--sm">
            Ajouter
          </button>
        </form>
      </section>

      <section className="panel">
        <h2 className="panel__title">Ajouter un sceau au système</h2>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            const s = free.find((x) => String(x.page_id) === toFlag);
            if (s) void run(() => api.slotFlag(s.page_id, true), `${s.title} ajouté aux slots`).then(() => setToFlag(''));
          }}
        >
          <select value={toFlag} onChange={(e) => setToFlag(e.target.value)} aria-label="Sceau à slotter">
            <option value="">Choisir un sceau libre…</option>
            {free.map((s) => (
              <option key={s.page_id} value={s.page_id}>
                {s.category.name} · {s.title}
              </option>
            ))}
          </select>
          <button type="submit" className="btn btn--red btn--sm" disabled={!toFlag}>
            Slotter
          </button>
        </form>
      </section>

      <section className="panel">
        <h2 className="panel__title">Sceaux slottés · {flagged.length}</h2>
        {flagged.length === 0 ? (
          <Empty glyph="枠">Aucun sceau dans le système.</Empty>
        ) : (
          <div className="slot-config-list">
            {flagged.map((s) => (
              <SealConfig key={s.page_id} seal={s} villages={data.villages} reload={reload} highlight={s.page_id === focus} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

export default function Slots({ tab }: { tab: Tab }) {
  const { data, error, load } = useSlots();
  const { refresh } = useSession();
  const reload = useCallback(() => {
    void load();
    void refresh(); // badges SLOT du sommaire
  }, [load, refresh]);

  return (
    <div className="console">
      <header className="page-head">
        <p className="kicker">Console du Conclave</p>
        <h1>Slots de sceaux</h1>
        <p className="muted">Places limitées par village : qui porte quoi, et combien de places restent.</p>
      </header>
      <nav className="tabs">
        <NavLink to="/conclave/slots" end className={({ isActive }) => `tab${isActive ? ' is-on' : ''}`}>
          Suivi
        </NavLink>
        <NavLink to="/conclave/slots/catalogue" className={({ isActive }) => `tab${isActive ? ' is-on' : ''}`}>
          Catalogue
        </NavLink>
        <NavLink to="/conclave/slots/configuration" className={({ isActive }) => `tab${isActive ? ' is-on' : ''}`}>
          Configuration
        </NavLink>
      </nav>
      {error ? (
        <ErrorState text={error} onRetry={load} />
      ) : !data ? (
        <Loader label="Inventaire des slots…" />
      ) : tab === 'suivi' ? (
        <Suivi data={data} reload={reload} />
      ) : tab === 'catalogue' ? (
        <Catalogue data={data} reload={reload} />
      ) : (
        <Config data={data} reload={reload} />
      )}
    </div>
  );
}
