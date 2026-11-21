import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError, type TramePlayerStep, type TrameView, type UnsealResult } from '../lib/api';
import { useSession } from '../lib/session';
import { circleLabel } from '../lib/format';
import Markdown from '../components/Markdown';
import TrameSeal from '../components/TrameSeal';
import { ChoiceStep, MatchStep, MissingStep, OrderStep, ReviewStep, SituationStep, SolvedChallenge } from '../components/TrameChallenges';
import { ErrorState, Loader, useToast } from '../components/ui';

const KIND_LABEL: Record<TramePlayerStep['kind'], string> = {
  cipher: 'Inscription à déchiffrer',
  riddle: 'Énigme',
  unseal: 'Désenclavement',
  missing: 'Kanjis manquants',
  situation: 'Mise en situation',
  choice: 'Question',
  order: 'Ordre des kanjis',
  match: 'Associations',
  review: 'Épreuve du Conclave',
  text: 'Récit',
};

const KIND_MARK: Record<TramePlayerStep['kind'], string> = {
  cipher: '謎',
  riddle: '問',
  unseal: '封',
  missing: '欠',
  situation: '境',
  choice: '択',
  order: '順',
  match: '合',
  review: '議',
  text: '巻',
};

function CipherStep({ step, trameId, shared, onDone }: { step: TramePlayerStep; trameId: number; shared: boolean; onDone: () => void }) {
  const toast = useToast();
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [wrong, setWrong] = useState(0);
  const used = step.attempts_used ?? 0;
  const max = step.max_attempts ?? 2;
  const left = Math.max(0, max - used);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!answer.trim() || busy) return;
    setBusy(true);
    try {
      const r = await api.trameAnswer(trameId, step.index, answer);
      const what = step.kind === 'riddle' ? 'la bonne réponse' : 'la bonne traduction';
      if (r.correct) {
        toast(step.kind === 'riddle' ? 'Bonne réponse : l’étape suivante s’ouvre' : 'Traduction juste : l’étape suivante s’ouvre');
        setAnswer('');
      } else {
        setWrong((w) => w + 1);
        toast(r.attempts_left > 0 ? `Ce n’est pas ${what}. ${r.attempts_left} essai${r.attempts_left > 1 ? 's' : ''} restant${r.attempts_left > 1 ? 's' : ''}.` : `Ce n’est pas ${what}. Plus aucun essai.`, 'error');
      }
      onDone();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {step.cipher_text && (
        <p className="cipher-text" lang="ja">
          {step.cipher_text}
        </p>
      )}
      {left > 0 ? (
        <form key={wrong} className={`cipher-form${wrong ? ' is-shaking' : ''}`} onSubmit={submit}>
          <input
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder={step.kind === 'riddle' ? 'Ta réponse…' : 'Ta traduction…'}
            maxLength={500}
            aria-label={step.kind === 'riddle' ? 'Ta réponse' : 'Ta traduction'}
            autoComplete="off"
          />
          <button type="submit" className="btn btn--red" disabled={busy || !answer.trim()}>
            {busy ? 'Vérification…' : 'Proposer'}
          </button>
        </form>
      ) : (
        <p className="step-blocked">
          Tu as utilisé tous tes essais pour cette étape.{shared ? ' Un autre shinobi peut encore trouver : la suite s’ouvrira alors pour tous.' : ''}
        </p>
      )}
      <div className="attempt-dots" aria-label={`${left} essai(s) restant(s) sur ${max}`}>
        {Array.from({ length: max }, (_, i) => (
          <i key={i} className={i < used ? 'is-used' : ''} />
        ))}
        <span>
          {left} essai{left > 1 ? 's' : ''} restant{left > 1 ? 's' : ''} pour cette étape
        </span>
      </div>
    </>
  );
}

