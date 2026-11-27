import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api, ApiError, type PageData, type SlotInfo } from '../lib/api';
import { useSession } from '../lib/session';
import { circleLabel, formatDate } from '../lib/format';
import { sanitizeSvg } from '../lib/markdown';
import Markdown from '../components/Markdown';
import SealEmblem from '../components/SealEmblem';
import Memorial from '../components/Memorial';
import { displaySealSvg, sealGlyphs } from '../lib/sealDesign';
import { useBrushFont } from '../lib/useBrushFont';
import { copyToClipboard, ErrorState, Loader, SealBadge, useToast } from '../components/ui';

/** Bouton du Conclave : envoie aux joueurs une fiche encore en brouillon. */
function PublishButton({ pageId, kind, onDone }: { pageId: number; kind: string; onDone: () => Promise<void> }) {
  const toast = useToast();
  const { refresh } = useSession();
  const [busy, setBusy] = useState(false);
  const publish = async () => {
    setBusy(true);
    try {
      const full = await api.pageGet(pageId);
      await api.pageSave({ ...full, hidden: false });
      toast(kind === 'seal' ? 'Sceau publié : les joueurs peuvent le voir' : 'Fiche publiée : les joueurs peuvent la voir');
      await Promise.all([refresh(), onDone()]);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" className="btn btn--red btn--sm" disabled={busy} onClick={() => void publish()}>
      {busy ? 'Publication…' : 'Publier sur le site'}
    </button>
  );
}

/** Case « Je maîtrise ce sceau » : le shinobi coche lui-même les sceaux qu'il connaît. */
function MasteryToggle({ pageId, initial }: { pageId: number; initial: boolean }) {
  const toast = useToast();
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);

  useEffect(() => setOn(initial), [initial, pageId]);

  const flip = async () => {
    const next = !on;
    setOn(next);
    setBusy(true);
    try {
      const r = await api.masterySet(pageId, next);
      toast(next ? `Sceau maîtrisé · ${r.total} au total` : 'Sceau retiré de tes sceaux maîtrisés');
    } catch (e) {
      setOn(!next);
      toast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mastery-row">
      <button type="button" className={`mastery${on ? ' is-on' : ''}`} role="checkbox" aria-checked={on} onClick={() => void flip()} disabled={busy}>
        <span className="mastery__box" aria-hidden="true">
          {on ? '✓' : ''}
        </span>
        {on ? 'Je maîtrise ce sceau' : 'Cocher si je maîtrise ce sceau'}
      </button>
      <Link to="/mon-compte/sceaux" className="mastery-row__link">
        Mes sceaux maîtrisés →
      </Link>
    </div>
  );
}

function KanjiBanner({ kanji }: { kanji: string }) {
  const toast = useToast();
  return (
    <div className="formula">
      <div>
        <p className="kicker">Formule de kanjis</p>
        <p className="formula__kanji" lang="ja">
          {kanji}
        </p>
      </div>
      <button
        type="button"
        className="btn btn--ghost btn--sm"
        onClick={async () => {
          if (await copyToClipboard(kanji)) toast(`Formule copiée : ${kanji}`);
        }}
      >
        Copier
      </button>
    </div>
  );
}

function SlotStatus({ slot, badge }: { slot: SlotInfo | null; badge: 'mj' | null }) {
  const slotted = slot && slot.total_cap > 0;
  let state: 'free' | 'slotted' | 'mj' = 'free';
  if (badge === 'mj') state = 'mj';
  else if (slotted) state = 'slotted';

  return (
    <section className={`slot-status slot-status--${state}`}>
      <div className="slot-status__mark" aria-hidden="true">
        枠
      </div>
      <div className="slot-status__body">
        <p className="kicker">Statut de slot</p>
        {state === 'mj' && (
          <>
            <h3>Sceau MJ</h3>
            <p>Sceau réservé aux Maîtres de Jeu : son usage passe par une validation et une scène encadrée.</p>
          </>
        )}
        {state === 'free' && (
          <>
            <h3>Sceau libre</h3>
            <p>
              Ce sceau n’est <strong>pas slotté</strong> : aucune limite de porteurs n’est appliquée.
            </p>
          </>
        )}
        {(state === 'slotted' || (state === 'mj' && slotted)) && slot && (
          <>
            {state === 'slotted' && (
              <h3>
                Sceau slotté · {slot.total_taken} / {slot.total_cap} places
              </h3>
            )}
            <div className="slot-villages">
              {slot.villages.map((v) => (
                <div key={v.village_id} className={`slot-village${v.taken >= v.cap ? ' is-full' : ''}`}>
                  <div className="slot-village__head">
                    <b>{v.name}</b>
                    <span>
                      {v.taken}/{v.cap}
                    </span>
                  </div>
                  <span className="gauge">
                    <i style={{ width: `${v.cap ? Math.min(100, (v.taken / v.cap) * 100) : 0}%` }} />
                  </span>
                  {v.occupants && v.occupants.length > 0 && (
                    <p className="slot-village__who">{v.occupants.map((o) => o.name).join(', ')}</p>
                  )}
                </div>
              ))}
            </div>
            {slot.notes && <p className="slot-status__notes">Note interne : {slot.notes}</p>}
          </>
        )}
      </div>
    </section>
  );
}

function Locked({ detail }: { detail: string }) {
  let info: { category?: string; min_rank?: number; conclave_only?: boolean } = {};
  try {
    info = JSON.parse(detail);
  } catch {
    /* détail absent */
  }
  return (
    <div className="locked">
      <div className="locked__seal" aria-hidden="true">
        <span>封</span>
        <span className="locked__band">
          <i>封</i>
          <i>印</i>
        </span>
      </div>
      <p className="kicker">Archive scellée</p>
      <h1>Ce savoir dépasse ton cercle.</h1>
      <p className="muted">
        {info.conclave_only
          ? `Les archives « ${info.category ?? ''} » sont réservées au Conclave.`
          : `Les archives « ${info.category ?? ''} » s’ouvrent au ${circleLabel(info.min_rank ?? 1)}.`}
        <br />
        Poursuis ton entraînement en RP ou rapproche-toi d’un Maître Fuin.
      </p>
      <Link to="/" className="btn btn--ghost">
        ← Retour au Conclave
      </Link>
    </div>
  );
}

function NotFound() {
  return (
    <div className="locked">
      <div className="locked__seal locked__seal--void" aria-hidden="true">
        <span>無</span>
      </div>
      <p className="kicker">Archive introuvable</p>
      <h1>Ce parchemin n’existe pas.</h1>
      <p className="muted">Il a peut-être été déplacé, renommé ou consumé.</p>
      <Link to="/" className="btn btn--ghost">
        ← Retour au Conclave
      </Link>
    </div>
  );
}

export default function PageView() {
  const location = useLocation();
  const slug = decodeURIComponent(location.pathname).replace(/^\/+|\/+$/g, '');
  const { member } = useSession();
  const [data, setData] = useState<PageData | null>(null);
  // police pinceau chargée pour les kanjis des sceaux de la page (centrage exact)
  const font = useBrushFont(
    data
      ? [sealGlyphs(data.page.kind === 'seal' ? data.page.icon_svg : 'x', data.page.kanji), ...(data.children ?? []).map((c) => sealGlyphs(c.icon_svg, c.kanji))].join('')
      : '',
  );
  const [error, setError] = useState<ApiError | null>(null);

  const load = useCallback(async () => {
    setData(null);
    setError(null);
    try {
      setData(await api.page(slug));
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError('ERR', String(e)));
    }
  }, [slug]);

  /** Relit la page sans repasser par l'écran de chargement (après une publication). */
  const reload = useCallback(async () => {
    try {
      setData(await api.page(slug));
    } catch {
      /* la page reste affichée telle quelle */
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    document.title = data ? `${data.page.title} · Fuinjutsu` : 'Fuinjutsu · Archives de Zenkai';
  }, [data]);

  if (error) {
    if (error.code === 'FU403') return <Locked detail={error.detail} />;
    if (error.code === 'FU404') return <NotFound />;
    return <ErrorState text={error.message} onRetry={load} />;
  }
  if (!data) return <Loader />;

  const { page, slot, children, related, masters } = data;
  const icon = sanitizeSvg(page.icon_svg);
  // chaque sceau a un visuel : celui du créateur, l'icône importée, ou un sceau dessiné avec sa formule
  const emblem = page.kind === 'seal' && font.ready ? displaySealSvg(page.icon_svg, page.kanji) : null;
  const crumbHref = page.category.index_slug && page.category.index_slug !== page.slug ? '/' + page.category.index_slug : '/';

  return (
    <article className={`archive archive--${page.kind}`} key={page.slug}>
      <header className="archive__head">
        {emblem && <SealEmblem svg={emblem} className="emblem--page" />}
        <Link className="crumb" to={crumbHref}>
          <span>{page.category.glyph}</span> {page.category.name}
        </Link>
        <p className="archive__index">
          {page.kind === 'seal'
            ? 'Archive de scellement'
            : page.kind === 'index'
              ? 'Vue d’ensemble du cercle'
              : page.kind === 'memorial'
                ? 'Mémorial du Conclave'
                : 'Dossier source'}
          {page.hidden && <span className="badge badge--draft">brouillon · invisible des joueurs</span>}
        </p>
        <div className="archive__title-row">
          {icon && page.kind !== 'seal' && <div className="seal-icon" dangerouslySetInnerHTML={{ __html: icon }} />}
          <h1>{page.title}</h1>
        </div>
        {page.description && <p className="archive__desc">{page.description}</p>}
        <div className="archive__rule" aria-hidden="true">
          <span />
          <i>{page.category.glyph}</i>
          <span />
        </div>
        <div className="archive__tags">
          <SealBadge badge={page.badge} slotted={!!slot && slot.total_cap > 0} />
          {page.kind === 'seal' && <span className="tag">{circleLabel(page.min_rank)}</span>}
        </div>
        {member?.is_conclave && (
          <div className="conclave-bar">
            <span className="conclave-bar__label">議 Conclave</span>
            {page.hidden && <PublishButton pageId={page.id} kind={page.kind} onDone={reload} />}
            <Link to={`/conclave/sceaux/${page.id}`} className="btn btn--ghost btn--sm">
              Modifier la fiche
            </Link>
            {page.kind === 'seal' && (
              <Link to={`/conclave/slots/configuration?sceau=${page.id}`} className="btn btn--ghost btn--sm">
                {slot ? 'Gérer les slots' : 'Sloter ce sceau'}
              </Link>
            )}
            {masters && (
              <p className="conclave-bar__masters">
                <b>Maîtrisé par</b>{' '}
                {masters.length ? masters.map((x) => x.name).join(', ') : <span className="muted">personne n’a encore coché ce sceau</span>}
              </p>
            )}
          </div>
        )}
        {page.kind === 'seal' && page.mastered !== undefined && <MasteryToggle pageId={page.id} initial={page.mastered} />}
      </header>

      <div className="archive__grid">
        <aside className="archive__meta">
          <span className="kicker">Codex</span>
          <b>{page.category.name.split(' ')[0]}</b>
          <p>Les archives du Conclave sont actualisées à mesure que les sceaux sont découverts.</p>
          <small>Mis à jour le {formatDate(page.updated_at)}</small>
        </aside>
        <div className="archive__content">
          {page.kanji && page.kind === 'seal' && <KanjiBanner kanji={page.kanji} />}
          <Markdown source={page.content_md} />

          {children && children.length > 0 && (
            <section className="children">
              <p className="kicker">Les sceaux du cercle</p>
              <div className="talismans">
                {children.map((c, i) => (
                  <Link
                    key={c.slug}
                    to={'/' + c.slug}
                    className={`talisman${c.hidden ? ' is-hidden' : ''}`}
                    style={{ animationDelay: `${i * 70}ms` }}
                    title={c.description || c.title}
                  >
                    <span className="talisman__cord" aria-hidden="true" />
                    <span className="talisman__badge">
                      <SealBadge badge={c.badge} slotted={c.slotted} />
                    </span>
                    {c.mastered && (
                      <span className="talisman__mastered" title="Tu maîtrises ce sceau">
                        ✓ Maîtrisé
                      </span>
                    )}
                    <span
                      className="talisman__seal seal-icon"
                      dangerouslySetInnerHTML={{
                        __html: sanitizeSvg(displaySealSvg(c.icon_svg, c.kanji)),
                      }}
                    />
                    {c.kanji && (
                      <span className="talisman__kanji" lang="ja">
                        {c.kanji.replace(/\s+/g, '')}
                      </span>
                    )}
                    <strong className="talisman__title">{c.title}</strong>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      {page.kind === 'seal' && <SlotStatus slot={slot} badge={page.badge} />}

      {page.kind === 'memorial' && <Memorial />}

      {related.length > 0 && (
        <footer className="related">
          <p className="kicker">Continuer l’étude</p>
          <div className="related__grid">
            {related.map((r) => (
              <Link key={r.slug} to={'/' + r.slug} className="related__item">
                <span className="related__glyph">{page.category.glyph}</span>
                <span className="related__text">
                  <small>{page.category.name}</small>
                  <strong>{r.title}</strong>
                </span>
                <i aria-hidden="true">↗</i>
              </Link>
            ))}
          </div>
        </footer>
      )}
    </article>
  );
}
