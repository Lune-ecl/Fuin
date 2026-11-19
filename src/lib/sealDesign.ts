// Moteur de dessin des sceaux : une description simple (contour, anneau, ornements, symbole,
// kanji central, couleur) devient un SVG. La description est rangée dans l'attribut
// data-fuin-design du SVG pour pouvoir rouvrir le sceau dans le créateur.

export interface SealDesign {
  v: 1;
  frame: string;
  ring: 'none' | 'kanji' | 'ticks' | 'both';
  ringText: string;
  ornaments: string[];
  symbol: string | null;
  symbolScale: number;
  glyph: string;
  glyphScale: number;
  color: string;
  stroke: number;
  rotation: number;
}

export const COLORS = [
  { value: '#ff3445', label: 'Rouge vif' },
  { value: '#d81e30', label: 'Écarlate' },
  { value: '#a3121f', label: 'Carmin' },
  { value: '#7c0c17', label: 'Sang séché' },
  { value: '#ff7a1a', label: 'Braise' },
  { value: '#f2b33d', label: 'Or' },
  { value: '#2fd47a', label: 'Vert jade' },
  { value: '#14a35c', label: 'Vert forêt' },
  { value: '#22d3ee', label: 'Cyan' },
  { value: '#3b82f6', label: 'Bleu' },
  { value: '#4f46e5', label: 'Indigo' },
  { value: '#a855f7', label: 'Violet' },
  { value: '#f472b6', label: 'Rose' },
  { value: '#f1ebe6', label: 'Os' },
  { value: '#8a827c', label: 'Cendre' },
];

export const BRUSH_FONT = 'Yuji Syuku';

// Centre optiquement un kanji : on mesure son encre réelle (canvas) au lieu de se fier
// aux métriques de la police, qui décalent le caractère vers le bas ou sur le côté.
let measureCtx: CanvasRenderingContext2D | null = null;
function glyphOffset(text: string, size: number): { dx: number; dy: number } {
  const fallback = { dx: 0, dy: size * 0.36 };
  if (typeof document === 'undefined') return fallback;
  try {
    measureCtx ??= document.createElement('canvas').getContext('2d');
    if (!measureCtx) return fallback;
    measureCtx.font = `${size}px "${BRUSH_FONT}", "Shippori Mincho B1", serif`;
    measureCtx.textAlign = 'center';
    measureCtx.textBaseline = 'alphabetic';
    const m = measureCtx.measureText(text);
    const a = m.actualBoundingBoxAscent;
    const d = m.actualBoundingBoxDescent;
    if (!Number.isFinite(a) || (a === 0 && d === 0)) return fallback;
    return {
      dx: -(m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2,
      dy: (a - d) / 2,
    };
  } catch {
    return fallback;
  }
}

/** Charge la police pinceau pour ces caractères (les fichiers Google Fonts sont découpés par caractères). */
export function loadBrushFont(text: string): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts || !text.trim()) return Promise.resolve();
  return document.fonts
    .load(`66px "${BRUSH_FONT}"`, text)
    .then(() => undefined)
    .catch(() => undefined);
}

const C = 100;
const n = (x: number) => Math.round(x * 100) / 100;

