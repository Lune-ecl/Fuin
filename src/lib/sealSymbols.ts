// Symboles centraux du créateur de sceaux, dessinés dans une boîte 100 × 100.
// Le trait (couleur, épaisseur) vient du groupe parent ; seuls les points pleins
// reçoivent la couleur `c` en remplissage.

export interface SealSymbol {
  key: string;
  label: string;
  cat: SymbolCategory;
  svg: (color: string) => string;
  /** autres mots qui retrouvent le symbole à la recherche */
  tags?: string;
}

export type SymbolCategory = 'corps' | 'coeurs' | 'visages' | 'esprits' | 'elements' | 'astres' | 'armes' | 'nature' | 'reperes' | 'mystique';

export const SYMBOL_CATEGORIES: { key: SymbolCategory; label: string }[] = [
  { key: 'corps', label: 'Corps & esprit' },
  { key: 'coeurs', label: 'Cœurs' },
  { key: 'visages', label: 'Visages & masques' },
  { key: 'esprits', label: 'Esprits & défunts' },
  { key: 'elements', label: 'Éléments' },
  { key: 'astres', label: 'Astres' },
  { key: 'armes', label: 'Armes & liens' },
  { key: 'nature', label: 'Nature & bêtes' },
  { key: 'reperes', label: 'Repères & signes' },
  { key: 'mystique', label: 'Sacré & mystique' },
];

const n = (x: number) => Math.round(x * 100) / 100;
const rad = (deg: number) => (deg * Math.PI) / 180;
const pt = (r: number, deg: number, cx = 50, cy = 50) => `${n(cx + r * Math.cos(rad(deg)))} ${n(cy + r * Math.sin(rad(deg)))}`;
const dot = (x: number, y: number, r: number, c: string) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" stroke="none"/>`;
const EYE = 'M8 50 Q50 14 92 50 Q50 86 8 50 Z';
const HEART = 'M50 86 C20 64 10 48 14 32 C18 18 38 14 50 30 C62 14 82 18 86 32 C90 48 80 64 50 86 Z';

/** Polygone régulier (ou étoile si `inner` est donné). */
function poly(count: number, r: number, start = -90, inner?: number): string {
  const pts: string[] = [];
  const total = inner ? count * 2 : count;
  for (let i = 0; i < total; i++) {
    const rr = inner && i % 2 ? inner : r;
    pts.push(pt(rr, start + (i * 360) / total));
  }
  return `<path d="M${pts.join(' L')} Z"/>`;
}

/** Répète un motif autour du centre. */
function around(count: number, shape: string, offset = 0): string {
  return Array.from({ length: count }, (_, i) => `<g transform="rotate(${n(offset + (i * 360) / count)} 50 50)">${shape}</g>`).join('');
}

function spiral(): string {
  const p: string[] = [];
  for (let i = 0; i <= 120; i++) {
    const t = (i / 120) * Math.PI * 6;
    const r = 2 + t * 2.1;
    p.push(`${n(50 + r * Math.cos(t))},${n(50 + r * Math.sin(t))}`);
  }
  return `<polyline points="${p.join(' ')}"/>`;
}

/** spirale autour de (cx, cy) : `turns` tours, rayon qui grandit de `growth` par radian */
function spiralAt(cx: number, cy: number, turns: number, growth: number, flip = false): string {
  const p: string[] = [];
  const steps = Math.round(turns * 40);
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2 * turns;
    const r = 1 + t * growth;
    p.push(`${n(cx + (flip ? -1 : 1) * r * Math.cos(t))},${n(cy + r * Math.sin(t))}`);
  }
  return `<polyline points="${p.join(' ')}"/>`;
}

function squareSpiral(): string {
  const p: [number, number][] = [[50, 50]];
  let x = 50;
  let y = 50;
  let step = 1;
  const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  for (let i = 0; i < 13; i++) {
    const [dx, dy] = dirs[i % 4];
    x += dx * step;
    y += dy * step;
    p.push([x, y]);
    if (i % 2 === 1) step += 1;
  }
  // recadre la spirale pour qu'elle remplisse la boîte
  const xs = p.map(([a]) => a);
  const ys = p.map(([, b]) => b);
  const k = 80 / Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const ox = (Math.max(...xs) + Math.min(...xs)) / 2;
  const oy = (Math.max(...ys) + Math.min(...ys)) / 2;
  return `<polyline points="${p.map(([a, b]) => `${n(50 + (a - ox) * k)},${n(50 + (b - oy) * k)}`).join(' ')}"/>`;
}

function web(): string {
  let s = around(8, '<path d="M50 50 V8"/>');
  for (const r of [12, 24, 36]) {
    const pts = Array.from({ length: 8 }, (_, i) => pt(r, -90 + i * 45));
    s += `<path d="M${pts.join(' L')} Z"/>`;
  }
  return s;
}

function snowflake(): string {
  return around(6, '<path d="M50 50 V10 M50 24 L40 16 M50 24 L60 16 M50 36 L43 30 M50 36 L57 30"/>');
}

function bagua(): string {
  let s = poly(8, 44, -90 + 22.5) + '<circle cx="50" cy="50" r="12"/>';
  for (let i = 0; i < 8; i++) {
    const a = -90 + i * 45;
    for (const [j, r] of [24, 29, 34].entries()) {
      const broken = (i + j) % 3 === 0;
      const t = rad(a + 90);
      const cx = 50 + r * Math.cos(rad(a));
      const cy = 50 + r * Math.sin(rad(a));
      const h = 7;
      if (broken) {
        s += `<path d="M${n(cx - h * Math.cos(t))} ${n(cy - h * Math.sin(t))} L${n(cx - 1.8 * Math.cos(t))} ${n(cy - 1.8 * Math.sin(t))} M${n(cx + 1.8 * Math.cos(t))} ${n(cy + 1.8 * Math.sin(t))} L${n(cx + h * Math.cos(t))} ${n(cy + h * Math.sin(t))}"/>`;
      } else {
        s += `<path d="M${n(cx - h * Math.cos(t))} ${n(cy - h * Math.sin(t))} L${n(cx + h * Math.cos(t))} ${n(cy + h * Math.sin(t))}"/>`;
      }
    }
  }
  return s;
}

function rays(cx: number, cy: number, r1: number, r2: number, from: number, to: number, count: number): string {
  return Array.from({ length: count }, (_, i) => {
    const a = from + ((to - from) * i) / (count - 1);
    return `<path d="M${pt(r1, a, cx, cy)} L${pt(r2, a, cx, cy)}"/>`;
  }).join('');
}


// ---------------------------------------------------------------- formes réutilisables
/** cœur centré en (cx, cy), à l'échelle k (k = 1 : le grand cœur) */
function heart(cx: number, cy: number, k: number): string {
  const P = (x: number, y: number) => `${n(cx + (x - 50) * k)} ${n(cy + (y - 52) * k)}`;
  return `<path d="M${P(50, 86)} C${P(20, 64)} ${P(10, 48)} ${P(14, 32)} C${P(18, 18)} ${P(38, 14)} ${P(50, 30)} C${P(62, 14)} ${P(82, 18)} ${P(86, 32)} C${P(90, 48)} ${P(80, 64)} ${P(50, 86)} Z"/>`;
}

/** goutte pointe en haut, ventre centré en (cx, cy) */
function drop(cx: number, cy: number, r: number, fill = 'none'): string {
  return `<path d="M${n(cx)} ${n(cy - 2.2 * r)} C${n(cx + 0.6 * r)} ${n(cy - r)} ${n(cx + r)} ${n(cy - 0.3 * r)} ${n(cx + r)} ${n(cy + 0.2 * r)} A${r} ${r} 0 0 1 ${n(cx - r)} ${n(cy + 0.2 * r)} C${n(cx - r)} ${n(cy - 0.3 * r)} ${n(cx - 0.6 * r)} ${n(cy - r)} ${n(cx)} ${n(cy - 2.2 * r)} Z"${fill !== 'none' ? ` fill="${fill}" stroke="none"` : ''}/>`;
}

/** repère de carte : tête ronde en (cx, cy), pointe vers le bas */
function pin(cx: number, cy: number, r: number): string {
  return `<path d="M${n(cx)} ${n(cy + 2.3 * r)} C${n(cx - 0.35 * r)} ${n(cy + 1.6 * r)} ${n(cx - r)} ${n(cy + 0.9 * r)} ${n(cx - r)} ${n(cy)} A${r} ${r} 0 0 1 ${n(cx + r)} ${n(cy)} C${n(cx + r)} ${n(cy + 0.9 * r)} ${n(cx + 0.35 * r)} ${n(cy + 1.6 * r)} ${n(cx)} ${n(cy + 2.3 * r)} Z"/>`;
}

/** petit fantôme : tête en (cx, cy), demi-largeur s */
function ghost(cx: number, cy: number, s: number, c: string): string {
  const L = (x: number, y: number) => `L${n(cx + x * s)} ${n(cy + y * s)}`;
  return (
    `<path d="M${n(cx - s)} ${n(cy + 2 * s)} V${n(cy)} A${s} ${s} 0 0 1 ${n(cx + s)} ${n(cy)} V${n(cy + 2 * s)} ${L(2 / 3, 1.6)} ${L(1 / 3, 2)} ${L(0, 1.6)} ${L(-1 / 3, 2)} ${L(-2 / 3, 1.6)} Z"/>` +
    dot(n(cx - 0.38 * s), n(cy + 0.05 * s), n(0.17 * s), c) +
    dot(n(cx + 0.38 * s), n(cy + 0.05 * s), n(0.17 * s), c)
  );
}

/** petite flamme : base ronde en (cx, cy), hauteur ~3s */
function flameAt(cx: number, cy: number, s: number): string {
  return `<path d="M${n(cx)} ${n(cy - 2.2 * s)} C${n(cx + 0.9 * s)} ${n(cy - s)} ${n(cx + 1.1 * s)} ${n(cy - 0.2 * s)} ${n(cx + s)} ${n(cy + 0.2 * s)} A${s} ${s} 0 0 1 ${n(cx - s)} ${n(cy + 0.2 * s)} C${n(cx - 1.1 * s)} ${n(cy - 0.2 * s)} ${n(cx - 0.9 * s)} ${n(cy - s)} ${n(cx)} ${n(cy - 2.2 * s)} Z"/>`;
}

/** arc de cercle (sens horaire) terminé par une pointe de flèche */
function arcArrow(r: number, a0: number, a1: number): string {
  const large = (((a1 - a0) % 360) + 360) % 360 > 180 ? 1 : 0;
  const [ex, ey] = pt(r, a1).split(' ').map(Number);
  const head = (da: number) => `M${n(ex)} ${n(ey)} L${n(ex + 9 * Math.cos(rad(a1 - 90 + da)))} ${n(ey + 9 * Math.sin(rad(a1 - 90 + da)))}`;
  return `<path d="M${pt(r, a0)} A${r} ${r} 0 ${large} 1 ${pt(r, a1)}"/><path d="${head(35)} ${head(-35)}"/>`;
}

/** étoile en polygone étoilé {count/step} inscrite dans un cercle de rayon r */
function starPolygon(count: number, step: number, r: number, start = -90): string {
  const pts = Array.from({ length: count }, (_, i) => pt(r, start + ((i * step) % count) * (360 / count)));
  return `<path d="M${pts.join(' L')} Z"/>`;
}

/** nuage posé sur une ligne horizontale à la hauteur y */
const CLOUD = 'M24 54 A14 14 0 0 1 28 27 A19 19 0 0 1 64 22 A15 15 0 0 1 78 54 Z';

