import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError, type SealRequest } from '../../lib/api';
import { useSession } from '../../lib/session';
import { circleLabel, formatDate, initials, slugify, timeAgo } from '../../lib/format';
import { displaySealSvg } from '../../lib/sealDesign';
import { downloadSealPng } from '../../lib/sealExport';
import Markdown from '../../components/Markdown';
import { Empty, ErrorState, Loader, Modal, useToast } from '../../components/ui';
import { RequestSeal, STATUS_LABEL } from '../Requests';

const CIRCLE_CATEGORY = ['', 'premier-cercle', 'deuxieme-cercle', 'troisieme-cercle', 'quatrieme-cercle', 'cinquieme-cercle'];

type Filter = 'pending' | 'approved' | 'refused' | 'all';

function ReviewModal({
  request,
  decision,
  onClose,
  onDone,
}: {
  request: SealRequest | null;
  decision: 'approved' | 'refused';
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setNote('');
    setError(null);
  }, [request, decision]);

  if (!request) return <Modal open={false} onClose={onClose} title="" />;
  const refuse = decision === 'refused';

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.requestReview(request.id, decision, note);
      toast(refuse ? `Demande « ${request.title} » refusée` : `Demande « ${request.title} » validée`);
      onDone();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={request.title} kicker={refuse ? 'Refuser la demande' : 'Valider la demande'}>
      <label className="field">
        <span>{refuse ? 'Raison du refus (envoyée au shinobi)' : 'Commentaire pour le shinobi (facultatif)'}</span>
        <textarea
          rows={5}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={refuse ? 'Ex. trop proche du Sceau de silence, effet trop puissant pour le 4ème cercle…' : 'Ex. validé, la fiche sera ajoutée au 4ème cercle.'}
          autoFocus
        />
      </label>
      {error && <p className="form-error">{error}</p>}
      <div className="form-actions">
        <button type="button" className="btn btn--ghost" onClick={onClose}>
          Annuler
        </button>
        <button type="button" className={`btn ${refuse ? 'btn--danger' : 'btn--red'}`} onClick={submit} disabled={busy || (refuse && !note.trim())}>
          {refuse ? 'Refuser' : 'Valider'}
        </button>
      </div>
    </Modal>
  );
}