function pts(count: number, r: number, rot = -90): string {
  return Array.from({ length: count }, (_, i) => {
    const a = ((rot + (360 / count) * i) * Math.PI) / 180;
    return `${n(C + r * Math.cos(a))},${n(C + r * Math.sin(a))}`;
  }).join(' ');
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Contours
// ---------------------------------------------------------------------------
export const FRAMES: { key: string; label: string; draw: (sw: number) => string }[] = [
  { key: 'none', label: 'Aucun', draw: () => '' },
  { key: 'circle', label: 'Cercle', draw: () => `<circle cx="${C}" cy="${C}" r="94"/>` },
  {
    key: 'double',
    label: 'Double cercle',
    draw: (sw) => `<circle cx="${C}" cy="${C}" r="95"/><circle cx="${C}" cy="${C}" r="89" stroke-width="${n(sw * 0.55)}"/>`,
  },
  {
    key: 'square',
    label: 'Carré',
    draw: (sw) =>
      `<rect x="7" y="7" width="186" height="186" rx="3"/><rect x="14" y="14" width="172" height="172" rx="2" stroke-width="${n(sw * 0.55)}"/>`,
  },
  { key: 'diamond', label: 'Losange', draw: () => `<polygon points="${pts(4, 97)}"/>` },
  { key: 'hexagon', label: 'Hexagone', draw: () => `<polygon points="${pts(6, 96)}"/>` },
  { key: 'octagon', label: 'Octogone', draw: () => `<polygon points="${pts(8, 96, -67.5)}"/>` },
  { key: 'triangle', label: 'Triangle', draw: () => `<polygon points="${pts(3, 98)}"/>` },
  {
    key: 'star8',
    label: 'Étoile',
    draw: () => `<polygon points="${pts(4, 95)}"/><polygon points="${pts(4, 95, -45)}"/>`,
  },
  {
    key: 'sun',
    label: 'Soleil',
    draw: (sw) =>
      `<circle cx="${C}" cy="${C}" r="88"/>` +
      Array.from({ length: 24 }, (_, i) => {
        const a = ((i * 15 - 90) * Math.PI) / 180;
        return `<line x1="${n(C + 90 * Math.cos(a))}" y1="${n(C + 90 * Math.sin(a))}" x2="${n(C + 98 * Math.cos(a))}" y2="${n(C + 98 * Math.sin(a))}" stroke-width="${n(sw * 0.8)}"/>`;
      }).join(''),
  },
];

// ---------------------------------------------------------------------------
// Ornements (intérieur du sceau, rayon ≤ 70)
// ---------------------------------------------------------------------------
const TRIGRAMS = ['111', '110', '101', '100', '011', '010', '001', '000'];

export const ORNAMENTS: { key: string; label: string; draw: (sw: number, color: string) => string }[] = [
  { key: 'inner', label: 'Cercle intérieur', draw: () => `<circle cx="${C}" cy="${C}" r="66"/>` },
  {
    key: 'dashes',
    label: 'Pointillés',
    draw: (sw) => `<circle cx="${C}" cy="${C}" r="70" stroke-dasharray="${n(sw)} ${n(sw * 3)}"/>`,
  },
  {
    key: 'dots',
    label: 'Huit points',
    draw: (_sw, color) =>
      Array.from({ length: 8 }, (_, i) => {
        const a = ((i * 45 - 90) * Math.PI) / 180;
        return `<circle cx="${n(C + 66 * Math.cos(a))}" cy="${n(C + 66 * Math.sin(a))}" r="3.4" fill="${color}" stroke="none"/>`;
      }).join(''),
  },
  {
    key: 'rays',
    label: 'Rayons',
    draw: () =>
      Array.from({ length: 16 }, (_, i) => {
        const a = ((i * 22.5 - 90) * Math.PI) / 180;
        return `<line x1="${n(C + 48 * Math.cos(a))}" y1="${n(C + 48 * Math.sin(a))}" x2="${n(C + 62 * Math.cos(a))}" y2="${n(C + 62 * Math.sin(a))}"/>`;
      }).join(''),
  },
  { key: 'triangle', label: 'Triangle', draw: () => `<polygon points="${pts(3, 66)}"/>` },
  {
    key: 'hexagram',
    label: 'Hexagramme',
    draw: () => `<polygon points="${pts(3, 66)}"/><polygon points="${pts(3, 66, 90)}"/>`,
  },
  {
    key: 'square',
    label: 'Carré intérieur',
    draw: () => `<polygon points="${pts(4, 66, -45)}"/>`,
  },
  {
    key: 'cross',
    label: 'Croix',
    draw: () => `<line x1="${C}" y1="30" x2="${C}" y2="170"/><line x1="30" y1="${C}" x2="170" y2="${C}"/>`,
  },
  {
    key: 'trigrams',
    label: 'Trigrammes',
    draw: (sw) =>
      TRIGRAMS.map((t, i) => {
        const lines = t
          .split('')
          .map((bit, j) => {
            const y = -60 + j * 5;
            return bit === '1'
              ? `<line x1="-8" y1="${y}" x2="8" y2="${y}"/>`
              : `<line x1="-8" y1="${y}" x2="-2" y2="${y}"/><line x1="2" y1="${y}" x2="8" y2="${y}"/>`;
          })
          .join('');
        return `<g transform="translate(${C} ${C}) rotate(${i * 45})" stroke-width="${n(sw * 0.9)}">${lines}</g>`;
      }).join(''),
  },
  {
    key: 'petals',
    label: 'Pétales',
    draw: () =>
      Array.from({ length: 8 }, (_, i) => `<path d="M${C} ${C} Q${C + 14} ${C - 34} ${C} ${C - 66} Q${C - 14} ${C - 34} ${C} ${C} Z" transform="rotate(${i * 45} ${C} ${C})"/>`).join(''),
  },
];

// ---------------------------------------------------------------------------
// Symboles centraux (dessinés dans une boîte 100 × 100)
// ---------------------------------------------------------------------------
function spiral(): string {
  const p: string[] = [];
  for (let i = 0; i <= 120; i++) {
    const t = (i / 120) * Math.PI * 6;
    const r = 2 + t * 2.1;
    p.push(`${n(50 + r * Math.cos(t))},${n(50 + r * Math.sin(t))}`);
  }
  return `<polyline points="${p.join(' ')}"/>`;
}

export const SYMBOLS: { key: string; label: string; svg: (color: string) => string }[] = [
  {
    key: 'eye',
    label: 'Œil',
    svg: (c) => `<path d="M8 50 Q50 14 92 50 Q50 86 8 50 Z"/><circle cx="50" cy="50" r="14"/><circle cx="50" cy="50" r="5" fill="${c}" stroke="none"/>`,
  },
  {
    key: 'flame',
    label: 'Flamme',
    svg: () =>
      `<path d="M50 8 C62 28 80 40 76 64 C73 82 58 92 50 92 C42 92 27 82 24 64 C21 48 34 40 40 26 C44 38 50 42 50 8 Z"/><path d="M50 52 C56 60 62 66 60 76 C58 84 42 84 40 76 C38 68 46 62 50 52 Z"/>`,
  },
  {
    key: 'drop',
    label: 'Goutte',
    svg: () => `<path d="M50 8 C64 34 78 48 78 64 A28 28 0 0 1 22 64 C22 48 36 34 50 8 Z"/><path d="M36 66 A14 14 0 0 0 48 80"/>`,
  },
  {
    key: 'chain',
    label: 'Chaîne',
    svg: () =>
      `<rect x="6" y="38" width="40" height="24" rx="12" transform="rotate(-20 26 50)"/><rect x="30" y="38" width="40" height="24" rx="12" transform="rotate(20 50 50)"/><rect x="54" y="38" width="40" height="24" rx="12" transform="rotate(-20 74 50)"/>`,
  },
  {
    key: 'wave',
    label: 'Vagues',
    svg: () =>
      [34, 50, 66].map((y) => `<path d="M6 ${y} Q17 ${y - 10} 28 ${y} T50 ${y} T72 ${y} T94 ${y}"/>`).join(''),
  },
  { key: 'spiral', label: 'Spirale', svg: () => spiral() },
  { key: 'lightning', label: 'Éclair', svg: () => `<path d="M58 6 L24 56 H48 L40 94 L78 40 H54 Z"/>` },
  {
    key: 'key',
    label: 'Clé',
    svg: () => `<circle cx="28" cy="50" r="15"/><circle cx="28" cy="50" r="5"/><path d="M43 50 H92 M78 50 V62 M88 50 V60"/>`,
  },
  {
    key: 'skull',
    label: 'Crâne',
    svg: (c) =>
      `<path d="M26 54 A24 24 0 1 1 74 54 V66 H64 V78 H36 V66 H26 Z"/><circle cx="40" cy="50" r="7" fill="${c}" stroke="none"/><circle cx="60" cy="50" r="7" fill="${c}" stroke="none"/><path d="M47 64 L50 58 L53 64 Z M44 70 V78 M50 70 V78 M56 70 V78"/>`,
  },
  {
    key: 'hand',
    label: 'Main',
    svg: () =>
      `<path d="M30 58 V40 M40 54 V24 M50 52 V18 M60 54 V24 M70 58 V36"/><path d="M28 56 C26 78 36 92 52 92 C66 92 74 80 72 56"/><path d="M28 56 Q22 48 16 52 Q24 64 30 70"/>`,
  },
  {
    key: 'lotus',
    label: 'Lotus',
    svg: () =>
      `<path d="M50 82 C40 64 40 42 50 22 C60 42 60 64 50 82 Z"/><path d="M50 82 C34 76 22 60 22 42 C36 48 46 62 50 82 Z"/><path d="M50 82 C66 76 78 60 78 42 C64 48 54 62 50 82 Z"/><path d="M18 84 H82"/>`,
  },
  {
    key: 'snake',
    label: 'Serpent',
    svg: (c) =>
      `<path d="M24 86 C70 86 74 62 50 56 C26 50 28 24 64 22"/><path d="M64 22 C72 18 82 20 84 28 C80 34 70 32 64 22 Z"/><circle cx="76" cy="25" r="1.8" fill="${c}" stroke="none"/>`,
  },
  { key: 'moon', label: 'Croissant', svg: () => `<path d="M64 12 A38 38 0 1 0 64 88 A30 30 0 1 1 64 12 Z"/>` },
  {
    key: 'sun',
    label: 'Soleil',
    svg: () =>
      `<circle cx="50" cy="50" r="18"/>` +
      Array.from({ length: 8 }, (_, i) => {
        const a = ((i * 45 - 90) * Math.PI) / 180;
        return `<line x1="${n(50 + 26 * Math.cos(a))}" y1="${n(50 + 26 * Math.sin(a))}" x2="${n(50 + 40 * Math.cos(a))}" y2="${n(50 + 40 * Math.sin(a))}"/>`;
      }).join(''),
  },
  { key: 'shield', label: 'Bouclier', svg: () => `<path d="M50 8 L84 22 V48 C84 70 68 86 50 94 C32 86 16 70 16 48 V22 Z"/><path d="M50 22 V80 M30 44 H70"/>` },
  {
    key: 'cage',
    label: 'Cage',
    svg: () => `<rect x="18" y="16" width="64" height="70" rx="4"/><path d="M34 16 V86 M50 16 V86 M66 16 V86 M18 32 H82"/><path d="M42 8 H58 V16"/>`,
  },
  { key: 'kunai', label: 'Kunai', svg: () => `<path d="M50 4 L60 46 L50 58 L40 46 Z"/><path d="M50 58 V84"/><circle cx="50" cy="91" r="6"/><path d="M45 64 H55 M45 72 H55"/>` },
  {
    key: 'tomoe',
    label: 'Tourbillon',
    svg: () =>
      [0, 120, 240]
        .map((r) => `<path d="M50 50 C50 34 64 26 74 32 C68 30 58 36 58 46 A8 8 0 1 1 50 50 Z" transform="rotate(${r} 50 50)"/>`)
        .join('') + `<circle cx="50" cy="50" r="40"/>`,
  },
];

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------
export function defaultDesign(kanji?: string | null): SealDesign {
  const chars = [...(kanji || '').replace(/\s/g, '')];
  return {
    v: 1,
    frame: 'double',
    ring: 'both',
    ringText: (kanji || '封 印').trim(),
    ornaments: ['dots'],
    symbol: null,
    symbolScale: 1,
    glyph: chars[0] || '封',
    glyphScale: 1,
    color: '#ff3445',
    stroke: 2,
    rotation: 0,
  };
}

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

const FONT = "Yuji Syuku, Shippori Mincho B1, Hiragino Mincho ProN, serif";

export function buildSealSvg(d: SealDesign, { embed = true }: { embed?: boolean } = {}): string {
  const sw = Math.max(0.6, Math.min(5, d.stroke || 2));
  const color = d.color || '#ff3445';
  const json = JSON.stringify(d);
  const id = `fs-${hash(json)}`;
  const frame = FRAMES.find((f) => f.key === d.frame) ?? FRAMES[0];

  // Anneau extérieur : kanjis sur un cercle + graduations
  let ring = '';
  if ((d.ring === 'kanji' || d.ring === 'both') && d.ringText.trim()) {
    const unit = [...d.ringText.replace(/\s+/g, '')].join(' ');
    const reps = Math.max(1, Math.round(24 / Math.max(1, unit.replace(/\s/g, '').length + 1)));
    const text = Array.from({ length: reps }, () => unit).join(' · ');
    ring += `<path id="${id}" d="M${C} ${C} m-79 0 a79 79 0 1 1 158 0 a79 79 0 1 1 -158 0" fill="none" stroke="none"/>`;
    ring += `<text font-family="${FONT}" font-size="13" fill="${color}" stroke="none"><textPath href="#${id}" startOffset="0" textLength="490" lengthAdjust="spacing">${esc(text)}</textPath></text>`;
    ring += `<circle cx="${C}" cy="${C}" r="75" stroke-width="${n(sw * 0.5)}"/>`;
  }
  if (d.ring === 'ticks' || d.ring === 'both') {
    const inner = d.ring === 'both' ? 69 : 80;
    ring += Array.from({ length: 72 }, (_, i) => {
      const a = ((i * 5 - 90) * Math.PI) / 180;
      const r1 = inner;
      const r2 = inner + (i % 6 === 0 ? 6 : 3.5);
      return `<line x1="${n(C + r1 * Math.cos(a))}" y1="${n(C + r1 * Math.sin(a))}" x2="${n(C + r2 * Math.cos(a))}" y2="${n(C + r2 * Math.sin(a))}" stroke-width="${n(i % 6 === 0 ? sw * 0.8 : sw * 0.45)}"/>`;
    }).join('');
  }

  const orn = d.ornaments
    .map((k) => ORNAMENTS.find((o) => o.key === k))
    .filter(Boolean)
    .map((o) => o!.draw(sw, color))
    .join('');

  let symbol = '';
  const sym = d.symbol ? SYMBOLS.find((s) => s.key === d.symbol) : null;
  if (sym) {
    const s = 0.88 * Math.max(0.3, Math.min(1.6, d.symbolScale || 1));
    symbol = `<g transform="translate(${n(C - 50 * s)} ${n(C - 50 * s)}) scale(${n(s)})" stroke-width="${n(sw / s)}">${sym.svg(color)}</g>`;
  }

  let glyph = '';
  if (d.glyph.trim()) {
    const size = 66 * Math.max(0.3, Math.min(1.8, d.glyphScale || 1));
    const off = glyphOffset(d.glyph.trim(), size);
    glyph = `<text x="${n(C + off.dx)}" y="${n(C + off.dy)}" text-anchor="middle" font-family="${FONT}" font-size="${n(size)}" fill="${color}" stroke="none">${esc(d.glyph.trim())}</text>`;
  }

  const rot = d.rotation ? ` transform="rotate(${n(d.rotation)} ${C} ${C})"` : '';
  // le carré reste droit : tourné, ses coins sortiraient du sceau
  const frameRot = d.frame === 'square' ? '' : rot;
  const attr = embed ? ` data-fuin-design="${encodeURIComponent(json)}"` : '';

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200" class="fuin-seal"${attr}>` +
    `<g fill="none" stroke="${color}" stroke-width="${n(sw)}" stroke-linecap="round" stroke-linejoin="round">` +
    `<g class="fs-frame"${frameRot}>${frame.draw(sw)}</g>` +
    `<g class="fs-outer"${rot}>${ring}</g>` +
    `<g class="fs-inner"${rot}>${orn}${symbol}</g>` +
    `</g>${glyph}</svg>`
  );
}

