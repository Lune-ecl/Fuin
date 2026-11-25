import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { api, type Suggestion, type SuggestionKind, type SuggestionStatus } from '../lib/api';
import { useSession } from '../lib/session';
import { readDraft, useDraft } from '../lib/draft';
import { formatDate, timeAgo } from '../lib/format';
import { Empty, ErrorState, Loader, useConfirm, useToast } from '../components/ui';

export const SUGGESTION_KINDS: Record<SuggestionKind, { label: string; glyph: string; hint: string }> = {
  feature: { label: 'Fonctionnalité', glyph: '新', hint: 'Un nouvel outil, une nouvelle page, une option qui manque' },
  content: { label: 'Fiches et contenu', glyph: '巻', hint: 'Un sceau, une règle ou une fiche à ajouter ou corriger' },
  trame: { label: 'Trames et épreuves', glyph: '謎', hint: 'Une idée d’énigme, de mini-jeu ou de trame' },
  bug: { label: 'Problème', glyph: '障', hint: 'Quelque chose qui ne marche pas comme prévu' },
  other: { label: 'Autre', glyph: '他', hint: 'Tout le reste' },
};

export const SUGGESTION_STATUS: Record<SuggestionStatus, string> = {
  new: 'Nouvelle',
  planned: 'Prévue',
  done: 'Faite',
  refused: 'Refusée',
};

type Filter = 'all' | SuggestionStatus;
type Sort = 'votes' | 'recent';

interface FormValue {
  id?: number;
  kind: SuggestionKind;
  title: string;
  body: string;
}

const DRAFT = 'suggestion';
const EMPTY: FormValue = { kind: 'feature', title: '', body: '' };

function SuggestionForm({ editing, onSaved, onCancel }: { editing: FormValue | null; onSaved: (s: Suggestion) => void; onCancel: () => void }) {
  const toast = useToast();
  const [value, setValue] = useState<FormValue>(() => editing ?? readDraft<FormValue>(DRAFT)?.value ?? EMPTY);
  const [busy, setBusy] = useState(false);
  // brouillon gardé si on change de page avant d'envoyer (pas pour une modification)
  const blank = !value.title.trim() && !value.body.trim();
  const discard = useDraft<FormValue>(editing ? null : DRAFT, editing || blank ? null : value);

  useEffect(() => {
    if (editing) setValue(editing);
  }, [editing]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (value.title.trim().length < 3) {
      toast('Donne un titre à ta suggestion (3 caractères au moins).', 'error');
      return;
    }
    setBusy(true);
    try {
      const s = await api.suggestionSave({ ...value, title: value.title.trim(), body: value.body.trim() });
      toast(editing ? 'Suggestion modifiée' : 'Suggestion envoyée : merci !');
      if (!editing) {
        discard();
        setValue(EMPTY);
      }
      onSaved(s);
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="panel form sugg-form" onSubmit={submit}>
      <h2 className="panel__title">{editing ? 'Modifier ma suggestion' : 'Proposer une suggestion'}</h2>
      <div className="field">
        <span>De quoi s’agit-il ?</span>
        <div className="sugg-kinds" role="radiogroup" aria-label="Type de suggestion">
          {(Object.keys(SUGGESTION_KINDS) as SuggestionKind[]).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={value.kind === k}
              className={`sugg-kind${value.kind === k ? ' is-on' : ''}`}
              onClick={() => setValue({ ...value, kind: k })}
            >
              <span aria-hidden="true">{SUGGESTION_KINDS[k].glyph}</span>
              <b>{SUGGESTION_KINDS[k].label}</b>
              <small>{SUGGESTION_KINDS[k].hint}</small>
            </button>
          ))}
        </div>
      </div>
      <label className="field">
        <span>Titre</span>
        <input value={value.title} onChange={(e) => setValue({ ...value, title: e.target.value })} maxLength={120} placeholder="Un calendrier des trames à venir" />
      </label>
      <label className="field">
        <span>Description</span>
        <textarea
          rows={4}
          value={value.body}
          onChange={(e) => setValue({ ...value, body: e.target.value })}
          maxLength={4000}
          placeholder="Explique ton idée : à quoi elle servirait, où tu la verrais sur le site…"
        />
        <small className="muted">{value.body.length} / 4 000</small>
      </label>
      <div className="form-actions">
        {editing && (
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Annuler
          </button>
        )}
        <button type="submit" className="btn btn--red" disabled={busy}>
          {busy ? 'Envoi…' : editing ? 'Enregistrer' : 'Envoyer la suggestion'}
        </button>
      </div>
    </form>
  );
}

