// Moteur de dessin des sceaux : une description simple (contour, anneau, ornements, symbole,
// kanji central, couleur) devient un SVG. La description est rangée dans l'attribut
// data-fuin-design du SVG pour pouvoir rouvrir le sceau dans le créateur.

import { SYMBOLS } from './sealSymbols';

export { SYMBOLS, SYMBOL_CATEGORIES, type SymbolCategory } from './sealSymbols';

export interface SealDesign {
  v: 1;
  frame: string;
  /** clé d'un anneau de RINGS (les anciennes valeurs none, kanji, ticks et both restent valables) */
  ring: string;
  ringText: string;
  ornaments: string[];
  symbol: string | null;
  symbolScale: number;
  /** kanjis du centre (jusqu'à 6), lus comme un sceau japonais : colonnes de droite à gauche */
  glyph: string;
  glyphScale: number;
  glyphLayout?: GlyphLayout;
  color: string;
  stroke: number;
  rotation: number;
}

export type GlyphLayout = 'auto' | 'column' | 'row' | 'circle';

export const GLYPH_LAYOUTS: { key: GlyphLayout; label: string; hint: string }[] = [
  { key: 'auto', label: 'Auto', hint: 'La disposition la plus équilibrée selon le nombre de kanjis' },
  { key: 'column', label: 'Colonnes', hint: 'De haut en bas, colonnes de droite à gauche (lecture japonaise)' },
  { key: 'row', label: 'Lignes', hint: 'De gauche à droite, lignes de haut en bas' },
  { key: 'circle', label: 'En cercle', hint: 'Autour du centre, en partant du haut' },
];

export const MAX_GLYPHS = 6;

/** Kanjis du centre, sans espaces, 6 au plus. */
export const glyphChars = (s: string): string[] => [...(s || '').replace(/\s+/g, '')].slice(0, MAX_GLYPHS);

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

const rad = (deg: number) => (deg * Math.PI) / 180;
/** point « x y » à `r` du centre, angle en degrés (0 = droite, -90 = haut) */
const P = (r: number, deg: number) => `${n(C + r * Math.cos(rad(deg)))} ${n(C + r * Math.sin(rad(deg)))}`;
const circle = (r: number, w?: number, extra = '') =>
  `<circle cx="${C}" cy="${C}" r="${r}"${w !== undefined ? ` stroke-width="${n(w)}"` : ''}${extra}/>`;
/** courbe fermée dont le rayon varie avec l'angle */
function polar(fn: (deg: number) => number, steps = 360, w?: number): string {
  const p: string[] = [];
  for (let i = 0; i < steps; i++) {
    const deg = (i / steps) * 360 - 90;
    p.push(P(fn(deg), deg));
  }
  return `<path d="M${p.join(' L')} Z"${w !== undefined ? ` stroke-width="${n(w)}"` : ''}/>`;
}
/** même motif répété autour du centre (dessiné en haut, puis tourné) */
const around = (count: number, shape: string, offset = 0) =>
  Array.from({ length: count }, (_, i) => `<g transform="rotate(${n(offset + (i * 360) / count)} ${C} ${C})">${shape}</g>`).join('');
