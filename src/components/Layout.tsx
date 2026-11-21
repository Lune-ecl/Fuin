import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useSession } from '../lib/session';
import { canRequest, circleLabel, initials, normalize, rankTitle, RANK_KANJI } from '../lib/format';
import type { NavCategory, NavPage } from '../lib/api';
import Brand from './Brand';
import { SealBadge } from './ui';

// ---------------------------------------------------------------------------
// Sommaire du Conclave
// ---------------------------------------------------------------------------
function lockReason(c: NavCategory) {
  return c.conclave_only ? 'Réservé au Conclave' : `${circleLabel(c.min_rank)} requis`;
}

export function categoryHref(c: NavCategory): string | null {
  if (!c.accessible || !c.pages.length) return null;
  const idx = c.pages.find((p) => p.kind === 'index');
  return '/' + (idx ?? c.pages[0]).slug;
}

function ActiveTrames() {
  const { activeTrames } = useSession();
  if (!activeTrames.length) return null;
  return (
    <div className="live-trames">
      {activeTrames.map((t) => (
        <NavLink key={t.id} to={`/trame/${t.id}`} className={({ isActive }) => `live-trame${isActive ? ' is-active' : ''}`}>
          <i aria-hidden="true" />
          <span>
            <small>Trame en cours</small>
            <b>{t.title}</b>
          </span>
        </NavLink>
      ))}
    </div>
  );
}

function GrimoireNav() {
  const { categories, member } = useSession();
  if (!member) return null;
  return (
    <nav className="nav" aria-label="Sommaire du Conclave">
      <ActiveTrames />
      <div className="nav__path">
        <p className="kicker">Ta voie</p>
        <div className="path" aria-label={`Maîtrise : ${circleLabel(member.rank)}`}>
          {[1, 2, 3, 4, 5].map((r) => (
            <span key={r} className={`path__node${r <= member.rank ? ' is-done' : ''}${r === member.rank ? ' is-current' : ''}`}>
              {RANK_KANJI[r]}
            </span>
          ))}
        </div>
        <p className="nav__path-label">
          {member.is_conclave ? 'Conclave · accès total' : rankTitle(member.rank)}
        </p>
      </div>

      <NavLink to="/mon-compte/sceaux" className={({ isActive }) => `atelier-link atelier-link--mastery${isActive ? ' is-active' : ''}`}>
        <span className="atelier-link__glyph">修</span>
        <span>
          <b>Mes sceaux maîtrisés</b>
          <small>Cocher les sceaux que je connais</small>
        </span>
      </NavLink>

      {canRequest(member) && (
        <NavLink to="/demandes" className={({ isActive }) => `atelier-link${isActive ? ' is-active' : ''}`}>
          <span className="atelier-link__glyph">願</span>
          <span>
            <b>Demande de création de sceau</b>
            <small>Proposer un sceau au Conclave</small>
          </span>
        </NavLink>
      )}

      {categories.map((c) => (
        <section key={c.id} className={`nav-group${c.accessible ? '' : ' is-locked'}`}>
          <p className="nav-group__head">
            <span className="nav-group__glyph">{c.glyph}</span>
            <span className="nav-group__name">{c.name}</span>
            {!c.accessible && <span className="nav-group__lock" aria-label="Verrouillé">🔒</span>}
          </p>
          {c.accessible ? (
            <ul>
              {c.pages.map((p) => (
                <li key={p.slug}>
                  <NavLink
                    to={'/' + p.slug}
                    end
                    className={({ isActive }) =>
                      `nav-link${isActive ? ' is-active' : ''}${p.kind === 'index' ? ' is-index' : ''}${p.hidden ? ' is-hidden' : ''}`
                    }
                  >
                    <span className="nav-link__label">{p.nav_title}</span>
                    {p.hidden && <span className="badge badge--draft">brouillon</span>}
                    <SealBadge badge={p.badge} slotted={p.slotted} />
                  </NavLink>
                </li>
              ))}
            </ul>
          ) : (
            <p className="nav-group__sealed">
              {c.seal_count > 0 ? `${c.seal_count} sceau${c.seal_count > 1 ? 'x' : ''} scellé${c.seal_count > 1 ? 's' : ''} · ` : ''}
              {lockReason(c)}
            </p>
          )}
        </section>
      ))}
    </nav>
  );
}