/** Réponse du Conclave : statut et mot d'explication. */
function AnswerBox({ s, onSaved }: { s: Suggestion; onSaved: (s: Suggestion) => void }) {
  const toast = useToast();
  const [status, setStatus] = useState<SuggestionStatus>(s.status === 'new' ? 'planned' : s.status);
  const [reply, setReply] = useState(s.reply);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      onSaved(await api.suggestionAnswer(s.id, status, reply));
      toast('Réponse enregistrée');
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="sugg-answer">
      <p className="kicker">Réponse du Conclave</p>
      <div className="segmented segmented--small" role="radiogroup" aria-label="Statut">
        {(Object.keys(SUGGESTION_STATUS) as SuggestionStatus[]).map((k) => (
          <button key={k} type="button" role="radio" aria-checked={status === k} className={status === k ? 'is-on' : ''} onClick={() => setStatus(k)}>
            {SUGGESTION_STATUS[k]}
          </button>
        ))}
      </div>
      <textarea
        rows={2}
        value={reply}
        onChange={(e) => setReply(e.target.value)}
        maxLength={2000}
        placeholder={status === 'refused' ? 'Pourquoi cette suggestion est refusée (obligatoire)' : 'Un mot pour le membre (facultatif)'}
      />
      <div className="request__actions">
        <button type="button" className="btn btn--red btn--sm" disabled={busy} onClick={() => void save()}>
          {busy ? 'Enregistrement…' : 'Enregistrer la réponse'}
        </button>
      </div>
    </div>
  );
}

function SuggestionCard({
  s,
  conclave,
  onChange,
  onEdit,
  onRemove,
}: {
  s: Suggestion;
  conclave: boolean;
  onChange: (s: Suggestion) => void;
  onEdit: (s: Suggestion) => void;
  onRemove: (s: Suggestion) => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [answering, setAnswering] = useState(false);
  const kind = SUGGESTION_KINDS[s.kind];
  const vote = async () => {
    setBusy(true);
    try {
      const r = await api.suggestionVote(s.id, !s.voted);
      onChange({ ...s, votes: r.votes, voted: r.voted });
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <article className={`sugg sugg--${s.status}`}>
      <button
        type="button"
        className={`sugg__vote${s.voted ? ' is-on' : ''}`}
        onClick={() => void vote()}
        disabled={busy || s.mine}
        aria-pressed={s.voted}
        title={s.mine ? 'Ta suggestion' : s.voted ? 'Ne plus soutenir' : 'Soutenir cette suggestion'}
      >
        <span aria-hidden="true">▲</span>
        <b>{s.votes}</b>
        <small>{s.votes > 1 ? 'soutiens' : 'soutien'}</small>
      </button>
      <div className="sugg__body">
        <p className="sugg__meta">
          <span className={`status status--sugg-${s.status}`}>{SUGGESTION_STATUS[s.status]}</span>
          <span className="sugg__kind">
            <i aria-hidden="true">{kind.glyph}</i> {kind.label}
          </span>
        </p>
        <h3>{s.title}</h3>
        {s.body && <p className="sugg__text">{s.body}</p>}
        <p className="muted small">
          {s.mine ? 'Toi' : s.author} · {timeAgo(s.created_at)}
          {s.updated_at !== s.created_at && s.status === 'new' ? ' · modifiée' : ''}
        </p>
        {s.reply && (
          <div className="sugg__reply">
            <b>Le Conclave{s.replied_by ? ` (${s.replied_by})` : ''} :</b> {s.reply}
            {s.replied_at && <small className="muted"> · {formatDate(s.replied_at)}</small>}
          </div>
        )}
        <div className="request__actions">
          {s.mine && s.status === 'new' && (
            <>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => onEdit(s)}>
                Modifier
              </button>
              <button type="button" className="btn btn--ghost btn--sm btn--danger-text" onClick={() => onRemove(s)}>
                Retirer
              </button>
            </>
          )}
          {conclave && (
            <>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setAnswering((a) => !a)}>
                {answering ? 'Fermer' : s.status === 'new' ? 'Répondre' : 'Changer la réponse'}
              </button>
              {!s.mine && (
                <button type="button" className="btn btn--ghost btn--sm btn--danger-text" onClick={() => onRemove(s)}>
                  Supprimer
                </button>
              )}
            </>
          )}
        </div>
        {conclave && answering && (
          <AnswerBox
            s={s}
            onSaved={(n) => {
              onChange(n);
              setAnswering(false);
            }}
          />
        )}
      </div>
    </article>
  );
}

