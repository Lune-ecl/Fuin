import { ci, dot, el, poly, spiralAt, type SealSymbol } from '../symbolKit';

const a = (key: string, label: string, svg: (c: string) => string, tags = ''): SealSymbol => ({ key, label, cat: 'animaux', tags: `animal bete ${tags}`, svg });

export const ANIMAUX: SealSymbol[] = [
  a(
    'caged-bird',
    'Oiseau en cage',
    (c) =>
      `${ci(50, 9, 3)}<path d="M50 12 V16 M22 88 V42 A28 28 0 0 1 78 42 V88 M14 88 H86 M33 20 V88 M67 20 V88 M50 14 V40"/><path d="M28 72 H72"/>` +
      `<path d="M38 66 C38 56 46 50 54 52 L58 46 C62 43 67 45 67 50 L74 51 L67 54 C66 62 60 67 52 67 Z M38 64 L30 60 L32 67 Z"/>${dot(62, 49, 1.6, c)}`,
    'oiseau cage prisonnier captif',
  ),
  a('sparrow', 'Moineau', (c) => `<path d="M14 72 L26 64 C24 48 36 38 50 40 C56 30 68 28 74 36 L86 38 L76 44 C76 58 64 68 46 68 Z"/><path d="M40 52 Q52 60 64 52 M44 68 V80 M52 68 V80 M40 80 H48 M48 80 H56"/>${dot(70, 37, 2, c)}`, 'oiseau'),
  a('crane-bird', 'Grue', (c) => `${el(48, 54, 18, 10, -12)}<path d="M62 48 Q76 32 66 18"/><circle cx="64" cy="15" r="4"/><path d="M68 15 L82 18 M46 63 L42 92 M54 62 L58 92 M30 54 L18 62 M31 50 L16 52"/>${dot(63, 11, 2, c)}`, 'grue tsuru oiseau'),
  a('crane-flight', 'Grue en vol', (c) => `<path d="M50 52 C36 36 20 30 4 34 C18 40 28 48 38 58 M50 52 C64 36 80 30 96 34 C82 40 72 48 62 58"/><path d="M50 34 V78 M44 70 L50 82 L56 70"/>${ci(50, 30, 4)}${dot(50, 26, 1.8, c)}`, 'grue tsuru vol oiseau'),
  a(
    'eagle',
    'Aigle',
    () =>
      `<path d="M46 40 C36 34 22 24 6 26 L16 33 L8 38 L20 43 L14 49 L30 50 C38 52 42 58 44 64 M54 40 C64 34 78 24 94 26 L84 33 L92 38 L80 43 L86 49 L70 50 C62 52 58 58 56 64"/><circle cx="50" cy="32" r="8"/><path d="M50 36 L46 44 L54 44 Z M44 64 L50 88 L56 64 Z"/>`,
    'aigle rapace oiseau',
  ),
  a('swan', 'Cygne', (c) => `<path d="M16 62 C28 76 66 78 82 60 C70 62 58 58 54 50 C50 40 52 26 62 22 C70 18 76 26 70 30 L80 34 L70 34"/><path d="M8 84 Q28 78 50 84 T92 84"/>${dot(66, 25, 1.8, c)}`, 'cygne oiseau lac'),
  a(
    'rooster',
    'Coq',
    (c) =>
      `<path d="M30 70 C24 52 34 40 46 42 L50 28 C48 22 52 18 56 22 L60 16 L62 22 L68 20 L64 28 L74 32 L64 36 C66 44 64 52 60 58 C70 54 78 42 76 26 C90 38 88 62 72 72 Z"/><path d="M44 72 V88 M56 72 V88 M38 88 H48 M50 88 H62"/>${dot(60, 30, 1.8, c)}`,
    'coq poule oiseau',
  ),
  a('fish', 'Poisson', (c) => `<path d="M12 50 C28 30 62 30 76 50 C62 70 28 70 12 50 Z M76 50 L92 36 V64 Z"/><path d="M34 40 Q40 50 34 60"/>${dot(24, 47, 2.2, c)}`, 'poisson'),
  a('whale', 'Baleine', (c) => `<path d="M8 56 C8 38 38 30 62 36 C74 40 80 48 78 58 L90 48 L92 62 L82 64 C78 72 58 78 38 76 C20 74 8 68 8 56 Z"/><path d="M34 30 Q30 18 22 16 M34 30 Q38 18 46 16 M20 64 Q40 70 66 64"/>${dot(24, 52, 2, c)}`, 'baleine mer ocean'),
  a('shark', 'Requin', (c) => `<path d="M6 60 C30 48 60 46 80 54 L94 42 L90 62 L94 74 L80 64 C60 72 30 72 6 60 Z"/><path d="M40 49 L52 28 L58 48 M28 56 V64 M32 56 V64 M36 56 V64"/>${dot(16, 57, 1.8, c)}`, 'requin mer'),
  a('octopus', 'Pieuvre', (c) => `<path d="M30 52 C24 22 76 22 70 52"/><path d="M30 52 Q20 64 28 74 Q34 84 22 92 M40 54 Q34 70 44 80 Q48 86 40 94 M50 54 V92 M60 54 Q66 70 56 80 Q52 86 60 94 M70 52 Q80 64 72 74 Q66 84 78 92"/>${dot(42, 42, 3, c)}${dot(58, 42, 3, c)}`, 'pieuvre poulpe tentacules'),
  a(
    'crab',
    'Crabe',
    (c) =>
      `${el(50, 58, 22, 14)}<path d="M32 50 Q18 42 20 28 M20 28 L12 22 M20 28 L28 22 M68 50 Q82 42 80 28 M80 28 L88 22 M80 28 L72 22 M30 60 L14 64 M30 66 L16 74 M34 70 L22 82 M70 60 L86 64 M70 66 L84 74 M66 70 L78 82 M44 46 V38 M56 46 V38"/>${dot(44, 36, 2.5, c)}${dot(56, 36, 2.5, c)}`,
    'crabe pinces mer',
  ),
  a('seahorse', 'Hippocampe', (c) => `<path d="M58 14 C46 10 40 22 46 28 L32 30 L46 34 C40 46 44 58 54 64 C64 72 60 86 50 88 C40 90 38 78 48 76"/><path d="M50 40 L44 42 M52 50 L46 52 M56 58 L50 60 M58 26 L64 22 L62 30"/>${dot(52, 20, 2, c)}`, 'hippocampe mer'),
  a('starfish', 'Étoile de mer', (c) => `${poly(5, 42, -90, 17)}${[0, 72, 144, 216, 288].map((r) => `<g transform="rotate(${r} 50 50)">${dot(50, 30, 2.4, c)}${dot(50, 20, 2, c)}</g>`).join('')}`, 'etoile mer'),
  a('scallop', 'Coquillage', () => `<path d="M50 88 L18 40 Q50 4 82 40 Z M50 88 L32 24 M50 88 L50 18 M50 88 L68 24 M50 88 L24 32 M50 88 L76 32"/><path d="M40 88 H60 L56 80 H44 Z"/>`, 'coquille saint jacques mer'),
  a('nautilus', 'Nautile', () => `${spiralAt(54, 52, 2.4, 3.1)}<path d="M54 52 L80 44 M54 52 L70 74 M54 52 L36 70 M54 52 L32 40 M54 52 L52 22"/>`, 'nautile coquille spirale'),
  a('turtle', 'Tortue', () => `${el(50, 54, 26, 20)}${poly(6, 9, -90, undefined, 50, 54)}<path d="M50 34 V45 M50 63 V74 M28 46 L42 50 M72 46 L58 50 M30 64 L42 59 M70 64 L58 59"/><circle cx="50" cy="26" r="7"/><path d="M28 40 L18 34 M72 40 L82 34 M30 68 L20 76 M70 68 L80 76 M50 74 L50 84"/>`, 'tortue carapace'),
  a('tadpole', 'Têtard', (c) => `<circle cx="38" cy="40" r="16"/><path d="M50 50 C62 60 54 70 66 76 C76 82 72 92 84 90"/>${dot(32, 36, 2.5, c)}${dot(44, 36, 2.5, c)}`, 'tetard grenouille'),
  a('lizard', 'Lézard', (c) => `<path d="M50 10 C56 12 58 20 54 26 C58 34 58 50 54 58 C56 66 54 74 50 80 C48 88 38 92 32 86"/><path d="M50 10 C44 12 42 20 46 26 C42 34 42 50 46 58 C44 66 46 74 50 80"/><path d="M46 34 L32 28 L28 20 M54 34 L68 28 L72 20 M46 56 L32 62 L28 70 M54 56 L68 62 L72 70"/>${dot(47, 16, 1.5, c)}${dot(53, 16, 1.5, c)}`, 'lezard salamandre gecko'),
  a(
    'scorpion',
    'Scorpion',
    () =>
      `${el(50, 58, 12, 16)}<path d="M50 74 C52 84 64 88 70 80 C76 72 72 62 64 62 M64 62 L70 56 M64 62 L60 56"/><path d="M42 48 Q30 36 32 24 M32 24 L24 18 M32 24 L38 16 M58 48 Q70 36 68 24 M68 24 L76 18 M68 24 L62 16 M40 56 L26 58 M40 62 L26 68 M40 68 L28 76 M60 56 L74 58 M60 62 L74 68 M60 68 L72 76"/>`,
    'scorpion dard poison',
  ),
  a('bee', 'Abeille', () => `${el(50, 58, 14, 22)}<path d="M36 52 H64 M37 62 H63 M40 72 H60 M50 80 L50 88"/>${el(32, 38, 14, 8, -30)}${el(68, 38, 14, 8, 30)}<circle cx="50" cy="32" r="7"/><path d="M46 26 L40 14 M54 26 L60 14"/>`, 'abeille insecte miel'),
  a('ant', 'Fourmi', (c) => `${ci(50, 22, 7)}${el(50, 42, 7, 9)}${el(50, 68, 12, 16)}<path d="M44 40 L28 30 L22 34 M56 40 L72 30 L78 34 M44 44 L26 48 M56 44 L74 48 M44 48 L30 62 L26 70 M56 48 L70 62 L74 70 M46 16 L40 6 M54 16 L60 6"/>${dot(47, 21, 1.5, c)}${dot(53, 21, 1.5, c)}`, 'fourmi insecte'),
  a('beetle', 'Scarabée', () => `${el(50, 58, 22, 28)}<path d="M50 30 V86 M36 34 Q50 26 64 34"/><circle cx="50" cy="24" r="8"/><path d="M50 16 L50 6 M28 48 L14 42 M28 60 L12 62 M30 72 L16 82 M72 48 L86 42 M72 60 L88 62 M70 72 L84 82"/>`, 'scarabee insecte'),
  a('ladybug', 'Coccinelle', (c) => `<path d="M24 58 A26 26 0 0 1 76 58 A26 26 0 0 1 24 58 Z M50 32 V84"/><path d="M38 34 Q50 22 62 34"/>${[[36, 50], [64, 50], [38, 68], [62, 68], [50, 44]].map(([x, y]) => dot(x, y, 4, c)).join('')}<path d="M44 26 L38 16 M56 26 L62 16"/>`, 'coccinelle insecte'),
  a('caterpillar', 'Chenille', (c) => `${[[18, 64], [30, 56], [42, 52], [54, 54], [66, 60], [78, 54]].map(([x, y]) => ci(x, y, 7)).join('')}<path d="M78 47 L74 38 M84 49 L88 40"/>${dot(80, 52, 1.6, c)}`, 'chenille insecte'),
  a('mouse', 'Souris', (c) => `<path d="M16 64 C16 48 34 38 50 40 C66 42 78 52 84 62 C70 70 34 72 16 64 Z"/><circle cx="66" cy="38" r="9"/><path d="M16 64 C8 66 6 76 14 80 C22 84 30 80 34 86"/>${dot(76, 54, 2, c)}<path d="M84 62 L90 60"/>`, 'souris rat rongeur'),
  a('rabbit', 'Lapin', (c) => `${ci(50, 60, 22)}${el(40, 24, 7, 20, -10)}${el(60, 24, 7, 20, 10)}${dot(42, 56, 2.5, c)}${dot(58, 56, 2.5, c)}<path d="M47 66 L50 69 L53 66 M50 69 V74 M50 70 L36 68 M50 70 L64 68"/>`, 'lapin lievre lune'),
  a('fox', 'Renard', (c) => `<path d="M18 16 L36 38 L50 34 L64 38 L82 16 L78 52 L50 86 L22 52 Z"/><path d="M36 54 L44 58 M64 54 L56 58 M38 70 L50 64 L62 70"/>${dot(50, 78, 3, c)}`, 'renard kitsune'),
  a(
    'kyubi',
    'Kyūbi (neuf queues)',
    (c) =>
      Array.from({ length: 9 }, (_, i) => `<path d="M50 80 C42 64 44 44 50 26 C56 44 58 64 50 80 Z" transform="rotate(${-72 + i * 18} 50 80)"/>`).join('') +
      `${ci(50, 82, 8)}${dot(50, 82, 3, c)}`,
    'renard neuf queues kitsune yokai',
  ),
  a('wolf', 'Loup hurlant', (c) => `<path d="M30 90 L34 62 L24 44 L36 46 L44 28 L50 10 L58 28 L64 22 L64 36 L74 42 L62 46 L58 60 L66 90"/><path d="M50 10 L46 22"/>${dot(54, 34, 2, c)}`, 'loup hurlement lune'),
  a('dog', 'Chien', (c) => `<path d="M30 30 Q50 18 70 30 L72 60 Q50 80 28 60 Z"/><path d="M30 30 C18 30 12 44 18 58 C22 50 26 46 30 44 M70 30 C82 30 88 44 82 58 C78 50 74 46 70 44"/>${dot(42, 44, 2.6, c)}${dot(58, 44, 2.6, c)}${dot(50, 56, 4, c)}<path d="M50 60 V66 M44 70 Q50 76 56 70"/>`, 'chien inu'),
  a('deer', 'Cerf', (c) => `<path d="M40 40 Q50 36 60 40 L56 72 Q50 80 44 72 Z"/><path d="M40 40 L30 34 M60 40 L70 34 M44 38 L34 22 L28 12 M34 22 L22 20 M38 30 L30 30 M56 38 L66 22 L72 12 M66 22 L78 20 M62 30 L70 30"/>${dot(45, 50, 2, c)}${dot(55, 50, 2, c)}${dot(50, 72, 2.4, c)}`, 'cerf daim bois nara'),
  a('horse', 'Cheval', (c) => `<path d="M34 90 L38 60 C30 52 28 40 34 30 L40 14 L46 24 C56 22 68 30 74 44 C78 52 74 58 68 56 L58 50 L54 60 L58 90"/><path d="M40 20 L36 30 M44 26 L38 38 M48 30 L42 44"/>${dot(56, 32, 2, c)}`, 'cheval monture'),
  a('boar', 'Sanglier', (c) => `<path d="M14 62 C14 44 30 34 50 36 C66 36 78 44 84 54 L90 58 L84 64 C76 70 60 72 44 70 L40 82 M58 70 L60 82 M22 68 L20 82 M30 70 L30 82"/><path d="M30 38 L34 30 L38 37 M42 36 L46 28 L50 36 M54 36 L58 30 L60 38 M84 58 Q92 50 90 44"/>${dot(74, 50, 2, c)}`, 'sanglier inoshishi'),
  a('ox', 'Bœuf', (c) => `<path d="M34 40 Q50 32 66 40 L64 72 Q50 84 36 72 Z"/><path d="M34 40 C24 40 14 32 16 18 C24 28 30 30 36 32 M66 40 C76 40 86 32 84 18 C76 28 70 30 64 32 M30 46 L22 48 M70 46 L78 48"/>${dot(43, 52, 2.4, c)}${dot(57, 52, 2.4, c)}${ci(50, 76, 6)}`, 'boeuf taureau vache ushi'),
  a('tiger', 'Tigre', (c) => `${ci(50, 54, 30)}<path d="M26 34 L22 20 L36 28 M74 34 L78 20 L64 28 M50 24 V34 M42 26 L44 34 M58 26 L56 34 M22 54 H32 M24 64 L33 60 M78 54 H68 M76 64 L67 60 M42 66 L50 72 L58 66 M50 72 V78"/>${dot(40, 50, 3, c)}${dot(60, 50, 3, c)}`, 'tigre tora felin'),
  a('monkey', 'Singe', (c) => `${ci(50, 52, 24)}${ci(22, 50, 9)}${ci(78, 50, 9)}<path d="M36 50 C36 38 64 38 64 50 C64 56 60 58 56 58 C60 64 58 74 50 74 C42 74 40 64 44 58 C40 58 36 56 36 50 Z"/>${dot(44, 48, 2.4, c)}${dot(56, 48, 2.4, c)}<path d="M44 66 Q50 70 56 66"/>`, 'singe saru'),
  a('bear', 'Ours', (c) => `${ci(50, 56, 28)}${ci(28, 30, 9)}${ci(72, 30, 9)}${el(50, 66, 12, 9)}${dot(40, 50, 2.6, c)}${dot(60, 50, 2.6, c)}${dot(50, 62, 3.4, c)}<path d="M50 65 V70 M44 72 Q50 75 56 72"/>`, 'ours kuma'),
  a('elephant', 'Éléphant', (c) => `<path d="M36 30 Q50 22 64 30 L64 56 Q60 64 56 68 L56 86 Q56 92 62 90 M44 68 Q40 64 36 56 Z"/><path d="M36 32 C20 26 10 40 14 54 C18 64 30 66 38 58 M64 32 C80 26 90 40 86 54 C82 64 70 66 62 58 M44 68 L44 80"/>${dot(44, 42, 2.4, c)}${dot(56, 42, 2.4, c)}`, 'elephant trompe'),
  a(
    'dragon',
    'Dragon',
    (c) =>
      `<path d="M20 84 C34 84 30 64 44 62 C58 60 56 80 70 76 C82 72 80 56 70 52 C60 48 60 36 68 30"/><path d="M28 80 L26 72 M40 64 L38 56 M54 66 L54 58 M68 74 L72 68 M76 58 L84 56"/><path d="M68 30 L64 18 L72 24 L78 14 L80 26 L90 26 L82 34 C78 40 70 40 66 36 Z"/><path d="M80 34 L92 38 M76 36 L84 44"/>${dot(76, 28, 1.8, c)}`,
    'dragon ryu serpent',
  ),
  a(
    'phoenix',
    'Phénix',
    (c) =>
      `<path d="M50 50 C40 38 24 30 8 32 C20 38 30 46 38 54 M50 50 C60 38 76 30 92 32 C80 38 70 46 62 54"/><path d="M50 36 V60 C42 70 40 80 34 92 M50 60 C50 72 50 82 50 94 M50 60 C58 70 60 80 66 92"/><path d="M34 92 Q30 84 36 80 M66 92 Q70 84 64 80 M50 94 Q46 86 50 82"/>${ci(50, 30, 6)}<path d="M50 24 L46 14 M50 24 L54 14 M50 24 V12"/>${dot(48, 29, 1.6, c)}`,
    'phenix feu oiseau renaissance houou',
  ),
  a('cobra', 'Cobra', (c) => `<path d="M50 70 C36 70 26 56 30 40 C32 30 40 22 50 20 C60 22 68 30 70 40 C74 56 64 70 50 70 Z"/><path d="M50 32 C44 36 44 48 50 52 C56 48 56 36 50 32 Z M50 70 C30 72 22 82 36 88 C50 94 72 90 80 82"/>${dot(45, 30, 2, c)}${dot(55, 30, 2, c)}<path d="M50 24 L50 18 M48 14 L50 18 L52 14"/>`, 'cobra serpent naja'),
  a('penguin', 'Manchot', (c) => `<path d="M50 14 C36 14 30 30 30 46 C28 64 34 82 50 84 C66 82 72 64 70 46 C70 30 64 14 50 14 Z"/><path d="M40 34 C34 52 38 74 50 78 C62 74 66 52 60 34 C56 30 44 30 40 34 Z M30 46 L20 62 M70 46 L80 62 M42 84 L36 90 H48 M58 84 L52 90 H64 M46 30 L50 36 L54 30"/>${dot(44, 26, 2, c)}${dot(56, 26, 2, c)}`, 'manchot pingouin'),
  a('goat', 'Bouc', (c) => `<path d="M38 36 Q50 30 62 36 L58 70 Q50 78 42 70 Z"/><path d="M40 36 C30 24 30 12 40 8 C38 18 42 26 46 32 M60 36 C70 24 70 12 60 8 C62 18 58 26 54 32 M44 72 L50 90 L56 72 M38 42 L28 44 M62 42 L72 44"/>${dot(45, 48, 2.2, c)}${dot(55, 48, 2.2, c)}`, 'bouc chevre barbe'),
  a('ram', 'Bélier', (c) => `<path d="M40 36 Q50 30 60 36 L58 70 Q50 78 42 70 Z"/>${spiralAt(30, 42, 1.6, 2.2, true)}${spiralAt(70, 42, 1.6, 2.2)}${dot(45, 50, 2.2, c)}${dot(55, 50, 2.2, c)}<path d="M46 68 Q50 72 54 68"/>`, 'belier mouton cornes'),
  a('egg', 'Œuf fendu', () => `<path d="M50 12 C30 12 22 46 24 62 C26 80 38 90 50 90 C62 90 74 80 76 62 C78 46 70 12 50 12 Z"/><path d="M26 54 L36 48 L44 56 L52 46 L60 54 L68 46 L75 52"/>`, 'oeuf eclosion naissance'),
  a('nest', 'Nid', () => `${el(36, 50, 10, 13)}${el(50, 46, 10, 13)}${el(64, 50, 10, 13)}<path d="M14 58 C18 80 82 80 86 58 Z M18 64 L82 60 M20 70 L80 66 M26 76 L74 72"/>`, 'nid oeufs oiseau'),
  a('peacock-feather', 'Plume de paon', (c) => `<path d="M50 94 V30"/>${el(50, 26, 16, 20)}${el(50, 28, 9, 12)}${dot(50, 30, 4, c)}<path d="M50 50 L34 44 M50 58 L32 54 M50 66 L34 64 M50 50 L66 44 M50 58 L68 54 M50 66 L66 64 M50 74 L36 74 M50 74 L64 74"/>`, 'paon plume oeil'),
  a('unicorn-horn', 'Corne de licorne', () => `<path d="M40 90 L50 8 L60 90 Z"/><path d="M42 76 L58 68 M43 62 L57 54 M45 48 L55 40 M46 34 L54 28"/>`, 'licorne corne'),
  a('fish-bone', 'Arête de poisson', (c) => `<path d="M14 50 H80 M80 50 L92 40 M80 50 L92 60 M26 50 L20 38 M26 50 L20 62 M38 50 L32 34 M38 50 L32 66 M50 50 L44 32 M50 50 L44 68 M62 50 L56 36 M62 50 L56 64"/><circle cx="14" cy="50" r="8"/>${dot(12, 48, 2, c)}`, 'arete poisson squelette'),
  a('firefly', 'Luciole', (c) => `${el(50, 56, 9, 16)}${el(36, 42, 12, 6, -35)}${el(64, 42, 12, 6, 35)}<circle cx="50" cy="36" r="6"/><path d="M47 31 L42 22 M53 31 L58 22"/>${dot(50, 70, 6, c)}<circle cx="50" cy="70" r="16" stroke-dasharray="2 5"/>`, 'luciole lumiere insecte hotaru'),
  a('hedgehog', 'Hérisson', (c) => `<path d="M14 70 C16 52 32 38 52 38 C66 38 76 46 80 56 L90 62 L80 68 C70 74 30 76 14 70 Z"/><path d="M20 58 L12 50 M26 50 L20 38 M34 44 L30 30 M44 40 L42 26 M54 39 L56 26 M64 41 L68 30 M72 46 L80 38 M32 74 V82 M64 72 V80"/>${dot(78, 56, 2, c)}`, 'herisson piquants'),
  a('dove', 'Colombe', (c) => `<path d="M10 56 C26 54 34 46 42 38 C46 30 56 26 62 32 L72 30 L64 38 C66 52 54 64 36 66 L20 70 Z M42 44 C48 30 62 18 76 18 C70 30 60 40 48 48"/><path d="M72 30 C80 34 86 30 90 24 M84 28 L88 34 M80 32 L82 38"/>${dot(60, 31, 1.6, c)}`, 'colombe paix olivier oiseau'),
  a('yatagarasu', 'Yatagarasu (corbeau à trois pattes)', (c) => `<path d="M50 30 C40 30 34 40 36 52 C22 46 12 50 6 58 C20 58 30 62 38 66 C42 72 46 76 50 76 C54 76 58 72 62 66 C70 62 80 58 94 58 C88 50 78 46 64 52 C66 40 60 30 50 30 Z"/><path d="M44 76 L40 92 M50 76 V92 M56 76 L60 92 M50 30 L50 22 L56 26"/>${dot(47, 38, 2, c)}`, 'corbeau trois pattes soleil mythe'),
  a('black-cat', 'Chat assis', (c) => `<path d="M40 36 L36 18 L46 28 Q50 26 54 28 L64 18 L60 36 C66 44 66 52 60 58 C70 66 72 80 66 90 H34 C28 80 30 66 40 58 C34 52 34 44 40 36 Z"/><path d="M66 90 C80 90 88 80 84 66 C82 58 76 60 78 66"/>${dot(45, 42, 2, c)}${dot(55, 42, 2, c)}`, 'chat noir assis neko'),
];
