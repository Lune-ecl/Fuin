import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import {
  buildSealSvg,
  COLORS,
  defaultDesign,
  FRAMES,
  GLYPH_LAYOUTS,
  glyphChars,
  MAX_GLYPHS,
  ORNAMENTS,
  parseDesign,
  randomDesign,
  reviveDesign,
  RINGS,
  SYMBOL_CATEGORIES,
  SYMBOLS,
  type SealDesign,
  type SymbolCategory,
} from '../lib/sealDesign';
import { sanitizeSvg } from '../lib/markdown';
import SealEmblem from './SealEmblem';
import { Modal, useToast } from './ui';
import { useBrushFont } from '../lib/useBrushFont';
import { downloadSealPng } from '../lib/sealExport';
import { slugify, timeAgo } from '../lib/format';
import { clearDraft, readDraft, useDraft } from '../lib/draft';

const QUICK_GLYPHS = ['封', '印', '禁', '呪', '結', '界', '解', '縛', '血', '魂', '火', '雷'];

// un nouveau sceau démarre sans kanji central : on le choisit soi-même
export const startDesign = (kanji: string | null | undefined): SealDesign => ({ ...defaultDesign(kanji), glyph: '' });

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/[’']/g, ' ');

function Tile({ on, label, svg, onClick }: { on: boolean; label: string; svg?: string; onClick: () => void }) {
  return (
    <button type="button" className={`tile${on ? ' is-on' : ''}`} onClick={onClick} aria-pressed={on} title={label}>
      {svg !== undefined && <span className="tile__art" dangerouslySetInnerHTML={{ __html: svg }} />}
      <small>{label}</small>
    </button>
  );
}

function Range({ min, max, step, value, onChange }: { min: number; max: number; step: number; value: number; onChange: (v: number) => void }) {
  const fill = `${((Math.min(max, Math.max(min, value)) - min) / (max - min)) * 100}%`;
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      style={{ '--fill': fill } as CSSProperties}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
}

/** Section repliable : l'en-tête rappelle le choix en cours. */
function Section({
  title,
  summary,
  open,
  onToggle,
  children,
  dot,
}: {
  title: string;
  summary: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  dot?: string;
}) {
  return (
    <section className={`creator__group${open ? ' is-open' : ''}`}>
      <button type="button" className="creator__head" onClick={onToggle} aria-expanded={open}>
        <span className="creator__title">{title}</span>
        <span className="creator__summary">
          {dot && <i className="creator__dot" style={{ background: dot }} aria-hidden="true" />}
          {summary}
        </span>
        <span className="creator__chevron" aria-hidden="true" />
      </button>
      {open && <div className="creator__body">{children}</div>}
    </section>
  );
}

type SectionKey = 'frame' | 'ring' | 'ornaments' | 'symbol' | 'glyph' | 'ink';

/**
 * Plan de travail du créateur : aperçu animé à gauche, réglages repliables à droite.
 * Contrôlé par le parent (fenêtre du créateur ou page « Création de visuel »).
 */
export function SealWorkbench({
  design: d,
  onChange,
  kanji,
  fileName = 'sceau',
  className = '',
}: {
  design: SealDesign;
  onChange: (d: SealDesign) => void;
  kanji: string | null;
  fileName?: string;
  className?: string;
}) {
  const toast = useToast();
  const [replay, setReplay] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [section, setSection] = useState<SectionKey | null>('frame');
  const [family, setFamily] = useState<SymbolCategory | null>(null);
  const [query, setQuery] = useState('');

  const set = <K extends keyof SealDesign>(k: K, v: SealDesign[K]) => onChange({ ...d, [k]: v });
  const toggle = (k: SectionKey) => setSection((s) => (s === k ? null : k));

  // le kanji est mesuré avec la police pinceau une fois chargée, pour être bien centré
  const font = useBrushFont(`${d.glyph}${d.ringText}`);
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
  const mk = useMemo(() => (p: Partial<SealDesign>) => sanitizeSvg(buildSealSvg({ ...base, ...p }, { embed: false })), [base]);
  const previews = useMemo(() => {
    if (section === 'frame') return Object.fromEntries(FRAMES.map((f) => [f.key, mk({ frame: f.key })]));
    if (section === 'ring')
      return Object.fromEntries(RINGS.map((r) => [r.key, mk({ ring: r.key, ringText: d.ringText || '封印', frame: 'circle' })]));
    if (section === 'ornaments') return Object.fromEntries(ORNAMENTS.map((o) => [o.key, mk({ ornaments: [o.key] })]));
    return {} as Record<string, string>;
  }, [section, mk, d.ringText]);

  // symboles visibles : résultats de recherche ou famille ouverte
  const q = norm(query.trim());
  const visibleSymbols = q ? SYMBOLS.filter((s) => norm(s.label).includes(q)) : family ? SYMBOLS.filter((s) => s.cat === family) : [];
  const symbolPreviews = useMemo(
    () => (section === 'symbol' ? Object.fromEntries(visibleSymbols.map((s) => [s.key, mk({ symbol: s.key, symbolScale: 1.5 })])) : {}),
    [section, mk, q, family],
  );
  const familyCovers = useMemo(
    () =>
      section === 'symbol'
        ? Object.fromEntries(
            SYMBOL_CATEGORIES.map((c) => [
              c.key,
              SYMBOLS.filter((s) => s.cat === c.key)
                .slice(0, 4)
                .map((s) => mk({ symbol: s.key, symbolScale: 1.6 })),
            ]),
          )
        : {},
    [section, mk],
  );

  const kanjiChars = [...new Set([...(kanji || '').replace(/\s/g, ''), ...QUICK_GLYPHS])].slice(0, 18);
  const glyphs = glyphChars(d.glyph);
  const frame = FRAMES.find((f) => f.key === d.frame);
  const ring = RINGS.find((r) => r.key === d.ring) ?? RINGS[0];
  const symbol = SYMBOLS.find((s) => s.key === d.symbol);
  const color = COLORS.find((c) => c.value === d.color);
  const ornLabels = d.ornaments.map((k) => ORNAMENTS.find((o) => o.key === k)?.label).filter(Boolean) as string[];

  return (
    <div
      className={`creator ${className}`}
      onKeyDown={(e) => {
        // le créateur vit parfois dans un formulaire : Entrée ne doit pas l'envoyer
        if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') e.preventDefault();
      }}
    >
      <div className="creator__preview">
        <SealEmblem svg={svg} replay={replay} animateOnChange={false} className="emblem--creator" />
        <div className="creator__actions">
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setReplay((r) => r + 1)}>
            Rejouer le tracé
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => onChange(randomDesign(kanji))}>
            Au hasard
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => onChange(startDesign(kanji))}>
            Réinitialiser
          </button>
        </div>
        <button type="button" className="btn btn--ghost btn--sm creator__png" onClick={exportPng} disabled={exporting}>
          {exporting ? 'Préparation…' : 'Télécharger en PNG (fond transparent)'}
        </button>
      </div>

      <div className="creator__controls">
        <Section title="Contour" summary={frame?.label ?? 'Aucun'} open={section === 'frame'} onToggle={() => toggle('frame')}>
          <div className="tiles">
            {FRAMES.map((f) => (
              <Tile key={f.key} on={d.frame === f.key} label={f.label} svg={previews[f.key]} onClick={() => set('frame', f.key)} />
            ))}
          </div>
        </Section>

        <Section
          title="Anneau"
          summary={ring.text && d.ringText.trim() ? `${ring.label} · ${d.ringText.replace(/\s+/g, '')}` : ring.label}
          open={section === 'ring'}
          onToggle={() => toggle('ring')}
        >
          {ring.text && (
            <label className="field creator__field creator__field--top">
              <span>Texte de l’anneau (formule de kanjis)</span>
              <input className="input-kanji" lang="ja" value={d.ringText} onChange={(e) => set('ringText', e.target.value)} />
            </label>
          )}
          <div className="tiles">
            {RINGS.map((r) => (
              <Tile key={r.key} on={d.ring === r.key} label={r.label} svg={previews[r.key]} onClick={() => set('ring', r.key)} />
            ))}
          </div>
        </Section>

        <Section
          title="Ornements"
          summary={ornLabels.length ? (ornLabels.length > 2 ? `${ornLabels.slice(0, 2).join(', ')} +${ornLabels.length - 2}` : ornLabels.join(', ')) : 'Aucun'}
          open={section === 'ornaments'}
          onToggle={() => toggle('ornaments')}
        >
          <p className="creator__hint">Plusieurs ornements peuvent se superposer.</p>
          <div className="tiles">
            {ORNAMENTS.map((o) => (
              <Tile
                key={o.key}
                on={d.ornaments.includes(o.key)}
                label={o.label}
                svg={previews[o.key]}
                onClick={() => set('ornaments', d.ornaments.includes(o.key) ? d.ornaments.filter((k) => k !== o.key) : [...d.ornaments, o.key])}
              />
            ))}
          </div>
          {d.ornaments.length > 0 && (
            <button type="button" className="btn btn--ghost btn--sm creator__clear" onClick={() => set('ornaments', [])}>
              Tout retirer
            </button>
          )}
        </Section>

        <Section title="Symbole central" summary={symbol?.label ?? 'Aucun'} open={section === 'symbol'} onToggle={() => toggle('symbol')}>
          <div className="symbol-bar">
            <input
              className="input-search"
              placeholder={`Chercher parmi ${SYMBOLS.length} symboles…`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {d.symbol && (
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => set('symbol', null)}>
                Retirer le symbole
              </button>
            )}
          </div>

          {q ? (
            <>
              <p className="creator__hint">
                {visibleSymbols.length} résultat{visibleSymbols.length > 1 ? 's' : ''}
              </p>
              <div className="tiles">
                {visibleSymbols.map((s) => (
                  <Tile key={s.key} on={d.symbol === s.key} label={s.label} svg={symbolPreviews[s.key]} onClick={() => set('symbol', s.key)} />
                ))}
              </div>
            </>
          ) : family ? (
            <>
              <div className="family-head">
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setFamily(null)}>
                  ← Familles
                </button>
                <b>{SYMBOL_CATEGORIES.find((c) => c.key === family)?.label}</b>
                <small>{visibleSymbols.length} symboles</small>
              </div>
              <div className="tiles">
                {visibleSymbols.map((s) => (
                  <Tile key={s.key} on={d.symbol === s.key} label={s.label} svg={symbolPreviews[s.key]} onClick={() => set('symbol', s.key)} />
                ))}
              </div>
            </>
          ) : (
            <div className="families">
              {SYMBOL_CATEGORIES.map((c) => {
                const count = SYMBOLS.filter((s) => s.cat === c.key).length;
                const has = symbol?.cat === c.key;
                return (
                  <button key={c.key} type="button" className={`family${has ? ' is-on' : ''}`} onClick={() => setFamily(c.key)}>
                    <span className="family__covers">
                      {(familyCovers[c.key] ?? []).map((art, i) => (
                        <span key={i} dangerouslySetInnerHTML={{ __html: art }} />
                      ))}
                    </span>
                    <span className="family__label">{c.label}</span>
                    <small>
                      {count} symboles{has ? ` · ${symbol?.label}` : ''}
                    </small>
                  </button>
                );
              })}
            </div>
          )}

          {d.symbol && (
            <label className="range">
              <span>Taille du symbole</span>
              <Range min={0.4} max={1.6} step={0.05} value={d.symbolScale} onChange={(v) => set('symbolScale', v)} />
            </label>
          )}
        </Section>

        <Section
          title="Kanjis du centre"
          summary={glyphs.length ? `${glyphs.join('')} · ${glyphs.length}/${MAX_GLYPHS}` : 'Aucun'}
          open={section === 'glyph'}
          onToggle={() => toggle('glyph')}
        >
          <div className="field creator__field creator__field--top">
            <span>
              Kanjis (jusqu’à {MAX_GLYPHS}) · {glyphs.length}/{MAX_GLYPHS}
            </span>
            <div className="glyph-line">
              <input
                className="input-kanji"
                lang="ja"
                value={d.glyph}
                onChange={(e) => set('glyph', glyphChars(e.target.value).join(''))}
                placeholder="封印結界"
                aria-label="Kanjis du centre"
              />
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => set('glyph', glyphs.slice(0, -1).join(''))} disabled={!glyphs.length}>
                ⌫ Retirer
              </button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => set('glyph', '')} disabled={!glyphs.length}>
                Vider
              </button>
            </div>
          </div>
          <p className="creator__hint">Clique pour ajouter un kanji à la suite. Ils se placent dans l’ordre, ligne par ligne de gauche à droite : avec « 印結魂雷縛界 », 印結 en haut, 魂雷 au milieu, 縛界 en bas.</p>
          <div className="glyph-picks">
            {kanjiChars.map((k) => (
              <button
                key={k}
                type="button"
                lang="ja"
                className={`glyph-pick${glyphs.includes(k) ? ' is-on' : ''}`}
                disabled={glyphs.length >= MAX_GLYPHS}
                onClick={() => set('glyph', glyphChars(d.glyph + k).join(''))}
              >
                {k}
              </button>
            ))}
          </div>
          {glyphs.length > 1 && (
            <div className="field creator__field">
              <span>Disposition</span>
              <div className="segmented" role="radiogroup" aria-label="Disposition des kanjis">
                {GLYPH_LAYOUTS.map((l) => (
                  <button
                    key={l.key}
                    type="button"
                    role="radio"
                    aria-checked={(d.glyphLayout ?? 'auto') === l.key}
                    className={(d.glyphLayout ?? 'auto') === l.key ? 'is-on' : ''}
                    title={l.hint}
                    onClick={() => set('glyphLayout', l.key)}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {glyphs.length > 0 && (
            <label className="range">
              <span>Taille des kanjis</span>
              <Range min={0.3} max={1.8} step={0.05} value={d.glyphScale} onChange={(v) => set('glyphScale', v)} />
            </label>
          )}
        </Section>

        <Section
          title="Encre et trait"
          summary={`${color?.label ?? 'Couleur libre'} · trait ${d.stroke.toFixed(1)}${d.rotation ? ` · ${Math.round(d.rotation)}°` : ''}`}
          dot={d.color}
          open={section === 'ink'}
          onToggle={() => toggle('ink')}
        >
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
            <Range min={0.8} max={4} step={0.1} value={d.stroke} onChange={(v) => set('stroke', v)} />
          </label>
          <label className="range">
            <span>Rotation · {Math.round(d.rotation)}°</span>
            <Range min={0} max={360} step={7.5} value={d.rotation} onChange={(v) => set('rotation', v)} />
          </label>
        </Section>
      </div>
    </div>
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
  draftKey,
}: {
  open: boolean;
  initialSvg: string | null;
  kanji: string | null;
  onClose: () => void;
  onUse: (svg: string) => void;
  fileName?: string;
  useLabel?: string;
  kicker?: string;
  /** clé du brouillon : le visuel en cours survit à un changement de page ou à une fenêtre refermée */
  draftKey?: string;
}) {
  const [d, setD] = useState<SealDesign>(() => startDesign(kanji));
  // le brouillon ne s'écrit qu'une fois le visuel réellement modifié
  const [touched, setTouched] = useState(false);
  const [resumed, setResumed] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const saved = draftKey ? readDraft<unknown>(draftKey) : null;
    const fromDraft = saved ? reviveDesign(saved.value) : null;
    setD(fromDraft ?? parseDesign(initialSvg) ?? startDesign(kanji));
    setResumed(fromDraft && saved ? saved.at : null);
    setTouched(false);
  }, [open, initialSvg, kanji, draftKey]);

  const discard = useDraft(open && touched && draftKey ? draftKey : null, open && touched ? d : null);

  const edit = (next: SealDesign) => {
    setD(next);
    setTouched(true);
  };

  // efface aussi un brouillon repris mais pas encore retouché
  const dropDraft = () => {
    discard();
    if (draftKey) clearDraft(draftKey);
  };

  const restart = () => {
    dropDraft();
    setD(parseDesign(initialSvg) ?? startDesign(kanji));
    setResumed(null);
    setTouched(false);
  };

  return (
    <Modal open={open} onClose={onClose} title="Créateur de sceau" kicker={kicker} wide>
      {open && resumed && (
        <div className="draft-banner">
          <span>
            <b>Brouillon repris</b> · dernière modification {timeAgo(resumed)}
          </span>
          <button type="button" className="btn btn--ghost btn--sm" onClick={restart}>
            {initialSvg ? 'Revenir au visuel enregistré' : 'Repartir de zéro'}
          </button>
        </div>
      )}
      {open && <SealWorkbench design={d} onChange={edit} kanji={kanji} fileName={fileName} />}
      <div className="form-actions">
        {draftKey && touched && <span className="draft-note">Brouillon gardé si tu changes de page</span>}
        <button type="button" className="btn btn--ghost" onClick={onClose}>
          Annuler
        </button>
        <button
          type="button"
          className="btn btn--red"
          onClick={() => {
            dropDraft();
            onUse(buildSealSvg(d));
            onClose();
          }}
        >
          {useLabel}
        </button>
      </div>
    </Modal>
  );
}
