import type { RollTable, RollTier, RollTone } from './api';

/** d100 équitable (1 à 100) tiré avec le générateur cryptographique du navigateur. */
export function d100(): number {
  const a = new Uint32Array(1);
  let x: number;
  do {
    crypto.getRandomValues(a);
    x = a[0];
  } while (x >= 4294967200); // plus grand multiple de 100 sous 2^32 : pas de biais
  return (x % 100) + 1;
}

/** Les 1 et 100 naturels restent critiques ; sinon le modificateur s'applique (borné de 2 à 99). */
export function effectiveRoll(natural: number, modifier = 0): number {
  if (natural <= 1 || natural >= 100) return natural <= 1 ? 1 : 100;
  return Math.min(99, Math.max(2, natural + modifier));
}

export function tierFor(table: RollTable | null | undefined, natural: number, modifier = 0): RollTier | null {
  if (!table) return null;
  const v = effectiveRoll(natural, modifier);
  return table.tiers.find((t) => v >= t.min && v <= t.max) ?? null;
}

export const isSuccess = (tone: RollTone | undefined) => tone === 'success' || tone === 'crit-success';

export const TONES: { value: RollTone; label: string }[] = [
  { value: 'crit-fail', label: 'Échec critique' },
  { value: 'fail', label: 'Échec avec malus' },
  { value: 'neutral', label: 'Échec simple' },
  { value: 'success', label: 'Réussite' },
  { value: 'crit-success', label: 'Réussite critique' },
];

/** Trous et chevauchements entre 1 et 100. */
export function coverage(tiers: RollTier[]): { gaps: number[]; overlaps: number[] } {
  const count = new Array(101).fill(0);
  tiers.forEach((t) => {
    for (let v = Math.max(1, t.min); v <= Math.min(100, t.max); v++) count[v] += 1;
  });
  const gaps: number[] = [];
  const overlaps: number[] = [];
  for (let v = 1; v <= 100; v++) {
    if (count[v] === 0) gaps.push(v);
    if (count[v] > 1) overlaps.push(v);
  }
  return { gaps, overlaps };
}

/** "3, 4, 5, 9" → "3–5, 9" */
export function ranges(values: number[]): string {
  const out: string[] = [];
  for (let i = 0; i < values.length; i++) {
    const start = values[i];
    while (i + 1 < values.length && values[i + 1] === values[i] + 1) i++;
    out.push(start === values[i] ? `${start}` : `${start} à ${values[i]}`);
  }
  return out.join(', ');
}