const dotsAround = (count: number, r: number, size: number, color: string, offset = 0) =>
  Array.from({ length: count }, (_, i) => {
    const deg = offset - 90 + (i * 360) / count;
    const [x, y] = P(r, deg).split(' ');
    return `<circle cx="${x}" cy="${y}" r="${size}" fill="${color}" stroke="none"/>`;
  }).join('');

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Contours
// ---------------------------------------------------------------------------
/** `fixed` : contour qui ne tourne jamais (ses coins sortiraient du sceau) */
export const FRAMES: { key: string; label: string; fixed?: boolean; draw: (sw: number, color: string) => string }[] = [
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
    fixed: true,
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
  {
    key: 'triple',
    label: 'Triple cercle',
    draw: (sw) => circle(97) + circle(93.6, sw * 0.5) + circle(90.8, sw * 0.35),
  },
  { key: 'beaded', label: 'Cercle perlé', draw: (_sw, color) => circle(91) + dotsAround(60, 96.5, 1.5, color) },
  {
    key: 'scalloped',
    label: 'Festonné',
    draw: () => {
      const k = 24;
      let d = `M${P(91, -90)}`;
      for (let i = 1; i <= k; i++) d += ` A13 13 0 0 1 ${P(91, -90 + (i * 360) / k)}`;
      return `<path d="${d} Z"/>`;
    },
  },
  {
    key: 'gear',
    label: 'Engrenage',
    draw: () => {
      const p: string[] = [];
      for (let i = 0; i < 20; i++) {
        const a = -90 + i * 18;
        p.push(P(88, a), P(97, a + 3), P(97, a + 10), P(88, a + 13));
      }
      return `<path d="M${p.join(' L')} Z"/>`;
    },
  },
  { key: 'pentagon', label: 'Pentagone', draw: () => `<polygon points="${pts(5, 98)}"/>` },
  { key: 'dodecagon', label: 'Dodécagone', draw: () => `<polygon points="${pts(12, 96, -75)}"/>` },
  {
    key: 'rounded',
    label: 'Carré arrondi',
    fixed: true,
    draw: (sw) => `<rect x="8" y="8" width="184" height="184" rx="38"/><rect x="15" y="15" width="170" height="170" rx="32" stroke-width="${n(sw * 0.5)}"/>`,
  },
  {
    key: 'brackets',
    label: 'Crochets',
    fixed: true,
    draw: (sw) =>
      `<path d="M8 46 V8 H46 M154 8 H192 V46 M192 154 V192 H154 M46 192 H8 V154"/>` + circle(92, sw * 0.5),
  },
  {
    key: 'lotus',
    label: 'Lotus',
    draw: () =>
      circle(84) +
      around(
        16,
        `<path d="M${C} ${C - 84} C${C + 13} ${C - 86} ${C + 9} ${C - 96} ${C} ${C - 99} C${C - 9} ${C - 96} ${C - 13} ${C - 86} ${C} ${C - 84} Z"/>`,
      ),
  },
  {
    key: 'flames',
    label: 'Couronne de flammes',
    draw: () =>
      circle(86) +
      around(18, `<path d="M${C - 6} ${C - 86} Q${C - 7} ${C - 93} ${C + 1} ${C - 99} Q${C} ${C - 92} ${C + 6} ${C - 86}"/>`),
  },
  { key: 'wave', label: 'Onde', draw: () => polar((deg) => 93 + 3.2 * Math.sin(rad(deg + 90) * 20)) },
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
  { key: 'inner-double', label: 'Double cercle', draw: (sw) => circle(66) + circle(61, sw * 0.5) },
  { key: 'beads-inner', label: 'Perles', draw: (_sw, color) => dotsAround(24, 66, 1.7, color) },
  {
    key: 'pentagram',
    label: 'Pentacle',
    draw: () => `<polygon points="${[0, 2, 4, 1, 3].map((i) => P(66, -90 + i * 72).replace(' ', ',')).join(' ')}"/>`,
  },
  { key: 'octagram', label: 'Étoile à huit', draw: () => `<polygon points="${pts(4, 66)}"/><polygon points="${pts(4, 66, -45)}"/>` },
  { key: 'pentagon', label: 'Pentagone', draw: () => `<polygon points="${pts(5, 66)}"/>` },
  { key: 'triangle-down', label: 'Triangle inversé', draw: () => `<polygon points="${pts(3, 66, 90)}"/>` },
  {
    key: 'nested',
    label: 'Carrés imbriqués',
    draw: () => `<polygon points="${pts(4, 66, -45)}"/><polygon points="${pts(4, 47)}"/><polygon points="${pts(4, 33, -45)}"/>`,
  },
  { key: 'spokes', label: 'Rayons longs', draw: () => around(8, `<line x1="${C}" y1="${C - 22}" x2="${C}" y2="${C - 66}"/>`) },
  {
    key: 'web',
    label: 'Toile',
    draw: (sw) =>
      around(8, `<line x1="${C}" y1="${C}" x2="${C}" y2="${C - 66}"/>`) +
      [26, 46, 66].map((r) => `<polygon points="${pts(8, r)}" stroke-width="${n(sw * 0.6)}"/>`).join(''),
  },
  {
    key: 'flower',
    label: 'Fleur de vie',
    draw: (sw) => `<g stroke-width="${n(sw * 0.7)}">${circle(32)}${around(6, `<circle cx="${C}" cy="${C - 32}" r="32"/>`)}</g>`,
  },
  { key: 'six-circles', label: 'Six cercles', draw: () => around(6, `<circle cx="${C}" cy="${C - 56}" r="9"/>`) },
  {
    key: 'diamonds',
    label: 'Losanges',
    draw: () => around(8, `<path d="M${C} ${C - 66} L${C + 5} ${C - 58} L${C} ${C - 50} L${C - 5} ${C - 58} Z"/>`, 22.5),
  },
  {
    key: 'arcs',
    label: 'Arcs',
    draw: () => around(4, `<path d="M${P(58, -120)} A58 58 0 0 1 ${P(58, -60)}"/>`, 45),
  },
  {
    key: 'crescents',
    label: 'Croissants',
    draw: () =>
      around(4, `<path d="M${C - 9} ${C - 64} A10 10 0 1 0 ${C + 9} ${C - 64} A13 13 0 0 1 ${C - 9} ${C - 64} Z"/>`, 45),
  },
  {
    key: 'tomoe',
    label: 'Virgules',
    draw: (_sw, color) =>
      around(
        3,
        `<circle cx="${C}" cy="${C - 58}" r="6.5" fill="${color}" stroke="none"/><path d="M${C + 6} ${C - 56} Q${C + 6} ${C - 40} ${C - 10} ${C - 36}"/>`,
      ),
  },
  {
    key: 'eyes',
    label: 'Yeux',
    draw: (_sw, color) =>
      around(
        4,
        `<path d="M${C - 11} ${C - 58} Q${C} ${C - 67} ${C + 11} ${C - 58} Q${C} ${C - 49} ${C - 11} ${C - 58} Z"/><circle cx="${C}" cy="${C - 58}" r="2.6" fill="${color}" stroke="none"/>`,
        45,
      ),
  },
];

