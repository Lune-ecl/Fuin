import { useCallback, useEffect, useState } from 'react';
import { api, type AuditEntry } from '../../lib/api';
import { AUDIT_LABELS, formatDate, normalize, timeAgo } from '../../lib/format';
import { Empty, ErrorState, Loader } from '../../components/ui';

function detailText(e: AuditEntry): string {
  const d = e.details as Record<string, unknown> | null;
  if (!d) return '';
  if (e.action === 'slot.assign' || e.action === 'slot.unassign') return `${d.member ?? ''} · ${d.village ?? ''}`;
  if (e.action === 'member.update') {
    const parts: string[] = [];
    const rank = d.rank as number[] | undefined;
    const conclave = d.conclave as boolean[] | undefined;
    const name = d.name as string[] | undefined;
    if (rank && rank[0] !== rank[1]) parts.push(`cercle ${rank[0]} → ${rank[1]}`);
    if (conclave && conclave[0] !== conclave[1]) parts.push(conclave[1] ? 'entre au Conclave' : 'quitte le Conclave');
    if (name) parts.push(`renommé (${name[0]})`);
    return parts.join(' · ');
  }
  if (e.action === 'member.create') return `cercle ${d.rank}${d.conclave ? ' · Conclave' : ''}`;
  if (e.action === 'category.save') return `cercle requis ${d.min_rank}${d.conclave_only ? ' · Conclave seul' : ''}`;
  return '';
}

export function AuditList({ entries }: { entries: AuditEntry[] }) {
  if (!entries.length) return <Empty glyph="録">Aucune action enregistrée pour l’instant.</Empty>;
  return (
    <ol className="audit">
      {entries.map((e) => (
        <li key={e.id} className={`audit__item audit__item--${e.action.split('.')[0]}`}>
          <span className="audit__dot" aria-hidden="true" />
          <div>
            <p>
              <b>{e.actor_name || '—'}</b> {AUDIT_LABELS[e.action] ?? e.action} <strong>{e.target}</strong>
            </p>
            <small title={formatDate(e.created_at, true)}>
              {timeAgo(e.created_at)}
              {detailText(e) && ` · ${detailText(e)}`}
            </small>
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function Journal() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      setEntries(await api.audit(500));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <ErrorState text={error} onRetry={load} />;
  if (!entries) return <Loader />;

  const nq = normalize(q);
  const shown = nq
    ? entries.filter((e) => normalize(`${e.actor_name} ${e.target} ${AUDIT_LABELS[e.action] ?? e.action}`).includes(nq))
    : entries;

  return (
    <div className="console">
      <header className="page-head">
        <p className="kicker">Console du Conclave</p>
        <h1>Journal</h1>
        <p className="muted">Chaque inscription, attribution de slot ou modification de fiche laisse une trace.</p>
      </header>
      <section className="panel">
        <div className="toolbar">
          <input className="input-search" type="search" placeholder="Filtrer par shinobi, sceau, action…" value={q} onChange={(e) => setQ(e.target.value)} />
          <span className="muted small">{shown.length} entrée(s)</span>
        </div>
        <AuditList entries={shown} />
      </section>
    </div>
  );
}
