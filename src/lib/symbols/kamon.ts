import { around, ci, dot, heart, n, petal, poly, xy, type SealSymbol } from '../symbolKit';

const mon = (key: string, label: string, svg: (c: string) => string, tags = ''): SealSymbol => ({
  key: `kamon-${key}`,
  label,
  cat: 'kamon',
  tags: `kamon blason clan japonais ${tags}`,
  svg,
});

const RING = ci(50, 50, 44);

function diamond(cx: number, cy: number, w: number, h: number): string {
  return `<path d="M${n(cx)} ${n(cy - h)} L${n(cx + w)} ${n(cy)} L${n(cx)} ${n(cy + h)} L${n(cx - w)} ${n(cy)} Z"/>`;
}

export const KAMON: SealSymbol[] = [
  mon('kikyo', 'Kikyō (campanule)', () => `${RING}${around(5, '<path d="M50 48 L39 24 L50 12 L61 24 Z M50 24 V40"/>')}${ci(50, 50, 5)}`, 'campanule fleur'),
  mon('kiku', 'Chrysanthème impérial', () => `${RING}${around(16, '<path d="M50 38 C45 30 45 14 50 10 C55 14 55 30 50 38 Z"/>')}${ci(50, 50, 11)}`, 'chrysantheme empereur'),
  mon('umebachi', 'Ume-bachi (prunier)', (c) => `${RING}${around(5, ci(50, 27, 11))}${ci(50, 50, 8)}${around(5, '<path d="M50 42 V39"/>', 36)}${dot(50, 50, 3, c)}`, 'prunier ume fleur'),
  mon('mokko', 'Mokkō', () => `${RING}<path d="M50 14 C62 14 66 26 62 34 C70 30 86 34 86 50 C86 66 70 70 62 66 C66 74 62 86 50 86 C38 86 34 74 38 66 C30 70 14 66 14 50 C14 34 30 30 38 34 C34 26 38 14 50 14 Z"/>${poly(4, 13, -45)}`, 'mokko quatre lobes'),
  mon('kikko', 'Trois carapaces (kikkō)', () => `${RING}${[-90, 30, 150].map((a) => { const [x, y] = xy(16, a); return poly(6, 15, -90, undefined, x, y); }).join('')}`, 'tortue carapace hexagone'),
  mon('takeda-bishi', 'Takeda-bishi', () => `${diamond(50, 30, 15, 12)}${diamond(34, 50, 15, 12)}${diamond(66, 50, 15, 12)}${diamond(50, 70, 15, 12)}`, 'losanges takeda'),
  mon('wachigai', 'Anneaux entrelacés (wachigai)', () => `${RING}${ci(38, 50, 20)}${ci(62, 50, 20)}${ci(38, 50, 13)}${ci(62, 50, 13)}`, 'anneaux'),
  mon('kuyo', 'Kuyō (neuf astres)', (c) => `${RING}${ci(50, 50, 12)}${around(8, ci(50, 18, 8))}${dot(50, 50, 4, c)}`, 'neuf astres cercles'),
  mon('tsuru-maru', 'Grue en cercle (tsuru-maru)', (c) =>
    `${RING}<path d="M50 34 C30 32 16 46 20 64 C24 76 36 80 46 78 M50 34 C70 32 84 46 80 64 C76 76 64 80 54 78 M50 34 V70 M44 70 L50 82 L56 70 M30 52 L40 56 M70 52 L60 56 M28 62 L40 64 M72 62 L60 64"/>${ci(50, 26, 6)}<path d="M50 20 L50 14"/>${dot(50, 22, 2, c)}`, 'grue tsuru'),
  mon('hitotsu-hiki', 'Maru ni hitotsu-hiki', () => `${RING}<path d="M10 44 H90 M10 56 H90"/>`, 'cercle barre'),
  mon('futatsu-hiki', 'Maru ni futatsu-hiki', () => `${RING}<path d="M10 34 H90 M10 44 H90 M10 56 H90 M10 66 H90"/>`, 'cercle deux barres'),
  mon('mitsu-hiki', 'Maru ni mitsu-hiki', () => `${RING}<path d="M14 30 H86 M14 36 H86 M10 47 H90 M10 53 H90 M14 64 H86 M14 70 H86"/>`, 'cercle trois barres'),
  mon('aoi', 'Mitsuba-aoi (rose trémière)', () => `${RING}${around(3, heart(50, 33, 0.36))}${around(3, '<path d="M50 50 V20"/>')}`, 'aoi tokugawa feuilles'),
  mon('kashiwa', 'Trois feuilles de chêne', () =>
    `${RING}${around(3, '<path d="M50 50 C44 46 38 44 38 38 C34 36 34 30 38 28 C34 24 38 18 42 20 C42 14 48 12 50 14 C52 12 58 14 58 20 C62 18 66 24 62 28 C66 30 66 36 62 38 C62 44 56 46 50 50 Z M50 50 V18"/>')}`, 'chene kashiwa feuilles'),
  mon('seigaiha', 'Seigaiha (vagues)', () => {
    let s = '';
    for (const [cx, cy] of [[34, 38], [66, 38], [18, 54], [50, 54], [82, 54], [34, 70], [66, 70], [18, 86], [50, 86], [82, 86]] as [number, number][])
      for (const r of [16, 10, 4]) s += `<path d="M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy}"/>`;
    return s;
  }, 'vagues ocean motif'),
  mon('shippo', 'Shippō (sept trésors)', () => `${RING}${ci(50, 50, 18)}${ci(32, 50, 18)}${ci(68, 50, 18)}${ci(50, 32, 18)}${ci(50, 68, 18)}`, 'cercles tresors'),
  mon('igeta', 'Igeta (margelle de puits)', () => `${RING}<path d="M36 18 V82 M64 18 V82 M18 36 H82 M18 64 H82"/>`, 'puits diese'),
  mon('kuginuki', 'Kuginuki (arrache-clou)', () => `${RING}<path d="M24 24 H76 V76 H24 Z"/><path d="M42 42 H58 V58 H42 Z"/>`, 'carre clou'),
  mon('yotsume', 'Yotsume (quatre yeux)', () => `${RING}${[[50, 30], [30, 50], [70, 50], [50, 70]].map(([x, y]) => `<path d="M${x} ${y - 11} L${x + 11} ${y} L${x} ${y + 11} L${x - 11} ${y} Z M${x} ${y - 4} L${x + 4} ${y} L${x} ${y + 4} L${x - 4} ${y} Z"/>`).join('')}`, 'quatre carres'),
  mon('mitsu-uroko', 'Mitsu-uroko (trois écailles)', () => `<path d="M50 12 L86 78 H14 Z M32 45 H68 L50 78 Z"/>`, 'ecailles triangles hojo'),
  mon('take', 'Bambous en cercle', () => `${RING}<path d="M38 86 V14 M62 86 V14 M34 34 H42 M34 58 H42 M58 26 H66 M58 50 H66 M58 74 H66"/><path d="M38 34 Q28 24 18 26 M62 50 Q74 40 82 42 M38 58 Q26 52 20 56"/>`, 'bambou'),
  mon('kasa', 'Ombrelle vue du dessus', (c) => `${RING}${ci(50, 50, 36)}${around(16, '<path d="M50 50 V14"/>')}${dot(50, 50, 5, c)}`, 'ombrelle parapluie'),
  mon('hishi', 'Losanges en treillis', () => `${RING}${diamond(50, 50, 34, 34)}<path d="M33 33 L67 67 M67 33 L33 67"/>`, 'losange treillis'),
  mon('wari-bishi', 'Wari-bishi (losange fendu)', () => `${diamond(50, 50, 40, 40)}${diamond(50, 31, 17, 17)}${diamond(31, 50, 17, 17)}${diamond(69, 50, 17, 17)}${diamond(50, 69, 17, 17)}`, 'losange fendu'),
  mon('hana-bishi', 'Hana-bishi (fleur en losange)', (c) => `${RING}${around(4, petal(6, 38, 13))}${around(4, petal(10, 26, 5), 45)}${dot(50, 50, 4, c)}`, 'fleur losange'),
  mon('ginkgo-trio', 'Trois feuilles de ginkgo', () =>
    `${RING}${around(3, '<path d="M50 50 L50 34 C38 30 30 22 32 12 C40 16 46 14 50 10 C54 14 60 16 68 12 C70 22 62 30 50 34 M50 34 L50 14"/>')}`, 'ginkgo feuilles'),
];
