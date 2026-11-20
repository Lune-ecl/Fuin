import { useEffect, useState } from 'react';
import { SealWorkbench, startDesign } from '../../components/SealCreator';
import { parseDesign, buildSealSvg, type SealDesign } from '../../lib/sealDesign';

const KEY = 'fuin.atelier.visuel';

// le visuel en cours est gardé dans ce navigateur pour ne pas perdre le travail
function loadSaved(): { design: SealDesign; name: string } {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw) as { svg?: string; name?: string };
      const design = parseDesign(saved.svg);
      if (design) return { design, name: saved.name ?? 'sceau' };
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

  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify({ svg: buildSealSvg(design), name }));
      } catch {
        /* rien à faire : la sauvegarde locale est un confort */
      }
    }, 400);
    return () => window.clearTimeout(t);
  }, [design, name]);

  return (
    <section className="panel">
      <div className="studio-bar">
        <div>
          <h2 className="panel__title">Création de visuel</h2>
          <p className="muted small">
            Dessine un sceau pour une trame, un objet ou un message, puis télécharge-le en PNG transparent. Ton travail reste gardé dans ce
            navigateur.
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
