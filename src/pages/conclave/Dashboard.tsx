import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Overview } from '../../lib/api';
import { RANK_KANJI } from '../../lib/format';
import { ErrorState, Loader } from '../../components/ui';
import { AuditList } from './Journal';

export default function Dashboard() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api.overview());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <ErrorState text={error} onRetry={load} />;
  if (!data) return <Loader label="Convocation du Conclave…" />;

  const max = Math.max(1, ...data.by_rank.map((r) => r.count));

  return (
    <div className="console">
      <header className="page-head">
        <p className="kicker">Console du Conclave</p>
        <h1>Tableau de bord</h1>
        <p className="muted">Vue d’ensemble des shinobi, du grimoire et des slots.</p>
      </header>

      <div className="stats">
        <div className="stat">
          <b>{data.members}</b>
          <span>Shinobi inscrits</span>
        </div>
        <div className="stat">
          <b>{data.conclave}</b>
          <span>Membres du Conclave</span>
        </div>
        <div className="stat">
          <b>{data.active_week}</b>
          <span>Connectés cette semaine</span>
        </div>
        <div className={`stat${data.inactive ? ' stat--alert' : ''}`}>
          <b>{data.inactive}</b>
          <span>Comptes à activer</span>
        </div>
        <div className="stat">
          <b>{data.pages}</b>
          <span>Sceaux au grimoire</span>
        </div>
        <div className="stat">
          <b>
            {data.slot_taken}
            <small>/{data.slot_total}</small>
          </b>
          <span>Places de slots occupées</span>
        </div>
      </div>

      <div className="console-grid">
        <section className="panel">
          <h2 className="panel__title">Répartition par cercle</h2>
          <p className="muted small">Joueurs hors Conclave.</p>
          <div className="rank-bars">
            {data.by_rank.map((r) => (
              <div key={r.rank} className="rank-bar">
                <span className="rank-bar__label">
                  <i>{RANK_KANJI[r.rank]}</i> Cercle {r.rank}
                </span>
                <span className="gauge gauge--lg">
                  <i style={{ width: `${(r.count / max) * 100}%` }} />
                </span>
                <b>{r.count}</b>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <h2 className="panel__title">Accès rapide</h2>
          <div className="quick">
            <Link to="/conclave/membres" className="quick__item">
              <span>人</span>
              <b>Inscrire un shinobi</b>
              <small>Nom RP, cercle, mot de passe</small>
            </Link>
            <Link to="/conclave/slots" className="quick__item">
              <span>枠</span>
              <b>Suivi des slots</b>
              <small>{data.slotted} sceaux slottés</small>
            </Link>
            <Link to="/conclave/sceaux/nouveau" className="quick__item">
              <span>巻</span>
              <b>Nouveau sceau</b>
              <small>Rédiger une fiche</small>
            </Link>
            <Link to="/conclave/categories" className="quick__item">
              <span>門</span>
              <b>Droits d’accès</b>
              <small>Cercle requis par catégorie</small>
            </Link>
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="panel__row">
          <h2 className="panel__title">Dernières actions</h2>
          <Link to="/conclave/journal" className="link-arrow">
            Tout le journal →
          </Link>
        </div>
        <AuditList entries={data.recent} />
      </section>
    </div>
  );
}
