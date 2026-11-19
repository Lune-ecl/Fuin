import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, type SealRequest } from '../lib/api';
import { useSession } from '../lib/session';
import { canRequest, circleLabel, formatDate, RANKS, timeAgo } from '../lib/format';
import { displaySealSvg, sealGlyphs } from '../lib/sealDesign';
import { sanitizeSvg } from '../lib/markdown';
import { useBrushFont } from '../lib/useBrushFont';
import Markdown from '../components/Markdown';
import SealCreator from '../components/SealCreator';
import { Empty, ErrorState, Loader, useConfirm, useToast } from '../components/ui';

export const STATUS_LABEL: Record<SealRequest['status'], string> = {
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

function RequestForm({ onSent }: { onSent: () => void }) {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [circle, setCircle] = useState<number | null>(null);
  const [kanji, setKanji] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState(TEMPLATE);
  const [icon, setIcon] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [creator, setCreator] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.requestSubmit({ title, circle, kanji, description, content_md: content, icon_svg: icon });
      toast('Demande envoyée au Conclave');
      setTitle('');
      setCircle(null);
      setKanji('');
      setDescription('');
      setContent(TEMPLATE);
      setIcon(null);
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel panel--accent">
      <h2 className="panel__title">Nouvelle demande</h2>
      <p className="muted small">
        Décris ton sceau et compose son visuel. La demande part en attente de validation : le Conclave l’accepte, ou la refuse en
        t’expliquant pourquoi.
      </p>
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
          <button type="submit" className="btn btn--red" disabled={busy}>
            {busy ? 'Envoi…' : 'Envoyer au Conclave'}
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
      />
    </section>
  );
}

function RequestCard({ r, onWithdraw }: { r: SealRequest; onWithdraw?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <article className={`request request--${r.status}`}>
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
          {' · '}envoyée {timeAgo(r.created_at)}
        </p>
        {r.description && <p className="request__desc">{r.description}</p>}
        {r.status !== 'pending' && (
          <div className={`verdict verdict--${r.status}`}>
            <b>
              {r.status === 'approved' ? 'Validée' : 'Refusée'} par {r.reviewed_by ?? 'le Conclave'} · {formatDate(r.reviewed_at)}
            </b>
            {r.review_note ? <p>{r.review_note}</p> : <p className="muted">Pas de commentaire.</p>}
          </div>
        )}
        <div className="request__actions">
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setOpen((o) => !o)}>
            {open ? 'Masquer la proposition' : 'Relire la proposition'}
          </button>
          {onWithdraw && (
            <button type="button" className="btn btn--ghost btn--sm btn--danger-text" onClick={onWithdraw}>
              Retirer la demande
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
  const allowed = canRequest(member);

  const load = useCallback(async () => {
    setError(null);
    try {
      setList(await api.myRequests());
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
          <span>四</span>
        </div>
        <p className="kicker">Atelier du Maître Fuin</p>
        <h1>Les demandes de création s’ouvrent au 4ème cercle.</h1>
        <Link to="/" className="btn btn--ghost">
          ← Retour au Conclave
        </Link>
      </div>
    );
  }

  const withdraw = async (r: SealRequest) => {
    if (!(await confirm({ title: `Retirer « ${r.title} » ?`, text: 'La demande sera supprimée.', confirm: 'Retirer', danger: true }))) return;
    try {
      await api.requestWithdraw(r.id);
      toast('Demande retirée');
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    }
  };

  return (
    <div className="console">
      <header className="page-head">
        <p className="kicker">Atelier du Maître Fuin</p>
        <h1>Demande de création de sceau</h1>
        <p className="muted">
          Tu as atteint le cercle des Maîtres : tu peux proposer tes propres sceaux au Conclave, avec leur formule, leurs règles et
          leur visuel.
        </p>
      </header>

      <RequestForm onSent={load} />

      <section className="panel">
        <h2 className="panel__title">Mes demandes</h2>
        {error ? (
          <ErrorState text={error} onRetry={load} />
        ) : !list ? (
          <Loader label="Lecture de tes demandes…" />
        ) : list.length === 0 ? (
          <Empty glyph="願">Aucune demande pour l’instant.</Empty>
        ) : (
          <div className="request-list">
            {list.map((r) => (
              <RequestCard key={r.id} r={r} onWithdraw={r.status === 'pending' ? () => withdraw(r) : undefined} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