// ---------------------------------------------------------------------------
// Anneaux (entre les ornements et le contour, rayon 70 à 92)
// ---------------------------------------------------------------------------
function ticks(sw: number, inner: number): string {
  return Array.from({ length: 72 }, (_, i) => {
    const a = i * 5 - 90;
    return `<line x1="${P(inner, a).replace(' ', '" y1="')}" x2="${P(inner + (i % 6 === 0 ? 6 : 3.5), a).replace(' ', '" y2="')}" stroke-width="${n(i % 6 === 0 ? sw * 0.8 : sw * 0.45)}"/>`;
  }).join('');
}

export interface RingContext {
  sw: number;
  color: string;
  /** kanjis de la formule écrits sur le cercle (rayon 79) */
  text: () => string;
}

/** `text` : l'anneau écrit la formule de kanjis */
export const RINGS: { key: string; label: string; text?: boolean; draw: (c: RingContext) => string }[] = [
  { key: 'none', label: 'Aucun', draw: () => '' },
  { key: 'kanji', label: 'Kanjis', text: true, draw: ({ sw, text }) => text() + circle(75, sw * 0.5) },
  { key: 'ticks', label: 'Graduations', draw: ({ sw }) => ticks(sw, 80) },
  { key: 'both', label: 'Kanjis et graduations', text: true, draw: ({ sw, text }) => text() + circle(75, sw * 0.5) + ticks(sw, 69) },
  {
    key: 'kanji-framed',
    label: 'Kanjis encadrés',
    text: true,
    draw: ({ sw, text }) => text() + circle(75, sw * 0.5) + circle(91.5, sw * 0.5),
  },
  {
    key: 'kanji-beads',
    label: 'Kanjis et perles',
    text: true,
    draw: ({ sw, color, text }) => text() + circle(75, sw * 0.5) + dotsAround(36, 70.5, 1.4, color),
  },
  { key: 'beads', label: 'Perles', draw: ({ color }) => dotsAround(48, 81, 2.1, color) },
  {
    key: 'rosary',
    label: 'Chapelet',
    draw: ({ sw, color }) =>
      `<g stroke-width="${n(sw * 0.6)}">${around(24, `<circle cx="${C}" cy="${C - 81}" r="3.4"/>`)}</g>` + dotsAround(24, 81, 1.4, color, 7.5),
  },
  {
    key: 'chain',
    label: 'Chaîne',
    draw: ({ sw }) =>
      `<g stroke-width="${n(sw * 0.6)}">` +
      around(24, `<ellipse cx="${C}" cy="${C - 81}" rx="8.2" ry="3.3"/>`) +
      around(24, `<ellipse cx="${C}" cy="${C - 81}" rx="3.4" ry="1.6"/>`, 7.5) +
      `</g>`,
  },
  { key: 'waves', label: 'Vagues', draw: ({ sw }) => polar((deg) => 81 + 3.4 * Math.sin(rad(deg + 90) * 24), 480, sw * 0.7) },
  {
    key: 'rope',
    label: 'Corde',
    draw: ({ sw }) =>
      polar((deg) => 81 + 3 * Math.sin(rad(deg + 90) * 36), 540, sw * 0.6) +
      polar((deg) => 81 - 3 * Math.sin(rad(deg + 90) * 36), 540, sw * 0.6),
  },
  {
    key: 'zigzag',
    label: 'Dents de scie',
    draw: ({ sw }) => {
      const p = Array.from({ length: 72 }, (_, i) => P(i % 2 ? 86 : 76, -90 + i * 5));
      return `<path d="M${p.join(' L')} Z" stroke-width="${n(sw * 0.7)}"/>`;
    },
  },
  {
    key: 'crenel',
    label: 'Créneaux',
    draw: ({ sw }) => {
      const p: string[] = [];
      for (let i = 0; i < 40; i++) {
        const r = i % 2 ? 85 : 77;
        p.push(P(r, -90 + i * 9), P(r, -90 + (i + 1) * 9));
      }
      return `<path d="M${p.join(' L')} Z" stroke-width="${n(sw * 0.7)}"/>`;
    },
  },
  {
    key: 'dashes',
    label: 'Tirets',
    draw: ({ sw }) => circle(82, sw, ' stroke-dasharray="9 6"') + circle(76, sw * 0.4),
  },
  { key: 'double-line', label: 'Double filet', draw: ({ sw }) => circle(84, sw * 0.7) + circle(78, sw * 0.45) },
  {
    key: 'petals',
    label: 'Pétales',
    draw: ({ sw }) =>
      `<g stroke-width="${n(sw * 0.6)}">${around(32, `<path d="M${C} ${C - 75} Q${C + 4.5} ${C - 81} ${C} ${C - 88} Q${C - 4.5} ${C - 81} ${C} ${C - 75} Z"/>`)}</g>`,
  },
  {
    key: 'flames',
    label: 'Flammes',
    draw: ({ sw }) =>
      circle(75, sw * 0.5) +
      `<g stroke-width="${n(sw * 0.7)}">${around(18, `<path d="M${C - 5} ${C - 75} C${C - 7} ${C - 81} ${C - 2} ${C - 85} ${C} ${C - 91} C${C + 2} ${C - 85} ${C + 7} ${C - 81} ${C + 5} ${C - 75} Z"/>`)}</g>`,
  },
  {
    key: 'stars',
    label: 'Étoiles',
    draw: ({ color }) =>
      around(12, `<path d="M${C} ${C - 87} L${C + 1.8} ${C - 82.8} L${C + 6} ${C - 81} L${C + 1.8} ${C - 79.2} L${C} ${C - 75} L${C - 1.8} ${C - 79.2} L${C - 6} ${C - 81} L${C - 1.8} ${C - 82.8} Z" fill="${color}" stroke="none"/>`) +
      dotsAround(12, 81, 1.3, color, 15),
  },
  {
    key: 'trigrams',
    label: 'Trigrammes',
    draw: ({ sw, color }) =>
      TRIGRAMS.map((t, i) => {
        const lines = t
          .split('')
          .map((bit, j) => {
            const y = C - 76 - j * 5;
            return bit === '1'
              ? `<line x1="${C - 7}" y1="${y}" x2="${C + 7}" y2="${y}"/>`
              : `<line x1="${C - 7}" y1="${y}" x2="${C - 1.6}" y2="${y}"/><line x1="${C + 1.6}" y1="${y}" x2="${C + 7}" y2="${y}"/>`;
          })
          .join('');
        return `<g transform="rotate(${i * 45} ${C} ${C})" stroke-width="${n(sw * 0.8)}">${lines}</g>`;
      }).join('') + dotsAround(8, 81, 1.6, color, 22.5),
  },
];

