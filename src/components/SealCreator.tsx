import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  buildSealSvg,
  COLORS,
  defaultDesign,
  FRAMES,
  ORNAMENTS,
  parseDesign,
  randomDesign,
  SYMBOLS,
  type SealDesign,
} from '../lib/sealDesign';
import { sanitizeSvg } from '../lib/markdown';
import SealEmblem from './SealEmblem';
import { Modal, useToast } from './ui';
import { useBrushFont } from '../lib/useBrushFont';
import { downloadSealPng } from '../lib/sealExport';
import { slugify } from '../lib/format';

const RING_OPTIONS: { key: SealDesign['ring']; label: string }[] = [
  { key: 'none', label: 'Aucun' },
  { key: 'kanji', label: 'Kanjis' },
  { key: 'ticks', label: 'Graduations' },
  { key: 'both', label: 'Les deux' },
];

const QUICK_GLYPHS = ['封', '印', '禁', '呪', '結', '界', '解', '縛', '血', '魂', '火', '雷'];

function Tile({ on, label, svg, onClick }: { on: boolean; label: string; svg?: string; onClick: () => void }) {
  return (
    <button type="button" className={`tile${on ? ' is-on' : ''}`} onClick={onClick} aria-pressed={on} title={label}>
      {svg !== undefined && <span className="tile__art" dangerouslySetInnerHTML={{ __html: svg }} />}
      <small>{label}</small>
    </button>
  );
}

function Group({ title, children, hint }: { title: string; children: ReactNode; hint?: string }) {
  return (
    <section className="creator__group">
      <h4>
        {title}
        {hint && <small>{hint}</small>}
      </h4>
      {children}
    </section>
  );
}

