// Dictionnaire de kanjis du traducteur : un extrait de KANJIDIC2 (EDRDG, licence CC BY-SA 4.0)
// servi par le site (public/kanji/kanjidic.json), chargé une seule fois à la demande.

export interface KanjiInfo {
  kanji: string;
  on: string[];
  kun: string[];
  meanings: string[];
  /** true : sens en anglais, faute de traduction française dans KANJIDIC2 */
  english: boolean;
  strokes: number;
  grade: number;
  jlpt: number;
  freq: number;
}

type Row = [string, string, string, string, number, number, number, number, 'f' | 'e'];

let cache: Promise<Map<string, KanjiInfo>> | null = null;

export function loadKanjiDict(): Promise<Map<string, KanjiInfo>> {
  if (!cache) {
    cache = fetch(`${import.meta.env.BASE_URL}kanji/kanjidic.json`)
      .then((r) => {
        if (!r.ok) throw new Error('Dictionnaire de kanjis introuvable.');
        return r.json() as Promise<{ data: Row[] }>;
      })
      .then(({ data }) => {
        const map = new Map<string, KanjiInfo>();
        for (const [kanji, on, kun, meanings, strokes, grade, jlpt, freq, lang] of data) {
          map.set(kanji, {
            kanji,
            on: on ? on.split('、') : [],
            kun: kun ? kun.split('、') : [],
            meanings: meanings ? meanings.split('; ') : [],
            english: lang === 'e',
            strokes,
            grade,
            jlpt,
            freq,
          });
        }
        return map;
      })
      .catch((e) => {
        cache = null;
        throw e;
      });
  }
  return cache;
}

/** Caractères CJK (kanjis) d'un texte, dans l'ordre. */
export const CJK = /[㐀-鿿豈-﫿]/g;
export const kanjiOf = (s: string): string[] => s.match(CJK) ?? [];

// ---------------------------------------------------------------------------
// Kana → rōmaji (Hepburn simplifié), pour lire les lectures du dictionnaire
// ---------------------------------------------------------------------------
const BASE: Record<string, string> = {
  あ: 'a', い: 'i', う: 'u', え: 'e', お: 'o',
  か: 'ka', き: 'ki', く: 'ku', け: 'ke', こ: 'ko', が: 'ga', ぎ: 'gi', ぐ: 'gu', げ: 'ge', ご: 'go',
  さ: 'sa', し: 'shi', す: 'su', せ: 'se', そ: 'so', ざ: 'za', じ: 'ji', ず: 'zu', ぜ: 'ze', ぞ: 'zo',
  た: 'ta', ち: 'chi', つ: 'tsu', て: 'te', と: 'to', だ: 'da', ぢ: 'ji', づ: 'zu', で: 'de', ど: 'do',
  な: 'na', に: 'ni', ぬ: 'nu', ね: 'ne', の: 'no',
  は: 'ha', ひ: 'hi', ふ: 'fu', へ: 'he', ほ: 'ho', ば: 'ba', び: 'bi', ぶ: 'bu', べ: 'be', ぼ: 'bo', ぱ: 'pa', ぴ: 'pi', ぷ: 'pu', ぺ: 'pe', ぽ: 'po',
  ま: 'ma', み: 'mi', む: 'mu', め: 'me', も: 'mo',
  や: 'ya', ゆ: 'yu', よ: 'yo',
  ら: 'ra', り: 'ri', る: 'ru', れ: 're', ろ: 'ro',
  わ: 'wa', ゐ: 'i', ゑ: 'e', を: 'o', ん: 'n', ゔ: 'vu',
  ぁ: 'a', ぃ: 'i', ぅ: 'u', ぇ: 'e', ぉ: 'o',
};
const SMALL: Record<string, string> = { ゃ: 'ya', ゅ: 'yu', ょ: 'yo' };

/** Katakana → hiragana (même son). */
const toHira = (s: string) => s.replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));

export function romaji(kana: string): string {
  const s = toHira(kana.replace(/[.\-]/g, ''));
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const next = s[i + 1];
    if (ch === 'っ') {
      const r = BASE[next] ?? '';
      out += r ? (r.startsWith('ch') ? 't' : r[0]) : '';
      continue;
    }
    if (ch === 'ー') {
      out += out.slice(-1);
      continue;
    }
    let r = BASE[ch];
    if (r === undefined) {
      out += ch;
      continue;
    }
    if (next && SMALL[next]) {
      const y = SMALL[next];
      r = r === 'shi' ? `sh${y.slice(1)}` : r === 'chi' ? `ch${y.slice(1)}` : r === 'ji' ? `j${y.slice(1)}` : `${r.slice(0, -1)}${y}`;
      i++;
    }
    if (r === 'n' && next && /[あいうえおやゆよ]/.test(toHira(next))) r = "n'";
    out += r;
  }
  return out;
}

/** Lecture lisible : « むす・ぶ (musubu) ». */
export const readingLabel = (kana: string) => `${kana.replace(/\./g, '・')} (${romaji(kana)})`;

/** Texte sans accents ni majuscules, pour chercher un sens. */
export const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae');