function UnsealStep({ step, trameId, shared, onDone }: { step: TramePlayerStep; trameId: number; shared: boolean; onDone: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<UnsealResult | null>(null);
  const [display, setDisplay] = useState<number | null>(null);
  const [flash, setFlash] = useState<{ type: 'fail' | 'hit' | null; key: number }>({ type: null, key: 0 });
  const timer = useRef<number | null>(null);
  const needed = step.locks ?? step.seal_circle ?? 3;
  const allowed = step.allowed ?? 0;
  const used = step.attempts_used ?? 0;
  const successes = step.successes ?? 0;
  const exhausted = used >= allowed;
  // en progression commune, le sceau réagit aux échecs de tous les shinobi
  const fails = shared ? step.fails_total ?? 0 : used - successes;
  const seal = <TrameSeal svg={step.seal_svg} fails={fails} successes={successes} needed={needed} broken={false} flash={flash} />;

  useEffect(() => () => {
    if (timer.current) window.clearInterval(timer.current);
  }, []);

  if (!step.eligible) {
    return (
      <>
      {seal}
      <p className="step-blocked">
        Seuls les shinobi du {circleLabel(step.required_rank ?? 3)} et plus peuvent tenter ce désenclavement.
        {shared ? ' Quand l’un d’eux brisera le sceau, la suite s’ouvrira pour tous.' : ''}
      </p>
      </>
    );
  }

  const attempt = async () => {
    setBusy(true);
    setLast(null);
    // petit roulement du dé pendant que la base tire le résultat
    timer.current = window.setInterval(() => setDisplay(Math.floor(Math.random() * 100) + 1), 60);
    try {
      const r = await api.trameUnseal(trameId, step.index);
      await new Promise((res) => setTimeout(res, 700));
      if (timer.current) window.clearInterval(timer.current);
      setDisplay(r.roll);
      setLast(r);
      setFlash((f) => ({ type: r.tone === 'success' || r.tone === 'crit-success' ? 'hit' : 'fail', key: f.key + 1 }));
      if (r.broken) toast('Le sceau est brisé');
      onDone();
    } catch (err) {
      if (timer.current) window.clearInterval(timer.current);
      setDisplay(null);
      toast(err instanceof Error ? err.message : String(err), 'error');
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {seal}
      <div className="unseal-progress unseal-progress--compact">
        <div>
          <p className="kicker">Verrous brisés</p>
          <b>
            {successes}
            <small>/{needed}</small>
          </b>
          <span className="gauge gauge--lg">
            <i style={{ width: `${(Math.min(successes, needed) / needed) * 100}%` }} />
          </span>
        </div>
        <div>
          <p className="kicker">Tes essais</p>
          <b>
            {used}
            <small>/{allowed}</small>
          </b>
          <span className="gauge gauge--lg gauge--muted">
            <i style={{ width: `${allowed ? (used / allowed) * 100 : 0}%` }} />
          </span>
        </div>
      </div>
      <p className="muted small">
        Il faut briser {needed} verrou{needed > 1 ? 's' : ''}.{' '}
        {step.attempts_mode === 'fixed'
          ? `Tu as ${allowed} essai${allowed > 1 ? 's' : ''} pour ce sceau.`
          : 'Tu as autant d’essais que ton cercle.'}{' '}
        Une réussite critique brise deux verrous d’un coup.
      </p>

      {(display !== null || busy) && (
        <div className={`dice${busy ? ' is-rolling' : ''}${last ? ` roll--${last.tone}` : ''}`}>
          <span className="dice__value">{display ?? '…'}</span>
          {last && (
            <div>
              <span className={`tone tone--${last.tone}`}>{last.label}</span>
              {(last.gained ?? 0) > 1 && <span className="tone tone--crit-success tone--double">+{last.gained} verrous</span>}
              {last.effect && <p>{last.effect}</p>}
            </div>
          )}
        </div>
      )}

      {exhausted ? (
        <p className="step-blocked">
          Le sceau a résisté à tes essais.{shared ? ' Un autre shinobi qualifié peut encore tenter sa chance.' : ''}
        </p>
      ) : (
        <button type="button" className="btn btn--red btn--lg" onClick={attempt} disabled={busy}>
          {busy ? 'Le chakra se concentre…' : 'Tenter le désenclavement'}
        </button>
      )}

      {(step.rolls?.length ?? 0) > 0 && (
        <ul className="roll-list">
          {step.rolls!.map((r, i) => (
            <li key={i} className={`roll roll--${r.tone}`}>
              <span className="roll__index">Essai {i + 1}</span>
              <span className="roll__value">{r.roll}</span>
              <span className={`tone tone--${r.tone}`}>
                {r.label}
                {r.tone === 'crit-success' ? ' · ×2' : ''}
              </span>
              <span className="roll__text">{r.effect}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function Trame() {
  const { id } = useParams();
  const trameId = Number(id);
  const { member, refresh } = useSession();
  const [view, setView] = useState<TrameView | null>(null);
  const [gone, setGone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setView(await api.trameView(trameId));
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'FU404') {
        setGone(true);
        void refresh();
      } else setError(e instanceof Error ? e.message : String(e));
    }
  }, [trameId, refresh]);

  useEffect(() => {
    void load();
    // la progression commune et la fermeture de la trame sont suivies en direct
    const t = window.setInterval(() => void load(), 15000);
    return () => window.clearInterval(t);
  }, [load]);

  if (gone) {
    return (
      <div className="locked">
        <div className="locked__seal locked__seal--void" aria-hidden="true">
          <span>終</span>
        </div>
        <p className="kicker">Trame</p>
        {view ? (
          <>
            <h1>Cette trame est terminée.</h1>
            <p className="muted">Le Conclave a refermé ce chapitre. La page n’est plus accessible.</p>
          </>
        ) : (
          <>
            <h1>Cette trame n’est pas accessible.</h1>
            <p className="muted">Elle est terminée, ou réservée à d’autres shinobi.</p>
          </>
        )}
        <Link to="/" className="btn btn--ghost">
          ← Retour au Conclave
        </Link>
      </div>
    );
  }
  if (error) return <ErrorState text={error} onRetry={load} />;
  if (!view) return <Loader label="Ouverture de la trame…" />;

  const { trame, steps } = view;
  const current = steps.find((s) => s.state === 'current' && s.kind !== 'text');
  const solvedCount = steps.filter((s) => s.state === 'solved' && s.kind !== 'text').length;

  return (
    <div className="trame">
      <header className="trame__head">
        <p className="trame__live">
          <i />
          {trame.test_only && trame.status === 'active'
            ? 'Trame de test · visible du Conclave seulement'
            : trame.status === 'active'
              ? 'Trame en cours'
              : trame.status === 'draft'
                ? 'Aperçu du Conclave · brouillon'
                : 'Aperçu du Conclave · terminée'}
        </p>
        <h1>{trame.title}</h1>
        {trame.intro_md && <Markdown source={trame.intro_md} className="trame__intro" />}
        <p className="trame__meta">
          {view.complete
            ? 'Toutes les étapes sont franchies'
            : `${solvedCount} étape${solvedCount > 1 ? 's' : ''} franchie${solvedCount > 1 ? 's' : ''} · ${view.remaining + 1} encore à découvrir`}
          {' · '}
          {trame.shared ? 'progression commune à tous les shinobi' : 'progression personnelle'}
        </p>
        {(trame.restricted_names?.length ?? 0) > 0 && (
          <p className="trame__private">
            <i aria-hidden="true">密</i>
            Trame réservée à {trame.restricted_names!.join(', ')}
          </p>
        )}
      </header>

      <ol className="trame__steps">
        {steps.map((s) => (
          <li key={s.index} className={`tstep tstep--${s.kind} tstep--${s.kind === 'text' ? 'text' : s.state}`}>
            <span className="tstep__mark" aria-hidden="true">
              {s.kind !== 'text' && s.state === 'solved' ? '解' : KIND_MARK[s.kind]}
            </span>
            <div className="tstep__body">
              <p className="kicker">
                {KIND_LABEL[s.kind]}
                {s.state === 'solved' && s.kind !== 'text' && ' · résolu'}
              </p>
              {s.title && <h2>{s.title}</h2>}
              {s.prompt_md && <Markdown source={s.prompt_md} />}
              {s.state === 'current' && (s.kind === 'cipher' || s.kind === 'riddle') && <CipherStep step={s} trameId={trame.id} shared={trame.shared} onDone={load} />}
              {s.state === 'current' && s.kind === 'unseal' && <UnsealStep step={s} trameId={trame.id} shared={trame.shared} onDone={load} />}
              {s.state === 'current' && s.kind === 'missing' && <MissingStep key={s.attempts_used} step={s} trameId={trame.id} shared={trame.shared} onDone={load} />}
              {s.state === 'current' && s.kind === 'order' && <OrderStep step={s} trameId={trame.id} shared={trame.shared} onDone={load} />}
              {s.state === 'current' && s.kind === 'match' && <MatchStep key={s.attempts_used} step={s} trameId={trame.id} shared={trame.shared} onDone={load} />}
              {s.state === 'current' && s.kind === 'choice' && <ChoiceStep step={s} trameId={trame.id} shared={trame.shared} onDone={load} />}
              {s.state === 'current' && s.kind === 'situation' && <SituationStep key={s.attempts_used} step={s} trameId={trame.id} shared={trame.shared} onDone={load} />}
              {s.state === 'current' && s.kind === 'review' && <ReviewStep step={s} trameId={trame.id} shared={trame.shared} onDone={load} />}
              {s.state === 'solved' && s.kind !== 'text' && (
                <>
                  {s.kind === 'unseal' && (
                    <TrameSeal svg={s.seal_svg} fails={s.fails_total ?? 0} successes={s.locks ?? s.seal_circle ?? 3} needed={s.locks ?? s.seal_circle ?? 3} broken compact />
                  )}
                  <SolvedChallenge step={s} />
                  {s.kind === 'cipher' && s.cipher_text && (
                    <p className="cipher-text cipher-text--done" lang="ja">
                      {s.cipher_text}
                    </p>
                  )}
                  {s.success_md && (
                    <div className="tstep__reveal">
                      <Markdown source={s.success_md} />
                    </div>
                  )}
                  {s.solved_by && <p className="muted small">Résolu par {s.solved_by}</p>}
                </>
              )}
            </div>
          </li>
        ))}
        {view.remaining > 0 && (
          <li className="tstep tstep--sealed">
            <span className="tstep__mark" aria-hidden="true">
              封
            </span>
            <div className="tstep__body">
              <p className="kicker">Encore scellé</p>
              <p className="muted">
                {view.remaining} étape{view.remaining > 1 ? 's' : ''} attend{view.remaining > 1 ? 'ent' : ''} d’être révélée{view.remaining > 1 ? 's' : ''}.
              </p>
            </div>
          </li>
        )}
      </ol>

      {view.complete && (
        <div className="trame__done">
          <span aria-hidden="true">解</span>
          <div>
            <b>Trame accomplie.</b>
            <p>Toutes les énigmes de « {trame.title} » sont résolues.</p>
          </div>
        </div>
      )}
      {!current && !view.complete && member?.is_conclave && <p className="muted small">Aucune étape jouable.</p>}
    </div>
  );
}
