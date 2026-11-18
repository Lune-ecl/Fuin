import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { api, ApiError, type AdminMember } from '../../lib/api';
import { useSession } from '../../lib/session';
import { circleLabel, initials, normalize, RANKS, timeAgo } from '../../lib/format';
import { copyToClipboard, Empty, ErrorState, Loader, Modal, RankPicker, Toggle, useConfirm, useToast } from '../../components/ui';

function generatePassword(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let out = '';
  bytes.forEach((b, i) => {
    if (i === 4 || i === 8) out += '-';
    out += alphabet[b % alphabet.length];
  });
  return out;
}

function siteUrl() {
  return window.location.origin + import.meta.env.BASE_URL;
}

interface Credentials {
  prenom: string;
  nom: string;
  password: string;
  title: string;
}

function CredentialsModal({ creds, onClose }: { creds: Credentials | null; onClose: () => void }) {
  const toast = useToast();
  if (!creds) return <Modal open={false} onClose={onClose} title="" />;
  const nom = creds.nom.trim() || '/';
  const message = `🔴 Accès au Conclave Fuinjutsu\nPrénom RP : ${creds.prenom}\nNom RP : ${nom}\nMot de passe : ${creds.password}\nSite : ${siteUrl()}`;
  return (
    <Modal open onClose={onClose} title={creds.title} kicker="Identifiants à transmettre">
      <div className="creds">
        <div className="creds__row">
          <span>Prénom RP</span>
          <b>{creds.prenom}</b>
        </div>
        <div className="creds__row">
          <span>Nom RP</span>
          <b>{nom}</b>
        </div>
        <div className="creds__row">
          <span>Mot de passe</span>
          <code className="creds__pw">{creds.password}</code>
        </div>
      </div>
      <p className="muted small">
        Ce mot de passe ne sera <strong>plus jamais affiché</strong>. Transmets-le maintenant au joueur (MP Discord par exemple).
      </p>
      <div className="form-actions">
        <button
          type="button"
          className="btn btn--ghost"
          onClick={async () => {
            if (await copyToClipboard(creds.password)) toast('Mot de passe copié');
          }}
        >
          Copier le mot de passe
        </button>
        <button
          type="button"
          className="btn btn--red"
          onClick={async () => {
            if (await copyToClipboard(message)) toast('Message complet copié');
          }}
        >
          Copier le message complet
        </button>
      </div>
    </Modal>
  );
}

function CreateMember({ onCreated }: { onCreated: (c: Credentials) => void }) {
  const toast = useToast();
  const [prenom, setPrenom] = useState('');
  const [nom, setNom] = useState('');
  const [rank, setRank] = useState(1);
  const [conclave, setConclave] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api.memberCreate(prenom, nom, rank, conclave, password.trim() || null);
      toast(`${r.member.display_name} a désormais accès aux archives du Conclave`);
      onCreated({ prenom: r.member.prenom, nom: r.member.nom, password: r.password, title: `${r.member.display_name} est inscrit` });
      setPrenom('');
      setNom('');
      setPassword('');
      setConclave(false);
      setRank(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel panel--accent">
      <h2 className="panel__title">Inscrire un shinobi</h2>
      <p className="muted small">Le joueur se connectera avec ce prénom + nom RP et le mot de passe que tu lui transmettras.</p>
      <form className="form" onSubmit={submit}>
        <div className="field-row">
          <label className="field">
            <span>Prénom RP</span>
            <input value={prenom} onChange={(e) => setPrenom(e.target.value)} required maxLength={60} autoComplete="off" />
          </label>
          <label className="field">
            <span>Nom RP</span>
            <input value={nom} onChange={(e) => setNom(e.target.value)} maxLength={60} autoComplete="off" placeholder="(facultatif si nom unique)" />
          </label>
        </div>
        <div className="field">
          <span>Cercle de maîtrise</span>
          <RankPicker value={rank} onChange={setRank} name="new-rank" />
        </div>
        <div className="field-row field-row--end">
          <label className="field">
            <span>Mot de passe</span>
            <div className="field__pw">
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Vide = généré automatiquement"
                autoComplete="new-password"
                minLength={8}
              />
              <button type="button" className="field__eye field__eye--text" onClick={() => setPassword(generatePassword())}>
                Générer
              </button>
            </div>
          </label>
          <Toggle checked={conclave} onChange={setConclave} label="Membre du Conclave" hint="Accès total + console" />
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="form-actions">
          <button type="submit" className="btn btn--red" disabled={busy}>
            {busy ? 'Inscription…' : 'Inscrire et générer l’accès'}
          </button>
        </div>
      </form>
    </section>
  );
}

