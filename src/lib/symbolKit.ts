// Outils partagés par les fichiers de symboles : chaque symbole est dessiné dans une boîte
// 100 × 100. Le trait (couleur, épaisseur) vient du groupe parent ; seuls les points pleins
// reçoivent la couleur `c` en remplissage.

export interface SealSymbol {
  key: string;
  label: string;
  cat: SymbolCategory;
  svg: (color: string) => string;
  /** autres mots qui retrouvent le symbole à la recherche */
  tags?: string;
}

export type SymbolCategory =
  | 'corps'
  | 'coeurs'
  | 'visages'
  | 'esprits'
  | 'elements'
  | 'astres'
  | 'armes'
  | 'animaux'
  | 'nature'
  | 'objets'
  | 'reperes'
  | 'runes'
  | 'geometrie'
  | 'kamon'
  | 'mystique';

export const n = (x: number) => Math.round(x * 100) / 100;
export const rad = (deg: number) => (deg * Math.PI) / 180;
export const pt = (r: number, deg: number, cx = 50, cy = 50) => `${n(cx + r * Math.cos(rad(deg)))} ${n(cy + r * Math.sin(rad(deg)))}`;
export const xy = (r: number, deg: number, cx = 50, cy = 50): [number, number] => [n(cx + r * Math.cos(rad(deg))), n(cy + r * Math.sin(rad(deg)))];
export const dot = (x: number, y: number, r: number, c: string) => `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${c}" stroke="none"/>`;
export const ci = (x: number, y: number, r: number) => `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}"/>`;
export const el = (x: number, y: number, rx: number, ry: number, rot = 0) =>
  `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(rx)}" ry="${n(ry)}"${rot ? ` transform="rotate(${n(rot)} ${n(x)} ${n(y)})"` : ''}/>`;
export const p = (d: string) => `<path d="${d}"/>`;
export const fill = (d: string, c: string) => `<path d="${d}" fill="${c}" stroke="none"/>`;
export const dash = (d: string, pattern = '4 5') => `<path d="${d}" stroke-dasharray="${pattern}"/>`;

/** Polygone régulier (ou étoile si `inner` est donné). */
export function poly(count: number, r: number, start = -90, inner?: number, cx = 50, cy = 50): string {
  const pts: string[] = [];
  const total = inner ? count * 2 : count;
  for (let i = 0; i < total; i++) pts.push(pt(inner && i % 2 ? inner : r, start + (i * 360) / total, cx, cy));
  return `<path d="M${pts.join(' L')} Z"/>`;
}

/** Répète un motif autour du centre. */
export function around(count: number, shape: string, offset = 0): string {
  return Array.from({ length: count }, (_, i) => `<g transform="rotate(${n(offset + (i * 360) / count)} 50 50)">${shape}</g>`).join('');
}

/** Étoile en polygone étoilé {count/step}. */
export function starPolygon(count: number, step: number, r: number, start = -90): string {
  // un polygone étoilé dont le pas divise le nombre de branches se dessine en plusieurs tracés
  const g = gcd(count, step);
  const per = count / g;
  let out = '';
  for (let k = 0; k < g; k++) {
    const pts = Array.from({ length: per }, (_, i) => pt(r, start + ((k + i * step) % count) * (360 / count)));
    out += `<path d="M${pts.join(' L')} Z"/>`;
  }
  return out;
}

function gcd(a: number, b: number): number {
  return b ? gcd(b, a % b) : a;
}

/** Courbe paramétrique recadrée pour remplir un disque de rayon `fit` autour du centre. */
export function curve(fn: (t: number) => [number, number], t0: number, t1: number, steps = 480, fit = 42, closed = true): string {
  const raw: [number, number][] = [];
  for (let i = 0; i <= steps; i++) raw.push(fn(t0 + ((t1 - t0) * i) / steps));
  const max = Math.max(...raw.map(([x, y]) => Math.hypot(x, y))) || 1;
  const k = fit / max;
  const d = raw.map(([x, y], i) => `${i ? 'L' : 'M'}${n(50 + x * k)} ${n(50 + y * k)}`).join(' ');
  return `<path d="${d}${closed ? ' Z' : ''}"/>`;
}

/** Spirale autour de (cx, cy) : `turns` tours, rayon qui grandit de `growth` par radian. */
export function spiralAt(cx: number, cy: number, turns: number, growth: number, flip = false, start = 1): string {
  const pts: string[] = [];
  const steps = Math.round(turns * 40);
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2 * turns;
    const r = start + t * growth;
    pts.push(`${n(cx + (flip ? -1 : 1) * r * Math.cos(t))},${n(cy + r * Math.sin(t))}`);
  }
  return `<polyline points="${pts.join(' ')}"/>`;
}

/** Cœur centré en (cx, cy), à l'échelle k. */
export function heart(cx: number, cy: number, k: number): string {
  const P = (x: number, y: number) => `${n(cx + (x - 50) * k)} ${n(cy + (y - 52) * k)}`;
  return `<path d="M${P(50, 86)} C${P(20, 64)} ${P(10, 48)} ${P(14, 32)} C${P(18, 18)} ${P(38, 14)} ${P(50, 30)} C${P(62, 14)} ${P(82, 18)} ${P(86, 32)} C${P(90, 48)} ${P(80, 64)} ${P(50, 86)} Z"/>`;
}

/** Goutte pointe en haut, ventre centré en (cx, cy). */
export function drop(cx: number, cy: number, r: number, c?: string): string {
  const d = `M${n(cx)} ${n(cy - 2.2 * r)} C${n(cx + 0.6 * r)} ${n(cy - r)} ${n(cx + r)} ${n(cy - 0.3 * r)} ${n(cx + r)} ${n(cy + 0.2 * r)} A${n(r)} ${n(r)} 0 0 1 ${n(cx - r)} ${n(cy + 0.2 * r)} C${n(cx - r)} ${n(cy - 0.3 * r)} ${n(cx - 0.6 * r)} ${n(cy - r)} ${n(cx)} ${n(cy - 2.2 * r)} Z`;
  return c ? fill(d, c) : p(d);
}

/** Pétale en amande, de la base (rayon r0) à la pointe (rayon r1), largeur w. */
export function petal(r0: number, r1: number, w: number, angle = -90): string {
  const [ax, ay] = xy(r0, angle);
  const [bx, by] = xy(r1, angle);
  const mid = (r0 + r1) / 2;
  const [l1x, l1y] = xy(Math.hypot(mid, w), angle - (Math.atan2(w, mid) * 180) / Math.PI);
  const [l2x, l2y] = xy(Math.hypot(mid, w), angle + (Math.atan2(w, mid) * 180) / Math.PI);
  return `<path d="M${ax} ${ay} Q${l1x} ${l1y} ${bx} ${by} Q${l2x} ${l2y} ${ax} ${ay} Z"/>`;
}

/** Miroir horizontal (gauche ↔ droite) d'un tracé dessiné sur la moitié gauche. */
export const mirror = (shape: string) => `${shape}<g transform="translate(100 0) scale(-1 1)">${shape}</g>`;
