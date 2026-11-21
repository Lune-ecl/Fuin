import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { RANKS, RANK_KANJI } from '../lib/format';

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------
type ToastKind = 'ok' | 'error' | 'info';
interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
}

const ToastContext = createContext<(text: string, kind?: ToastKind) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: ToastKind = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 6000 : 3200);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.kind}`}>
            <span className="toast__mark">{t.kind === 'error' ? '✕' : t.kind === 'info' ? '·' : '封'}</span>
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

// ---------------------------------------------------------------------------
// Modale + confirmation
// ---------------------------------------------------------------------------
export function Modal({
  open,
  onClose,
  title,
  kicker,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  kicker?: string;
  children?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={`modal${wide ? ' modal--wide' : ''}`}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open && (
        <div className="modal__sheet">
          <header className="modal__head">
            <div>
              {kicker && <p className="kicker">{kicker}</p>}
              <h2>{title}</h2>
            </div>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Fermer">
              ✕
            </button>
          </header>
          <div className="modal__body">{children}</div>
        </div>
      )}
    </dialog>
  );
}

interface ConfirmOptions {
  title: string;
  text?: string;
  confirm?: string;
  /** libellé du bouton qui renonce (« Annuler » par défaut) */
  cancel?: string;
  danger?: boolean;
}
const ConfirmContext = createContext<(o: ConfirmOptions) => Promise<boolean>>(async () => false);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const ask = useCallback(
    (o: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ ...o, resolve })),
    [],
  );
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      <Modal open={!!state} onClose={() => close(false)} title={state?.title ?? ''} kicker="Confirmation">
        {state?.text && <p className="muted">{state.text}</p>}
        <div className="form-actions">
          <button type="button" className="btn btn--ghost" onClick={() => close(false)}>
            {state?.cancel ?? 'Annuler'}
          </button>
          <button
            type="button"
            className={`btn ${state?.danger ? 'btn--danger' : 'btn--red'}`}
            onClick={() => close(true)}
            autoFocus
          >
            {state?.confirm ?? 'Confirmer'}
          </button>
        </div>
      </Modal>
    </ConfirmContext.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmContext);

// ---------------------------------------------------------------------------
// Petits éléments
// ---------------------------------------------------------------------------
export function Loader({ label = 'Ouverture des archives…' }: { label?: string }) {
  return (
    <div className="loader" role="status">
      <div className="loader__seal" aria-hidden="true">
        <span>封</span>
      </div>
      <p>{label}</p>
    </div>
  );
}

export function ErrorState({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <div className="empty empty--error">
      <span className="empty__glyph">呪</span>
      <p>{text}</p>
      {onRetry && (
        <button type="button" className="btn btn--ghost" onClick={onRetry}>
          Réessayer
        </button>
      )}
    </div>
  );
}

export function Empty({ glyph = '空', children }: { glyph?: string; children: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty__glyph">{glyph}</span>
      <div>{children}</div>
    </div>
  );
}

export function SealBadge({ badge, slotted }: { badge: 'mj' | null; slotted: boolean }) {
  if (badge === 'mj') return <span className="badge badge--mj">MJ</span>;
  if (slotted) return <span className="badge badge--slot">SLOT</span>;
  return null;
}

export function RankPicker({
  value,
  onChange,
  name = 'rank',
}: {
  value: number;
  onChange: (r: number) => void;
  name?: string;
}) {
  return (
    <div className="rank-picker" role="radiogroup" aria-label="Cercle">
      {RANKS.map((r) => (
        <label key={r} className={`rank-picker__opt${value === r ? ' is-on' : ''}`} title={`Cercle ${r}`}>
          <input type="radio" name={name} value={r} checked={value === r} onChange={() => onChange(r)} />
          <span className="rank-picker__kanji">{RANK_KANJI[r]}</span>
          <span className="rank-picker__num">{r}</span>
        </label>
      ))}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle__track" aria-hidden="true">
        <i />
      </span>
      <span className="toggle__text">
        <b>{label}</b>
        {hint && <small>{hint}</small>}
      </span>
    </label>
  );
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}
