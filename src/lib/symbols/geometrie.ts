import { around, ci, curve, n, p, petal, poly, pt, starPolygon, xy, type SealSymbol } from '../symbolKit';

const geo = (key: string, label: string, svg: () => string, tags = ''): SealSymbol => ({
  key,
  label,
  cat: 'geometrie',
  tags: `geometrie sacree ${tags}`,
  svg,
});

// Polygones étoilés {n/k}
const STARS: SealSymbol[] = (
  [
    [7, 2, 'Étoile à 7 branches ouverte'],
    [8, 3, 'Octogramme'],
    [9, 2, 'Étoile à 9 branches'],
    [9, 4, 'Ennéagramme étoilé'],
    [10, 3, 'Décagramme'],
    [11, 3, 'Étoile à 11 branches'],
    [11, 4, 'Étoile à 11 branches aiguë'],
    [12, 5, 'Dodécagramme'],
  ] as [number, number, string][]
).map(([count, step, label]) => geo(`star-${count}-${step}`, label, () => `${starPolygon(count, step, 42)}`, 'etoile polygone'));

// Rosaces : r = cos(kθ)
const rose = (k: number, turns: number) => curve((t) => [Math.cos(k * t) * Math.cos(t), Math.cos(k * t) * Math.sin(t)], 0, Math.PI * turns, 720, 42);
const ROSES: SealSymbol[] = [
  geo('rose-2', 'Rosace à 4 pétales', () => rose(2, 2), 'rosace courbe fleur'),
  geo('rose-3', 'Rosace à 3 pétales', () => rose(3, 1), 'rosace courbe fleur'),
  geo('rose-4', 'Rosace à 8 pétales', () => rose(4, 2), 'rosace courbe fleur'),
  geo('rose-5', 'Rosace à 5 pétales', () => rose(5, 1), 'rosace courbe fleur'),
  geo('rose-6', 'Rosace à 12 pétales', () => rose(6, 2), 'rosace courbe fleur'),
  geo('rose-7', 'Rosace à 7 pétales', () => rose(7, 1), 'rosace courbe fleur'),
  geo('rose-3-2', 'Rosace entrelacée', () => rose(1.5, 4), 'rosace courbe'),
  geo('rose-5-3', 'Rosace tressée', () => rose(5 / 3, 6), 'rosace courbe'),
];

// Courbes de Lissajous
const liss = (a: number, b: number, phase: number) => curve((t) => [Math.sin(a * t + phase), Math.sin(b * t)], 0, Math.PI * 2, 720, 40);
const LISSAJOUS: SealSymbol[] = [
  geo('lissajous-1-2', 'Lissajous 1:2', () => liss(1, 2, Math.PI / 2), 'courbe onde'),
  geo('lissajous-3-2', 'Lissajous 3:2', () => liss(3, 2, Math.PI / 2), 'courbe onde'),
  geo('lissajous-3-4', 'Lissajous 3:4', () => liss(3, 4, Math.PI / 2), 'courbe onde'),
  geo('lissajous-5-4', 'Lissajous 5:4', () => liss(5, 4, Math.PI / 2), 'courbe onde'),
];

// Spirographes (hypotrochoïdes et épitrochoïdes)
const hypo = (R: number, r: number, d: number, turns: number) =>
  curve((t) => [(R - r) * Math.cos(t) + d * Math.cos(((R - r) / r) * t), (R - r) * Math.sin(t) - d * Math.sin(((R - r) / r) * t)], 0, Math.PI * 2 * turns, 1200, 42);
const epi = (R: number, r: number, d: number, turns: number) =>
  curve((t) => [(R + r) * Math.cos(t) - d * Math.cos(((R + r) / r) * t), (R + r) * Math.sin(t) - d * Math.sin(((R + r) / r) * t)], 0, Math.PI * 2 * turns, 1200, 42);
