import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useSession } from '../lib/session';
import SealRing from '../components/SealRing';
import { Hanko } from '../components/Brand';

export default function Login() {
  const { status, login } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from || '/';

  const [prenom, setPrenom] = useState('');
  const [nom, setNom] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(0);

  if (status === 'ready') return <Navigate to={from} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const err = await login(prenom, nom, password);
    setBusy(false);
    if (err) {
      setError(err);
      setShake((s) => s + 1);
    } else {
      navigate(from, { replace: true });
    }
  };

  return (
    <div className="login">
      <div className="login__backdrop" aria-hidden="true">
        <SealRing className="login__ring" />
        <span className="login__kanji login__kanji--a">封</span>
        <span className="login__kanji login__kanji--b">印</span>
      </div>

      <form key={shake} className={`login__card${shake ? ' is-shaking' : ''}`} onSubmit={submit}>
        <Hanko size="lg" />
        <p className="kicker">Conclave de Zenkai</p>
        <h1>Accès au grimoire</h1>
        <p className="login__lede">Identifie-toi avec ton nom RP pour consulter les archives de ton cercle.</p>

        <div className="field-row">
          <label className="field">
            <span>Prénom RP</span>
            <input
              value={prenom}
              onChange={(e) => setPrenom(e.target.value)}
              autoComplete="given-name"
              autoFocus
              required
              placeholder="Prénom de ton personnage"
            />
          </label>
          <label className="field">
            <span>Nom RP</span>
            <input value={nom} onChange={(e) => setNom(e.target.value)} autoComplete="family-name" placeholder="Nom de ton personnage" />
          </label>
        </div>

        <label className="field">
          <span>Mot de passe</span>
          <div className="field__pw">
            <input
              type={show ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
            <button type="button" className="field__eye" onClick={() => setShow((s) => !s)} aria-label={show ? 'Masquer' : 'Afficher'}>
              {show ? '隠' : '見'}
            </button>
          </div>
        </label>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn btn--red btn--block btn--lg" disabled={busy}>
          {busy ? 'Rupture du sceau…' : 'Briser le sceau'} <span aria-hidden="true">→</span>
        </button>

        <p className="login__foot">
          Pas d’accès ? Les identifiants sont remis par <b>le Conclave</b>.
        </p>
      </form>
    </div>
  );
}
