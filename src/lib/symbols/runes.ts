import { ci, dot, p, type SealSymbol } from '../symbolKit';

const rune = (key: string, label: string, d: string, tags = ''): SealSymbol => ({
  key: `rune-${key}`,
  label: `Rune ${label}`,
  cat: 'runes',
  tags: `rune futhark viking ${tags}`,
  svg: () => p(d),
});

// Futhark ancien : vingt-quatre runes tracées à la pointe
const FUTHARK: SealSymbol[] = [
  rune('fehu', 'Fehu', 'M42 88 V12 M42 30 L62 16 M42 46 L64 30', 'richesse betail'),
  rune('uruz', 'Uruz', 'M38 88 V12 L62 30 V88', 'force aurochs'),
  rune('thurisaz', 'Thurisaz', 'M42 88 V12 M42 30 L62 46 L42 62', 'geant epine'),
  rune('ansuz', 'Ansuz', 'M42 88 V12 M42 14 L62 30 M42 34 L62 50', 'dieu souffle'),
  rune('raidho', 'Raidhō', 'M40 88 V12 L60 28 L40 46 L62 88', 'voyage chevauchee'),
  rune('kenaz', 'Kenaz', 'M60 18 L38 50 L60 82', 'torche feu'),
  rune('gebo', 'Gebo', 'M30 14 L70 86 M70 14 L30 86', 'don cadeau'),
  rune('wunjo', 'Wunjō', 'M42 88 V12 L62 28 L42 44', 'joie'),
  rune('hagalaz', 'Hagalaz', 'M36 12 V88 M64 12 V88 M36 38 L64 60', 'grele'),
  rune('nauthiz', 'Naudhiz', 'M50 12 V88 M36 36 L64 58', 'besoin necessite'),
  rune('isa', 'Isa', 'M50 12 V88 M44 12 H56 M44 88 H56', 'glace'),
  rune('jera', 'Jēra', 'M46 22 L30 40 L46 58 M54 42 L70 60 L54 78', 'annee recolte'),
  rune('eihwaz', 'Eihwaz', 'M50 12 V88 M50 12 L64 26 M50 88 L36 74', 'if'),
  rune('perthro', 'Perthro', 'M38 12 V88 M38 12 L52 26 L64 14 M38 88 L52 74 L64 86', 'destin hasard'),
  rune('algiz', 'Algiz', 'M50 88 V12 M50 40 L30 16 M50 40 L70 16', 'protection elan'),
  rune('sowilo', 'Sōwilō', 'M62 12 L38 42 L62 58 L38 88', 'soleil'),
  rune('tiwaz', 'Tīwaz', 'M50 88 V12 M30 32 L50 12 L70 32', 'tyr guerre'),
  rune('berkano', 'Berkanan', 'M40 12 V88 M40 12 L62 31 L40 50 L62 69 L40 88', 'bouleau naissance'),
  rune('ehwaz', 'Ehwaz', 'M36 88 V12 L50 34 L64 12 V88', 'cheval'),
  rune('mannaz', 'Mannaz', 'M36 88 V12 L64 44 M64 88 V12 L36 44', 'homme humanite'),
  rune('laguz', 'Laguz', 'M44 88 V12 L64 32', 'eau lac'),
  rune('ingwaz', 'Ingwaz', 'M36 20 L64 50 L36 80 M64 20 L36 50 L64 80', 'fertilite'),
  rune('dagaz', 'Dagaz', 'M28 18 V82 L72 18 V82 Z', 'jour aube'),
  rune('othala', 'Ōthalan', 'M50 14 L70 42 L36 88 M50 14 L30 42 L64 88', 'heritage terre'),
];

const sign = (key: string, label: string, svg: string, tags = ''): SealSymbol => ({
  key: `zodiac-${key}`,
  label,
  cat: 'runes',
  tags: `zodiaque signe astrologie ${tags}`,
  svg: () => svg,
});

// Signes du zodiaque
const ZODIAC: SealSymbol[] = [
  sign('aries', 'Signe du Bélier', p('M50 88 V40 M50 40 C50 18 28 12 22 28 C18 40 30 46 36 40 M50 40 C50 18 72 12 78 28 C82 40 70 46 64 40'), 'belier'),
  sign('taurus', 'Signe du Taureau', `${ci(50, 62, 20)}${p('M22 16 C28 42 72 42 78 16')}`, 'taureau'),
  sign('gemini', 'Signe des Gémeaux', p('M26 16 Q50 28 74 16 M26 84 Q50 72 74 84 M40 23 V77 M60 23 V77'), 'gemeaux'),
  sign('cancer', 'Signe du Cancer', `${ci(32, 42, 9)}${ci(68, 58, 9)}${p('M32 33 C48 22 68 24 82 38 M68 67 C52 78 32 76 18 62')}`, 'cancer'),
  sign('leo', 'Signe du Lion', `${ci(32, 64, 10)}${p('M42 64 C42 40 40 24 56 20 C74 16 82 34 70 48 C60 60 66 80 82 80')}`, 'lion'),
  sign('virgo', 'Signe de la Vierge', p('M18 28 V80 M18 36 Q28 22 34 36 V80 M34 36 Q44 22 50 36 V72 Q52 86 66 80 Q78 72 68 60 Q58 54 52 68'), 'vierge'),
  sign('libra', 'Signe de la Balance', p('M18 80 H82 M18 64 H36 A15 15 0 1 1 64 64 H82'), 'balance'),
  sign('scorpio', 'Signe du Scorpion', p('M16 28 V80 M16 36 Q26 22 32 36 V80 M32 36 Q42 22 48 36 V72 Q50 84 62 82 L78 72 M70 70 L78 72 L76 63'), 'scorpion'),
  sign('sagittarius', 'Signe du Sagittaire', p('M24 82 L78 20 M54 20 H78 V44 M34 50 L54 70'), 'sagittaire fleche'),
  sign('capricorn', 'Signe du Capricorne', p('M18 26 L30 72 L42 26 Q48 72 62 76 Q80 78 78 62 Q74 48 60 58 Q52 66 58 88'), 'capricorne'),
  sign('aquarius', 'Signe du Verseau', p('M14 40 L26 30 L38 40 L50 30 L62 40 L74 30 L86 40 M14 64 L26 54 L38 64 L50 54 L62 64 L74 54 L86 64'), 'verseau'),
  sign('pisces', 'Signe des Poissons', p('M24 14 Q46 50 24 86 M76 14 Q54 50 76 86 M28 50 H72'), 'poissons'),
];