export default function SealCreator({
  open,
  initialSvg,
  kanji,
  onClose,
  onUse,
  fileName = 'sceau',
  useLabel = 'Utiliser ce visuel',
  kicker = 'Visuel de la fiche',
}: {
  open: boolean;
  initialSvg: string | null;
  kanji: string | null;
  onClose: () => void;
  onUse: (svg: string) => void;
  fileName?: string;
  useLabel?: string;
  kicker?: string;
}) {
  const toast = useToast();
  const [d, setD] = useState<SealDesign>(() => defaultDesign(kanji));
  const [replay, setReplay] = useState(0);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (open) setD(parseDesign(initialSvg) ?? defaultDesign(kanji));
  }, [open, initialSvg, kanji]);

  const set = <K extends keyof SealDesign>(k: K, v: SealDesign[K]) => setD((x) => ({ ...x, [k]: v }));
  // le kanji est mesuré avec la police pinceau une fois chargée, pour être bien centré
  const font = useBrushFont(open ? `${d.glyph}${d.ringText}` : '');
  const svg = useMemo(() => buildSealSvg(d), [d, font.version]);

  const exportPng = async () => {
    setExporting(true);
    try {
      await downloadSealPng(svg, slugify(fileName) || 'sceau');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Export impossible', 'error');
    } finally {
      setExporting(false);
    }
  };

  // aperçus des tuiles (même couleur et même trait que le sceau en cours)
  const base: SealDesign = useMemo(
    () => ({ ...defaultDesign(), frame: 'none', ring: 'none', ornaments: [], symbol: null, glyph: '', color: d.color, stroke: d.stroke + 0.8 }),
    [d.color, d.stroke],
  );
  const previews = useMemo(() => {
    const mk = (p: Partial<SealDesign>) => sanitizeSvg(buildSealSvg({ ...base, ...p }, { embed: false }));
    return {
      frames: Object.fromEntries(FRAMES.map((f) => [f.key, mk({ frame: f.key })])),
      rings: Object.fromEntries(RING_OPTIONS.map((r) => [r.key, mk({ ring: r.key, ringText: d.ringText || '封印', frame: 'circle' })])),
      ornaments: Object.fromEntries(ORNAMENTS.map((o) => [o.key, mk({ ornaments: [o.key] })])),
      symbols: Object.fromEntries(SYMBOLS.map((s) => [s.key, mk({ symbol: s.key, symbolScale: 1.5 })])),
    };
  }, [base, d.ringText]);

  const kanjiChars = [...new Set([...(kanji || '').replace(/\s/g, ''), ...QUICK_GLYPHS])].slice(0, 16);

  return (
    <Modal open={open} onClose={onClose} title="Créateur de sceau" kicker={kicker} wide>
      <div
        className="creator"
        onKeyDown={(e) => {
          // le créateur vit dans le formulaire de l'éditeur : Entrée ne doit pas enregistrer la fiche
          if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') e.preventDefault();
        }}
      >
        <div className="creator__preview">
          <SealEmblem svg={svg} replay={replay} animateOnChange={false} className="emblem--creator" />
          <div className="creator__actions">
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setReplay((r) => r + 1)}>
              Rejouer le tracé
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setD(randomDesign(kanji))}>
              Au hasard
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setD(defaultDesign(kanji))}>
              Réinitialiser
            </button>
          </div>
          <button type="button" className="btn btn--ghost btn--sm creator__png" onClick={exportPng} disabled={exporting}>
            {exporting ? 'Préparation…' : 'Télécharger en PNG (fond transparent)'}
          </button>
        </div>

        <div className="creator__controls">
          <Group title="Contour">
            <div className="tiles">
              {FRAMES.map((f) => (
                <Tile key={f.key} on={d.frame === f.key} label={f.label} svg={previews.frames[f.key]} onClick={() => set('frame', f.key)} />
              ))}
            </div>
          </Group>

          <Group title="Anneau" hint="écrit avec la formule de kanjis">
            <div className="tiles tiles--small">
              {RING_OPTIONS.map((r) => (
                <Tile key={r.key} on={d.ring === r.key} label={r.label} svg={previews.rings[r.key]} onClick={() => set('ring', r.key)} />
              ))}
            </div>
            {(d.ring === 'kanji' || d.ring === 'both') && (
              <label className="field creator__field">
                <span>Texte de l’anneau</span>
                <input className="input-kanji" lang="ja" value={d.ringText} onChange={(e) => set('ringText', e.target.value)} />
              </label>
            )}
          </Group>

          <Group title="Ornements" hint="plusieurs possibles">
            <div className="tiles">
              {ORNAMENTS.map((o) => (
                <Tile
                  key={o.key}
                  on={d.ornaments.includes(o.key)}
                  label={o.label}
                  svg={previews.ornaments[o.key]}
                  onClick={() =>
                    set('ornaments', d.ornaments.includes(o.key) ? d.ornaments.filter((k) => k !== o.key) : [...d.ornaments, o.key])
                  }
                />
              ))}
            </div>
          </Group>

          <Group title="Symbole central">
            <div className="tiles">
              <Tile on={!d.symbol} label="Aucun" svg="" onClick={() => set('symbol', null)} />
              {SYMBOLS.map((s) => (
                <Tile key={s.key} on={d.symbol === s.key} label={s.label} svg={previews.symbols[s.key]} onClick={() => set('symbol', s.key)} />
              ))}
            </div>
            {d.symbol && (
              <label className="range">
                <span>Taille du symbole</span>
                <input type="range" min={0.4} max={1.6} step={0.05} value={d.symbolScale} onChange={(e) => set('symbolScale', Number(e.target.value))} />
              </label>
            )}
          </Group>

          <Group title="Kanji central">
            <div className="glyph-picks">
              <button type="button" className={`glyph-pick${!d.glyph ? ' is-on' : ''}`} onClick={() => set('glyph', '')}>
                ∅
              </button>
              {kanjiChars.map((k) => (
                <button key={k} type="button" lang="ja" className={`glyph-pick${d.glyph === k ? ' is-on' : ''}`} onClick={() => set('glyph', k)}>
                  {k}
                </button>
              ))}
              <input
                className="glyph-input"
                lang="ja"
                value={d.glyph}
                maxLength={2}
                onChange={(e) => set('glyph', e.target.value)}
                aria-label="Kanji personnalisé"
                placeholder="…"
              />
            </div>
            {d.glyph && (
              <label className="range">
                <span>Taille du kanji</span>
                <input type="range" min={0.3} max={1.8} step={0.05} value={d.glyphScale} onChange={(e) => set('glyphScale', Number(e.target.value))} />
              </label>
            )}
          </Group>

          <Group title="Encre">
            <div className="swatches">
              {COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  className={`swatch${d.color === c.value ? ' is-on' : ''}`}
                  style={{ background: c.value }}
                  onClick={() => set('color', c.value)}
                  title={c.label}
                  aria-label={c.label}
                />
              ))}
              <label
                className={`swatch swatch--custom${COLORS.some((c) => c.value === d.color) ? '' : ' is-on'}`}
                title="Autre couleur"
                style={COLORS.some((c) => c.value === d.color) ? undefined : { background: d.color }}
              >
                <input type="color" value={d.color} onChange={(e) => set('color', e.target.value)} aria-label="Autre couleur" />
                <span aria-hidden="true">+</span>
              </label>
            </div>
            <label className="range">
              <span>Épaisseur du trait</span>
              <input type="range" min={0.8} max={4} step={0.1} value={d.stroke} onChange={(e) => set('stroke', Number(e.target.value))} />
            </label>
            <label className="range">
              <span>Rotation · {Math.round(d.rotation)}°</span>
              <input type="range" min={0} max={360} step={7.5} value={d.rotation} onChange={(e) => set('rotation', Number(e.target.value))} />
            </label>
          </Group>
        </div>
      </div>
      <div className="form-actions">
        <button type="button" className="btn btn--ghost" onClick={onClose}>
          Annuler
        </button>
        <button
          type="button"
          className="btn btn--red"
          onClick={() => {
            onUse(svg);
            onClose();
          }}
        >
          {useLabel}
        </button>
      </div>
    </Modal>
  );
}
