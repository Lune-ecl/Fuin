import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { isConfigured } from './lib/api';
import { SessionProvider, useSession } from './lib/session';
import { ConfirmProvider, ErrorState, Loader, ToastProvider } from './components/ui';
import Layout from './components/Layout';
import { Hanko } from './components/Brand';
import Login from './pages/Login';
import Home from './pages/Home';
import PageView from './pages/PageView';
import Account from './pages/Account';
import Dashboard from './pages/conclave/Dashboard';
import Members from './pages/conclave/Members';
import Slots from './pages/conclave/Slots';
import { EditorList, PageEditor } from './pages/conclave/Editor';
import Categories from './pages/conclave/Categories';
import Journal from './pages/conclave/Journal';
import Requests from './pages/Requests';
import ConclaveRequests from './pages/conclave/Requests';
import Trames from './pages/conclave/Trames';
import TrameEditor from './pages/conclave/TrameEditor';
import Trame from './pages/Trame';

function RequireAuth({ children }: { children: ReactNode }) {
  const { status, error, refresh } = useSession();
  const location = useLocation();
  if (status === 'loading') return <div className="fullscreen"><Loader /></div>;
  if (status === 'error')
    return (
      <div className="fullscreen">
        <ErrorState text={error || 'Erreur inconnue.'} onRetry={refresh} />
      </div>
    );
  if (status === 'anon') return <Navigate to="/connexion" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

function RequireConclave({ children }: { children: ReactNode }) {
  const { member } = useSession();
  if (!member?.is_conclave) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function NotConfigured() {
  return (
    <div className="fullscreen">
      <div className="setup">
        <Hanko size="lg" />
        <p className="kicker">Installation</p>
        <h1>Le site du Conclave n’est pas encore relié à Supabase.</h1>
        <p className="muted">
          Renseigne <code>VITE_SUPABASE_URL</code> et <code>VITE_SUPABASE_ANON_KEY</code> (fichier <code>.env</code> en local, ou
          secrets du dépôt pour le déploiement), puis reconstruis le site. Toutes les étapes sont dans le <code>README.md</code>.
        </p>
      </div>
    </div>
  );
}

export default function App() {
  if (!isConfigured) return <NotConfigured />;
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || '/'}>
      <ToastProvider>
        <ConfirmProvider>
          <SessionProvider>
            <Routes>
              <Route path="/connexion" element={<Login />} />
              <Route
                element={
                  <RequireAuth>
                    <Layout />
                  </RequireAuth>
                }
              >
                <Route index element={<Home />} />
                <Route path="mon-compte" element={<Account />} />
                <Route path="demandes" element={<Requests />} />
                <Route path="trame/:id" element={<Trame />} />
                <Route
                  path="conclave"
                  element={
                    <RequireConclave>
                      <ConclaveOutlet />
                    </RequireConclave>
                  }
                >
                  <Route index element={<Dashboard />} />
                  <Route path="membres" element={<Members />} />
                  <Route path="slots" element={<Slots tab="suivi" />} />
                  <Route path="slots/catalogue" element={<Slots tab="catalogue" />} />
                  <Route path="slots/configuration" element={<Slots tab="config" />} />
                  <Route path="sceaux" element={<EditorList />} />
                  <Route path="sceaux/nouveau" element={<PageEditor />} />
                  <Route path="sceaux/:id" element={<PageEditor />} />
                  <Route path="categories" element={<Categories />} />
                  <Route path="journal" element={<Journal />} />
                  <Route path="demandes" element={<ConclaveRequests />} />
                  <Route path="trames" element={<Trames tab="liste" />} />
                  <Route path="trames/tables" element={<Trames tab="tables" />} />
                  <Route path="trames/dechiffreur" element={<Trames tab="dechiffreur" />} />
                  <Route path="trames/visuel" element={<Trames tab="visuel" />} />
                  <Route path="trames/nouvelle" element={<TrameEditor />} />
                  <Route path="trames/:id" element={<TrameEditor />} />
                  <Route path="*" element={<Navigate to="/conclave" replace />} />
                </Route>
                <Route path="*" element={<PageView />} />
              </Route>
            </Routes>
          </SessionProvider>
        </ConfirmProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

function ConclaveOutlet() {
  return <Outlet />;
}
