import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, type SealRequest } from '../lib/api';
import { useSession } from '../lib/session';
import { canRequest, circleLabel, formatDate, RANKS, timeAgo } from '../lib/format';
import { displaySealSvg, sealGlyphs } from '../lib/sealDesign';
import { sanitizeSvg } from '../lib/markdown';
import { useBrushFont } from '../lib/useBrushFont';
import { clearDraft, readDraft, useDraft, type Draft } from '../lib/draft';
import Markdown from '../components/Markdown';
import SealCreator from '../components/SealCreator';
import { Empty, ErrorState, Loader, useConfirm, useToast } from '../components/ui';

export const STATUS_LABEL: Record<SealRequest['status'], string> = {
  draft: 'Brouillon',
  pending: 'En attente de validation',
  approved: 'Validée',
  refused: 'Refusée',
};

const TEMPLATE = `## Effet

Décris ce que fait le sceau.

## Règles proposées

- Conditions de pose
- Limites et contreparties
`;

export function RequestSeal({ svg, kanji, size = 'md' }: { svg: string | null; kanji: string | null; size?: 'sm' | 'md' }) {
  const font = useBrushFont(sealGlyphs(svg, kanji));
  const html = font.ready ? sanitizeSvg(displaySealSvg(svg, kanji)) : '';
  return <div className={`seal-icon seal-icon--${size}`} dangerouslySetInnerHTML={{ __html: html || '<span>封</span>' }} />;
}

interface RequestDraft {
  title: string;
  circle: number | null;
  kanji: string;
  description: string;
  content: string;
  icon: string | null;
}

const BLANK: RequestDraft = { title: '', circle: null, kanji: '', description: '', content: TEMPLATE, icon: null };

const fromRequest = (r: SealRequest): RequestDraft => ({
  title: r.title,
  circle: r.circle,
  kanji: r.kanji,
  description: r.description,
  content: r.content_md,
  icon: r.icon_svg,
});

const sameDraft = (a: RequestDraft, b: RequestDraft) =>
  a.title.trim() === b.title.trim() &&
  a.circle === b.circle &&
  a.kanji.trim() === b.kanji.trim() &&
  a.description.trim() === b.description.trim() &&
  a.content.trim() === b.content.trim() &&
  (a.icon || null) === (b.icon || null);

const text = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);

// brouillon relu avec prudence : il vient du navigateur et peut dater d'une ancienne version du site
function readRequestDraft(key: string): Draft<RequestDraft> | null {
  const d = readDraft<Partial<RequestDraft>>(key);
  const v = d?.value;
  if (!d || !v || typeof v !== 'object') return null;
  return {
    at: d.at,
    value: {
      title: text(v.title),
      circle: typeof v.circle === 'number' && (RANKS as readonly number[]).includes(v.circle) ? v.circle : null,
      kanji: text(v.kanji),
      description: text(v.description),
      content: text(v.content, TEMPLATE),
      icon: text(v.icon) || null,
    },
  };
}

/** Clé du brouillon local d'une demande déjà enregistrée, en cours de modification. */
const editKey = (base: string, id: number) => `${base}.${id}`;