export default function ConclaveRequests() {
  const toast = useToast();
  const navigate = useNavigate();
  const { refresh } = useSession();
  const [list, setList] = useState<SealRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('pending');
  const [review, setReview] = useState<{ r: SealRequest; d: 'approved' | 'refused' } | null>(null);
  const [creating, setCreating] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setList(await api.adminRequests());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const c = { draft: 0, pending: 0, approved: 0, refused: 0, all: list?.length ?? 0 };
    list?.forEach((r) => (c[r.status] += 1));
    return c;
  }, [list]);

  if (error) return <ErrorState text={error} onRetry={load} />;
  if (!list) return <Loader label="Lecture des demandes…" />;

  const shown = filter === 'all' ? list : list.filter((r) => r.status === filter);

  // Crée une fiche brouillon (invisible des joueurs) à partir d'une demande validée
  const createDraft = async (r: SealRequest) => {
    setCreating(r.id);
    try {
      const cats = await api.categories();
      const cat =
        cats.find((c) => c.slug === CIRCLE_CATEGORY[r.circle ?? 0]) ?? cats.find((c) => c.slug === 'archives-instables') ?? cats[0];
      const base = `${cat.slug}/${slugify(r.title) || 'sceau'}`;
      const footer = `\n\n:::note[Origine]\nProposé par ${r.member?.name ?? 'un shinobi'} le ${formatDate(r.created_at)}, validé par le Conclave.\n:::\n`;
      let saved: { id: number } | null = null;
      for (let i = 0; i < 6 && !saved; i++) {
        try {
          saved = await api.pageSave({
            id: null,
            category_id: cat.id ?? 0,
            slug: i === 0 ? base : `${base}-${i + 1}`,
            kind: 'seal',
            title: r.title,
            nav_title: null,
            description: r.description,
            badge: null,
            kanji: r.kanji || null,
            icon_svg: r.icon_svg,
            content_md: (r.content_md || '') + footer,
            min_rank: null,
            hidden: true,
            position: null,
          });
        } catch (e) {
          if (!(e instanceof ApiError && e.code === 'FU409')) throw e;
        }
      }
      if (!saved) throw new Error('Impossible de trouver une adresse libre pour la fiche.');
      toast('Fiche brouillon créée : relis-la puis retire le mode brouillon pour la publier');
      await refresh();
      navigate(`/conclave/sceaux/${saved.id}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setCreating(null);
    }
  };

  return (
    <div className="console">
      <header className="page-head">
        <p className="kicker">Console du Conclave</p>
        <h1>Demandes de création</h1>
        <p className="muted">Les sceaux proposés par les shinobi du 4ème cercle et plus. Un refus doit toujours être expliqué.</p>
      </header>

      <div className="chips">
        {(
          [
            ['pending', `En attente · ${counts.pending}`],
            ['approved', `Validées · ${counts.approved}`],
            ['refused', `Refusées · ${counts.refused}`],
            ['all', `Toutes · ${counts.all}`],
          ] as [Filter, string][]
        ).map(([k, label]) => (
          <button key={k} type="button" className={`chip${filter === k ? ' is-on' : ''}`} onClick={() => setFilter(k)}>
            {label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <Empty glyph="願">{filter === 'pending' ? 'Aucune demande en attente.' : 'Rien à afficher.'}</Empty>
      ) : (
        <div className="review-list">
          {shown.map((r) => (
            <article key={r.id} className={`review review--${r.status}`}>
              <div className="review__visual">
                <RequestSeal svg={r.icon_svg} kanji={r.kanji} />
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => void downloadSealPng(displaySealSvg(r.icon_svg, r.kanji), slugify(r.title)).catch(() => toast('Export impossible', 'error'))}
                >
                  PNG
                </button>
              </div>
              <div className="review__main">
                <div className="review__author">
                  <span className="avatar">{initials(r.member?.name ?? '?')}</span>
                  <div>
                    <b>{r.member?.name ?? 'Shinobi supprimé'}</b>
                    <small>
                      {r.member ? circleLabel(r.member.rank) : ''} · envoyée {timeAgo(r.created_at)}
                      {r.status === 'pending' && new Date(r.updated_at).getTime() - new Date(r.created_at).getTime() > 60_000 && (
                        <b className="request__edited"> · modifiée {timeAgo(r.updated_at)}</b>
                      )}
                    </small>
                  </div>
                  <span className={`status status--${r.status}`}>{STATUS_LABEL[r.status]}</span>
                </div>
                <h3>{r.title}</h3>
                <p className="request__meta">
                  {r.circle ? `Proposé pour le ${circleLabel(r.circle)}` : 'Cercle à définir'}
                  {r.kanji && (
                    <>
                      {' · '}
                      <span className="request__kanji" lang="ja">
                        {r.kanji}
                      </span>
                    </>
                  )}
                </p>
                {r.description && <p className="request__desc">{r.description}</p>}
                <details className="review__content" open={r.status === 'pending'}>
                  <summary>Proposition complète</summary>
                  <Markdown source={r.content_md || '*Aucun texte.*'} />
                </details>
                {r.status !== 'pending' && (
                  <div className={`verdict verdict--${r.status}`}>
                    <b>
                      {r.status === 'approved' ? 'Validée' : 'Refusée'} par {r.reviewed_by ?? '—'} · {formatDate(r.reviewed_at)}
                    </b>
                    {r.review_note && <p>{r.review_note}</p>}
                  </div>
                )}
                <div className="request__actions">
                  {r.status === 'pending' && (
                    <>
                      <button type="button" className="btn btn--red btn--sm" onClick={() => setReview({ r, d: 'approved' })}>
                        Valider
                      </button>
                      <button type="button" className="btn btn--ghost btn--sm btn--danger-text" onClick={() => setReview({ r, d: 'refused' })}>
                        Refuser
                      </button>
                    </>
                  )}
                  {r.status === 'approved' && (
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => createDraft(r)} disabled={creating === r.id}>
                      {creating === r.id ? 'Création…' : 'Créer la fiche (brouillon)'}
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <ReviewModal
        request={review?.r ?? null}
        decision={review?.d ?? 'approved'}
        onClose={() => setReview(null)}
        onDone={async () => {
          await load();
          await refresh();
        }}
      />
    </div>
  );
}