export const SYMBOLS: SealSymbol[] = [
  // ---------------------------------------------------------------- Corps & esprit
  {
    key: 'eye',
    label: 'Œil',
    cat: 'corps',
    svg: (c) => `<path d="${EYE}"/><circle cx="50" cy="50" r="14"/>${dot(50, 50, 5, c)}`,
  },
  {
    key: 'eye-crossed',
    label: 'Œil barré',
    cat: 'corps',
    svg: (c) => `<path d="${EYE}"/><circle cx="50" cy="50" r="14"/>${dot(50, 50, 5, c)}<path d="M14 86 L86 14"/>`,
  },
  {
    key: 'eye-closed',
    label: 'Œil clos',
    cat: 'corps',
    svg: () => `<path d="M8 44 Q50 80 92 44"/><path d="M22 58 L15 68 M36 66 L32 77 M50 68 V80 M64 66 L68 77 M78 58 L85 68"/>`,
  },
  {
    key: 'third-eye',
    label: 'Troisième œil',
    cat: 'corps',
    svg: (c) => `<path d="M50 6 Q82 50 50 94 Q18 50 50 6 Z"/><circle cx="50" cy="50" r="12"/>${dot(50, 50, 4.5, c)}`,
  },
  {
    key: 'snake-eye',
    label: 'Œil reptilien',
    cat: 'corps',
    svg: (c) => `<path d="${EYE}"/><circle cx="50" cy="50" r="22"/><path d="M50 30 Q58 50 50 70 Q42 50 50 30 Z" fill="${c}" stroke="none"/>`,
  },
  {
    key: 'eye-triangle',
    label: 'Œil du triangle',
    cat: 'corps',
    svg: (c) => `<path d="M50 8 L92 84 H8 Z"/><path d="M28 62 Q50 42 72 62 Q50 82 28 62 Z"/>${dot(50, 62, 5, c)}`,
  },
  {
    key: 'hand',
    label: 'Main',
    cat: 'corps',
    svg: () =>
      `<path d="M30 58 V40 M40 54 V24 M50 52 V18 M60 54 V24 M70 58 V36"/><path d="M28 56 C26 78 36 92 52 92 C66 92 74 80 72 56"/><path d="M28 56 Q22 48 16 52 Q24 64 30 70"/>`,
  },
  {
    key: 'hand-eye',
    label: 'Main à l’œil',
    cat: 'corps',
    svg: (c) =>
      `<path d="M30 50 V30 M40 46 V16 M50 44 V10 M60 46 V16 M70 50 V28"/><path d="M28 48 C24 76 34 92 50 92 C66 92 76 76 72 48"/><path d="M36 68 Q50 56 64 68 Q50 80 36 68 Z"/>${dot(50, 68, 3.5, c)}`,
  },
  { key: 'heart', label: 'Cœur', cat: 'coeurs', svg: () => `<path d="${HEART}"/>` },
  {
    key: 'heart-pierced',
    label: 'Cœur transpercé',
    cat: 'coeurs',
    svg: () => `<path d="${HEART}"/><path d="M8 82 L92 18 M92 18 L78 19 M92 18 L89 31 M8 82 L10 72 M8 82 L18 81"/>`,
  },
  {
    key: 'mouth-sewn',
    label: 'Bouche cousue',
    cat: 'corps',
    svg: () =>
      `<path d="M8 50 Q28 30 50 38 Q72 30 92 50 Q72 72 50 66 Q28 72 8 50 Z"/><path d="M8 50 H92"/><path d="M24 42 L32 58 M32 42 L24 58 M46 40 L54 60 M54 40 L46 60 M68 42 L76 58 M76 42 L68 58"/>`,
  },
  {
    key: 'skull',
    label: 'Crâne',
    cat: 'esprits',
    svg: (c) =>
      `<path d="M26 54 A24 24 0 1 1 74 54 V66 H64 V78 H36 V66 H26 Z"/>${dot(40, 50, 7, c)}${dot(60, 50, 7, c)}<path d="M47 64 L50 58 L53 64 Z M44 70 V78 M50 70 V78 M56 70 V78"/>`,
  },
  {
    key: 'mask',
    label: 'Masque',
    cat: 'visages',
    svg: () =>
      `<path d="M20 20 Q50 4 80 20 V52 Q80 84 50 92 Q20 84 20 52 Z"/><path d="M28 44 Q37 34 46 44 Q37 50 28 44 Z M54 44 Q63 34 72 44 Q63 50 54 44 Z"/><path d="M40 72 Q50 66 60 72"/><path d="M26 56 L34 62 M74 56 L66 62"/>`,
  },
  {
    key: 'kitsune',
    label: 'Masque de renard',
    cat: 'visages',
    svg: (c) =>
      `<path d="M16 10 L36 32 Q50 26 64 32 L84 10 L82 50 Q74 76 50 92 Q26 76 18 50 Z"/><path d="M30 50 L44 56 M70 50 L56 56"/><path d="M28 22 L34 34 M72 22 L66 34"/>${dot(50, 80, 4, c)}`,
  },

  // ---------------------------------------------------------------- Éléments
  {
    key: 'flame',
    label: 'Flamme',
    cat: 'elements',
    svg: () =>
      `<path d="M50 8 C62 28 80 40 76 64 C73 82 58 92 50 92 C42 92 27 82 24 64 C21 48 34 40 40 26 C44 38 50 42 50 8 Z"/><path d="M50 52 C56 60 62 66 60 76 C58 84 42 84 40 76 C38 68 46 62 50 52 Z"/>`,
  },
  {
    key: 'triple-flame',
    label: 'Trois flammes',
    cat: 'elements',
    svg: () =>
      `<path d="M50 10 C60 30 70 40 66 62 C64 76 56 84 50 84 C44 84 36 76 34 62 C30 40 40 30 50 10 Z"/><path d="M24 40 C30 52 36 58 34 72 C33 80 28 84 24 84 C18 84 12 78 12 68 C12 56 20 52 24 40 Z"/><path d="M76 40 C80 52 88 56 88 68 C88 78 82 84 76 84 C72 84 67 80 66 72 C64 58 70 52 76 40 Z"/><path d="M8 92 H92"/>`,
  },
  {
    key: 'drop',
    label: 'Goutte',
    cat: 'elements',
    svg: () => `<path d="M50 8 C64 34 78 48 78 64 A28 28 0 0 1 22 64 C22 48 36 34 50 8 Z"/><path d="M36 66 A14 14 0 0 0 48 80"/>`,
  },
  {
    key: 'blood',
    label: 'Gouttes de sang',
    cat: 'elements',
    svg: (c) =>
      `<path d="M50 8 C60 26 70 38 70 52 A20 20 0 0 1 30 52 C30 38 40 26 50 8 Z" fill="${c}" fill-opacity="0.25"/><path d="M24 60 C29 70 34 76 34 82 A10 10 0 0 1 14 82 C14 76 19 70 24 60 Z"/><path d="M76 60 C81 70 86 76 86 82 A10 10 0 0 1 66 82 C66 76 71 70 76 60 Z"/>`,
  },
  {
    key: 'wave',
    label: 'Vagues',
    cat: 'elements',
    svg: () => [34, 50, 66].map((y) => `<path d="M6 ${y} Q17 ${y - 10} 28 ${y} T50 ${y} T72 ${y} T94 ${y}"/>`).join(''),
  },
  {
    key: 'great-wave',
    label: 'Grande vague',
    cat: 'elements',
    svg: () =>
      `<path d="M8 84 C10 50 34 22 64 18 C82 16 92 28 88 40 C84 50 70 48 70 40 C70 34 78 32 80 36"/><path d="M8 84 C30 80 44 66 52 50"/><path d="M8 84 H92"/><path d="M30 84 C40 72 56 70 66 76 C74 80 84 80 92 74"/>`,
  },
  { key: 'lightning', label: 'Éclair', cat: 'elements', svg: () => `<path d="M58 6 L24 56 H48 L40 94 L78 40 H54 Z"/>` },
  {
    key: 'wind',
    label: 'Vent',
    cat: 'elements',
    svg: () => `<path d="M8 34 H60 A12 12 0 1 0 48 22"/><path d="M8 52 H78 A12 12 0 1 1 66 64"/><path d="M8 70 H42 A9 9 0 1 1 36 79"/>`,
  },
  {
    key: 'tornado',
    label: 'Tornade',
    cat: 'elements',
    svg: () =>
      `<path d="M10 16 Q50 26 90 16"/><path d="M18 30 Q50 38 80 28"/><path d="M28 44 Q52 50 72 40"/><path d="M38 58 Q54 62 64 52"/><path d="M44 70 Q54 72 58 64"/><path d="M48 82 Q52 82 54 76"/>`,
  },
  {
    key: 'mountain',
    label: 'Montagne',
    cat: 'elements',
    svg: () => `<path d="M6 84 L36 28 L50 52 L64 34 L94 84 Z"/><path d="M27 45 L36 52 L44 44"/><path d="M58 44 L64 48 L70 44"/>`,
  },
  {
    key: 'cloud',
    label: 'Nuage',
    cat: 'elements',
    svg: () =>
      `<path d="M24 72 A16 16 0 0 1 24 40 A20 20 0 0 1 62 30 A17 17 0 0 1 80 46 A13 13 0 0 1 78 72 Z"/><path d="M36 58 Q46 50 56 58 Q64 64 70 56"/>`,
  },
  { key: 'snowflake', label: 'Givre', cat: 'elements', svg: () => snowflake() },
  {
    key: 'crystal',
    label: 'Cristal',
    cat: 'elements',
    svg: () => `<path d="M50 6 L74 30 L64 92 H36 L26 30 Z"/><path d="M26 30 H74 M50 6 L42 30 L50 92 L58 30 Z"/>`,
  },
  {
    key: 'leaf',
    label: 'Feuille',
    cat: 'elements',
    svg: () => `<path d="M16 84 C16 42 44 16 86 14 C84 56 58 84 16 84 Z"/><path d="M16 84 L66 34 M36 64 V48 M48 52 L50 38 M36 64 H52 M48 52 H62"/>`,
  },

  // ---------------------------------------------------------------- Astres
  { key: 'moon', label: 'Croissant', cat: 'astres', svg: () => `<path d="M64 12 A38 38 0 1 0 64 88 A30 30 0 1 1 64 12 Z"/>` },
  {
    key: 'moons',
    label: 'Phases de lune',
    cat: 'astres',
    svg: (c) => `<path d="M18 36 A14 14 0 0 0 18 64 A18 18 0 0 1 18 36 Z"/>${dot(50, 50, 14, c)}<path d="M82 36 A14 14 0 0 1 82 64 A18 18 0 0 0 82 36 Z"/>`,
  },
  {
    key: 'sun',
    label: 'Soleil',
    cat: 'astres',
    svg: () => `<circle cx="50" cy="50" r="18"/>` + rays(50, 50, 26, 40, -90, 225, 8),
  },
  {
    key: 'black-sun',
    label: 'Soleil noir',
    cat: 'astres',
    svg: (c) => `${dot(50, 50, 24, c)}<circle cx="50" cy="50" r="31"/>` + rays(50, 50, 36, 46, -90, 247.5, 16),
  },
  {
    key: 'rising-sun',
    label: 'Soleil levant',
    cat: 'astres',
    svg: () => `<path d="M6 70 H94"/><path d="M24 70 A26 26 0 0 1 76 70"/>` + rays(50, 70, 32, 46, -165, -15, 7) + `<path d="M20 80 H80 M34 90 H66"/>`,
  },
  { key: 'star', label: 'Étoile', cat: 'astres', svg: () => poly(5, 42, -90, 17) },
  { key: 'star-8', label: 'Étoile à huit branches', cat: 'astres', svg: () => poly(8, 42, -90, 22) + '<circle cx="50" cy="50" r="9"/>' },
  {
    key: 'hexagram',
    label: 'Hexagramme',
    cat: 'astres',
    svg: () => `<path d="M50 8 L86 70 H14 Z"/><path d="M50 92 L14 30 H86 Z"/>`,
  },
  {
    key: 'comet',
    label: 'Comète',
    cat: 'astres',
    svg: () => `<circle cx="68" cy="32" r="13"/><path d="M58 41 L12 87 M62 46 L30 90 M54 37 L10 68"/>`,
  },
  {
    key: 'constellation',
    label: 'Constellation',
    cat: 'astres',
    svg: (c) =>
      `<polyline points="14,72 32,42 54,54 70,22 88,44"/><path d="M54 54 L62 84"/>` +
      [[14, 72], [32, 42], [54, 54], [70, 22], [88, 44], [62, 84]].map(([x, y]) => dot(x, y, 4, c)).join(''),
  },

  // ---------------------------------------------------------------- Armes & liens
  {
    key: 'chain',
    label: 'Chaîne',
    cat: 'armes',
    svg: () =>
      `<rect x="6" y="38" width="40" height="24" rx="12" transform="rotate(-20 26 50)"/><rect x="30" y="38" width="40" height="24" rx="12" transform="rotate(20 50 50)"/><rect x="54" y="38" width="40" height="24" rx="12" transform="rotate(-20 74 50)"/>`,
  },
  {
    key: 'chain-broken',
    label: 'Chaîne brisée',
    cat: 'armes',
    svg: () =>
      `<rect x="4" y="38" width="38" height="24" rx="12" transform="rotate(-20 23 50)"/><rect x="58" y="38" width="38" height="24" rx="12" transform="rotate(-20 77 50)"/><path d="M50 26 V36 M50 64 V74 M40 30 L44 38 M60 70 L56 62"/>`,
  },
  {
    key: 'key',
    label: 'Clé',
    cat: 'armes',
    svg: () => `<circle cx="28" cy="50" r="15"/><circle cx="28" cy="50" r="5"/><path d="M43 50 H92 M78 50 V62 M88 50 V60"/>`,
  },
  {
    key: 'lock',
    label: 'Cadenas',
    cat: 'armes',
    svg: () => `<rect x="22" y="44" width="56" height="44" rx="6"/><path d="M34 44 V30 A16 16 0 0 1 66 30 V44"/><circle cx="50" cy="62" r="6"/><path d="M50 68 V78"/>`,
  },
  {
    key: 'cage',
    label: 'Cage',
    cat: 'armes',
    svg: () => `<rect x="18" y="16" width="64" height="70" rx="4"/><path d="M34 16 V86 M50 16 V86 M66 16 V86 M18 32 H82"/><path d="M42 8 H58 V16"/>`,
  },
  { key: 'shield', label: 'Bouclier', cat: 'armes', svg: () => `<path d="M50 8 L84 22 V48 C84 70 68 86 50 94 C32 86 16 70 16 48 V22 Z"/><path d="M50 22 V80 M30 44 H70"/>` },
  { key: 'kunai', label: 'Kunai', cat: 'armes', svg: () => `<path d="M50 4 L60 46 L50 58 L40 46 Z"/><path d="M50 58 V84"/><circle cx="50" cy="91" r="6"/><path d="M45 64 H55 M45 72 H55"/>` },
  {
    key: 'shuriken',
    label: 'Shuriken',
    cat: 'armes',
    svg: () => `<path d="M50 6 L58 42 L94 50 L58 58 L50 94 L42 58 L6 50 L42 42 Z"/><circle cx="50" cy="50" r="7"/>`,
  },
  {
    key: 'fuma',
    label: 'Grand shuriken',
    cat: 'armes',
    svg: () => around(4, '<path d="M50 50 L44 40 Q46 18 64 6 Q58 26 60 42 Z"/>') + '<circle cx="50" cy="50" r="8"/>',
  },
  {
    key: 'katana',
    label: 'Sabre',
    cat: 'armes',
    svg: () => `<path d="M90 8 Q74 40 38 68 L33 63 Q66 36 90 8 Z"/><path d="M26 58 L42 74"/><path d="M34 66 L12 88"/><path d="M28 68 L32 72 M22 74 L26 78 M16 80 L20 84"/>`,
  },
  {
    key: 'blades',
    label: 'Lames croisées',
    cat: 'armes',
    svg: () => `<path d="M12 12 L70 70 M88 12 L30 70"/><path d="M60 78 L78 60 M40 78 L22 60"/><path d="M70 70 L88 88 M30 70 L12 88"/>`,
  },
  {
    key: 'arrow',
    label: 'Flèche',
    cat: 'armes',
    svg: () => `<path d="M12 88 L86 14 M86 14 L64 18 M86 14 L82 36"/><path d="M12 88 L13 74 M12 88 L26 87 M21 79 L22 66 M21 79 L34 78"/>`,
  },
  {
    key: 'scroll',
    label: 'Parchemin',
    cat: 'armes',
    svg: () => `<rect x="14" y="12" width="72" height="10" rx="5"/><rect x="14" y="78" width="72" height="10" rx="5"/><rect x="22" y="22" width="56" height="56"/><path d="M36 32 V68 M50 32 V68 M64 32 V56"/>`,
  },
  {
    key: 'hourglass',
    label: 'Sablier',
    cat: 'armes',
    svg: (c) =>
      `<path d="M22 10 H78 M22 90 H78"/><path d="M30 10 C30 38 48 44 48 50 C48 56 30 62 30 90 M70 10 C70 38 52 44 52 50 C52 56 70 62 70 90"/><path d="M38 86 Q50 72 62 86 Z" fill="${c}" stroke="none"/>`,
  },
  {
    key: 'bell',
    label: 'Clochette',
    cat: 'armes',
    svg: () => `<path d="M50 14 C30 14 26 34 26 52 C26 64 18 70 16 76 H84 C82 70 74 64 74 52 C74 34 70 14 50 14 Z"/><circle cx="50" cy="84" r="6"/><path d="M50 6 V14"/>`,
  },
  {
    key: 'fan',
    label: 'Éventail',
    cat: 'armes',
    svg: () =>
      `<path d="M50 86 L10 46 A56 56 0 0 1 90 46 Z"/><path d="M${pt(20, -135, 50, 86)} A20 20 0 0 1 ${pt(20, -45, 50, 86)}"/>` +
      [-117, -99, -81, -63].map((a) => `<path d="M${pt(20, a, 50, 86)} L${pt(56, a, 50, 86)}"/>`).join(''),
  },

  // ---------------------------------------------------------------- Nature & bêtes
  {
    key: 'lotus',
    label: 'Lotus',
    cat: 'nature',
    svg: () =>
      `<path d="M50 82 C40 64 40 42 50 22 C60 42 60 64 50 82 Z"/><path d="M50 82 C34 76 22 60 22 42 C36 48 46 62 50 82 Z"/><path d="M50 82 C66 76 78 60 78 42 C64 48 54 62 50 82 Z"/><path d="M18 84 H82"/>`,
  },
  {
    key: 'sakura',
    label: 'Fleur de cerisier',
    cat: 'nature',
    svg: (c) => around(5, '<path d="M50 50 C40 40 38 26 45 16 L50 21 L55 16 C62 26 60 40 50 50 Z"/>') + dot(50, 50, 4, c),
  },
  {
    key: 'bamboo',
    label: 'Bambou',
    cat: 'nature',
    svg: () =>
      `<rect x="28" y="8" width="16" height="84" rx="3"/><path d="M28 34 H44 M28 62 H44"/><rect x="56" y="20" width="14" height="72" rx="3"/><path d="M56 46 H70 M56 70 H70"/><path d="M44 30 Q58 22 64 8 M70 42 Q82 36 90 22"/>`,
  },
  {
    key: 'snake',
    label: 'Serpent',
    cat: 'nature',
    svg: (c) =>
      `<path d="M24 86 C70 86 74 62 50 56 C26 50 28 24 64 22"/><path d="M64 22 C72 18 82 20 84 28 C80 34 70 32 64 22 Z"/>${dot(76, 25, 1.8, c)}`,
  },
  {
    key: 'ouroboros',
    label: 'Ouroboros',
    cat: 'nature',
    svg: (c) =>
      `<path d="M62 12 A40 40 0 1 1 38 12"/><path d="M38 12 C44 4 56 4 62 12 C56 20 44 20 38 12 Z"/>${dot(50, 10, 2, c)}<path d="M62 12 L66 6 M62 12 L68 14"/>`,
  },
  {
    key: 'butterfly',
    label: 'Papillon',
    cat: 'nature',
    svg: () =>
      `<path d="M50 30 V78"/><path d="M50 40 C38 16 12 16 14 36 C16 50 34 52 50 52 Z"/><path d="M50 40 C62 16 88 16 86 36 C84 50 66 52 50 52 Z"/><path d="M50 54 C36 56 22 66 28 78 C34 86 46 76 50 62 Z"/><path d="M50 54 C64 56 78 66 72 78 C66 86 54 76 50 62 Z"/><path d="M50 30 L42 20 M50 30 L58 20"/>`,
  },
  {
    key: 'feather',
    label: 'Plume',
    cat: 'nature',
    svg: () => `<path d="M82 10 C52 16 26 42 22 80 C48 76 76 52 82 10 Z"/><path d="M12 90 L66 30"/><path d="M38 64 L28 62 M46 54 L38 50 M54 46 L48 40 M44 70 L42 60"/>`,
  },
  { key: 'web', label: 'Toile', cat: 'nature', svg: () => web() },
  {
    key: 'paw',
    label: 'Empreinte',
    cat: 'nature',
    svg: () => `<ellipse cx="50" cy="66" rx="18" ry="15"/><circle cx="26" cy="42" r="8"/><circle cx="42" cy="26" r="8"/><circle cx="58" cy="26" r="8"/><circle cx="74" cy="42" r="8"/>`,
  },
  {
    key: 'fangs',
    label: 'Crocs',
    cat: 'nature',
    svg: () => `<path d="M8 26 Q50 50 92 26"/><path d="M26 34 Q32 56 34 78 Q40 58 42 42"/><path d="M58 42 Q60 58 66 78 Q68 56 74 34"/>`,
  },
  {
    key: 'claws',
    label: 'Griffes',
    cat: 'nature',
    svg: () => `<path d="M32 10 Q30 50 16 90"/><path d="M54 8 Q52 50 38 92"/><path d="M76 10 Q74 50 60 90"/>`,
  },
  {
    key: 'tree',
    label: 'Arbre sacré',
    cat: 'nature',
    svg: () =>
      `<path d="M50 92 V46 M50 62 L32 48 M50 56 L68 42 M50 92 L38 86 M50 92 L62 86"/><path d="M50 8 C70 8 84 20 84 34 C84 46 72 52 60 50 C56 56 44 56 40 50 C28 52 16 46 16 34 C16 20 30 8 50 8 Z"/>`,
  },

  // ---------------------------------------------------------------- Sacré & mystique
  { key: 'spiral', label: 'Spirale', cat: 'mystique', svg: () => spiral() },
  { key: 'square-spiral', label: 'Spirale carrée', cat: 'mystique', svg: () => squareSpiral() },
  {
    key: 'tomoe',
    label: 'Tourbillon',
    cat: 'mystique',
    svg: () => around(3, '<path d="M50 50 C50 34 64 26 74 32 C68 30 58 36 58 46 A8 8 0 1 1 50 50 Z"/>') + `<circle cx="50" cy="50" r="40"/>`,
  },
  {
    key: 'triskele',
    label: 'Triskèle',
    cat: 'mystique',
    svg: () => around(3, '<path d="M50 50 C50 28 72 18 82 32 C90 44 80 58 68 52 C62 49 64 40 70 40"/>'),
  },
  {
    key: 'yinyang',
    label: 'Yin-yang',
    cat: 'mystique',
    svg: (c) => `<circle cx="50" cy="50" r="40"/><path d="M50 10 A20 20 0 0 1 50 50 A20 20 0 0 0 50 90"/>${dot(50, 70, 5, c)}<circle cx="50" cy="30" r="5"/>`,
  },
  { key: 'pentagram', label: 'Pentacle', cat: 'mystique', svg: () => `<circle cx="50" cy="50" r="44"/><path d="M${[0, 2, 4, 1, 3].map((i) => pt(42, -90 + i * 72)).join(' L')} Z"/>` },
  { key: 'bagua', label: 'Bagua', cat: 'mystique', svg: () => bagua() },
  {
    key: 'trigram',
    label: 'Trigramme',
    cat: 'mystique',
    svg: () => `<path d="M16 28 H84 M16 50 H42 M58 50 H84 M16 72 H84"/>`,
  },
  {
    key: 'infinity',
    label: 'Infini',
    cat: 'mystique',
    svg: () => `<path d="M50 50 C38 30 12 30 12 50 C12 70 38 70 50 50 C62 30 88 30 88 50 C88 70 62 70 50 50 Z"/>`,
  },
  { key: 'forbidden', label: 'Interdit', cat: 'mystique', svg: () => `<circle cx="50" cy="50" r="38"/><path d="M23 23 L77 77"/>` },
  {
    key: 'x-seal',
    label: 'Sceau en X',
    cat: 'mystique',
    svg: (c) => `<path d="M16 16 L84 84 M84 16 L16 84"/>${dot(50, 14, 4, c)}${dot(50, 86, 4, c)}${dot(14, 50, 4, c)}${dot(86, 50, 4, c)}`,
  },
  { key: 'cross', label: 'Croix scellée', cat: 'mystique', svg: () => `<path d="M50 6 V94 M6 50 H94"/><circle cx="50" cy="50" r="22"/>` },
  {
    key: 'target',
    label: 'Cible',
    cat: 'reperes',
    svg: (c) => `<circle cx="50" cy="50" r="40"/><circle cx="50" cy="50" r="27"/><circle cx="50" cy="50" r="14"/>${dot(50, 50, 4, c)}`,
  },
  { key: 'hexagon', label: 'Hexagone', cat: 'mystique', svg: () => poly(6, 42, -90) + poly(6, 24, -60) },
  {
    key: 'cube',
    label: 'Cube',
    cat: 'mystique',
    svg: (c) =>
      `<path d="M50 10 L84.64 30 L50 50 L15.36 30 Z" fill="${c}" fill-opacity="0.22"/><path d="M50 10 L84.64 30 V70 L50 90 L15.36 70 V30 Z"/><path d="M15.36 30 L50 50 L84.64 30 M50 50 V90"/>`,
  },
  {
    key: 'cube-wire',
    label: 'Cube filaire',
    cat: 'mystique',
    svg: () =>
      `<rect x="14" y="34" width="50" height="50"/><rect x="36" y="16" width="50" height="50"/><path d="M14 34 L36 16 M64 34 L86 16 M64 84 L86 66 M14 84 L36 66"/>`,
  },
  {
    key: 'cube-sealed',
    label: 'Cube scellé',
    cat: 'mystique',
    svg: (c) =>
      `<path d="M50 10 L84.64 30 V70 L50 90 L15.36 70 V30 Z"/><path d="M15.36 30 L50 50 L84.64 30 M50 50 V90"/>` +
      `<path d="M50 20 L72 32.7 L50 45.4 L28 32.7 Z" fill="${c}" fill-opacity="0.3"/>` +
      `<path d="M24 46 L44 57.5 M24 56 L44 67.5 M24 66 L44 77.5 M76 46 L56 57.5 M76 56 L56 67.5 M76 66 L56 77.5"/>`,
  },
  { key: 'diamond', label: 'Losange', cat: 'mystique', svg: () => `<path d="M50 6 L88 50 L50 94 L12 50 Z M50 26 L70 50 L50 74 L30 50 Z"/>` },
  {
    key: 'labyrinth',
    label: 'Labyrinthe',
    cat: 'mystique',
    svg: () => `<path d="M42 12 H12 V88 H88 V12 H58 M58 28 H72 V72 H28 V28 H42 M42 44 V56 H58 V44"/>`,
  },
  {
    key: 'cracked',
    label: 'Sceau fêlé',
    cat: 'mystique',
    svg: () => `<path d="M58 11 A40 40 0 1 1 42 11"/><path d="M50 4 L44 24 L56 38 L46 54 L54 68"/>`,
  },
  {
    key: 'torii',
    label: 'Torii',
    cat: 'mystique',
    svg: () => `<path d="M6 20 Q50 30 94 20"/><path d="M14 36 H86"/><path d="M28 24 V92 M72 24 V92 M50 26 V36"/>`,
  },
  {
    key: 'shimenawa',
    label: 'Shimenawa',
    cat: 'mystique',
    svg: () =>
      `<path d="M6 28 Q50 46 94 28"/><path d="M6 36 Q50 54 94 36"/><path d="M20 34 L26 38 M36 38 L42 42 M56 42 L62 40 M74 38 L80 36"/><path d="M30 46 V56 L37 60 L30 66 L37 72 M68 46 V56 L75 60 L68 66 L75 72 M50 50 V64 L57 68 L50 74 L57 80"/>`,
  },
  {
    key: 'ofuda',
    label: 'Ofuda',
    cat: 'mystique',
    svg: () => `<rect x="32" y="6" width="36" height="88" rx="2"/><path d="M40 18 H60 M50 18 V42 M40 30 H60 M42 52 H58 V68 H42 Z M50 76 V86"/>`,
  },
  {
    key: 'mirror',
    label: 'Miroir sacré',
    cat: 'mystique',
    svg: () => `<circle cx="50" cy="44" r="34"/><circle cx="50" cy="44" r="26"/><path d="M36 30 Q43 24 52 25"/><path d="M40 78 L34 92 H66 L60 78"/>`,
  },
  {
    key: 'lantern',
    label: 'Lanterne',
    cat: 'mystique',
    svg: () => `<ellipse cx="50" cy="52" rx="28" ry="32"/><path d="M38 14 H62 M38 90 H62 M50 6 V14"/><path d="M24 40 Q50 48 76 40 M22 52 H78 M24 64 Q50 56 76 64"/>`,
  },
  // ---------------------------------------------------------------- Ajouts : corps & esprit
  {
    key: 'eye-spiral',
    label: 'Œil spirale',
    cat: 'corps',
    svg: () => `<path d="${EYE}"/>${spiralAt(50, 50, 2.2, 1.05)}`,
  },
  {
    key: 'eye-radiant',
    label: 'Œil rayonnant',
    cat: 'corps',
    svg: (c) =>
      `<path d="M20 50 Q50 26 80 50 Q50 74 20 50 Z"/><circle cx="50" cy="50" r="10"/>${dot(50, 50, 4, c)}` +
      Array.from({ length: 12 }, (_, i) => `<path d="M${pt(38, i * 30)} L${pt(47, i * 30)}"/>`).join(''),
  },
  {
    key: 'tears',
    label: 'Œil en larmes',
    cat: 'corps',
    svg: () =>
      `<path d="M10 36 Q50 68 90 36"/><path d="M24 48 L18 56 M76 48 L82 56"/>` +
      `<path d="M38 62 C42 70 44 74 44 78 A6 6 0 0 1 32 78 C32 74 34 70 38 62 Z"/><path d="M62 70 C65 76 67 79 67 82 A5 5 0 0 1 57 82 C57 79 59 76 62 70 Z"/>`,
  },
  {
    key: 'oni',
    label: 'Masque d’oni',
    cat: 'visages',
    svg: () =>
      `<path d="M24 34 Q50 20 76 34 V58 Q76 86 50 92 Q24 86 24 58 Z"/><path d="M28 34 L16 6 L38 28 M72 34 L84 6 L62 28"/><path d="M31 46 L45 53 M69 46 L55 53"/><path d="M34 72 H66 M39 72 L42 79 L45 72 M55 72 L58 79 L61 72"/>`,
  },
  {
    key: 'bone',
    label: 'Os',
    cat: 'corps',
    svg: () =>
      `<path d="M31 63 L63 31 M37 69 L69 37"/><circle cx="23" cy="65" r="8"/><circle cx="35" cy="77" r="8"/><circle cx="65" cy="23" r="8"/><circle cx="77" cy="35" r="8"/>`,
  },

  // ---------------------------------------------------------------- Ajouts : éléments
  {
    key: 'volcano',
    label: 'Volcan',
    cat: 'elements',
    svg: () =>
      `<path d="M6 90 L34 42 H66 L94 90 Z"/><path d="M34 42 Q38 36 42 42 Q46 36 50 42 Q54 36 58 42 Q62 36 66 42"/><path d="M44 42 L41 58 M56 42 L59 52"/><path d="M50 34 Q42 24 50 18 Q58 12 52 4"/>`,
  },
  {
    key: 'whirlpool',
    label: 'Remous',
    cat: 'elements',
    svg: () =>
      `<path d="M62 50 A12 12 0 1 1 50 38"/><path d="M74 50 A24 24 0 1 1 50 26"/><path d="M86 50 A36 36 0 1 1 50 14"/><circle cx="50" cy="50" r="3"/>`,
  },
  {
    key: 'bubble',
    label: 'Sphère d’eau',
    cat: 'elements',
    svg: () => `<circle cx="46" cy="54" r="34"/><path d="M26 44 A22 22 0 0 1 40 30"/><circle cx="80" cy="18" r="6"/><circle cx="90" cy="34" r="3.5"/>`,
  },
  {
    key: 'rock',
    label: 'Rocher',
    cat: 'elements',
    svg: () => `<path d="M12 82 L20 46 L40 28 L64 24 L82 40 L90 66 L80 84 Z"/><path d="M40 28 L46 52 L34 68 M64 24 L60 44 L76 58 M46 52 L60 44"/>`,
  },
  {
    key: 'ice',
    label: 'Pics de glace',
    cat: 'elements',
    svg: () => `<path d="M10 88 L22 42 L32 88 M32 88 L46 14 L58 88 M58 88 L70 32 L80 88 M80 88 L87 56 L92 88"/><path d="M6 88 H94"/><path d="M46 14 L46 50 M22 42 V62 M70 32 V58"/>`,
  },
  {
    key: 'smoke',
    label: 'Fumée',
    cat: 'elements',
    svg: () =>
      `<path d="M28 92 C18 72 38 64 28 46 C20 32 34 22 30 8"/><path d="M50 92 C40 72 60 64 50 46 C42 32 56 22 52 8"/><path d="M72 92 C62 72 82 64 72 46 C64 32 78 22 74 8"/>`,
  },
  {
    key: 'wisp',
    label: 'Feu follet',
    cat: 'esprits',
    svg: () => `<path d="M50 26 C58 40 66 48 64 62 A14 14 0 0 1 36 62 C34 48 42 40 50 26 Z"/><circle cx="50" cy="56" r="38" stroke-dasharray="3 7"/>`,
  },

  // ---------------------------------------------------------------- Ajouts : astres
  {
    key: 'sun-moon',
    label: 'Soleil et lune',
    cat: 'astres',
    svg: () =>
      `<circle cx="32" cy="50" r="16"/>` +
      [110, 140, 170, 200, 230, 260].map((a) => `<path d="M${pt(22, a, 32, 50)} L${pt(29, a, 32, 50)}"/>`).join('') +
      `<path d="M72 26 A24 24 0 1 0 72 74 A19 19 0 1 1 72 26 Z"/><path d="M50 14 V86"/>`,
  },
  {
    key: 'planet',
    label: 'Planète',
    cat: 'astres',
    svg: () => `<circle cx="50" cy="50" r="24"/><ellipse cx="50" cy="50" rx="45" ry="12" transform="rotate(-20 50 50)"/>`,
  },
  {
    key: 'full-moon',
    label: 'Pleine lune',
    cat: 'astres',
    svg: () => `<circle cx="50" cy="50" r="38"/><circle cx="38" cy="38" r="8"/><circle cx="62" cy="58" r="11"/><circle cx="40" cy="66" r="4"/><circle cx="64" cy="32" r="3"/>`,
  },
  {
    key: 'crescent-star',
    label: 'Croissant et étoile',
    cat: 'astres',
    svg: (c) => `<path d="M58 12 A38 38 0 1 0 58 88 A30 30 0 1 1 58 12 Z"/><path d="M${[0, 2, 4, 1, 3].map((i) => pt(13, -90 + i * 72, 70, 50)).join(' L')} Z" fill="${c}" stroke="none"/>`,
  },

  // ---------------------------------------------------------------- Ajouts : armes & liens
  {
    key: 'handcuffs',
    label: 'Menottes',
    cat: 'armes',
    svg: () =>
      `<circle cx="26" cy="64" r="18"/><circle cx="74" cy="64" r="18"/><circle cx="26" cy="64" r="11"/><circle cx="74" cy="64" r="11"/>` +
      `<ellipse cx="40" cy="38" rx="6" ry="3.5" transform="rotate(-40 40 38)"/><ellipse cx="50" cy="32" rx="6" ry="3.5"/><ellipse cx="60" cy="38" rx="6" ry="3.5" transform="rotate(40 60 38)"/>`,
  },
  {
    key: 'explosive-tag',
    label: 'Parchemin explosif',
    cat: 'armes',
    svg: () =>
      `<rect x="30" y="22" width="40" height="70" rx="2"/><path d="M38 36 H62 M50 36 V58 M40 47 H60 M42 68 H58 M42 76 H58"/><path d="M50 22 Q45 14 52 9"/><path d="M52 9 L55 2 M52 9 L60 7 M52 9 L59 14 M52 9 L46 4"/>`,
  },
  {
    key: 'scythe',
    label: 'Faux',
    cat: 'armes',
    svg: () => `<path d="M26 94 L60 8"/><path d="M60 8 C80 10 94 28 92 50 C84 34 70 26 54 24"/><path d="M38 64 L46 68"/>`,
  },
  {
    key: 'senbon',
    label: 'Senbon',
    cat: 'armes',
    svg: () => `<path d="M46 90 L28 10 M50 90 V8 M54 90 L72 10"/><circle cx="45" cy="93" r="2.5"/><circle cx="50" cy="93" r="2.5"/><circle cx="55" cy="93" r="2.5"/>`,
  },
  {
    key: 'bow',
    label: 'Arc',
    cat: 'armes',
    svg: () => `<path d="M30 8 Q84 50 30 92"/><path d="M30 8 V92"/><path d="M30 50 H90 M90 50 L80 44 M90 50 L80 56 M36 50 L30 44 M36 50 L30 56"/>`,
  },
  {
    key: 'sword',
    label: 'Épée droite',
    cat: 'armes',
    svg: () => `<path d="M50 4 L57 14 V62 H43 V14 Z"/><path d="M50 14 V58"/><path d="M30 62 H70"/><path d="M50 62 V84"/><circle cx="50" cy="90" r="5"/>`,
  },
  {
    key: 'poison',
    label: 'Fiole',
    cat: 'armes',
    svg: () =>
      `<path d="M40 8 H60 M43 8 V32 L22 76 Q18 90 32 90 H68 Q82 90 78 76 L57 32 V8"/><path d="M28 66 H72"/><circle cx="44" cy="76" r="3"/><circle cx="56" cy="80" r="2"/><circle cx="52" cy="72" r="1.5"/>`,
  },
  {
    key: 'lock-broken',
    label: 'Cadenas brisé',
    cat: 'armes',
    svg: () =>
      `<rect x="22" y="46" width="56" height="44" rx="6"/><path d="M34 46 V32 A16 16 0 0 1 64 24"/><path d="M50 52 L44 64 L54 72 L48 84"/>`,
  },

  // ---------------------------------------------------------------- Ajouts : nature & bêtes
  {
    key: 'crow',
    label: 'Corbeau',
    cat: 'nature',
    svg: (c) =>
      `<path d="M6 46 Q24 30 42 42 Q46 30 58 32 L72 26 L66 38 Q82 38 94 28 Q86 52 62 56 Q54 72 38 74 Q44 62 40 56 Q22 60 6 46 Z"/>${dot(58, 38, 2, c)}`,
  },
  {
    key: 'toad',
    label: 'Crapaud',
    cat: 'nature',
    svg: (c) =>
      `<path d="M14 70 Q14 42 50 42 Q86 42 86 70 Q86 84 50 84 Q14 84 14 70 Z"/><circle cx="33" cy="40" r="9"/><circle cx="67" cy="40" r="9"/>${dot(33, 40, 3.5, c)}${dot(67, 40, 3.5, c)}<path d="M30 62 Q50 72 70 62"/><path d="M16 74 L4 88 M84 74 L96 88"/>`,
  },
  {
    key: 'koi',
    label: 'Carpe',
    cat: 'nature',
    svg: (c) =>
      `<path d="M8 50 Q32 22 64 40 L88 26 L82 50 L88 74 L64 60 Q32 78 8 50 Z"/>${dot(24, 46, 2.5, c)}<path d="M40 33 L48 22 L54 36"/><path d="M38 50 Q44 44 50 50 Q56 44 62 50"/>`,
  },
  {
    key: 'spider',
    label: 'Araignée',
    cat: 'nature',
    svg: () =>
      `<circle cx="50" cy="40" r="9"/><ellipse cx="50" cy="64" rx="12" ry="16"/>` +
      `<path d="M42 40 Q26 30 18 14 M42 46 Q24 44 10 36 M42 56 Q24 60 12 74 M42 62 Q30 74 24 92 M58 40 Q74 30 82 14 M58 46 Q76 44 90 36 M58 56 Q76 60 88 74 M58 62 Q70 74 76 92"/>`,
  },
  {
    key: 'ginkgo',
    label: 'Ginkgo',
    cat: 'nature',
    svg: () => `<path d="M50 92 V62"/><path d="M50 62 C30 60 10 42 12 22 Q50 8 88 22 C90 42 70 60 50 62 Z"/><path d="M50 62 L46 18 M50 62 L54 18 M50 62 L28 26 M50 62 L72 26"/>`,
  },
  {
    key: 'snail',
    label: 'Escargot',
    cat: 'nature',
    svg: () => `${spiralAt(58, 46, 2.4, 1.75)}<path d="M8 80 H90"/><path d="M14 80 Q8 64 18 60 L22 50 M18 60 L28 54"/>`,
  },
  {
    key: 'roots',
    label: 'Racines',
    cat: 'nature',
    svg: () =>
      `<path d="M50 8 V42"/><path d="M38 20 L50 30 L62 18"/><path d="M18 42 H82"/><path d="M50 42 Q40 60 26 66 Q16 70 12 88 M50 42 Q58 62 72 68 Q84 74 88 90 M50 42 V92 M50 60 Q38 74 36 92 M50 60 Q62 74 64 92"/>`,
  },

  // ---------------------------------------------------------------- Ajouts : sacré & mystique
  {
    key: 'flower-of-life',
    label: 'Fleur de vie',
    cat: 'mystique',
    svg: () => `<circle cx="50" cy="50" r="40"/><circle cx="50" cy="50" r="20"/>` + around(6, '<circle cx="50" cy="30" r="20"/>'),
  },
  {
    key: 'triquetra',
    label: 'Triquetra',
    cat: 'mystique',
    svg: () => around(3, '<path d="M50 52 C28 42 32 12 50 10 C68 12 72 42 50 52 Z"/>') + '<circle cx="50" cy="52" r="22"/>',
  },
  {
    key: 'ankh',
    label: 'Croix de vie',
    cat: 'mystique',
    svg: () => `<path d="M50 44 C34 34 36 8 50 8 C64 8 66 34 50 44 Z"/><path d="M50 44 V92 M26 50 H74"/>`,
  },
  {
    key: 'mandala',
    label: 'Mandala',
    cat: 'mystique',
    svg: () =>
      around(8, '<path d="M50 50 Q58 32 50 12 Q42 32 50 50 Z"/>') +
      around(8, '<path d="M50 40 Q55 32 50 24 Q45 32 50 40 Z"/>', 22.5) +
      '<circle cx="50" cy="50" r="9"/><circle cx="50" cy="50" r="44" stroke-dasharray="2 5"/>',
  },
  {
    key: 'solomon',
    label: 'Sceau de Salomon',
    cat: 'mystique',
    svg: () => `<circle cx="50" cy="50" r="44"/><path d="M50 8 L86 70 H14 Z"/><path d="M50 92 L14 30 H86 Z"/><circle cx="50" cy="50" r="15"/>`,
  },
  {
    key: 'gate',
    label: 'Portail',
    cat: 'mystique',
    svg: () => `<path d="M20 92 V40 A30 30 0 0 1 80 40 V92 Z"/><path d="M33 92 V44 A17 17 0 0 1 67 44 V92"/><circle cx="50" cy="62" r="4"/><path d="M50 66 V76"/>`,
  },
  {
    key: 'pyramid',
    label: 'Pyramide',
    cat: 'mystique',
    svg: () => `<path d="M50 10 L92 86 H8 Z"/><path d="M50 10 L62 86"/><path d="M21 62 H79 M32 42 H68"/>`,
  },
  {
    key: 'double-spiral',
    label: 'Double spirale',
    cat: 'mystique',
    svg: () => `${spiralAt(29, 50, 2, 1.6)}${spiralAt(71, 50, 2, 1.6, true)}`,
  },
  {
    key: 'vortex',
    label: 'Vortex',
    cat: 'mystique',
    svg: () => around(6, '<path d="M50 50 Q70 42 76 18"/>') + '<circle cx="50" cy="50" r="44"/><circle cx="50" cy="50" r="5"/>',
  },

  // ---------------------------------------------------------------- Cœurs
  {
    key: 'heart-broken',
    label: 'Cœur brisé',
    cat: 'coeurs',
    tags: 'coeur rupture chagrin',
    svg: () =>
      `<g transform="translate(-4 0)"><path d="M50 30 C38 14 18 18 14 32 C10 48 20 64 50 86 L45 72 L54 60 L45 46 Z"/></g><g transform="translate(4 0)"><path d="M50 30 C62 14 82 18 86 32 C90 48 80 64 50 86 L45 72 L54 60 L45 46 Z"/></g>`,
  },
  {
    key: 'heart-lock',
    label: 'Cœur verrouillé',
    cat: 'coeurs',
    tags: 'coeur serrure cadenas',
    svg: (c) => `<path d="${HEART}"/>${dot(50, 46, 6.5, c)}<path d="M46.5 50 L43 66 H57 L53.5 50 Z" fill="${c}" stroke="none"/>`,
  },
  {
    key: 'heart-flame',
    label: 'Cœur ardent',
    cat: 'coeurs',
    tags: 'coeur feu passion flamme',
    svg: () => `${heart(50, 62, 0.74)}<path d="M44 44 Q36 28 50 8 Q64 28 56 44"/><path d="M30 40 Q22 28 28 16 Q38 26 37 36"/><path d="M70 40 Q78 28 72 16 Q62 26 63 36"/>`,
  },
  {
    key: 'heart-wings',
    label: 'Cœur ailé',
    cat: 'coeurs',
    tags: 'coeur ailes envol',
    svg: () =>
      `${heart(50, 54, 0.52)}<path d="M32 46 C24 32 14 28 4 30 C8 40 14 46 22 50 C14 51 10 55 7 60 C17 62 25 59 32 55"/><path d="M68 46 C76 32 86 28 96 30 C92 40 86 46 78 50 C86 51 90 55 93 60 C83 62 75 59 68 55"/><path d="M12 36 L24 44 M14 56 L26 54 M88 36 L76 44 M86 56 L74 54"/>`,
  },
  { key: 'heart-twin', label: 'Cœurs liés', cat: 'coeurs', tags: 'coeur deux couple', svg: () => `${heart(37, 54, 0.6)}${heart(63, 48, 0.6)}` },
  {
    key: 'heart-crown',
    label: 'Cœur couronné',
    cat: 'coeurs',
    tags: 'coeur couronne roi reine',
    svg: () => `${heart(50, 62, 0.72)}<path d="M30 30 L33 10 L42 21 L50 6 L58 21 L67 10 L70 30 Z"/>`,
  },
  {
    key: 'heart-eye',
    label: 'Cœur clairvoyant',
    cat: 'coeurs',
    tags: 'coeur oeil',
    svg: (c) => `<path d="${HEART}"/><path d="M30 50 Q50 34 70 50 Q50 66 30 50 Z"/>${dot(50, 50, 5, c)}`,
  },
  {
    key: 'heart-chained',
    label: 'Cœur enchaîné',
    cat: 'coeurs',
    tags: 'coeur chaine prison',
    svg: () =>
      `<path d="${HEART}"/>` +
      [10, 23, 36, 49, 62, 75, 88].map((x, i) => (i % 2 ? `<path d="M${x - 6} 50 H${x + 6}"/>` : `<ellipse cx="${x}" cy="50" rx="7" ry="4.5"/>`)).join(''),
  },
  {
    key: 'heart-stitched',
    label: 'Cœur recousu',
    cat: 'coeurs',
    tags: 'coeur couture cicatrice',
    svg: () =>
      `<path d="${HEART}"/><path d="M50 30 Q45 46 52 58 Q57 70 50 86"/><path d="M42 36 L54 40 M43 46 L55 50 M46 56 L58 59 M47 66 L59 68 M44 75 L56 78"/>`,
  },
  { key: 'heart-nested', label: 'Cœur gigogne', cat: 'coeurs', tags: 'coeur double', svg: (c) => `<path d="${HEART}"/>${heart(50, 54, 0.55)}${dot(50, 52, 3.5, c)}` },
  {
    key: 'heart-bleeding',
    label: 'Cœur saignant',
    cat: 'coeurs',
    tags: 'coeur sang goutte',
    svg: (c) => `${heart(50, 42, 0.8)}${drop(50, 86, 4.5, c)}${drop(35, 80, 3.2, c)}${drop(65, 82, 3.2, c)}`,
  },
  {
    key: 'heart-dagger',
    label: 'Cœur et dague',
    cat: 'coeurs',
    tags: 'coeur poignard lame',
    svg: () => `<path d="${HEART}"/><circle cx="50" cy="7" r="3"/><path d="M50 10 V22 M38 24 H62"/><path d="M46 24 L50 82 L54 24"/>`,
  },
  {
    key: 'heart-beat',
    label: 'Battement',
    cat: 'coeurs',
    tags: 'coeur pouls vie',
    svg: () => `<path d="${HEART}"/><path d="M4 54 H30 L36 44 L42 66 L50 30 L56 62 L62 54 H96"/>`,
  },

  // ---------------------------------------------------------------- Repères & signes
  { key: 'pin', label: 'Repère', cat: 'reperes', tags: 'localisation position carte marqueur lieu gps', svg: () => `${pin(50, 36, 24)}<circle cx="50" cy="36" r="9"/>` },
  {
    key: 'pin-meet',
    label: 'Point de rendez-vous',
    cat: 'reperes',
    tags: 'localisation position carte marqueur lieu',
    svg: (c) => `<ellipse cx="50" cy="88" rx="22" ry="6"/>${pin(50, 32, 22)}${dot(50, 32, 7, c)}`,
  },
  { key: 'pin-x', label: 'Repère marqué', cat: 'reperes', tags: 'localisation position carte croix lieu', svg: () => `${pin(50, 36, 24)}<path d="M42 28 L58 44 M58 28 L42 44"/>` },
  {
    key: 'pin-route',
    label: 'Itinéraire',
    cat: 'reperes',
    tags: 'localisation chemin trajet carte voyage',
    svg: (c) => `${pin(24, 20, 11)}${pin(76, 56, 11)}${dot(24, 20, 3.5, c)}${dot(76, 56, 3.5, c)}<path d="M24 50 C24 80 62 58 70 84" stroke-dasharray="4 5"/>`,
  },
  {
    key: 'crosshair',
    label: 'Viseur',
    cat: 'reperes',
    tags: 'cible visee localisation',
    svg: (c) => `<circle cx="50" cy="50" r="30"/><path d="M50 6 V36 M50 64 V94 M6 50 H36 M64 50 H94"/>${dot(50, 50, 3.5, c)}`,
  },
  {
    key: 'compass-rose',
    label: 'Rose des vents',
    cat: 'reperes',
    tags: 'boussole nord direction orientation',
    svg: (c) => `<circle cx="50" cy="50" r="30"/>${poly(4, 26, -45, 6)}<path d="M50 4 L57 43 L96 50 L57 57 L50 96 L43 57 L4 50 L43 43 Z"/>${dot(50, 50, 3.5, c)}`,
  },
  {
    key: 'compass',
    label: 'Boussole',
    cat: 'reperes',
    tags: 'nord direction orientation aiguille',
    svg: (c) =>
      `<circle cx="50" cy="50" r="42"/>${rays(50, 50, 36, 42, -90, 225, 8)}<path d="M50 16 L58 50 H42 Z" fill="${c}" stroke="none"/><path d="M42 50 L50 84 L58 50"/><circle cx="50" cy="50" r="3"/>`,
  },
  {
    key: 'treasure',
    label: 'Croix du trésor',
    cat: 'reperes',
    tags: 'carte tresor localisation chemin',
    svg: () => `<path d="M8 90 C30 88 20 64 40 62 C60 60 48 44 62 42" stroke-dasharray="4 5"/><path d="M64 18 L86 40 M86 18 L64 40"/>`,
  },
  {
    key: 'signal',
    label: 'Signal',
    cat: 'reperes',
    tags: 'onde appel localisation emission',
    svg: (c) =>
      dot(50, 76, 5, c) +
      [16, 30, 44].map((r) => `<path d="M${pt(r, -135, 50, 76)} A${r} ${r} 0 0 1 ${pt(r, -45, 50, 76)}"/>`).join(''),
  },
  {
    key: 'ripple',
    label: 'Point repéré',
    cat: 'reperes',
    tags: 'localisation onde detection position',
    svg: (c) => `${dot(50, 50, 6, c)}<circle cx="50" cy="50" r="16"/><circle cx="50" cy="50" r="30" stroke-dasharray="5 4"/><circle cx="50" cy="50" r="44" stroke-dasharray="2 6"/>`,
  },
  {
    key: 'flag',
    label: 'Étendard',
    cat: 'reperes',
    tags: 'drapeau banniere clan',
    svg: (c) => `${dot(24, 7, 3.5, c)}<path d="M24 10 V94"/><path d="M24 14 C40 6 52 22 78 14 V50 C52 58 40 42 24 50"/>`,
  },
  {
    key: 'converge',
    label: 'Convergence',
    cat: 'reperes',
    tags: 'fleches centre attraction',
    svg: (c) => `${around(4, '<path d="M50 6 V33 M41 24 L50 33 L59 24"/>')}${dot(50, 50, 6, c)}`,
  },
  {
    key: 'diverge',
    label: 'Expansion',
    cat: 'reperes',
    tags: 'fleches dehors repulsion explosion',
    svg: () => `${around(4, '<path d="M50 34 V7 M41 16 L50 7 L59 16"/>')}<circle cx="50" cy="50" r="9"/>`,
  },
  {
    key: 'dial',
    label: 'Cadran',
    cat: 'reperes',
    tags: 'octogone horloge mecanisme',
    svg: () => `${poly(8, 42, -90 + 22.5)}${around(8, '<path d="M50 20 V29"/>')}<circle cx="50" cy="50" r="6"/>`,
  },
  { key: 'cycle', label: 'Cycle', cat: 'reperes', tags: 'fleches retour boucle renouveau', svg: () => `${arcArrow(32, -80, 70)}${arcArrow(32, 100, 250)}` },
  {
    key: 'signpost',
    label: 'Croisée des chemins',
    cat: 'reperes',
    tags: 'panneau direction chemin carrefour',
    svg: () => `<path d="M50 94 V8 M38 94 H62"/><path d="M50 16 H80 L88 25 L80 34 H50"/><path d="M50 44 H20 L12 53 L20 62 H50"/>`,
  },
  {
    key: 'map',
    label: 'Carte',
    cat: 'reperes',
    tags: 'localisation voyage plan territoire',
    svg: (c) => `<path d="M8 24 L36 14 L64 24 L92 14 V76 L64 86 L36 76 L8 86 Z"/><path d="M36 14 V76 M64 24 V86"/><path d="M18 66 Q30 48 46 54 Q58 58 70 40" stroke-dasharray="3 4"/>${dot(72, 37, 3.5, c)}`,
  },
  {
    key: 'footsteps',
    label: 'Traces de pas',
    cat: 'reperes',
    tags: 'empreintes pieds pistage chemin',
    svg: (c) =>
      `<ellipse cx="34" cy="70" rx="9" ry="14" transform="rotate(-8 34 70)"/>${[[25, 52], [30, 49], [36, 49], [41, 51]].map(([x, y]) => dot(x, y, 2.6, c)).join('')}` +
      `<ellipse cx="66" cy="40" rx="9" ry="14" transform="rotate(8 66 40)"/>${[[59, 21], [64, 19], [70, 19], [75, 22]].map(([x, y]) => dot(x, y, 2.6, c)).join('')}`,
  },

  // ---------------------------------------------------------------- Esprits & défunts
  {
    key: 'ghost',
    label: 'Fantôme',
    cat: 'esprits',
    tags: 'spectre esprit revenant yokai hante',
    svg: (c) =>
      `<path d="M26 88 V46 A24 24 0 0 1 74 46 V88 L66 80 L58 88 L50 80 L42 88 L34 80 Z"/><ellipse cx="41" cy="46" rx="4" ry="6" fill="${c}" stroke="none"/><ellipse cx="59" cy="46" rx="4" ry="6" fill="${c}" stroke="none"/><ellipse cx="50" cy="63" rx="4" ry="5"/>`,
  },
  {
    key: 'ghost-wail',
    label: 'Spectre hurlant',
    cat: 'esprits',
    tags: 'fantome esprit cri revenant',
    svg: (c) =>
      `<path d="M30 46 A20 20 0 0 1 70 46 C70 64 66 76 76 92 Q62 84 52 90 Q42 82 30 88 C34 72 30 60 30 46 Z"/><path d="M31 54 Q18 46 12 30 M69 54 Q82 46 88 30"/>${dot(42, 42, 3.5, c)}${dot(58, 42, 3.5, c)}<ellipse cx="50" cy="58" rx="5" ry="8"/>`,
  },
  {
    key: 'yurei',
    label: 'Yūrei',
    cat: 'esprits',
    tags: 'fantome japonais spectre esprit revenant',
    svg: () =>
      `<circle cx="50" cy="24" r="11"/><path d="M45 14 L50 7 L55 14 Z"/><path d="M39 21 Q33 40 36 58 M61 21 Q67 40 64 58"/><path d="M41 35 Q30 58 34 80 Q44 92 50 84 Q58 94 68 80 Q72 58 59 35"/><path d="M42 45 Q28 46 24 56 M58 45 Q72 46 76 56"/><path d="M24 56 L21 63 M24 56 L27 64 M76 56 L73 64 M76 56 L79 63"/>`,
  },
  {
    key: 'hitodama',
    label: 'Hitodama',
    cat: 'esprits',
    tags: 'ame feu follet esprit flamme',
    svg: (c) => `<circle cx="52" cy="70" r="16"/><path d="M37 64 C26 42 48 34 40 8 C58 22 68 40 68 66"/>${dot(52, 70, 5, c)}`,
  },
  {
    key: 'onibi',
    label: 'Onibi',
    cat: 'esprits',
    tags: 'feux follets esprits flammes',
    svg: () => `${around(3, flameAt(50, 26, 7))}<circle cx="50" cy="50" r="42" stroke-dasharray="2 8"/><circle cx="50" cy="50" r="6"/>`,
  },
  { key: 'ghost-trio', label: 'Cortège d’esprits', cat: 'esprits', tags: 'fantomes spectres parade', svg: (c) => `${ghost(50, 26, 13, c)}${ghost(25, 54, 12, c)}${ghost(75, 54, 12, c)}` },
  {
    key: 'tomb',
    label: 'Tombe',
    cat: 'esprits',
    tags: 'mort cimetiere sepulture defunt',
    svg: () => `<path d="M26 86 V42 A24 24 0 0 1 74 42 V86"/><path d="M12 86 H88"/><path d="M50 32 V70 M40 45 H60"/><path d="M18 86 L15 78 M22 86 L23 78 M78 86 L77 78 M82 86 L85 78"/>`,
  },
  {
    key: 'tombstone',
    label: 'Pierre tombale',
    cat: 'esprits',
    tags: 'tombe mort cimetiere stele',
    svg: () => `<path d="M28 88 V36 Q28 14 50 14 Q72 14 72 36 V88"/><path d="M16 88 H84"/><path d="M38 40 H62 M40 52 H60 M42 63 H58"/><path d="M62 18 L57 28 L63 34"/>`,
  },
  {
    key: 'haka',
    label: 'Tombe japonaise',
    cat: 'esprits',
    tags: 'haka tombe mort cimetiere stele',
    svg: () => `<path d="M14 90 H86 V80 H14 Z"/><path d="M24 80 V70 H76 V80"/><path d="M36 70 V22 L40 16 H60 L64 22 V70"/><path d="M46 26 V62 M54 26 V52"/>`,
  },
  {
    key: 'sotoba',
    label: 'Sotoba',
    cat: 'esprits',
    tags: 'tablettes tombe cimetiere bois',
    svg: () =>
      [
        [18, 22],
        [34, 14],
        [50, 18],
        [66, 24],
      ]
        .map(([x, top]) => `<path d="M${x} 92 V${top + 8} L${x + 6} ${top} L${x + 12} ${top + 8} V92"/><path d="M${x} ${top + 14} H${x + 12} M${x} ${top + 19} H${x + 12}"/>`)
        .join(''),
  },
  { key: 'coffin', label: 'Cercueil', cat: 'esprits', tags: 'mort defunt', svg: () => `<path d="M38 6 H62 L76 30 L64 94 H36 L24 30 Z"/><path d="M50 26 V60 M40 38 H60"/>` },
  {
    key: 'celtic-cross',
    label: 'Croix celtique',
    cat: 'esprits',
    tags: 'croix tombe cimetiere',
    svg: () => `<path d="M44 94 V54 H16 V42 H44 V8 H56 V42 H84 V54 H56 V94 Z"/><circle cx="50" cy="48" r="17"/>`,
  },
  {
    key: 'urn',
    label: 'Urne funéraire',
    cat: 'esprits',
    tags: 'cendres mort vase',
    svg: (c) => `${dot(50, 11, 3, c)}<path d="M40 22 Q50 12 60 22 Z"/><path d="M42 22 V30 Q22 40 26 62 Q30 84 50 86 Q70 84 74 62 Q78 40 58 30 V22"/><path d="M40 86 L38 92 H62 L60 86"/><path d="M30 52 H70"/>`,
  },
  {
    key: 'skull-bones',
    label: 'Crâne et os',
    cat: 'esprits',
    tags: 'tete de mort pirate danger poison',
    svg: (c) =>
      `<path d="M33 50 A17 17 0 1 1 67 50 V59 H60 V68 H40 V59 H33 Z"/>${dot(44, 46, 5, c)}${dot(56, 46, 5, c)}<path d="M48 56 L50 52 L52 56 Z"/><path d="M20 92 L80 72 M20 72 L80 92"/>` +
      [[18, 72], [18, 92], [82, 72], [82, 92]].map(([x, y]) => `<circle cx="${x}" cy="${y - 3}" r="3"/><circle cx="${x}" cy="${y + 3}" r="3"/>`).join(''),
  },
  {
    key: 'candle',
    label: 'Bougie funéraire',
    cat: 'esprits',
    tags: 'cierge flamme veillee deuil',
    svg: () => `<path d="M38 92 V40 H62 V92 M30 92 H70"/><path d="M38 46 Q41 56 44 46 Q48 62 52 46"/><path d="M50 40 V33"/><path d="M50 8 C58 18 58 26 50 32 C42 26 42 18 50 8 Z"/><circle cx="50" cy="22" r="17" stroke-dasharray="2 5"/>`,
  },
  {
    key: 'incense',
    label: 'Encens',
    cat: 'esprits',
    tags: 'baton fumee priere offrande',
    svg: () => `<path d="M22 66 H78 Q76 90 50 90 Q24 90 22 66 Z"/><path d="M42 66 L38 32 M50 66 V28 M58 66 L62 32"/><path d="M38 28 C32 22 42 18 36 10 M50 22 C44 16 54 12 48 4 M62 28 C68 22 58 18 64 10"/>`,
  },
  {
    key: 'graveyard',
    label: 'Cimetière',
    cat: 'esprits',
    tags: 'tombes nuit lune mort',
    svg: () =>
      `<path d="M14 88 V50 A14 14 0 0 1 42 50 V88"/><path d="M28 46 V68 M21 54 H35"/><path d="M54 88 V60 A12 12 0 0 1 78 60 V88"/><path d="M4 88 H96"/><path d="M84 8 A14 14 0 1 0 94 30 A11 11 0 1 1 84 8 Z"/>`,
  },
  {
    key: 'hooded',
    label: 'Spectre encapuchonné',
    cat: 'esprits',
    tags: 'faucheuse capuche ombre mort',
    svg: (c) => `<path d="M50 8 C30 8 22 28 24 50 L14 92 H86 L76 50 C78 28 70 8 50 8 Z"/><path d="M36 42 Q50 24 64 42 Q62 58 50 60 Q38 58 36 42 Z"/>${dot(44, 44, 3, c)}${dot(56, 44, 3, c)}`,
  },

  // ---------------------------------------------------------------- Visages
  {
    key: 'glasses-sad',
    label: 'Lunettes tristes',
    cat: 'visages',
    tags: 'visage triste lunettes',
    svg: () => `<circle cx="32" cy="42" r="12"/><circle cx="68" cy="42" r="12"/><circle cx="50" cy="42" r="3.5"/><path d="M44 42 H46.5 M53.5 42 H56 M20 40 L12 36 M80 40 L88 36"/><path d="M22 74 Q32 62 42 74 M58 74 Q68 62 78 74"/>`,
  },
  {
    key: 'face-sad',
    label: 'Visage triste',
    cat: 'visages',
    tags: 'tristesse chagrin',
    svg: (c) => `<circle cx="50" cy="50" r="42"/>${dot(36, 44, 4, c)}${dot(64, 44, 4, c)}<path d="M26 32 L40 27 M74 32 L60 27"/><path d="M34 72 Q50 58 66 72"/>`,
  },
  {
    key: 'face-serene',
    label: 'Visage serein',
    cat: 'visages',
    tags: 'paix sourire calme',
    svg: () => `<circle cx="50" cy="50" r="42"/><path d="M27 44 Q35 51 43 44 M57 44 Q65 51 73 44"/><path d="M36 64 Q50 75 64 64"/>`,
  },
  {
    key: 'face-angry',
    label: 'Visage furieux',
    cat: 'visages',
    tags: 'colere rage',
    svg: (c) => `<circle cx="50" cy="50" r="42"/><path d="M25 30 L44 40 M75 30 L56 40"/>${dot(37, 47, 4, c)}${dot(63, 47, 4, c)}<path d="M30 72 L39 64 L50 70 L61 64 L70 72"/>`,
  },
  {
    key: 'face-tears',
    label: 'Visage en larmes',
    cat: 'visages',
    tags: 'pleurs larmes tristesse',
    svg: (c) => `<circle cx="50" cy="50" r="42"/><path d="M27 42 Q35 36 43 42 M57 42 Q65 36 73 42"/>${drop(35, 58, 3, c)}${drop(65, 58, 3, c)}<path d="M40 75 Q50 67 60 75"/>`,
  },
  {
    key: 'face-stitched',
    label: 'Visage cousu',
    cat: 'visages',
    tags: 'poupee couture silence',
    svg: () => `<circle cx="50" cy="50" r="42"/><path d="M30 34 L42 46 M42 34 L30 46 M58 34 L70 46 M70 34 L58 46"/><path d="M30 68 H70"/><path d="M37 62 V74 M45 62 V74 M53 62 V74 M61 62 V74"/>`,
  },
  {
    key: 'face-surprised',
    label: 'Visage stupéfait',
    cat: 'visages',
    tags: 'surprise peur effroi',
    svg: (c) => `<circle cx="50" cy="50" r="42"/><circle cx="36" cy="42" r="7"/><circle cx="64" cy="42" r="7"/>${dot(36, 42, 2.5, c)}${dot(64, 42, 2.5, c)}<circle cx="50" cy="68" r="8"/>`,
  },
  {
    key: 'face-sleep',
    label: 'Visage endormi',
    cat: 'visages',
    tags: 'sommeil reve repos',
    svg: () => `<circle cx="50" cy="54" r="38"/><path d="M30 54 H44 M56 54 H70"/><circle cx="50" cy="72" r="4"/><path d="M66 8 H78 L66 20 H78 M82 24 H90 L82 32 H90"/>`,
  },
  {
    key: 'noh',
    label: 'Masque de nô',
    cat: 'visages',
    tags: 'masque theatre japonais',
    svg: (c) =>
      `<path d="M50 8 C74 8 82 30 80 52 C78 76 64 92 50 92 C36 92 22 76 20 52 C18 30 26 8 50 8 Z"/><path d="M50 8 Q44 15 34 15 M50 8 Q56 15 66 15"/>${dot(36, 26, 3.5, c)}${dot(64, 26, 3.5, c)}<path d="M29 45 Q37 40 44 46 M56 46 Q63 40 71 45"/><path d="M43 71 Q50 66 57 71 Q50 75 43 71 Z"/>`,
  },
  {
    key: 'tengu',
    label: 'Tengu',
    cat: 'visages',
    tags: 'masque yokai long nez demon',
    svg: (c) =>
      `<path d="M42 20 L50 8 L58 20"/><path d="M28 30 Q50 16 72 30 V60 Q72 84 50 88 Q28 84 28 60 Z"/><path d="M32 36 L46 42 M68 36 L54 42"/>${dot(40, 47, 3.5, c)}${dot(60, 47, 3.5, c)}<path d="M50 50 L86 62 L52 62"/><path d="M40 76 Q50 72 58 78"/>`,
  },
  {
    key: 'hannya',
    label: 'Hannya',
    cat: 'visages',
    tags: 'masque demon jalousie cornes',
    svg: (c) =>
      `<path d="M30 28 Q18 16 22 4 M70 28 Q82 16 78 4"/><path d="M24 30 Q50 18 76 30 L72 62 Q62 90 50 90 Q38 90 28 62 Z"/><path d="M32 42 L46 48 L34 51 Z M68 42 L54 48 L66 51 Z" fill="${c}" stroke="none"/><path d="M32 66 Q50 82 68 66 M36 68 L38 77 M64 68 L62 77"/>`,
  },
  {
    key: 'noppera',
    label: 'Noppera-bō',
    cat: 'visages',
    tags: 'sans visage yokai fantome',
    svg: () => `<path d="M50 10 C72 10 80 30 78 52 C76 76 64 90 50 90 C36 90 24 76 22 52 C20 30 28 10 50 10 Z"/><path d="M24 40 Q30 18 50 16 Q70 18 76 40"/>`,
  },
  {
    key: 'daruma',
    label: 'Daruma',
    cat: 'visages',
    tags: 'voeu chance poupee',
    svg: (c) =>
      `<path d="M50 8 C76 8 88 30 88 54 C88 78 72 92 50 92 C28 92 12 78 12 54 C12 30 24 8 50 8 Z"/><path d="M30 48 C30 34 40 26 50 26 C60 26 70 34 70 48 C70 62 62 68 50 68 C38 68 30 62 30 48 Z"/>${dot(41, 44, 5, c)}<circle cx="59" cy="44" r="5"/><path d="M33 34 Q40 29 46 35 M54 35 Q60 29 67 34 M42 58 Q50 54 58 58 M40 80 H60"/>`,
  },

  // ---------------------------------------------------------------- Ajouts : nature & bêtes
  {
    key: 'moth',
    label: 'Papillon de nuit',
    cat: 'nature',
    tags: 'phalene insecte nuit',
    svg: () =>
      `<path d="M50 28 V78"/><path d="M50 36 C34 16 10 22 12 40 C14 54 34 52 50 50 M50 36 C66 16 90 22 88 40 C86 54 66 52 50 50"/><path d="M50 54 C38 60 26 74 34 82 C42 88 48 70 50 62 M50 54 C62 60 74 74 66 82 C58 88 52 70 50 62"/><circle cx="30" cy="38" r="5"/><circle cx="70" cy="38" r="5"/><path d="M48 29 Q40 15 33 12 M52 29 Q60 15 67 12"/>`,
  },
  {
    key: 'dragonfly',
    label: 'Libellule',
    cat: 'nature',
    tags: 'insecte',
    svg: () =>
      `<circle cx="50" cy="16" r="5"/><path d="M50 21 V92"/><ellipse cx="30" cy="32" rx="21" ry="6" transform="rotate(-10 30 32)"/><ellipse cx="70" cy="32" rx="21" ry="6" transform="rotate(10 70 32)"/><ellipse cx="32" cy="46" rx="18" ry="5" transform="rotate(12 32 46)"/><ellipse cx="68" cy="46" rx="18" ry="5" transform="rotate(-12 68 46)"/>`,
  },
  {
    key: 'owl',
    label: 'Hibou',
    cat: 'nature',
    tags: 'chouette oiseau nuit sagesse',
    svg: (c) =>
      `<path d="M24 30 Q50 18 76 30 C82 56 72 86 50 90 C28 86 18 56 24 30 Z"/><path d="M24 30 L20 12 L36 24 M76 30 L80 12 L64 24"/><circle cx="38" cy="44" r="10"/><circle cx="62" cy="44" r="10"/>${dot(38, 44, 4, c)}${dot(62, 44, 4, c)}<path d="M46 54 L50 62 L54 54 M40 72 L44 76 L48 72 M52 72 L56 76 L60 72"/>`,
  },
  {
    key: 'bat',
    label: 'Chauve-souris',
    cat: 'nature',
    tags: 'nuit vampire',
    svg: () =>
      `<ellipse cx="50" cy="52" rx="7" ry="13"/><path d="M45 40 L44 32 L49 37 M55 40 L56 32 L51 37"/><path d="M43 46 C34 32 18 32 4 42 C11 46 13 52 13 58 C20 54 26 56 28 62 C32 56 38 56 43 60 M57 46 C66 32 82 32 96 42 C89 46 87 52 87 58 C80 54 74 56 72 62 C68 56 62 56 57 60"/>`,
  },
  {
    key: 'cat',
    label: 'Chat',
    cat: 'nature',
    tags: 'nekomata bakeneko felin',
    svg: (c) =>
      `<path d="M24 42 L22 12 L40 28 Q50 24 60 28 L78 12 L76 42 C82 66 68 86 50 86 C32 86 18 66 24 42 Z"/><path d="M34 50 Q39 43 44 50 Q39 57 34 50 Z M56 50 Q61 43 66 50 Q61 57 56 50 Z" fill="${c}" stroke="none"/><path d="M47 62 H53 L50 66 Z M50 66 Q46 72 42 70 M50 66 Q54 72 58 70"/><path d="M30 63 L10 59 M30 68 L10 72 M70 63 L90 59 M70 68 L90 72"/>`,
  },
  {
    key: 'mushroom',
    label: 'Champignon',
    cat: 'nature',
    tags: 'foret poison',
    svg: () => `<path d="M10 52 C10 26 30 12 50 12 C70 12 90 26 90 52 Z"/><path d="M38 52 C36 70 34 82 32 90 H68 C66 82 64 70 62 52"/><circle cx="34" cy="32" r="5"/><circle cx="56" cy="24" r="4"/><circle cx="70" cy="40" r="4.5"/><circle cx="48" cy="42" r="3.5"/>`,
  },
  {
    key: 'maple',
    label: 'Feuille d’érable',
    cat: 'nature',
    tags: 'momiji automne arbre',
    svg: () =>
      `<path d="M50 6 L57 26 L70 18 L66 36 L86 33 L75 49 L86 56 L65 60 L67 73 L53 66 H47 L33 73 L35 60 L14 56 L25 49 L14 33 L34 36 L30 18 L43 26 Z"/><path d="M50 66 V94 M50 64 V22 M50 58 L72 38 M50 58 L28 38"/>`,
  },
  { key: 'clover', label: 'Trèfle', cat: 'nature', tags: 'chance quatre feuilles', svg: () => `${around(4, heart(50, 30, 0.4))}<path d="M50 56 Q56 78 72 92"/>` },
  {
    key: 'rose',
    label: 'Rose',
    cat: 'nature',
    tags: 'fleur amour epines',
    svg: () => `${spiralAt(50, 38, 2.2, 1.9)}<path d="M26 36 C22 60 38 70 50 70 C62 70 78 60 74 36"/><path d="M50 70 V94 M50 82 Q36 74 30 82 Q40 90 50 86"/>`,
  },
  {
    key: 'thorns',
    label: 'Ronces',
    cat: 'nature',
    tags: 'epines couronne piege',
    svg: () => `<circle cx="50" cy="50" r="34"/>${around(10, '<path d="M46 16.5 L50 6 L54 16.5"/>')}${around(10, '<path d="M46 16.5 L50 25 L54 16.5"/>', 18)}`,
  },
  {
    key: 'jellyfish',
    label: 'Méduse',
    cat: 'nature',
    tags: 'mer ocean poison',
    svg: () =>
      `<path d="M18 48 C18 24 32 10 50 10 C68 10 82 24 82 48 Q74 44 66 48 Q58 44 50 48 Q42 44 34 48 Q26 44 18 48 Z"/><path d="M30 50 Q26 64 32 76 Q36 86 30 94 M44 50 Q40 66 46 78 Q50 88 44 94 M56 50 Q60 66 54 78 Q50 88 56 94 M70 50 Q74 64 68 76 Q64 86 70 94"/>`,
  },
  { key: 'pine', label: 'Pin', cat: 'nature', tags: 'arbre foret sapin', svg: () => `<path d="M50 6 L68 32 H58 L76 56 H62 L84 82 H16 L38 56 H24 L42 32 H32 Z"/><path d="M45 82 V94 H55 V82"/>` },

  // ---------------------------------------------------------------- Ajouts : éléments
  { key: 'rain', label: 'Pluie', cat: 'elements', tags: 'nuage averse eau', svg: () => `<path d="${CLOUD}"/><path d="M32 64 L26 80 M48 64 L42 82 M64 64 L58 80 M40 86 L37 94 M56 86 L53 94"/>` },
  { key: 'storm', label: 'Orage', cat: 'elements', tags: 'nuage foudre eclair tonnerre', svg: () => `<path d="${CLOUD}"/><path d="M54 54 L42 74 H54 L46 94 L68 66 H56 L62 54"/>` },
  {
    key: 'tide',
    label: 'Marée',
    cat: 'elements',
    tags: 'lune vagues mer ocean',
    svg: () =>
      `<path d="M58 8 A20 20 0 1 0 72 40 A15 15 0 1 1 58 8 Z"/><path d="M6 62 Q17 54 28 62 T50 62 T72 62 T94 62 M6 76 Q17 68 28 76 T50 76 T72 76 T94 76 M6 90 Q17 82 28 90 T50 90 T72 90 T94 90"/>`,
  },
  {
    key: 'thunder-drums',
    label: 'Tambours du tonnerre',
    cat: 'elements',
    tags: 'raijin foudre tambour',
    svg: () => `${around(8, '<circle cx="50" cy="13" r="7"/>')}<path d="M54 30 L42 52 H54 L46 72 L60 48 H50 L58 30"/>`,
  },

  // ---------------------------------------------------------------- Ajouts : astres
  {
    key: 'eclipse',
    label: 'Éclipse',
    cat: 'astres',
    tags: 'soleil lune ombre',
    svg: () => `<circle cx="50" cy="50" r="24"/><circle cx="57" cy="45" r="21"/>${around(16, '<path d="M50 18 V8"/>')}`,
  },
  {
    key: 'galaxy',
    label: 'Galaxie',
    cat: 'astres',
    tags: 'spirale etoiles cosmos',
    svg: (c) =>
      `${spiralAt(50, 50, 1.6, 3.6)}<g transform="rotate(180 50 50)">${spiralAt(50, 50, 1.6, 3.6)}</g>${[[18, 22], [84, 30], [80, 80], [16, 76], [50, 8]].map(([x, y]) => dot(x, y, 2, c)).join('')}`,
  },
  {
    key: 'moon-phases',
    label: 'Phases de lune',
    cat: 'astres',
    tags: 'lune cycle croissant',
    svg: (c) => {
      const y = 50;
      const r = 7;
      const f = `fill="${c}" stroke="none"`;
      const cell = (x: number, inner: string) => `<circle cx="${x}" cy="${y}" r="${r}"/>${inner}`;
      return (
        cell(14, '') +
        cell(32, `<path d="M32 ${y - r} A${r} ${r} 0 0 1 32 ${y + r} A4 ${r} 0 0 0 32 ${y - r} Z" ${f}/>`) +
        cell(50, `<path d="M50 ${y - r} A${r} ${r} 0 0 1 50 ${y + r} Z" ${f}/>`) +
        cell(68, `<path d="M68 ${y - r} A${r} ${r} 0 0 1 68 ${y + r} A4 ${r} 0 0 1 68 ${y - r} Z" ${f}/>`) +
        dot(86, y, r, c) +
        `<path d="M10 70 Q50 86 90 70" stroke-dasharray="2 5"/>`
      );
    },
  },
  {
    key: 'sun-eye',
    label: 'Soleil à l’œil',
    cat: 'astres',
    tags: 'soleil oeil divin',
    svg: (c) => `${around(12, '<path d="M50 14 V4"/>')}<circle cx="50" cy="50" r="32"/><path d="M28 50 Q50 32 72 50 Q50 68 28 50 Z"/>${dot(50, 50, 5, c)}`,
  },

  // ---------------------------------------------------------------- Ajouts : armes & liens
  {
    key: 'trident',
    label: 'Trident',
    cat: 'armes',
    tags: 'fourche lance mer',
    svg: () => `<path d="M50 94 V8 M30 14 V30 Q30 40 50 40 Q70 40 70 30 V14"/><path d="M25 21 L30 12 L35 21 M45 15 L50 6 L55 15 M65 21 L70 12 L75 21"/><path d="M44 72 H56 M44 78 H56"/>`,
  },
  { key: 'axe', label: 'Hache', cat: 'armes', tags: 'bucheron arme', svg: () => `<path d="M44 94 V8"/><path d="M44 20 L66 12 C88 24 88 52 66 64 L44 54 Z"/><path d="M66 12 Q74 38 66 64"/>` },
  { key: 'hammer', label: 'Marteau', cat: 'armes', tags: 'masse forge', svg: () => `<path d="M50 94 V36"/><path d="M24 14 H76 V36 H24 Z"/><path d="M38 14 V36 M62 14 V36"/>` },
  {
    key: 'anchor',
    label: 'Ancre',
    cat: 'armes',
    tags: 'bateau mer port',
    svg: () => `<circle cx="50" cy="13" r="7"/><path d="M50 20 V88 M34 32 H66"/><path d="M18 62 Q22 86 50 88 Q78 86 82 62"/><path d="M18 62 L12 71 M18 62 L27 67 M82 62 L88 71 M82 62 L73 67"/>`,
  },
  {
    key: 'kusarigama',
    label: 'Kusarigama',
    cat: 'armes',
    tags: 'faucille chaine arme ninja',
    svg: (c) => `<path d="M30 94 V40"/><path d="M30 40 C34 16 62 8 86 22 C64 20 46 28 34 48"/><path d="M26 40 H34"/><path d="M30 94 Q62 98 80 74" stroke-dasharray="6 3"/>${dot(82, 70, 5, c)}`,
  },
  {
    key: 'yari',
    label: 'Lance (yari)',
    cat: 'armes',
    tags: 'lance pique',
    svg: () => `<path d="M50 94 V28"/><path d="M50 4 L58 20 L54 26 H46 L42 20 Z"/><path d="M42 32 H58 M50 26 V32"/><path d="M50 36 Q40 46 44 58 M50 36 Q60 46 56 58"/>`,
  },
  {
    key: 'kunai-crossed',
    label: 'Kunais croisés',
    cat: 'armes',
    tags: 'kunai couteau ninja',
    svg: () => {
      const k = `<path d="M50 6 L57 32 L50 40 L43 32 Z"/><path d="M50 40 V78"/><circle cx="50" cy="84" r="5"/><path d="M45 50 H55 M45 58 H55"/>`;
      return `<g transform="rotate(-38 50 50)">${k}</g><g transform="rotate(38 50 50)">${k}</g>`;
    },
  },
  {
    key: 'smoke-bomb',
    label: 'Bombe fumigène',
    cat: 'armes',
    tags: 'bombe explosif fumee ninja',
    svg: () => `<circle cx="46" cy="60" r="28"/><path d="M60 36 Q68 22 80 22"/><path d="M84 14 L86 8 M90 22 L96 22 M88 28 L93 32 M80 14 L78 8"/><path d="M30 52 Q36 42 46 40"/>`,
  },
  {
    key: 'makibishi',
    label: 'Makibishi',
    cat: 'armes',
    tags: 'chausse trappe piege pointes',
    svg: () => `<path d="M50 50 L50 12 M50 50 L18 76 M50 50 L82 76 M50 50 L54 66"/><path d="M46 20 L50 10 L54 20 M22 69 L14 79 L26 79 M78 69 L86 79 L74 79"/><circle cx="50" cy="50" r="5"/>`,
  },

  // ---------------------------------------------------------------- Ajouts : sacré & mystique
  {
    key: 'tri-dots',
    label: 'Trois points',
    cat: 'mystique',
    tags: 'triangle trinite',
    svg: (c) => `<circle cx="50" cy="50" r="44"/>${[-90, 30, 150].map((a) => { const [x, y] = pt(20, a).split(' ').map(Number); return dot(x, y, 8, c); }).join('')}${dot(50, 50, 3.5, c)}`,
  },
  {
    key: 'hooks',
    label: 'Sceau des crochets',
    cat: 'mystique',
    tags: 'crochets spirale sigil',
    svg: (c) => `<path d="M${pt(14, 0)} A14 14 0 1 1 ${pt(14, -90)}"/>${dot(50, 50, 4, c)}<path d="M34 12 C20 30 20 70 34 88 M66 12 C80 30 80 70 66 88"/><path d="M18 22 L30 27 M18 78 L30 73 M82 22 L70 27 M82 78 L70 73"/>`,
  },
  { key: 'heptagram', label: 'Heptagramme', cat: 'mystique', tags: 'etoile sept branches', svg: () => `<circle cx="50" cy="50" r="44"/>${starPolygon(7, 3, 42)}` },
  {
    key: 'enneagram',
    label: 'Ennéagramme',
    cat: 'mystique',
    tags: 'neuf points etoile',
    svg: () => {
      const v = (i: number) => pt(42, -90 + i * 40);
      return `<circle cx="50" cy="50" r="42"/><path d="M${v(0)} L${v(3)} L${v(6)} Z"/><path d="M${[1, 4, 2, 8, 5, 7, 1].map(v).join(' L')}"/>`;
    },
  },
  { key: 'vesica', label: 'Vesica piscis', cat: 'mystique', tags: 'deux cercles amande', svg: () => `<circle cx="38" cy="50" r="28"/><circle cx="62" cy="50" r="28"/><path d="M50 8 V92"/>` },
  {
    key: 'seed-of-life',
    label: 'Graine de vie',
    cat: 'mystique',
    tags: 'cercles fleur geometrie sacree',
    svg: () => `<circle cx="50" cy="50" r="32"/><circle cx="50" cy="50" r="16"/>${around(6, '<circle cx="50" cy="34" r="16"/>')}`,
  },
  {
    key: 'enso',
    label: 'Ensō',
    cat: 'mystique',
    tags: 'cercle zen pinceau',
    svg: () => `<path d="M${pt(38, -64)} A38 38 0 1 1 ${pt(38, -112)}"/><path d="M${pt(38, -64)} Q64 12 70 8"/>`,
  },
  { key: 'triangles', label: 'Triangles imbriqués', cat: 'mystique', tags: 'triangle', svg: () => poly(3, 44, -90) + poly(3, 28, 90) + poly(3, 14, -90) },
  {
    key: 'keyhole',
    label: 'Serrure scellée',
    cat: 'mystique',
    tags: 'serrure cle verrou',
    svg: (c) => `<circle cx="50" cy="50" r="42"/><circle cx="50" cy="50" r="34" stroke-dasharray="3 5"/>${dot(50, 40, 10, c)}<path d="M43 46 L38 74 H62 L57 46 Z" fill="${c}" stroke="none"/>`,
  },
  {
    key: 'chakra-wheel',
    label: 'Roue du chakra',
    cat: 'mystique',
    tags: 'roue dharma',
    svg: (c) => `<circle cx="50" cy="50" r="36"/><circle cx="50" cy="50" r="10"/>${around(8, '<path d="M50 40 V14"/>')}${around(8, dot(50, 8, 3.5, c))}`,
  },
  {
    key: 'asanoha',
    label: 'Asanoha',
    cat: 'mystique',
    tags: 'chanvre motif japonais etoile',
    svg: () => `${poly(6, 42, -90)}${around(6, '<path d="M50 50 L50 8"/>')}${around(6, `<path d="M50 50 L${pt(36.4, -60)}"/>`)}${around(6, `<path d="M50 8 L${pt(21, -60)}"/>`)}`,
  },
];