// ---------------------------------------------------------------------------
// Kanjis du centre : position et taille de chaque caractère (par rapport au centre)
// ---------------------------------------------------------------------------
type Slot = { x: number; y: number; size: number };

/** Groupes de caractères : colonnes (droite → gauche) ou lignes (haut → bas), centrés. */
function gridSlots(groups: number[], vertical: boolean): Slot[] {
  const k = groups.length;
  const m = Math.max(...groups);
  const pitch = Math.min(70, 116 / Math.hypot(k, m));
  const size = Math.min(66, pitch * 0.92);
  const out: Slot[] = [];
  groups.forEach((count, j) => {
    for (let i = 0; i < count; i++) {
      const along = (i - (count - 1) / 2) * pitch;
      const across = vertical ? ((k - 1) / 2 - j) * pitch : (j - (k - 1) / 2) * pitch;
      out.push(vertical ? { x: across, y: along, size } : { x: along, y: across, size });
    }
  });
  return out;
}

const split = (count: number) => (count <= 3 ? [count] : [Math.ceil(count / 2), Math.floor(count / 2)]);

function glyphSlots(count: number, layout: GlyphLayout): Slot[] {
  if (count <= 0) return [];
  if (count === 1) return [{ x: 0, y: 0, size: 66 }];
  if (layout === 'circle') {
    const r = count === 2 ? 24 : count === 3 ? 27 : 31;
    const size = count <= 3 ? 34 : count === 4 ? 30 : 26;
    return Array.from({ length: count }, (_, i) => {
      const a = rad(-90 + (i * 360) / count);
      return { x: r * Math.cos(a), y: r * Math.sin(a), size };
    });
  }
  if (layout === 'row') return gridSlots(split(count), false);
  if (layout === 'auto' && count === 3) {
    // trois kanjis : un en haut, deux en bas (lus de droite à gauche)
    return [
      { x: 0, y: -22, size: 38 },
      { x: 23, y: 18, size: 38 },
      { x: -23, y: 18, size: 38 },
    ];
  }
  return gridSlots(split(count), true);
}

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
    glyphLayout: 'auto',
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

  // Anneau extérieur
  const ringDef = RINGS.find((r) => r.key === d.ring) ?? RINGS[0];
  const text = () => {
    if (!d.ringText.trim()) return '';
    const unit = [...d.ringText.replace(/\s+/g, '')].join(' ');
    const reps = Math.max(1, Math.round(24 / Math.max(1, unit.replace(/\s/g, '').length + 1)));
    // chaque répétition est suivie d'un point, y compris la dernière : la jonction à gauche
    // du cercle garde ainsi son séparateur ; l'espace insécable final occupe le reste du tour
    const t = Array.from({ length: reps }, () => `${unit} ·`).join(' ') + '\u00a0';
    return (
      `<path id="${id}" d="M${C} ${C} m-79 0 a79 79 0 1 1 158 0 a79 79 0 1 1 -158 0" fill="none" stroke="none"/>` +
      `<text font-family="${FONT}" font-size="13" fill="${color}" stroke="none"><textPath href="#${id}" startOffset="0" textLength="494" lengthAdjust="spacing">${esc(t)}</textPath></text>`
    );
  };
  const ring = ringDef.draw({ sw, color, text });

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

  // kanjis du centre : chacun est centré sur sa case d'après son encre réelle
  const chars = glyphChars(d.glyph);
  const scale = Math.max(0.3, Math.min(1.8, d.glyphScale || 1));
  const glyph = glyphSlots(chars.length, d.glyphLayout ?? 'auto')
    .map((slot, i) => {
      const size = slot.size * scale;
      const off = glyphOffset(chars[i], size);
      return `<text x="${n(C + slot.x * scale + off.dx)}" y="${n(C + slot.y * scale + off.dy)}" text-anchor="middle" font-family="${FONT}" font-size="${n(size)}" fill="${color}" stroke="none">${esc(chars[i])}</text>`;
    })
    .join('');

  const rot = d.rotation ? ` transform="rotate(${n(d.rotation)} ${C} ${C})"` : '';
  // le carré reste droit : tourné, ses coins sortiraient du sceau
  const frameRot = frame.fixed ? '' : rot;
  const attr = embed ? ` data-fuin-design="${encodeURIComponent(json)}"` : '';

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200" class="fuin-seal"${attr}>` +
    `<g fill="none" stroke="${color}" stroke-width="${n(sw)}" stroke-linecap="round" stroke-linejoin="round">` +
    `<g class="fs-frame"${frameRot}>${frame.draw(sw, color)}</g>` +
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
    return reviveDesign(JSON.parse(decodeURIComponent(m[1])));
  } catch {
    return null;
  }
}