function RequestForm({
  draftKey,
  editing,
  onSaved,
  onCloseEdit,
}: {
  draftKey: string;
  /** demande déjà enregistrée (brouillon ou en attente) en cours de modification */
  editing: SealRequest | null;
  onSaved: () => void;
  onCloseEdit: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const localKey = editing ? editKey(draftKey, editing.id) : draftKey;
  const base = useMemo(() => (editing ? fromRequest(editing) : BLANK), [editing]);
  const [restored, setRestored] = useState(() => readRequestDraft(localKey));
  const init = restored?.value ?? base;
  const [title, setTitle] = useState(init.title);
  const [circle, setCircle] = useState<number | null>(init.circle);
  const [kanji, setKanji] = useState(init.kanji);
  const [description, setDescription] = useState(init.description);
  const [content, setContent] = useState(init.content);
  const [icon, setIcon] = useState<string | null>(init.icon);
  const [preview, setPreview] = useState(false);
  const [creator, setCreator] = useState(false);
  const [busy, setBusy] = useState<'send' | 'save' | null>(null);
  const [error, setError] = useState<string | null>(null);

  // tout ce qui est écrit part en brouillon local : changer de page ou d'onglet ne fait rien perdre
  const current = useMemo<RequestDraft>(() => ({ title, circle, kanji, description, content, icon }), [title, circle, kanji, description, content, icon]);
  const changed = !sameDraft(current, base);
  const discard = useDraft(localKey, changed ? current : null);

  const fill = (v: RequestDraft) => {
    setTitle(v.title);
    setCircle(v.circle);
    setKanji(v.kanji);
    setDescription(v.description);
    setContent(v.content);
    setIcon(v.icon);
  };

  const reset = () => {
    discard();
    setRestored(null);
    fill(BLANK);
    setPreview(false);
  };

  const input = (draft = false) => ({ title, circle, kanji, description, content_md: content, icon_svg: icon, ...(draft ? { draft } : {}) });

  const dropDraft = async () => {
    const msg = editing
      ? { title: 'Abandonner les modifications ?', text: 'La demande enregistrée reste telle qu’elle était.', confirm: 'Abandonner' }
      : { title: 'Effacer le brouillon ?', text: 'Le formulaire sera vidé, visuel compris.', confirm: 'Effacer' };
    if (!(await confirm({ ...msg, danger: true }))) return;
    if (editing) {
      discard();
      onCloseEdit();
    } else {
      reset();
      toast('Brouillon effacé');
    }
  };

  const close = () => (changed ? void dropDraft() : onCloseEdit());

  const run = async (kind: 'send' | 'save', job: () => Promise<string>) => {
    setBusy(kind);
    setError(null);
    try {
      const msg = await job();
      toast(msg);
      discard();
      if (editing) onCloseEdit();
      else reset();
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  // bouton principal : envoyer (nouvelle demande ou brouillon), ou enregistrer (demande en attente)
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!editing)
      return void run('send', async () => {
        await api.requestSubmit(input());
        return 'Demande envoyée au Conclave';
      });
    const id = editing.id;
    if (editing.status === 'draft')
      return void run('send', async () => {
        await api.requestUpdate(id, input());
        await api.requestSend(id);
        return 'Demande envoyée au Conclave';
      });
    return void run('save', async () => {
      await api.requestUpdate(id, input());
      return 'Modifications enregistrées : le Conclave verra la nouvelle version';
    });
  };

  // bouton secondaire : garder en brouillon dans « Mes demandes »
  const saveDraft = () =>
    run('save', async () => {
      if (editing) await api.requestUpdate(editing.id, input());
      else await api.requestSubmit(input(true));
      return editing ? 'Brouillon enregistré' : 'Brouillon enregistré dans « Mes brouillons »';
    });

  const head = !editing
    ? { title: 'Nouvelle demande', text: 'Décris ton sceau et compose son visuel. Envoie-le au Conclave, ou garde-le en brouillon pour le reprendre plus tard.' }
    : editing.status === 'draft'
      ? { title: `Brouillon · ${editing.title}`, text: 'Modifie ton brouillon, enregistre-le ou envoie-le au Conclave quand il est prêt.' }
      : {
          title: `Modifier · ${editing.title}`,
          text: 'Ta demande reste en attente pendant que tu la modifies : le Conclave examinera la version enregistrée.',
        };

  return (
    <section className={`panel panel--accent${editing ? ' request-form--editing' : ''}`}>
      <div className="request-form__title">
        <h2 className="panel__title">{head.title}</h2>
        {editing && <span className={`status status--${editing.status}`}>{STATUS_LABEL[editing.status]}</span>}
      </div>
      <p className="muted small">{head.text}</p>
      {restored && changed && (
        <div className="draft-banner">
          <span>
            <b>{editing ? 'Modifications reprises' : 'Brouillon repris'}</b> ·{' '}
            {editing ? 'tu avais commencé à modifier cette demande' : 'tu avais commencé cette demande'} {timeAgo(restored.at)}
          </span>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => void dropDraft()}>
            {editing ? 'Abandonner les modifications' : 'Effacer le brouillon'}
          </button>
        </div>
      )}
      <form className="form request-form" onSubmit={submit}>
        <div className="request-form__grid">
          <div className="request-form__fields">
            <label className="field">
              <span>Nom du sceau</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} placeholder="Sceau de …" />
            </label>
            <div className="field-row">
              <label className="field">
                <span>Cercle visé</span>
                <select value={circle ?? ''} onChange={(e) => setCircle(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">À définir par le Conclave</option>
                  {RANKS.map((r) => (
                    <option key={r} value={r}>
                      {circleLabel(r)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Formule de kanjis</span>
                <input className="input-kanji" lang="ja" value={kanji} onChange={(e) => setKanji(e.target.value)} maxLength={60} placeholder="血 鎖 縛 印" />
              </label>
            </div>
            <label className="field">
              <span>Description courte</span>
              <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={400} placeholder="Une phrase qui résume le sceau." />
            </label>
          </div>
          <div className="request-form__visual">
            <span className="field__label">Visuel proposé</span>
            <RequestSeal svg={icon} kanji={kanji} />
            <button type="button" className="btn btn--red btn--sm" onClick={() => setCreator(true)}>
              {icon ? 'Modifier le visuel' : 'Créer le visuel'}
            </button>
            {!icon && <small className="muted">Sans visuel, un sceau est dessiné avec ta formule.</small>}
          </div>
        </div>

        <div className="field">
          <div className="request-form__head">
            <span>Effet et règles proposés</span>
            <div className="tabs tabs--small">
              <button type="button" className={`tab${!preview ? ' is-on' : ''}`} onClick={() => setPreview(false)}>
                Rédaction
              </button>
              <button type="button" className={`tab${preview ? ' is-on' : ''}`} onClick={() => setPreview(true)}>
                Aperçu
              </button>
            </div>
          </div>
          {preview ? (
            <div className="request-form__preview">
              <Markdown source={content} />
            </div>
          ) : (
            <textarea rows={10} className="mono" value={content} onChange={(e) => setContent(e.target.value)} maxLength={20000} />
          )}
          <small className="muted">Mise en forme : ## Titre, **gras**, - liste, :::note[Titre] … ::: pour un encadré.</small>
        </div>

        {error && <p className="form-error">{error}</p>}
        <div className="form-actions">
          {changed && <span className="draft-note">{editing ? 'Modifications gardées dans ce navigateur' : 'Brouillon gardé dans ce navigateur'}</span>}
          {editing ? (
            <button type="button" className="btn btn--ghost" onClick={close}>
              Fermer
            </button>
          ) : (
            changed &&
            !restored && (
              <button type="button" className="btn btn--ghost" onClick={() => void dropDraft()}>
                Effacer
              </button>
            )
          )}
          {(!editing || editing.status === 'draft') && (
            <button type="button" className="btn btn--ghost" onClick={() => void saveDraft()} disabled={!!busy || (!!editing && !changed)}>
              {busy === 'save' ? 'Enregistrement…' : 'Enregistrer en brouillon'}
            </button>
          )}
          <button type="submit" className="btn btn--red" disabled={!!busy || (editing?.status === 'pending' && !changed)}>
            {busy === 'send' || (busy === 'save' && editing?.status === 'pending')
              ? 'Enregistrement…'
              : editing?.status === 'pending'
                ? 'Enregistrer les modifications'
                : 'Envoyer au Conclave'}
          </button>
        </div>
      </form>
      <SealCreator
        open={creator}
        initialSvg={icon}
        kanji={kanji}
        onClose={() => setCreator(false)}
        onUse={setIcon}
        fileName={title || 'mon-sceau'}
        kicker="Visuel proposé"
        useLabel="Garder ce visuel"
        draftKey={`${localKey}.visuel`}
      />
    </section>
  );
}

function RequestCard({
  r,
  editing,
  unsaved,
  onEdit,
  onCancel,
  onSend,
  onDelete,
}: {
  r: SealRequest;
  editing?: boolean;
  /** modifications commencées mais pas encore enregistrées (brouillon local) */
  unsaved?: boolean;
  onEdit?: () => void;
  onCancel?: () => void;
  onSend?: () => void;
  onDelete?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const edited = r.status === 'pending' && new Date(r.updated_at).getTime() - new Date(r.created_at).getTime() > 60_000;
  return (
    <article className={`request request--${r.status}${editing ? ' is-editing' : ''}`}>
      <RequestSeal svg={r.icon_svg} kanji={r.kanji} size="sm" />
      <div className="request__main">
        <div className="request__top">
          <h3>{r.title}</h3>
          <span className={`status status--${r.status}`}>{STATUS_LABEL[r.status]}</span>
        </div>
        <p className="request__meta">
          {r.circle ? circleLabel(r.circle) : 'Cercle à définir'}
          {r.kanji && (
            <>
              {' · '}
              <span className="request__kanji" lang="ja">
                {r.kanji}
              </span>
            </>
          )}
          {' · '}
          {r.status === 'draft' ? `modifié ${timeAgo(r.updated_at)}` : `envoyée ${timeAgo(r.created_at)}`}
          {edited && ` · modifiée ${timeAgo(r.updated_at)}`}
        </p>
        {r.description && <p className="request__desc">{r.description}</p>}
        {(r.status === 'approved' || r.status === 'refused') && (
          <div className={`verdict verdict--${r.status}`}>
            <b>
              {r.status === 'approved' ? 'Validée' : 'Refusée'} par {r.reviewed_by ?? 'le Conclave'} · {formatDate(r.reviewed_at)}
            </b>
            {r.review_note ? <p>{r.review_note}</p> : <p className="muted">Pas de commentaire.</p>}
          </div>
        )}
        {(editing || unsaved) && <p className="request__flag">{editing ? 'En cours de modification, en haut de la page' : 'Modifications commencées, pas encore enregistrées'}</p>}
        <div className="request__actions">
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setOpen((o) => !o)}>
            {open ? 'Masquer la proposition' : 'Relire la proposition'}
          </button>
          {onEdit && !editing && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={onEdit}>
              {unsaved ? 'Reprendre la modification' : 'Modifier'}
            </button>
          )}
          {onSend && (
            <button type="button" className="btn btn--red btn--sm" onClick={onSend}>
              Envoyer au Conclave
            </button>
          )}
          {onCancel && (
            <button type="button" className="btn btn--ghost btn--sm btn--danger-text" onClick={onCancel}>
              Annuler la demande
            </button>
          )}
          {onDelete && (
            <button type="button" className="btn btn--ghost btn--sm btn--danger-text" onClick={onDelete}>
              Supprimer le brouillon
            </button>
          )}
        </div>
        {open && (
          <div className="request__content">
            <Markdown source={r.content_md || '*Aucun texte.*'} />
          </div>
        )}
      </div>
    </article>
  );
}

export { RequestCard };

export default function Requests() {
  const { member } = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const [list, setList] = useState<SealRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<SealRequest | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const allowed = canRequest(member);
  const draftKey = `demande.${member?.id ?? 'invite'}`;

  const load = useCallback(async () => {
    setError(null);
    try {
      const rows = await api.myRequests();
      setList(rows);
      // la demande en cours de modification suit son nouvel état (annulée → brouillon, examinée → fermée)
      setEditing((cur) => (cur ? rows.find((x) => x.id === cur.id && (x.status === 'draft' || x.status === 'pending')) ?? null : null));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => {
    if (allowed) void load();
  }, [load, allowed]);

  if (!allowed) {
    return (
      <div className="locked">
        <div className="locked__seal" aria-hidden="true">
          <span>三</span>
        </div>
        <p className="kicker">Atelier du Maître Fuin</p>
        <h1>Les demandes de création s’ouvrent au 3ème cercle.</h1>
        <Link to="/" className="btn btn--ghost">
          ← Retour au Conclave
        </Link>
      </div>
    );
  }

  const act = async (job: () => Promise<unknown>, msg: string) => {
    try {
      await job();
      toast(msg);
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    }
  };

  const edit = (r: SealRequest) => {
    setEditing(r);
    window.requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const cancel = async (r: SealRequest) => {
    const ok = await confirm({
      title: `Annuler « ${r.title} » ?`,
      text: 'Elle quitte la file d’examen du Conclave et revient dans tes brouillons : rien n’est perdu, tu pourras la modifier puis la renvoyer.',
      confirm: 'Annuler la demande',
      cancel: 'Garder',
    });
    if (ok) await act(() => api.requestCancel(r.id), 'Demande annulée : elle t’attend dans tes brouillons');
  };

  const remove = async (r: SealRequest) => {
    const ok = await confirm({ title: `Supprimer « ${r.title} » ?`, text: 'Ce brouillon sera définitivement effacé.', confirm: 'Supprimer', danger: true });
    if (!ok) return;
    clearDraft(editKey(draftKey, r.id));
    clearDraft(`${editKey(draftKey, r.id)}.visuel`);
    await act(() => api.requestWithdraw(r.id), 'Brouillon supprimé');
  };

  const card = (r: SealRequest) => {
    const open = r.status === 'draft' || r.status === 'pending';
    return (
      <RequestCard
        key={r.id}
        r={r}
        editing={editing?.id === r.id}
        unsaved={open && !!readDraft(editKey(draftKey, r.id))}
        onEdit={open ? () => edit(r) : undefined}
        onCancel={r.status === 'pending' ? () => void cancel(r) : undefined}
        onSend={r.status === 'draft' && editing?.id !== r.id ? () => void act(() => api.requestSend(r.id), 'Demande envoyée au Conclave') : undefined}
        onDelete={r.status === 'draft' ? () => void remove(r) : undefined}
      />
    );
  };

  const drafts = list?.filter((r) => r.status === 'draft') ?? [];
  const sent = list?.filter((r) => r.status !== 'draft') ?? [];

  return (
    <div className="console">
      <header className="page-head">
        <p className="kicker">Atelier du Maître Fuin</p>
        <h1>Demande de création de sceau</h1>
        <p className="muted">
          Dès le 3ème cercle, tu peux proposer tes propres sceaux au Conclave, avec leur formule, leurs règles et leur visuel.
        </p>
      </header>

      <div ref={formRef} className="request-form__anchor">
        <RequestForm
          key={editing ? `edit-${editing.id}` : 'new'}
          draftKey={draftKey}
          editing={editing}
          onSaved={() => void load()}
          onCloseEdit={() => setEditing(null)}
        />
      </div>

      {drafts.length > 0 && (
        <section className="panel">
          <h2 className="panel__title">Mes brouillons</h2>
          <p className="muted small">Gardés sur le site, invisibles pour le Conclave tant que tu ne les envoies pas.</p>
          <div className="request-list">{drafts.map(card)}</div>
        </section>
      )}

      <section className="panel">
        <h2 className="panel__title">Mes demandes</h2>
        {error ? (
          <ErrorState text={error} onRetry={load} />
        ) : !list ? (
          <Loader label="Lecture de tes demandes…" />
        ) : sent.length === 0 ? (
          <Empty glyph="願">Aucune demande envoyée pour l’instant.</Empty>
        ) : (
          <div className="request-list">{sent.map(card)}</div>
        )}
      </section>
    </div>
  );
}
