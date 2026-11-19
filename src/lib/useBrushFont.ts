import { useEffect, useState } from 'react';
import { loadBrushFont } from './sealDesign';

/**
 * Attend que la police pinceau soit chargée pour ces caractères (ou 1,2 s au plus),
 * pour que les kanjis soient mesurés et centrés avec la bonne police.
 * Renvoie un numéro qui change quand la police est prête.
 */
export function useBrushFont(text: string): { ready: boolean; version: number } {
  const [state, setState] = useState({ ready: !text.trim(), version: 0 });
  useEffect(() => {
    if (!text.trim()) {
      setState((s) => ({ ready: true, version: s.version }));
      return;
    }
    let alive = true;
    const done = () => alive && setState((s) => ({ ready: true, version: s.version + 1 }));
    const timer = window.setTimeout(done, 1200);
    void loadBrushFont(text).then(() => {
      window.clearTimeout(timer);
      done();
    });
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [text]);
  return state;
}
