import { useMemo, useState } from 'react';
import { SealWorkbench, startDesign } from '../../components/SealCreator';
import { parseDesign, reviveDesign, type SealDesign } from '../../lib/sealDesign';
import { readDraft, useDraft } from '../../lib/draft';

const KEY = 'atelier.visuel';
const LEGACY_KEY = 'fuin.atelier.visuel';

// le visuel en cours est gardé en brouillon dans ce navigateur pour ne pas perdre le travail
function loadSaved(): { design: SealDesign; name: string } {
  const draft = readDraft<{ design?: unknown; name?: unknown }>(KEY);
  const design = reviveDesign(draft?.value?.design);
  if (design) return { design, name: typeof draft?.value?.name === 'string' ? draft.value.name : 'sceau' };
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as { svg?: string; name?: string };
      const old = parseDesign(saved.svg);
      if (old) return { design: old, name: saved.name ?? 'sceau' };
    }
  } catch {
    /* stockage indisponible : on repart d'un visuel neuf */
  }
  return { design: startDesign('封 印'), name: 'sceau' };
}

/** Outils de trame · Création de visuel : le créateur de sceau en pleine page. */
export default function SealStudio() {
  const [initial] = useState(loadSaved);
  const [design, setDesign] = useState<SealDesign>(initial.design);
  const [name, setName] = useState(initial.name);

  // écrit au fil des modifications, et tout de suite quand on change de page ou d'onglet
  useDraft(
    KEY,
    useMemo(() => ({ design, name }), [design, name]),
  );

  return (
    <section className="panel">
      <div className="studio-bar">
        <div>
          <h2 className="panel__title">Création de visuel</h2>
          <p className="muted small">
            Dessine un sceau pour une trame, un objet ou un message, puis télécharge-le en PNG transparent. Ton travail est gardé en brouillon
            dans ce navigateur, même si tu changes de page.
          </p>
        </div>
        <label className="field">
          <span>Nom du fichier PNG</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="sceau" />
        </label>
      </div>
      <SealWorkbench design={design} onChange={setDesign} kanji={design.ringText} fileName={name || 'sceau'} className="creator--page" />
    </section>
  );
}
