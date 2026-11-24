import { Link, Outlet } from 'react-router-dom';
import { useSession } from '../lib/session';
import { Loader } from './ui';
import Layout from './Layout';
import Brand from './Brand';

/**
 * Cadre des pages ouvertes à tous (le traducteur de kanjis) : le site habituel pour un membre
 * connecté, une barre simple avec « Se connecter » pour un visiteur.
 */
export default function PublicShell() {
  const { status } = useSession();
  if (status === 'loading')
    return (
      <div className="fullscreen">
        <Loader />
      </div>
    );
  if (status === 'ready') return <Layout />;
  return (
    <div className="app app--public">
      <header className="topbar">
        <Brand />
        <div className="topbar__actions">
          <Link to="/connexion" className="btn btn--ghost btn--sm">
            Se connecter
          </Link>
        </div>
      </header>
      <main className="main main--public" id="contenu">
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
  );
}
