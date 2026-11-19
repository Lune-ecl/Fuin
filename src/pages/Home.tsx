import { Link } from 'react-router-dom';
import { useSession } from '../lib/session';
import { circleLabel, rankTitle } from '../lib/format';
import SealRing from '../components/SealRing';
import Embers from '../components/Embers';
import { categoryHref } from '../components/Layout';

export default function Home() {
  const { member, categories, activeTrames } = useSession();
  if (!member) return null;

  const cards = categories.filter((c) => c.show_on_home);
  const docs = categories.find((c) => c.slug === 'fondations');
  const firstDoc = docs?.pages[0];
  const archives = categories.filter((c) => !c.show_on_home);
  const sealCount = categories.reduce((n, c) => n + c.pages.filter((p) => p.kind === 'seal').length, 0);

  return (
    <div className="home">
      <section className="hero">
        <Embers count={18} className="embers--hero" />
        <div className="hero__copy reveal">
          <p className="kicker">Archives scellées · Conclave de Zenkai</p>
          <h1 className="hero__title">
            L’art de
            <br />
            <span className="hero__accent">l’empreinte.</span>
          </h1>
          <p className="hero__lede">
            Un codex vivant pour celles et ceux qui apprennent à lier le chakra, les mots et les destinées.
          </p>
          <div className="hero__ctas">
            {firstDoc && (
              <Link to={'/' + firstDoc.slug} className="btn btn--red btn--lg">
                Lire les fondations <span aria-hidden="true">→</span>
              </Link>
            )}
            <button
              type="button"
              className="btn btn--ghost btn--lg"
              onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))}
            >
              Explorer les archives
            </button>
          </div>
          <dl className="hero__stats">
            <div>
              <dt>Ton rang</dt>
              <dd>{rankTitle(member.rank, member.is_conclave)}</dd>
            </div>
            <div>
              <dt>Sceaux accessibles</dt>
              <dd>{sealCount}</dd>
            </div>
            <div>
              <dt>Shinobi</dt>
              <dd>{member.display_name}</dd>
            </div>
          </dl>
        </div>
        <div className="hero__visual reveal reveal--late">
          <SealRing label="Fūin" />
        </div>
      </section>

      {activeTrames.map((t) => (
        <Link key={t.id} to={`/trame/${t.id}`} className="trame-banner reveal">
          <i aria-hidden="true" />
          <span>
            <small>Une trame est en cours</small>
            <b>{t.title}</b>
          </span>
          <em>Rejoindre →</em>
        </Link>
      ))}

      <p className="hero-note reveal">
        Les kanjis ne s’écrivent jamais seuls.
        <br />
        Chaque trait engage le chakra de son auteur.
      </p>

      <section className="section">
        <header className="section__head">
          <p className="kicker">Les voies du scellement</p>
          <h2>Choisir son cercle.</h2>
          <span className="section__count">01 — {String(cards.length).padStart(2, '0')}</span>
        </header>
        <div className="circle-grid">
          {cards.map((c, i) => {
            const href = categoryHref(c);
            const content = (
              <>
                <span className="circle-card__glyph" aria-hidden="true">
                  {c.glyph}
                </span>
                <span className="circle-card__num">{String(i + 1).padStart(2, '0')}</span>
                <h3>{c.name}</h3>
                <p>{c.tagline}</p>
                <span className="circle-card__cta">
                  {c.accessible ? (
                    <>
                      Ouvrir le cercle <i aria-hidden="true">↗</i>
                    </>
                  ) : c.conclave_only ? (
                    'Réservé au Conclave'
                  ) : (
                    `${circleLabel(c.min_rank)} requis`
                  )}
                </span>
                {!c.accessible && (
                  <span className="ofuda" aria-hidden="true">
                    <span>封</span>
                    <span>印</span>
                  </span>
                )}
              </>
            );
            return href ? (
              <Link key={c.id} to={href} className="circle-card" style={{ animationDelay: `${i * 60}ms` }}>
                {content}
              </Link>
            ) : (
              <div key={c.id} className="circle-card is-locked" style={{ animationDelay: `${i * 60}ms` }} aria-disabled="true">
                {content}
              </div>
            );
          })}
        </div>
      </section>

      <section className="section split">
        <div className="ritual">
          <span className="ritual__glyph" aria-hidden="true">
            二
          </span>
          <p className="kicker">Principe fondateur</p>
          <h2>
            Deux kanjis.
            <br />
            Un équilibre.
          </h2>
          <p>L’apprentissage de la calligraphie et du contrôle du chakra forment le cœur du Fuinjutsu.</p>
          {firstDoc && (
            <Link to={'/' + firstDoc.slug} className="link-arrow">
              Consulter les règles <span aria-hidden="true">→</span>
            </Link>
          )}
        </div>
        <div className="archive-list">
          <header className="section__head section__head--tight">
            <p className="kicker">Accès direct</p>
            <h2>Les archives.</h2>
          </header>
          {[...(docs ? [docs] : []), ...categories.filter((c) => c.slug === 'sceaux-de-clan'), ...archives.filter((c) => c.slug !== 'fondations')].map(
            (c) => {
              const href = categoryHref(c);
              const inner = (
                <>
                  <span className="archive-list__glyph">{c.glyph}</span>
                  <span className="archive-list__text">
                    <small>{c.accessible ? 'Dossier' : 'Scellé'}</small>
                    <strong>{c.name}</strong>
                  </span>
                  <i aria-hidden="true">{c.accessible ? '→' : '🔒'}</i>
                </>
              );
              return href ? (
                <Link key={c.id} to={href} className="archive-list__item">
                  {inner}
                </Link>
              ) : (
                <div key={c.id} className="archive-list__item is-locked">
                  {inner}
                </div>
              );
            },
          )}
        </div>
      </section>
    </div>
  );
}