const glyph = (key: string, label: string, svg: string, tags = ''): SealSymbol => ({ key, label, cat: 'runes', tags, svg: () => svg });

// Planètes et alchimie
const PLANETS: SealSymbol[] = [
  glyph('planet-mercury', 'Mercure', `${ci(50, 48, 14)}${p('M36 16 Q50 34 64 16 M50 62 V90 M40 78 H60')}`, 'planete alchimie vif-argent'),
  glyph('planet-venus', 'Vénus', `${ci(50, 36, 18)}${p('M50 54 V90 M37 74 H63')}`, 'planete cuivre amour'),
  glyph('planet-earth', 'Terre (planète)', `${ci(50, 60, 22)}${p('M50 38 V10 M38 22 H62 M28 60 H72 M50 38 V82')}`, 'planete monde'),
  glyph('planet-mars', 'Mars', `${ci(42, 58, 20)}${p('M56 44 L82 18 M62 18 H82 V38')}`, 'planete fer guerre'),
  glyph('planet-jupiter', 'Jupiter', p('M26 40 Q26 18 44 20 Q60 24 44 50 L28 66 H80 M64 38 V90'), 'planete etain'),
  glyph('planet-saturn', 'Saturne', p('M36 12 V60 M26 22 H46 M36 46 Q44 34 56 38 Q70 44 60 62 Q52 74 64 88'), 'planete plomb'),
  glyph('planet-uranus', 'Uranus', `${ci(50, 80, 8)}${p('M30 18 V60 M70 18 V60 M30 40 H70 M50 18 V72')}`, 'planete'),
  glyph('planet-pluto', 'Pluton', p('M36 12 V88 M36 12 H54 Q70 12 70 30 Q70 48 54 48 H36 M36 76 H62'), 'planete'),
];

const ALCHEMY: SealSymbol[] = [
  glyph('alch-fire', 'Feu alchimique', p('M50 14 L86 80 H14 Z'), 'alchimie element feu triangle'),
  glyph('alch-water', 'Eau alchimique', p('M14 20 H86 L50 86 Z'), 'alchimie element eau triangle'),
  glyph('alch-air', 'Air alchimique', p('M50 14 L86 80 H14 Z M27 56 H73'), 'alchimie element air triangle'),
  glyph('alch-earth', 'Terre alchimique', p('M14 20 H86 L50 86 Z M27 44 H73'), 'alchimie element terre triangle'),
  glyph('alch-gold', 'Or alchimique', `${ci(50, 50, 34)}`, 'alchimie or soleil'),
  glyph('alch-salt', 'Sel alchimique', `${ci(50, 50, 32)}${p('M18 50 H82')}`, 'alchimie sel'),
  glyph('alch-sulfur', 'Soufre alchimique', p('M50 12 L72 50 H28 Z M50 50 V90 M36 72 H64'), 'alchimie soufre'),
  glyph('alch-stone', 'Pierre philosophale', `${ci(50, 54, 40)}${p('M50 14 L84.6 74 H15.4 Z')}${p('M37 41 H63 V67 H37 Z')}${ci(50, 54, 9)}`, 'alchimie pierre philosophale'),
];

// Trigrammes du Yi Jing (bas en haut : lignes 1 à 3), brisée = yin
const TRI = (lines: [boolean, boolean, boolean]) =>
  lines
    .map((solid, i) => {
      const y = 70 - i * 20;
      return solid ? `M20 ${y} H80` : `M20 ${y} H44 M56 ${y} H80`;
    })
    .join(' ');
const tri = (key: string, label: string, lines: [boolean, boolean, boolean], tags: string): SealSymbol =>
  glyph(`trigram-${key}`, `Trigramme ${label}`, p(TRI(lines)), `trigramme yi jing bagua ${tags}`);

const TRIGRAMS: SealSymbol[] = [
  tri('qian', 'du Ciel', [true, true, true], 'ciel qian'),
  tri('dui', 'du Lac', [true, true, false], 'lac dui'),
  tri('li', 'du Feu', [true, false, true], 'feu li'),
  tri('zhen', 'du Tonnerre', [true, false, false], 'tonnerre zhen'),
  tri('xun', 'du Vent', [false, true, true], 'vent xun'),
  tri('kan', 'de l’Eau', [false, true, false], 'eau kan'),
  tri('gen', 'de la Montagne', [false, false, true], 'montagne gen'),
  tri('kun', 'de la Terre', [false, false, false], 'terre kun'),
];

export const RUNES: SealSymbol[] = [
  ...FUTHARK,
  ...ZODIAC,
  ...PLANETS,
  ...ALCHEMY.map((s) => (s.key === 'alch-gold' ? { ...s, svg: (c: string) => `${ci(50, 50, 34)}${dot(50, 50, 6, c)}` } : s)),
  ...TRIGRAMS,
];