/**
 * SVG à afficher pour une fiche : un sceau du créateur est redessiné depuis sa description
 * (il profite ainsi des corrections, comme le centrage du kanji) ; une icône importée est
 * gardée telle quelle ; sans visuel, un sceau est dessiné avec la formule.
 */
export function displaySealSvg(svg: string | null | undefined, kanji?: string | null, autoDraw = true): string {
  const design = parseDesign(svg);
  if (design) return buildSealSvg(design);
  if (svg && svg.trim()) return svg;
  return autoDraw ? buildSealSvg(defaultDesign(kanji), { embed: false }) : '';
}

/** Caractères à charger dans la police pinceau pour dessiner ce sceau. */
export function sealGlyphs(svg: string | null | undefined, kanji?: string | null): string {
  const d = parseDesign(svg) ?? (svg ? null : defaultDesign(kanji));
  return d ? `${d.glyph}${d.ringText}` : '';
}

export function parseDesign(svg: string | null | undefined): SealDesign | null {
  if (!svg) return null;
  const m = /data-fuin-design="([^"]*)"/.exec(svg);
  if (!m) return null;
  try {
    return { ...defaultDesign(), ...(JSON.parse(decodeURIComponent(m[1])) as Partial<SealDesign>), v: 1 };
  } catch {
    return null;
  }
}

export function randomDesign(kanji?: string | null): SealDesign {
  const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
  const chars = [...(kanji || '封印結界').replace(/\s/g, '')];
  const orns = ORNAMENTS.map((o) => o.key).sort(() => Math.random() - 0.5).slice(0, Math.floor(Math.random() * 3));
  const withSymbol = Math.random() < 0.55;
  return {
    v: 1,
    frame: pick(FRAMES.slice(1)).key,
    ring: pick(['kanji', 'ticks', 'both', 'both'] as const),
    ringText: (kanji || '封 印 結 界').trim(),
    ornaments: orns,
    symbol: withSymbol ? pick(SYMBOLS).key : null,
    symbolScale: withSymbol ? 0.8 + Math.random() * 0.4 : 1,
    glyph: withSymbol && Math.random() < 0.6 ? '' : pick(chars),
    glyphScale: withSymbol ? 0.6 : 1,
    color: pick(COLORS.slice(0, 4)).value,
    stroke: Math.round((1.4 + Math.random() * 1.4) * 10) / 10,
    rotation: pick([0, 0, 0, 15, 22.5, 45]),
  };
}