/** Suggestions des membres pour améliorer le site. */
export default function Suggestions() {
  const { member, refresh } = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const [list, setList] = useState<Suggestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [kind, setKind] = useState<'all' | SuggestionKind>('all');
  const [sort, setSort] = useState<Sort>('votes');
  const [editing, setEditing] = useState<FormValue | null>(null);
  const conclave = !!member?.is_conclave;

  const load = useCallback(async () => {
    try {
      setList(await api.suggestions());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const shown = useMemo(() => {
    if (!list) return [];
    return list
      .filter((s) => (filter === 'all' || s.status === filter) && (kind === 'all' || s.kind === kind))
      .sort((a, b) => (sort === 'votes' ? b.votes - a.votes : 0) || b.created_at.localeCompare(a.created_at));
  }, [list, filter, kind, sort]);

  if (error) return <ErrorState text={error} onRetry={load} />;
  if (!list) return <Loader label="Ouverture des suggestions…" />;

  const count = (f: Filter) => (f === 'all' ? list.length : list.filter((s) => s.status === f).length);
  const replace = (s: Suggestion) => setList((l) => (l ? l.map((x) => (x.id === s.id ? s : x)) : l));
  const remove = async (s: Suggestion) => {
    if (!(await confirm({ title: `Retirer « ${s.title} » ?`, text: 'La suggestion et ses soutiens seront effacés.', confirm: 'Retirer', danger: true }))) return;
    try {
      await api.suggestionDelete(s.id);
      setList((l) => (l ? l.filter((x) => x.id !== s.id) : l));
      toast('Suggestion retirée');
      if (conclave) void refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  return (
    <div className="console suggestions">
      <header className="page-head">
        <p className="kicker">Autre</p>
        <h1>Suggestions pour le site</h1>
        <p className="muted">
          Une idée de fonctionnalité, une fiche à ajouter, une trame, un problème ? Propose-la ici. Les autres membres peuvent la soutenir, et le Conclave répond à
          chacune.
        </p>
      </header>

      <SuggestionForm
        key={editing?.id ?? 'nouvelle'}
        editing={editing}
        onCancel={() => setEditing(null)}
        onSaved={(s) => {
          if (editing) {
            replace(s);
            setEditing(null);
          } else setList((l) => (l ? [s, ...l] : [s]));
          if (conclave) void refresh();
        }}
      />

      <section className="panel">
        <div className="sugg-tools">
          <div className="sugg-filters" role="tablist" aria-label="Statut">
            {(['all', 'new', 'planned', 'done', 'refused'] as Filter[]).map((f) => (
              <button key={f} type="button" role="tab" aria-selected={filter === f} className={`chip${filter === f ? ' is-on' : ''}`} onClick={() => setFilter(f)}>
                {f === 'all' ? 'Toutes' : SUGGESTION_STATUS[f]} <small>{count(f)}</small>
              </button>
            ))}
          </div>
          <div className="sugg-selects">
            <select value={kind} onChange={(e) => setKind(e.target.value as 'all' | SuggestionKind)} aria-label="Type">
              <option value="all">Tous les types</option>
              {(Object.keys(SUGGESTION_KINDS) as SuggestionKind[]).map((k) => (
                <option key={k} value={k}>
                  {SUGGESTION_KINDS[k].label}
                </option>
              ))}
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Tri">
              <option value="votes">Les plus soutenues</option>
              <option value="recent">Les plus récentes</option>
            </select>
          </div>
        </div>
        {shown.length === 0 ? (
          <Empty glyph="案">{list.length ? 'Aucune suggestion ne correspond à ces filtres.' : 'Aucune suggestion pour l’instant. La tienne sera la première !'}</Empty>
        ) : (
          <div className="sugg-list">
            {shown.map((s) => (
              <SuggestionCard
                key={s.id}
                s={s}
                conclave={conclave}
                onChange={(n) => {
                  replace(n);
                  if (conclave) void refresh();
                }}
                onEdit={(x) => {
                  setEditing({ id: x.id, kind: x.kind, title: x.title, body: x.body });
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                onRemove={(x) => void remove(x)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