const SPIRO: SealSymbol[] = [
  geo('spiro-5-3', 'Spirographe à 5 boucles', () => hypo(5, 3, 5, 3), 'spirographe'),
  geo('spiro-7-3', 'Spirographe à 7 boucles', () => hypo(7, 3, 4, 3), 'spirographe'),
  geo('spiro-8-5', 'Spirographe en couronne', () => hypo(8, 5, 6, 5), 'spirographe'),
  geo('spiro-epi-3', 'Épitrochoïde à 3 lobes', () => epi(3, 1, 2, 1), 'spirographe'),
  geo('spiro-epi-5', 'Épitrochoïde à 5 lobes', () => epi(5, 1, 3, 1), 'spirographe'),
  geo('spiro-epi-7', 'Fleur de spirographe', () => epi(7, 2, 3, 2), 'spirographe fleur'),
  geo('nephroid', 'Néphroïde', () => epi(2, 1, 1, 1), 'courbe'),
  geo('deltoid', 'Deltoïde', () => hypo(3, 1, 1, 1), 'courbe triangle'),
  geo('astroid', 'Astroïde', () => hypo(4, 1, 1, 1), 'courbe etoile'),
  geo('cardioid', 'Cardioïde', () => curve((t) => [(1 - Math.cos(t)) * Math.cos(t) + 1, (1 - Math.cos(t)) * Math.sin(t)], 0, Math.PI * 2, 480, 40), 'courbe coeur'),
];

// Spirale d'or : carrés de Fibonacci et quarts de cercle qui s'enchaînent
function goldenSpiral(): string {
  const sizes = [1, 1, 2, 3, 5, 8];
  const dirs = ['up', 'right', 'down', 'left'] as const;
  const squares: { x: number; y: number; s: number; d: (typeof dirs)[number] }[] = [{ x: 0, y: 0, s: 1, d: 'up' }];
  let [bx0, by0, bx1, by1] = [0, 0, 1, 1];
  for (let i = 1; i < sizes.length; i++) {
    const s = sizes[i];
    const d = dirs[i % 4];
    if (d === 'right') {
      squares.push({ x: bx1, y: by0, s, d });
      bx1 += s;
    } else if (d === 'down') {
      squares.push({ x: bx0, y: by1, s, d });
      by1 += s;
    } else if (d === 'left') {
      squares.push({ x: bx0 - s, y: by0, s, d });
      bx0 -= s;
    } else {
      squares.push({ x: bx0, y: by0 - s, s, d });
      by0 -= s;
    }
  }
  const k = 84 / (bx1 - bx0);
  const ox = 50 - ((bx0 + bx1) / 2) * k;
  const oy = 50 - ((by0 + by1) / 2) * k;
  const X = (x: number) => n(ox + x * k);
  const Y = (y: number) => n(oy + y * k);
  let rects = '';
  let arcs = '';
  for (const q of squares) {
    rects += `M${X(q.x)} ${Y(q.y)} H${X(q.x + q.s)} V${Y(q.y + q.s)} H${X(q.x)} Z `;
    const r = n(q.s * k);
    const [from, to] =
      q.d === 'right'
        ? [[q.x, q.y], [q.x + q.s, q.y + q.s]]
        : q.d === 'down'
          ? [[q.x + q.s, q.y], [q.x, q.y + q.s]]
          : q.d === 'left'
            ? [[q.x + q.s, q.y + q.s], [q.x, q.y]]
            : [[q.x, q.y + q.s], [q.x + q.s, q.y]];
    arcs += `M${X(from[0])} ${Y(from[1])} A${r} ${r} 0 0 1 ${X(to[0])} ${Y(to[1])} `;
  }
  return `<path d="${rects.trim()}" stroke-opacity="0.45"/><path d="${arcs.trim()}"/>`;
}

function metatron(): string {
  const pts: [number, number][] = [[50, 50]];
  for (let i = 0; i < 6; i++) pts.push(xy(18, -90 + i * 60));
  for (let i = 0; i < 6; i++) pts.push(xy(36, -90 + i * 60));
  let s = pts.map(([x, y]) => ci(x, y, 7)).join('');
  const lines: string[] = [];
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) lines.push(`M${pts[i][0]} ${pts[i][1]} L${pts[j][0]} ${pts[j][1]}`);
  s += `<path d="${lines.join(' ')}" stroke-opacity="0.5"/>`;
  return s;
}

function fruitOfLife(): string {
  let s = ci(50, 50, 8);
  for (let i = 0; i < 6; i++) {
    const [x, y] = xy(16, -90 + i * 60);
    const [x2, y2] = xy(32, -90 + i * 60);
    s += ci(x, y, 8) + ci(x2, y2, 8);
  }
  return s;
}