function EditModal({ member, onClose, onSaved }: { member: AdminMember | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [prenom, setPrenom] = useState('');
  const [nom, setNom] = useState('');
  const [rank, setRank] = useState(1);
  const [conclave, setConclave] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (member) {
      setPrenom(member.prenom);
      setNom(member.nom);
      setRank(member.rank);
      setConclave(member.is_conclave);
      setError(null);
    }
  }, [member]);

  if (!member) return <Modal open={false} onClose={onClose} title="" />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.memberUpdate(member.id, prenom, nom, rank, conclave);
      toast('Fiche du shinobi mise à jour');
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={member.display_name} kicker="Modifier le shinobi">
      <form className="form" onSubmit={submit}>
        <div className="field-row">
          <label className="field">
            <span>Prénom RP</span>
            <input value={prenom} onChange={(e) => setPrenom(e.target.value)} required maxLength={60} />
          </label>
          <label className="field">
            <span>Nom RP</span>
            <input value={nom} onChange={(e) => setNom(e.target.value)} maxLength={60} />
          </label>
        </div>
        <div className="field">
          <span>Cercle</span>
          <RankPicker value={rank} onChange={setRank} name="edit-rank" />
        </div>
        <Toggle
          checked={conclave}
          onChange={setConclave}
          label="Membre du Conclave"
          hint={member.is_me ? 'Tu ne peux pas te retirer toi-même' : 'Accès total + console'}
        />
        {error && <p className="form-error">{error}</p>}
        <div className="form-actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className="btn btn--red" disabled={busy}>
            Enregistrer
          </button>
        </div>
      </form>
    </Modal>
  );
}

type Filter = 'all' | 'conclave' | 'inactive' | `r${number}`;