const CONCLAVE_LINKS = [
  { to: '/conclave', glyph: '議', label: 'Tableau de bord', hint: 'Vue d’ensemble', end: true },
  { to: '/conclave/membres', glyph: '人', label: 'Membres', hint: 'Comptes, cercles, accès' },
  { to: '/conclave/slots', glyph: '枠', label: 'Slots', hint: 'Places par village' },
  { to: '/conclave/sceaux', glyph: '巻', label: 'Éditeur de sceaux', hint: 'Fiches & kanjis' },
  { to: '/conclave/demandes', glyph: '願', label: 'Demandes', hint: 'Sceaux proposés' },
  { to: '/conclave/trames', glyph: '謎', label: 'Trames', hint: 'Énigmes et défis' },
  { to: '/conclave/categories', glyph: '門', label: 'Catégories', hint: 'Cercles & droits' },
  { to: '/conclave/journal', glyph: '録', label: 'Journal', hint: 'Historique des actions' },
];

function ConclaveNav() {
  const { requestsPending, activeTrames } = useSession();
  return (
    <nav className="nav nav--conclave" aria-label="Console du Conclave">
      <div className="nav__path">
        <p className="kicker">Console</p>
        <p className="nav__conclave-title">Le Conclave</p>
      </div>
      <ul className="conclave-links">
        {CONCLAVE_LINKS.map((l) => (
          <li key={l.to}>
            <NavLink to={l.to} end={l.end} className={({ isActive }) => `conclave-link${isActive ? ' is-active' : ''}`}>
              <span className="conclave-link__glyph">{l.glyph}</span>
              <span className="conclave-link__text">
                <b>{l.label}</b>
                <small>{l.hint}</small>
              </span>
              {l.to === '/conclave/demandes' && requestsPending > 0 && <span className="count-badge">{requestsPending}</span>}
              {l.to === '/conclave/trames' && activeTrames.length > 0 && <span className="count-badge count-badge--live">{activeTrames.length}</span>}
            </NavLink>
          </li>
        ))}
      </ul>
      <Link to="/" className="nav__back">
        ← Retour aux archives du Conclave
      </Link>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Compte
// ---------------------------------------------------------------------------
function AccountMenu() {
  const { member, logout, requestsPending } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('click', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', esc);
    };
  }, []);

  if (!member) return null;
  return (
    <div className="account" ref={ref}>
      <button type="button" className="account__btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className={`avatar${member.is_conclave ? ' avatar--conclave' : ''}`}>{initials(member.display_name)}</span>
        <span className="account__meta">
          <b>{member.display_name}</b>
          <em>{rankTitle(member.rank, member.is_conclave)}</em>
        </span>
        <span className="account__caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="account__menu" role="menu">
          <div className="account__menu-head">
            <b>{member.display_name}</b>
            <span>
              {member.is_conclave ? 'Conclave · ' : ''}
              {circleLabel(member.rank)}
            </span>
          </div>
          {member.is_conclave && (
            <Link role="menuitem" to="/conclave" onClick={() => setOpen(false)}>
              <span>議</span> Console du Conclave
              {requestsPending > 0 && <em className="count-badge">{requestsPending}</em>}
            </Link>
          )}
          {canRequest(member) && (
            <Link role="menuitem" to="/demandes" onClick={() => setOpen(false)}>
              <span>願</span> Demande de création de sceau
            </Link>
          )}
          <Link role="menuitem" to="/mon-compte/sceaux" onClick={() => setOpen(false)}>
            <span>修</span> Mes sceaux maîtrisés
          </Link>
          <Link role="menuitem" to="/mon-compte" onClick={() => setOpen(false)}>
            <span>鍵</span> Mon compte
          </Link>
          <button
            role="menuitem"
            type="button"
            onClick={async () => {
              setOpen(false);
              await logout();
              navigate('/connexion');
            }}
          >
            <span>退</span> Se déconnecter
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recherche (⌘K / Ctrl K)
// ---------------------------------------------------------------------------
interface SearchItem extends NavPage {
  category: string;
  glyph: string;
}

function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { categories } = useSession();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const ref = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      setQ('');
      setSel(0);
      setTimeout(() => input.current?.focus(), 10);
    }
    if (!open && d.open) d.close();
  }, [open]);

  const all: SearchItem[] = categories.flatMap((c) =>
    c.pages.map((p) => ({ ...p, category: c.name, glyph: c.glyph })),
  );
  const nq = normalize(q.trim());
  const results = (nq
    ? all.filter((p) => {
        const hay = normalize(`${p.title} ${p.nav_title} ${p.category} ${p.description}`);
        const kanji = (p.kanji || '').replace(/\s/g, '');
        return hay.includes(nq) || [...q.replace(/\s/g, '')].every((ch) => /[㐀-鿿]/.test(ch) && kanji.includes(ch));
      })
    : all.filter((p) => p.kind !== 'index')
  ).slice(0, 14);

  const go = (p: SearchItem) => {
    onClose();
    navigate('/' + p.slug);
  };

  return (
    <dialog
      ref={ref}
      className="search"
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      <div className="search__sheet">
        <div className="search__head">
          <span className="search__icon">⌕</span>
          <input
            ref={input}
            type="search"
            value={q}
            placeholder="Rechercher un sceau, un kanji, un effet…"
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSel((s) => Math.min(s + 1, results.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSel((s) => Math.max(s - 1, 0));
              } else if (e.key === 'Enter' && results[sel]) {
                go(results[sel]);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
              }
            }}
          />
          <button type="button" className="search__close" onClick={onClose}>
            Échap
          </button>
        </div>
        <div className="search__results">
          {results.length ? (
            results.map((p, i) => (
              <button
                type="button"
                key={p.slug}
                className={`search__item${i === sel ? ' is-sel' : ''}`}
                onMouseEnter={() => setSel(i)}
                onClick={() => go(p)}
              >
                <span className="search__glyph">{p.glyph}</span>
                <span className="search__text">
                  <b>{p.title}</b>
                  <small>{p.category}</small>
                </span>
                {p.kanji && <span className="search__kanji">{p.kanji}</span>}
                <SealBadge badge={p.badge} slotted={p.slotted} />
              </button>
            ))
          ) : (
            <p className="search__empty">Aucune archive ne répond à « {q} » dans ton cercle.</p>
          )}
        </div>
        <p className="search__hint">↑ ↓ pour naviguer · Entrée pour ouvrir · seules les archives de ton cercle apparaissent</p>
      </div>
    </dialog>
  );
}

