// Code du Conclave : chaque lettre d'un message devient un kanji. La table est gardée d'une
// modification à l'autre (seules les nouvelles lettres reçoivent un kanji tiré au hasard).

export interface KeyEntry {
  l: string;
  k: string;
  hidden?: boolean;
}

/** Kanjis du fuin utilisés pour coder les lettres (au moins 26, tous différents). */
export const CODE_POOL = [...'封印結界魂雷縛解門鍵血火水風土光闇影月星天地心命夢刃鎖霊鬼龍狐蛇陣符札禁呪'];

/** Message sans accents ni majuscules (« Le sceau cède » → « le sceau cede »). */
export const plainText = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/\s+/g, ' ')
    .trim();

const shuffle = <T,>(list: T[]) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** Table pour un message : on garde les lettres déjà codées, on code les nouvelles, on retire les inutiles. */
export function buildKey(message: string, previous: KeyEntry[] = [], reshuffle = false): KeyEntry[] {
  const letters = [...new Set([...plainText(message)].filter((c) => /[a-z]/.test(c)))].sort();
  const keep = reshuffle ? [] : previous.filter((e) => letters.includes(e.l));
  const used = new Set(keep.map((e) => e.k));
  const free = shuffle(CODE_POOL.filter((k) => !used.has(k)));
  return letters.map((l) => {
    const old = keep.find((e) => e.l === l);
    if (old) return old;
    const hidden = reshuffle ? previous.find((e) => e.l === l)?.hidden : undefined;
    return { l, k: free.shift() ?? '？', ...(hidden ? { hidden } : {}) };
  });
}

/** Message codé : les lettres deviennent des kanjis, les espaces séparent les mots. */
export function encode(message: string, key: KeyEntry[]): string {
  const map = new Map(key.map((e) => [e.l, e.k]));
  return plainText(message)
    .split(' ')
    .map((word) => [...word].map((c) => map.get(c) ?? c).join(''))
    .join(' ');
}

/** Cache environ une lettre sur quatre (les moins fréquentes d'abord restent visibles). */
export function hideSome(key: KeyEntry[], ratio = 0.25): KeyEntry[] {
  const n = Math.max(1, Math.round(key.length * ratio));
  const pick = new Set(shuffle(key.map((e) => e.l)).slice(0, n));
  return key.map((e) => ({ ...e, hidden: pick.has(e.l) }));
}