export default function Members() {
  const toast = useToast();
  const confirm = useConfirm();
  const { refresh, member: me } = useSession();
  const [list, setList] = useState<AdminMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [creds, setCreds] = useState<Credentials | null>(null);
  const [editing, setEditing] = useState<AdminMember | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setList(await api.members());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const shown = useMemo(() => {
    if (!list) return [];
    const nq = normalize(q.trim());
    return list.filter((m) => {
      if (nq && !normalize(m.display_name).includes(nq)) return false;
      if (filter === 'conclave') return m.is_conclave;
      if (filter === 'inactive') return !m.active;
      if (filter.startsWith('r')) return !m.is_conclave && m.rank === Number(filter.slice(1));
      return true;
    });
  }, [list, q, filter]);

  if (error) return <ErrorState text={error} onRetry={load} />;
  if (!list) return <Loader label="Lecture du registre…" />;

  // Compte supprimé entre-temps (autre onglet, SQL…) : on le dit et on rafraîchit la liste
  const onActionError = async (e: unknown) => {
    if (e instanceof ApiError && e.code === 'FU404') {
      toast('Ce compte n’existe plus (déjà supprimé). Liste actualisée.', 'info');
      await load();
      return;
    }
    toast(e instanceof Error ? e.message : String(e), 'error');
  };

  const quickRank = async (m: AdminMember, rank: number) => {
    try {
      await api.memberUpdate(m.id, m.prenom, m.nom, rank, m.is_conclave);
      toast(`${m.display_name} → ${circleLabel(rank)}`);
      await load();
      if (m.is_me) await refresh();
    } catch (e) {
      await onActionError(e);
    }
  };

  const resetPassword = async (m: AdminMember) => {
    const ok = await confirm({
      title: m.active ? `Nouveau mot de passe pour ${m.display_name} ?` : `Activer le compte de ${m.display_name} ?`,
      text: m.active
        ? 'L’ancien mot de passe ne fonctionnera plus et le joueur sera déconnecté de tous ses appareils.'
        : 'Un mot de passe sera généré : transmets-le au joueur pour qu’il puisse se connecter.',
      confirm: m.active ? 'Régénérer' : 'Activer',
    });
    if (!ok) return;
    try {
      const r = await api.memberPassword(m.id, null);
      setCreds({ prenom: m.prenom, nom: m.nom, password: r.password, title: m.active ? 'Nouveau mot de passe' : 'Compte activé' });
      await load();
    } catch (e) {
      await onActionError(e);
    }
  };

  const remove = async (m: AdminMember) => {
    const ok = await confirm({
      title: `Supprimer ${m.display_name} ?`,
      text: `Son compte et ses ${m.slots} place(s) de slot seront effacés. Cette action est définitive.`,
      confirm: 'Supprimer',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.memberDelete(m.id);
      toast(`${m.display_name} a été retiré du registre`);
      await load();
    } catch (e) {
      await onActionError(e);
    }
  };

  const counts = {
    all: list.length,
    conclave: list.filter((m) => m.is_conclave).length,
    inactive: list.filter((m) => !m.active).length,
  };

  return (
    <div className="console">
      <header className="page-head">
        <p className="kicker">Console du Conclave</p>
        <h1>Membres</h1>
        <p className="muted">Inscris les shinobi, fixe leur cercle et remets-leur leurs accès.</p>
      </header>

      <CreateMember
        onCreated={(c) => {
          setCreds(c);
          void load();
        }}
      />

      <section className="panel">
        <div className="panel__row">
          <h2 className="panel__title">Registre · {list.length}</h2>
          <input className="input-search" type="search" placeholder="Rechercher un nom RP…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="chips" role="tablist">
          {(
            [
              ['all', `Tous · ${counts.all}`],
              ['conclave', `Conclave · ${counts.conclave}`],
              ...RANKS.map((r) => [`r${r}`, `Cercle ${r}`] as const),
              ['inactive', `À activer · ${counts.inactive}`],
            ] as [Filter, string][]
          ).map(([k, label]) => (
            <button key={k} type="button" className={`chip${filter === k ? ' is-on' : ''}`} onClick={() => setFilter(k)}>
              {label}
            </button>
          ))}
        </div>

        {shown.length === 0 ? (
          <Empty glyph="人">Aucun shinobi ne correspond.</Empty>
        ) : (
          <ul className="member-list">
            {shown.map((m) => (
              <li key={m.id} className={`member${m.active ? '' : ' is-inactive'}`}>
                <span className={`avatar${m.is_conclave ? ' avatar--conclave' : ''}`}>{initials(m.display_name)}</span>
                <div className="member__id">
                  <b>
                    {m.display_name}
                    {m.is_me && <span className="tag tag--ghost">toi</span>}
                  </b>
                  <small>
                    {m.is_conclave && <span className="tag tag--red">Conclave</span>}
                    {!m.active ? (
                      <span className="tag tag--warn">Non activé</span>
                    ) : m.locked ? (
                      <span className="tag tag--warn">Verrouillé (trop d’essais)</span>
                    ) : (
                      <span>Connexion : {timeAgo(m.last_login_at)}</span>
                    )}
                    {m.slots > 0 && <span>· {m.slots} slot(s)</span>}
                  </small>
                </div>
                <div className="member__rank">
                  <select
                    value={m.rank}
                    aria-label={`Cercle de ${m.display_name}`}
                    onChange={(e) => quickRank(m, Number(e.target.value))}
                  >
                    {RANKS.map((r) => (
                      <option key={r} value={r}>
                        Cercle {r}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="member__actions">
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing(m)}>
                    Modifier
                  </button>
                  <button type="button" className={`btn btn--sm ${m.active ? 'btn--ghost' : 'btn--red'}`} onClick={() => resetPassword(m)}>
                    {m.active ? 'Nouveau mdp' : 'Activer'}
                  </button>
                  {!m.is_me && (
                    <button type="button" className="btn btn--ghost btn--sm btn--danger-text" onClick={() => remove(m)} aria-label={`Supprimer ${m.display_name}`}>
                      Supprimer
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <CredentialsModal creds={creds} onClose={() => setCreds(null)} />
      <EditModal
        member={editing}
        onClose={() => setEditing(null)}
        onSaved={async () => {
          await load();
          if (editing?.id === me?.id) await refresh();
        }}
      />
    </div>
  );
}