// ---------------------------------------------------------------------------
// Coquille de l'application
// ---------------------------------------------------------------------------
export default function Layout() {
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const inConclave = location.pathname.startsWith('/conclave');

  const { refresh } = useSession();
  // les trames ouvertes ou terminées apparaissent et disparaissent sans recharger la page
  useEffect(() => {
    const t = window.setInterval(() => void refresh(), 60000);
    return () => window.clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    setNavOpen(false);
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  const onKey = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      setSearchOpen(true);
    }
  }, []);
  useEffect(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onKey]);

  useEffect(() => {
    document.body.classList.toggle('no-scroll', navOpen);
  }, [navOpen]);

  return (
    <div className="app">
      <header className="topbar">
        <button
          type="button"
          className={`burger${navOpen ? ' is-open' : ''}`}
          aria-label={navOpen ? 'Fermer le sommaire' : 'Ouvrir le sommaire'}
          aria-expanded={navOpen}
          onClick={() => setNavOpen((o) => !o)}
        >
          <i />
          <i />
        </button>
        <Brand />
        <div className="topbar__actions">
          <button type="button" className="search-trigger" onClick={() => setSearchOpen(true)}>
            <span aria-hidden="true">⌕</span>
            <span className="search-trigger__label">Rechercher</span>
            <kbd>Ctrl K</kbd>
          </button>
          <AccountMenu />
        </div>
      </header>

      <div className="shell">
        <aside className={`sidebar${navOpen ? ' is-open' : ''}`}>{inConclave ? <ConclaveNav /> : <GrimoireNav />}</aside>
        {navOpen && <div className="scrim" onClick={() => setNavOpen(false)} />}
        <main className="main" id="contenu">
          <Outlet />
          <footer className="site-footer">
            <span className="site-footer__mark">封</span>
            <p>
              Fuinjutsu · Archives de Zenkai
              <br />
              <small>Les kanjis ne s’écrivent jamais seuls. Chaque trait engage le chakra de son auteur.</small>
            </p>
          </footer>
        </main>
      </div>

      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