/** Recompose un visuel complet à partir d'un objet partiel (brouillon, ancien visuel). */
export function reviveDesign(raw: unknown): SealDesign | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return { ...defaultDesign(), ...(raw as Partial<SealDesign>), v: 1 };
}

export function randomDesign(kanji?: string | null): SealDesign {
  const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
  const chars = [...(kanji || '封印結界').replace(/\s/g, '')];
  const orns = ORNAMENTS.map((o) => o.key).sort(() => Math.random() - 0.5).slice(0, Math.floor(Math.random() * 3));
  const withSymbol = Math.random() < 0.55;
  return {
    v: 1,
    frame: pick(FRAMES.slice(1)).key,
    ring: Math.random() < 0.4 ? 'both' : pick(RINGS.slice(1)).key,
    ringText: (kanji || '封 印 結 界').trim(),
    ornaments: orns,
    symbol: withSymbol ? pick(SYMBOLS).key : null,
    symbolScale: withSymbol ? 0.8 + Math.random() * 0.4 : 1,
    glyph: withSymbol && Math.random() < 0.6 ? '' : Math.random() < 0.3 ? chars.slice(0, 2 + Math.floor(Math.random() * 3)).join('') : pick(chars),
    glyphScale: withSymbol ? 0.6 : 1,
    glyphLayout: 'auto',
    color: pick(COLORS.slice(0, 4)).value,
    stroke: Math.round((1.4 + Math.random() * 1.4) * 10) / 10,
    rotation: pick([0, 0, 0, 15, 22.5, 45]),
  };
}
