import { useCallback, useEffect, useRef } from 'react';

/**
 * Brouillons gardés dans ce navigateur (localStorage).
 * Ils survivent à un changement de page, d'onglet, à un rechargement ou à une fermeture du site.
 * Le stockage peut être indisponible (navigation privée, données effacées) : tout est donc protégé
 * par try/catch, et un brouillon perdu ne casse jamais la page.
 */
const PREFIX = 'fuin.brouillon.';

export interface Draft<T> {
  value: T;
  /** date de la dernière écriture (ISO) */
  at: string;
}

export function readDraft<T>(key: string): Draft<T> | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<Draft<T>> | null;
    if (!d || typeof d !== 'object' || d.value === undefined || typeof d.at !== 'string') return null;
    return d as Draft<T>;
  } catch {
    return null;
  }
}

export function writeDraft<T>(key: string, value: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ value, at: new Date().toISOString() }));
  } catch {
    /* stockage plein ou bloqué : le brouillon est un confort, pas une obligation */
  }
}

export function clearDraft(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* rien à faire */
  }
}

/**
 * Garde `value` en brouillon sous `key` tant que `key` n'est pas nul.
 * L'écriture part 300 ms après la dernière modification, et tout de suite quand on change de page
 * dans le site, d'onglet du navigateur ou d'application sur mobile.
 * `value === null` efface le brouillon (formulaire revenu à vide).
 * Renvoie `discard()`, qui efface le brouillon et annule l'écriture en attente (après un envoi, par exemple).
 */
export function useDraft<T>(key: string | null, value: T | null, delay = 300): () => void {
  const pending = useRef<{ key: string; value: T | null } | null>(null);

  const flush = useCallback(() => {
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    if (p.value === null) clearDraft(p.key);
    else writeDraft(p.key, p.value);
  }, []);

  useEffect(() => {
    // brouillon mis en pause (fenêtre refermée…) : on écrit tout de suite la dernière version connue
    if (!key) return flush();
    pending.current = { key, value };
    const t = window.setTimeout(flush, delay);
    return () => window.clearTimeout(t);
  }, [key, value, delay, flush]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
      // la page est quittée (autre onglet du site) : rien ne doit se perdre
      flush();
    };
  }, [flush]);

  return useCallback(() => {
    const k = pending.current?.key ?? key;
    pending.current = null;
    if (k) clearDraft(k);
  }, [key]);
}
