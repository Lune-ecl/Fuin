// Moteur du traducteur : découpe un texte japonais en mots (le plus long d'abord), retrouve la forme
// du dictionnaire des verbes et adjectifs conjugués, et donne le sens de chaque morceau.
// Mots : lexique français du site, puis JMdict (en anglais), servi en 256 pièces chargées à la demande.
import { LEXIQUE, PARTICULES, type LexEntry } from './lexique';

export interface WordItem {
  reading: string;
  meaning: string;
  rank: number;
  kinds: string;
}

type Shard = Record<string, [string, string, number, string][]>;

const SHARDS = 256;
const pending = new Map<number, Promise<void>>();
const loaded = new Map<number, Shard>();
const shardOf = (s: string) => (s.codePointAt(0) ?? 0) % SHARDS;

export const JAPANESE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々〆]/u;
export const KANJI = /[\p{Script=Han}々〆]/u;
export const isKanaOnly = (s: string) => /^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u.test(s);

function fetchShard(i: number): Promise<void> {
  let p = pending.get(i);
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}kanji/mots/${String(i).padStart(2, '0')}.json`)
      .then((r) => {
        if (!r.ok) throw new Error('Dictionnaire de mots introuvable.');
        return r.json() as Promise<Shard>;
      })
      .then((s) => {
        loaded.set(i, s);
      })
      .catch((e) => {
        pending.delete(i);
        throw e;
      });
    pending.set(i, p);
  }
  return p;
}

/** Charge les pièces du dictionnaire dont le texte a besoin (un mot est rangé selon son premier caractère). */
export function prepareWords(text: string): Promise<void> {
  const need = new Set<number>();
  for (const ch of text) if (JAPANESE.test(ch)) need.add(shardOf(ch));
  return Promise.all([...need].map(fetchShard)).then(() => undefined);
}

export function wordsOf(key: string): WordItem[] | undefined {
  const rows = loaded.get(shardOf(key))?.[key];
  return rows?.map(([reading, meaning, rank, kinds]) => ({ reading, meaning, rank, kinds }));
}

// ---------------------------------------------------------------------------
// Formes conjuguées → forme du dictionnaire
// ---------------------------------------------------------------------------
interface Rule {
  from: string;
  to: string;
  /** types de mot JMdict acceptés : g godan, i ichidan, k kuru, s nom + suru, a adjectif en -i */
  kinds: string;
  label: string;
}
const RULES: Rule[] = [];
const add = (from: string, to: string, kinds: string, label: string) => RULES.push({ from, to, kinds, label });

for (const [s, label] of [
  ['ます', 'poli'], ['ました', 'poli, passé'], ['ません', 'poli, négatif'], ['ませんでした', 'poli, négatif passé'],
  ['た', 'passé'], ['て', 'forme en -te'], ['ない', 'négatif'], ['なかった', 'négatif passé'], ['なくて', 'négatif'],
  ['ず', 'négatif'], ['ぬ', 'négatif'], ['られる', 'passif ou potentiel'], ['られた', 'passif, passé'], ['られて', 'passif'],
  ['られない', 'passif, négatif'], ['させる', 'causatif'], ['させた', 'causatif, passé'], ['よう', 'volonté'],
  ['たい', 'désir'], ['たかった', 'désir, passé'], ['れば', 'condition'], ['たら', 'condition'], ['ろ', 'impératif'],
  ['よ', 'impératif'], ['ている', 'en cours'], ['ていた', 'en cours, passé'], ['ています', 'en cours, poli'], ['てる', 'en cours'],
  ['てしまう', 'achevé'], ['てしまった', 'achevé, passé'], ['ちゃう', 'achevé'], ['ちゃった', 'achevé, passé'],
]) add(s, 'る', 'ik', label);

const GODAN: Record<string, string[]> = {
  く: ['か', 'き', 'け', 'こ', 'いて', 'いた'],
  ぐ: ['が', 'ぎ', 'げ', 'ご', 'いで', 'いだ'],
  す: ['さ', 'し', 'せ', 'そ', 'して', 'した'],
  つ: ['た', 'ち', 'て', 'と', 'って', 'った'],
  ぬ: ['な', 'に', 'ね', 'の', 'んで', 'んだ'],
  ぶ: ['ば', 'び', 'べ', 'ぼ', 'んで', 'んだ'],
  む: ['ま', 'み', 'め', 'も', 'んで', 'んだ'],
  る: ['ら', 'り', 'れ', 'ろ', 'って', 'った'],
  う: ['わ', 'い', 'え', 'お', 'って', 'った'],
};
for (const [u, [a, i, e, o, te, ta]] of Object.entries(GODAN)) {
  add(a + 'ない', u, 'g', 'négatif');
  add(a + 'なかった', u, 'g', 'négatif passé');
  add(a + 'ず', u, 'g', 'négatif');
  add(a + 'れる', u, 'g', 'passif');
  add(a + 'れた', u, 'g', 'passif, passé');
  add(a + 'せる', u, 'g', 'causatif');
  add(a + 'せた', u, 'g', 'causatif, passé');
  add(i + 'ます', u, 'g', 'poli');
  add(i + 'ました', u, 'g', 'poli, passé');
  add(i + 'ません', u, 'g', 'poli, négatif');
  add(i + 'たい', u, 'g', 'désir');
  add(i + 'ながら', u, 'g', 'tout en');
  add(e + 'ば', u, 'g', 'condition');
  add(e + 'る', u, 'g', 'potentiel');
  add(e + 'ない', u, 'g', 'potentiel, négatif');
  add(e, u, 'g', 'impératif');
  add(o + 'う', u, 'g', 'volonté');
  add(te, u, 'g', 'forme en -te');
  add(ta, u, 'g', 'passé');
  add(ta + 'ら', u, 'g', 'condition');
  add(te + 'いる', u, 'g', 'en cours');
  add(te + 'いた', u, 'g', 'en cours, passé');
  add(te + 'る', u, 'g', 'en cours');
}
add('って', 'く', 'g', 'forme en -te'); // 行く
add('った', 'く', 'g', 'passé');

for (const [s, label] of [
  ['する', 'faire'], ['した', 'faire, passé'], ['して', 'faire, forme en -te'], ['します', 'faire, poli'],
  ['しました', 'faire, poli, passé'], ['しません', 'faire, poli, négatif'], ['しない', 'faire, négatif'],
  ['しなかった', 'faire, négatif passé'], ['される', 'passif'], ['された', 'passif, passé'], ['させる', 'causatif'],
  ['させた', 'causatif, passé'], ['しよう', 'volonté'], ['したい', 'désir'], ['しろ', 'impératif'], ['せよ', 'impératif'],
  ['している', 'en cours'], ['していた', 'en cours, passé'], ['できる', 'pouvoir faire'], ['できない', 'ne pas pouvoir faire'],
  ['すれば', 'condition'], ['したら', 'condition'],
]) add(s, '', 's', label);

for (const [s, label] of [
  ['かった', 'passé'], ['くない', 'négatif'], ['くなかった', 'négatif passé'], ['くて', 'forme en -te'], ['く', 'adverbe'],
  ['ければ', 'condition'], ['さ', 'nom'], ['そう', 'semble'],
]) add(s, 'い', 'a', label);

RULES.sort((x, y) => y.from.length - x.from.length);

// ---------------------------------------------------------------------------
// Découpage
// ---------------------------------------------------------------------------
export interface Token {
  text: string;
  kind: 'word' | 'particle' | 'kanji' | 'kana' | 'other';
  /** forme du dictionnaire (différente de text pour un mot conjugué) */
  base?: string;
  /** conjugaison reconnue (« passé », « négatif »…) */
  form?: string;
  lex?: LexEntry;
  items?: WordItem[];
  particle?: string;
}

function match(cand: string): Token | null {
  const lex = LEXIQUE.get(cand);
  if (lex) return { text: cand, kind: 'word', base: cand, lex, items: wordsOf(cand) };
  if (PARTICULES[cand]) return { text: cand, kind: 'particle', particle: PARTICULES[cand] };
  const items = wordsOf(cand);
  if (items) return { text: cand, kind: 'word', base: cand, items };
  // plusieurs formes du dictionnaire possibles (行って : 行く ou 行う) → la plus courante
  let best: Token | null = null;
  let bestRank = Infinity;
  for (const r of RULES) {
    if (cand.length <= r.from.length || !cand.endsWith(r.from)) continue;
    const base = cand.slice(0, -r.from.length) + r.to;
    const found = wordsOf(base)?.filter((it) => [...r.kinds].some((k) => it.kinds.includes(k)));
    // 行って, 行った : presque toujours « aller » (行く), que JMdict classe pourtant après 行う
    const rank = found?.length ? (base === '行く' ? 0 : found[0].rank) : Infinity;
    if (found?.length && rank < bestRank) {
      bestRank = rank;
      best = { text: cand, kind: 'word', base, form: r.label, lex: LEXIQUE.get(base), items: found };
    }
  }
  return best;
}

const MAX = 12;

/** Découpe un texte en morceaux : mots du lexique ou du dictionnaire (le plus long possible), particules, kanjis isolés. */
export function segment(text: string): Token[] {
  const chars = [...text];
  const out: Token[] = [];
  let i = 0;
  const pushOther = (s: string, kind: Token['kind']) => {
    const last = out[out.length - 1];
    if (last && last.kind === kind && kind !== 'kanji') last.text += s;
    else out.push({ text: s, kind });
  };
  while (i < chars.length) {
    const ch = chars[i];
    if (!JAPANESE.test(ch)) {
      pushOther(ch, 'other');
      i++;
      continue;
    }
    let end = i;
    while (end < chars.length && end - i < MAX && JAPANESE.test(chars[end])) end++;
    let found: Token | null = null;
    let len = end - i;
    for (; len >= 1; len--) {
      found = match(chars.slice(i, i + len).join(''));
      if (found) break;
    }
    if (found) {
      out.push(found);
      i += len;
    } else {
      pushOther(ch, KANJI.test(ch) ? 'kanji' : 'kana');
      i++;
    }
  }
  return out;
}

/** Premier sens anglais, court (« seal; to seal… » → « seal »). */
export const shortEnglish = (meaning: string, n = 2) => meaning.split('; ')[0].split(', ').slice(0, n).join(', ');
/** Premier sens français du lexique, court. */
export const shortFrench = (fr: string) => fr.split(';')[0].trim();
