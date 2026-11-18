import { useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import { circleLabel, initials, rankTitle, RANK_KANJI } from '../lib/format';
import { useToast } from '../components/ui';

export default function Account() {
  const { member } = useSession();
  const toast = useToast();
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!member) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPw !== confirm) {
      setError('Les deux nouveaux mots de passe ne correspondent pas.');
      return;
    }
    setBusy(true);
    try {
      const r = await api.changePassword(oldPw, newPw);
      if (!r.ok) setError(r.error || 'Échec.');
      else {
        toast('Mot de passe changé. Tes autres appareils ont été déconnectés.');
        setOldPw('');
        setNewPw('');
        setConfirm('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page-narrow">
      <header className="page-head">
        <p className="kicker">Mon compte</p>
        <h1>{member.display_name}</h1>
      </header>

      <section className="panel id-card">
        <span className={`avatar avatar--xl${member.is_conclave ? ' avatar--conclave' : ''}`}>{initials(member.display_name)}</span>
        <div>
          <p className="id-card__title">{rankTitle(member.rank, member.is_conclave)}</p>
          <p className="muted">
            {circleLabel(member.rank)}
            {member.is_conclave ? ' · membre du Conclave (accès total)' : ''}
          </p>
        </div>
        <span className="id-card__kanji" aria-hidden="true">
          {RANK_KANJI[member.rank]}
        </span>
      </section>

      <section className="panel">
        <h2 className="panel__title">Changer mon mot de passe</h2>
        <p className="muted">Ton mot de passe t’a été remis par le Conclave ; tu peux le remplacer par le tien.</p>
        <form className="form" onSubmit={submit}>
          <label className="field">
            <span>Mot de passe actuel</span>
            <input type="password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} autoComplete="current-password" required />
          </label>
          <div className="field-row">
            <label className="field">
              <span>Nouveau mot de passe</span>
              <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" minLength={8} required />
            </label>
            <label className="field">
              <span>Confirmation</span>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" minLength={8} required />
            </label>
          </div>
          {error && <p className="form-error">{error}</p>}
          <div className="form-actions">
            <button type="submit" className="btn btn--red" disabled={busy}>
              {busy ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