function yantra(): string {
  return (
    `${ci(50, 50, 44)}` +
    `<path d="M50 14 L80 66 H20 Z M50 82 L20 30 H80 Z M50 24 L72 62 H28 Z M50 72 L28 38 H72 Z M50 36 L62 56 H38 Z"/>` +
    `${ci(50, 50, 3)}`
  );
}

function borromean(): string {
  return [-90, 30, 150]
    .map((a) => {
      const [x, y] = xy(14, a);
      return ci(x, y, 24);
    })
    .join('');
}

export const GEOMETRIE: SealSymbol[] = [
  ...STARS,
  ...ROSES,
  ...LISSAJOUS,
  ...SPIRO,
  geo('golden-spiral', 'Spirale d’or', goldenSpiral, 'fibonacci nombre d or'),
  geo('log-spiral', 'Spirale logarithmique', () => curve((t) => [Math.exp(0.18 * t) * Math.cos(t), Math.exp(0.18 * t) * Math.sin(t)], 0, Math.PI * 7, 700, 42, false), 'spirale'),
  geo('metatron', 'Cube de Métatron', metatron, 'metatron cube'),
  geo('fruit-of-life', 'Fruit de vie', fruitOfLife, 'cercles fleur de vie'),
  geo('torus', 'Tore', () => around(12, ci(50, 30, 20)), 'tore cercles'),
  geo('squares-spin', 'Carrés tournoyants', () => [0, 15, 30, 45, 60, 75].map((a, i) => poly(4, 42 - i * 4.5, -45 + a)).join(''), 'carre rotation'),
  geo('nested-polygons', 'Polygones gigognes', () => poly(3, 44, -90) + poly(4, 30, -45) + poly(5, 19, -90) + poly(6, 11, -90) + ci(50, 50, 5), 'polygones'),
  geo('yantra', 'Yantra', yantra, 'triangles meditation'),
  geo('chakana', 'Croix à degrés', () => p('M40 10 H60 V24 H76 V40 H90 V60 H76 V76 H60 V90 H40 V76 H24 V60 H10 V40 H24 V24 H40 Z') + ci(50, 50, 10), 'croix escalier'),
  geo('endless-knot', 'Nœud éternel', () => `<g transform="rotate(45 50 50)">${p('M30 30 H70 V70 H30 Z M30 43 H70 M30 57 H70 M43 30 V70 M57 30 V70')}${p('M30 43 A7 7 0 1 1 30 57 M70 43 A7 7 0 1 0 70 57 M43 30 A7 7 0 1 1 57 30 M43 70 A7 7 0 1 0 57 70')}</g>`, 'noeud bouddhiste'),
  geo('solomon-knot', 'Nœud de Salomon', () => `<ellipse cx="50" cy="50" rx="38" ry="15"/><ellipse cx="50" cy="50" rx="15" ry="38"/>${ci(50, 50, 6)}`, 'noeud'),
  geo('borromean', 'Anneaux borroméens', borromean, 'trois cercles noeud'),
  geo('gothic-rose', 'Rosace gothique', () => `${ci(50, 50, 44)}${ci(50, 50, 12)}${around(6, `<path d="M${pt(12, -120)} A20 20 0 0 1 ${pt(12, -60)}"/><path d="M${pt(44, -120)} Q50 20 ${pt(44, -60)}"/>`)}${around(6, `<path d="M${pt(12, -90)} L${pt(44, -90)}"/>`, 30)}`, 'vitrail cathedrale'),
  geo('mandala-8', 'Mandala à 8 pétales', () => `${ci(50, 50, 44)}${around(8, petal(12, 40, 9))}${ci(50, 50, 10)}${ci(50, 50, 4)}`, 'mandala fleur'),
  geo('mandala-12', 'Mandala à 12 pétales', () => `${ci(50, 50, 46)}${around(12, petal(22, 44, 6))}${around(12, petal(9, 24, 4), 15)}${ci(50, 50, 8)}`, 'mandala fleur'),
  geo('sacred-grid', 'Grille sacrée', () => {
    let s = poly(6, 42, -90);
    for (let i = 0; i < 3; i++) s += `<path d="M${pt(42, -90 + i * 60)} L${pt(42, 90 + i * 60)}"/>`;
    for (let i = 0; i < 6; i++) s += `<path d="M${pt(42, -90 + i * 60)} L${pt(42, -90 + (i + 2) * 60)}"/>`;
    return s;
  }, 'grille triangle hexagone'),
];
