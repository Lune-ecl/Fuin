// Symboles centraux du créateur de sceaux, dessinés dans une boîte 100 × 100.
// Le trait (couleur, épaisseur) vient du groupe parent ; seuls les points pleins
// reçoivent la couleur `c` en remplissage.

export interface SealSymbol {
  key: string;
  label: string;
  cat: SymbolCategory;
  svg: (color: string) => string;
}

export type SymbolCategory = 'corps' | 'elements' | 'astres' | 'armes' | 'nature' | 'mystique';

export const SYMBOL_CATEGORIES: { key: SymbolCategory; label: string }[] = [
  { key: 'corps', label: 'Corps & esprit' },
  { key: 'elements', label: 'Éléments' },
  { key: 'astres', label: 'Astres' },
  { key: 'armes', label: 'Armes & liens' },
  { key: 'nature', label: 'Nature & bêtes' },
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
  { key: 'heart', label: 'Cœur', cat: 'corps', svg: () => `<path d="${HEART}"/>` },
  {
    key: 'heart-pierced',
    label: 'Cœur transpercé',
    cat: 'corps',
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
    cat: 'corps',
    svg: (c) =>
      `<path d="M26 54 A24 24 0 1 1 74 54 V66 H64 V78 H36 V66 H26 Z"/>${dot(40, 50, 7, c)}${dot(60, 50, 7, c)}<path d="M47 64 L50 58 L53 64 Z M44 70 V78 M50 70 V78 M56 70 V78"/>`,
  },
  {
    key: 'mask',
    label: 'Masque',
    cat: 'corps',
    svg: () =>
      `<path d="M20 20 Q50 4 80 20 V52 Q80 84 50 92 Q20 84 20 52 Z"/><path d="M28 44 Q37 34 46 44 Q37 50 28 44 Z M54 44 Q63 34 72 44 Q63 50 54 44 Z"/><path d="M40 72 Q50 66 60 72"/><path d="M26 56 L34 62 M74 56 L66 62"/>`,
  },
  {
    key: 'kitsune',
    label: 'Masque de renard',
    cat: 'corps',
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
    cat: 'mystique',
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
    cat: 'corps',
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
    cat: 'elements',
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
];
