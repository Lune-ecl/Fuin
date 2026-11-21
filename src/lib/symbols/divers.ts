import { around, ci, dot, el, fill, poly, spiralAt, type SealSymbol, type SymbolCategory } from '../symbolKit';

const s = (key: string, label: string, cat: SymbolCategory, svg: (c: string) => string, tags = ''): SealSymbol => ({ key, label, cat, tags, svg });

export const DIVERS: SealSymbol[] = [
  // ---------------------------------------------------------------- Éléments et météo
  s('rainbow', 'Arc-en-ciel', 'elements', () => `<path d="M10 76 A40 40 0 0 1 90 76 M20 76 A30 30 0 0 1 80 76 M30 76 A20 20 0 0 1 70 76"/><path d="M4 80 Q14 72 24 80 M76 80 Q86 72 96 80"/>`, 'arc en ciel meteo pluie'),
  s('hail', 'Grêle', 'elements', (c) => `<path d="M24 50 A14 14 0 0 1 28 23 A19 19 0 0 1 64 18 A15 15 0 0 1 78 50 Z"/>${[[30, 62], [46, 66], [62, 62], [38, 80], [54, 84], [70, 78]].map(([x, y]) => dot(x, y, 3.4, c)).join('')}`, 'grele glace meteo'),
  s('fog', 'Brouillard', 'elements', () => `<path d="M12 30 H72 M28 42 H88 M12 54 H66 M30 66 H86 M14 78 H70"/>`, 'brouillard brume meteo'),
  s('sunrise', 'Lever du soleil', 'elements', () => `<path d="M8 68 H92 M26 68 A24 24 0 0 1 74 68"/>${around(7, '<path d="M50 34 V22"/>', -90).replace(/rotate\(([-\d.]+) 50 50\)/g, (_, r) => `rotate(${Number(r) / 2} 50 68)`)}<path d="M20 80 H80 M32 90 H68"/>`, 'aube lever soleil horizon'),
  s('thermometer', 'Thermomètre', 'elements', (c) => `<path d="M44 66 V18 A6 6 0 0 1 56 18 V66"/>${ci(50, 76, 12)}${dot(50, 76, 7, c)}<path d="M50 70 V36 M60 26 H66 M60 38 H66 M60 50 H66"/>`, 'temperature chaleur froid'),
  s('earthquake', 'Séisme', 'elements', () => `<path d="M8 50 H26 L32 34 L40 66 L48 28 L56 72 L64 40 L70 50 H92 M22 80 L34 74 L44 84 L56 76 L66 84 L78 78"/>`, 'seisme tremblement terre'),
  s('geyser', 'Geyser', 'elements', () => `<path d="M10 86 H90 M34 86 C40 70 44 50 46 30 M66 86 C60 70 56 50 54 30 M46 30 C36 26 34 14 44 12 C48 6 58 8 58 14 C68 14 66 28 54 30"/><path d="M28 60 Q22 56 26 50 M72 60 Q78 56 74 50"/>`, 'geyser source chaude onsen'),
  s('steam', 'Vapeur', 'elements', () => `<path d="M30 86 C20 74 40 66 30 54 C20 42 40 34 30 22 M50 90 C40 76 60 66 50 52 C40 40 60 30 50 14 M70 86 C60 74 80 66 70 54 C60 42 80 34 70 22"/>`, 'vapeur fumee chaleur'),
  s('lava', 'Coulée de lave', 'elements', (c) => `<path d="M30 10 C24 30 40 40 32 56 C26 70 36 84 48 90 H72 C64 80 70 66 62 54 C56 42 64 26 58 10"/>${dot(46, 40, 3, c)}${dot(52, 64, 3, c)}${dot(44, 78, 2.4, c)}`, 'lave magma volcan'),
  s('snowflakes', 'Flocons', 'elements', () => [[30, 30, 14], [68, 40, 10], [42, 72, 12]].map(([x, y, r]) => `<g transform="translate(${x - 50 * (r / 40)} ${y - 50 * (r / 40)}) scale(${r / 40})">${around(6, '<path d="M50 50 V10 M50 26 L40 18 M50 26 L60 18"/>')}</g>`).join(''), 'neige flocons hiver'),
  s('sandstorm', 'Tempête de sable', 'elements', (c) => `<path d="M8 30 Q30 22 52 30 T92 30 M14 50 Q36 42 58 50 T96 50 M6 70 Q28 62 50 70 T88 70"/>${[[22, 40], [70, 40], [40, 60], [80, 60], [30, 80], [64, 80]].map(([x, y]) => dot(x, y, 2, c)).join('')}`, 'sable desert tempete vent'),

  // ---------------------------------------------------------------- Astres
  s('black-hole', 'Trou noir', 'astres', (c) => `${dot(50, 50, 10, c)}${el(50, 50, 40, 12, -15)}${el(50, 50, 28, 8, -15)}${spiralAt(50, 50, 1.4, 4.2)}`, 'trou noir espace neant'),
  s('nebula', 'Nébuleuse', 'astres', (c) => `<path d="M20 60 C10 40 30 24 46 32 C54 16 80 20 80 40 C94 46 88 70 70 70 C62 86 34 84 30 70 C22 72 16 66 20 60 Z" stroke-dasharray="3 4"/>${[[40, 48], [58, 42], [66, 58], [46, 64], [52, 54]].map(([x, y], i) => dot(x, y, i % 2 ? 2 : 3, c)).join('')}`, 'nebuleuse etoiles espace'),
  s('twin-stars', 'Étoiles jumelles', 'astres', () => `${poly(4, 22, -90, 6, 34, 40)}${poly(4, 16, -90, 5, 68, 62)}${el(50, 50, 40, 26, 30)}`, 'etoiles double binaire'),
  s('north-star', 'Étoile polaire', 'astres', (c) => `<path d="M50 4 L55 45 L80 50 L55 55 L50 96 L45 55 L20 50 L45 45 Z"/>${poly(4, 18, -45, 4)}${dot(50, 50, 3, c)}`, 'etoile polaire nord guide'),
  s('big-dipper', 'Grande Ourse', 'astres', (c) => {
    const pts: [number, number][] = [[12, 34], [28, 30], [42, 38], [54, 46], [58, 66], [82, 70], [86, 50]];
    return `<path d="M${pts.map(([x, y]) => `${x} ${y}`).join(' L')} L54 46"/>${pts.map(([x, y]) => dot(x, y, 3, c)).join('')}`;
  }, 'constellation grande ourse etoiles'),
  s('blood-moon', 'Lune de sang', 'astres', (c) => `${ci(50, 42, 28)}<path d="M36 26 Q44 34 38 44 M60 30 Q54 40 62 50"/>${dot(40, 84, 3, c)}${dot(50, 90, 3.6, c)}${dot(60, 84, 3, c)}`, 'lune sang eclipse rouge'),
  s('solar-flare', 'Éruption solaire', 'astres', () => `${ci(46, 58, 26)}<path d="M62 38 C70 18 88 16 90 30 C92 42 78 44 72 38 M66 44 C80 40 90 50 84 60"/>`, 'soleil eruption flamme'),

  // ---------------------------------------------------------------- Corps
  s('fist', 'Poing fermé', 'corps', () => `<path d="M28 44 C28 34 36 30 42 34 C44 26 54 26 56 34 C60 28 70 30 70 38 C76 36 82 42 80 50 L78 70 C76 82 66 90 52 90 C38 90 28 80 28 66 Z M42 34 V48 M56 34 V48 M70 38 V50 M28 52 C36 48 44 52 46 60"/>`, 'poing combat force'),
  s('brain', 'Cerveau', 'corps', () => `<path d="M50 20 C40 12 24 16 22 30 C12 34 12 50 20 56 C16 68 28 80 40 76 C44 84 56 84 60 76 C72 80 84 68 80 56 C88 50 88 34 78 30 C76 16 60 12 50 20 Z M50 20 V78 M34 34 Q42 40 36 50 M66 34 Q58 40 64 50 M30 60 Q38 58 42 66 M70 60 Q62 58 58 66"/>`, 'cerveau esprit pensee'),
  s('lungs', 'Poumons', 'corps', () => `<path d="M50 12 V44 M50 34 C44 36 40 40 40 46 M50 34 C56 36 60 40 60 46 M40 30 C24 32 14 56 16 76 C18 88 34 88 40 80 C42 68 40 52 40 46 M60 30 C76 32 86 56 84 76 C82 88 66 88 60 80 C58 68 60 52 60 46"/>`, 'poumons souffle respiration'),
  s('spine', 'Colonne vertébrale', 'corps', () => `${[14, 26, 38, 50, 62, 74, 86].map((y) => `<path d="M42 ${y - 4} H58 L62 ${y} L58 ${y + 4} H42 L38 ${y} Z M38 ${y} H28 M62 ${y} H72"/>`).join('')}`, 'colonne vertebrale os squelette'),
  s('ear', 'Oreille', 'corps', () => `<path d="M40 30 C40 16 66 12 70 32 C74 48 60 54 58 66 C56 80 44 88 36 80 M48 36 C50 28 60 28 60 36 C60 44 50 46 50 54"/>`, 'oreille ecoute entendre'),
  s('dna', 'Double hélice', 'corps', () => `<path d="M34 6 C34 26 66 30 66 50 C66 70 34 74 34 94 M66 6 C66 26 34 30 34 50 C34 70 66 74 66 94 M38 16 H62 M44 30 H56 M44 70 H56 M38 84 H62"/>`, 'adn sang lignee heredite'),
  s('handprint', 'Empreinte de main', 'corps', (c) => fill('M30 86 C24 72 22 56 26 46 L22 22 C22 16 30 16 31 22 L35 42 L36 12 C36 6 45 6 45 12 L46 40 L50 10 C51 4 60 5 59 11 L57 41 L64 18 C66 12 74 14 72 20 L66 48 L76 40 C82 36 88 42 84 48 L68 72 C62 84 52 90 42 90 Z', c), 'main empreinte paume'),
  s('tooth', 'Croc', 'corps', () => `<path d="M30 20 C30 12 70 12 70 20 C70 36 66 46 62 54 L56 88 L50 64 L44 88 L38 54 C34 46 30 36 30 20 Z"/>`, 'dent croc'),

  // ---------------------------------------------------------------- Visages
  s('kabuki', 'Masque de kabuki', 'visages', () => `<path d="M50 8 C74 8 84 28 82 52 C80 76 66 92 50 92 C34 92 20 76 18 52 C16 28 26 8 50 8 Z"/><path d="M24 40 C32 30 42 34 46 42 M76 40 C68 30 58 34 54 42 M28 46 L44 48 M72 46 L56 48 M30 60 C36 66 40 72 38 80 M70 60 C64 66 60 72 62 80 M42 74 Q50 70 58 74 Q50 80 42 74 Z"/>`, 'kabuki masque theatre kumadori'),
  s('comedy-tragedy', 'Masques comédie et tragédie', 'visages', (c) =>
    `<path d="M12 22 C26 14 44 16 52 24 C54 46 46 62 32 62 C18 62 10 46 12 22 Z"/><path d="M20 34 Q24 30 28 34 M36 34 Q40 30 44 34 M22 46 Q32 54 42 46"/><path d="M48 40 C56 32 74 30 88 38 C90 62 82 78 68 78 C54 78 46 62 48 40 Z"/><path d="M56 52 Q60 56 64 52 M72 52 Q76 56 80 52 M58 70 Q68 62 78 70"/>${dot(24, 34, 1.4, c)}`, 'masques theatre comedie tragedie'),
  s('okame', 'Okame', 'visages', (c) => `<path d="M50 10 C76 10 86 34 84 56 C82 80 66 92 50 92 C34 92 18 80 16 56 C14 34 24 10 50 10 Z"/>${el(30, 60, 8, 5)}${el(70, 60, 8, 5)}<path d="M34 46 Q40 42 46 46 M54 46 Q60 42 66 46 M44 72 Q50 76 56 72"/>${dot(36, 28, 3, c)}${dot(64, 28, 3, c)}`, 'okame otafuku masque joie'),
  s('hyottoko', 'Hyottoko', 'visages', (c) => `${ci(50, 50, 38)}<path d="M28 44 Q34 38 40 44 M60 40 Q68 38 74 44 M56 68 C64 64 72 68 70 76 C68 82 60 80 58 74"/>${dot(36, 46, 3, c)}${dot(66, 44, 3, c)}<path d="M30 30 L42 34 M70 28 L60 32"/>`, 'hyottoko masque drole'),
  s('menpo', 'Menpō (masque de samouraï)', 'visages', () => `<path d="M18 40 H82 C82 70 70 90 50 90 C30 90 18 70 18 40 Z M50 40 L44 58 H56 Z M30 66 H70 M34 66 L36 74 M42 66 L43 76 M50 66 V77 M58 66 L57 76 M66 66 L64 74 M18 48 L8 44 M82 48 L92 44"/>`, 'menpo masque samourai armure'),
  s('ninja-face', 'Visage de ninja', 'visages', (c) => `${ci(50, 50, 38)}<path d="M14 40 H86 M14 58 H86 M86 48 L96 40 M86 50 L96 58"/>${el(38, 49, 7, 4)}${el(62, 49, 7, 4)}${dot(38, 49, 2, c)}${dot(62, 49, 2, c)}`, 'ninja shinobi masque bandeau'),
  s('plague-mask', 'Masque à bec', 'visages', (c) => `<path d="M30 30 C30 16 58 14 62 30 L92 70 L58 56 C50 66 34 66 30 54 Z"/>${ci(42, 36, 6)}${dot(42, 36, 2, c)}<path d="M58 56 L62 30 M30 30 L22 26"/>`, 'masque bec peste corbeau'),

  // ---------------------------------------------------------------- Esprits (yōkai)
  s('kappa', 'Kappa', 'esprits', (c) => `${el(50, 30, 16, 6)}<path d="M28 34 C26 52 34 66 50 66 C66 66 74 52 72 34 M42 52 L50 62 L58 52 Z M28 66 C24 74 26 84 34 88 H66 C74 84 76 74 72 66"/><path d="M34 30 L30 22 M42 26 L40 18 M58 26 L60 18 M66 30 L70 22"/>${dot(42, 42, 2.6, c)}${dot(58, 42, 2.6, c)}`, 'kappa yokai riviere'),
  s('karakasa', 'Karakasa (ombrelle hantée)', 'esprits', (c) => `<path d="M12 56 C14 30 32 14 50 14 C68 14 86 30 88 56 Z M50 56 V90 L44 94 M30 56 L50 14 L70 56 M60 40 C64 50 60 56 56 52"/>${ci(46, 36, 6)}${dot(46, 36, 2.4, c)}<path d="M52 48 C56 60 50 66 46 62"/>`, 'karakasa obake ombrelle yokai tsukumogami'),
  s('chochin-obake', 'Lanterne hantée', 'esprits', (c) => `<path d="M38 12 H62 M38 88 H62 M50 6 V12"/>${el(50, 50, 26, 36)}<path d="M26 34 Q50 40 74 34 M24 66 Q50 72 76 66"/>${ci(48, 44, 7)}${dot(48, 44, 2.6, c)}<path d="M36 56 C42 64 58 64 64 56 L58 70 L52 60"/>`, 'chochin obake lanterne yokai'),
  s('rokurokubi', 'Rokurokubi', 'esprits', (c) => `<path d="M50 94 C40 88 36 76 44 70 C54 62 66 64 62 52 C58 40 40 44 36 32 C34 22 44 16 52 18"/>${ci(62, 22, 12)}${dot(58, 20, 2, c)}${dot(66, 20, 2, c)}<path d="M58 28 Q62 30 66 28 M52 12 L44 16 L50 20"/>`, 'rokurokubi long cou yokai'),
  s('hitotsume', 'Hitotsume-kozō (un œil)', 'esprits', (c) => `${ci(50, 48, 32)}${el(50, 44, 14, 10)}${dot(50, 44, 5, c)}<path d="M38 66 Q50 74 62 66 M50 74 L48 84 L52 84 Z M22 30 Q50 20 78 30"/>`, 'hitotsume cyclope un oeil yokai'),
  s('nurikabe', 'Nurikabe (mur vivant)', 'esprits', (c) => `<path d="M14 14 H86 V88 H14 Z M14 34 H86 M14 54 H86 M14 74 H86 M38 14 V34 M62 14 V34 M26 34 V54 M50 34 V54 M74 34 V54 M38 54 V74 M62 54 V74"/>${dot(38, 44, 4, c)}${dot(62, 44, 4, c)}`, 'nurikabe mur yokai'),
  s('jizo', 'Jizō', 'esprits', () => `<path d="M50 10 C38 10 32 20 34 30 C26 36 24 52 26 66 C28 80 38 88 50 88 C62 88 72 80 74 66 C76 52 74 36 66 30 C68 20 62 10 50 10 Z M34 30 Q50 38 66 30 M40 22 Q44 20 46 22 M54 22 Q56 20 60 22 M28 46 H72 L66 54 H34 Z M44 60 C44 72 56 72 56 60 M24 88 H76"/>`, 'jizo statue protecteur'),

  // ---------------------------------------------------------------- Armes
  s('kama', 'Kama', 'armes', () => `<path d="M40 92 V36 M36 36 H44 M40 36 C42 18 60 8 82 12 C66 16 52 24 44 40"/>`, 'kama faucille arme'),
  s('tonfa', 'Tonfa', 'armes', () => `<path d="M42 8 H52 V92 H42 Z M52 30 H70 V40 H52"/>`, 'tonfa baton'),
  s('sai', 'Sai', 'armes', () => `<path d="M50 6 V70 M50 70 V92 M44 92 H56 M30 40 C30 54 40 60 50 60 C60 60 70 54 70 40 M30 40 L28 30 M70 40 L72 30 M46 70 H54"/>`, 'sai trident okinawa'),
  s('naginata', 'Naginata', 'armes', () => `<path d="M46 94 V40 M42 40 H50 M46 40 C46 24 54 12 68 6 C64 18 56 28 50 40"/><path d="M42 60 H50 M42 64 H50"/>`, 'naginata hallebarde'),
  s('kanabo', 'Kanabō', 'armes', (c) => `<path d="M44 92 V60 M38 60 H50 L56 10 H32 Z"/>${[[38, 20], [48, 22], [40, 32], [50, 34], [38, 44], [48, 46]].map(([x, y]) => dot(x, y, 2, c)).join('')}`, 'kanabo massue oni'),
  s('bo-staff', 'Bō (bâton)', 'armes', () => `<path d="M24 92 L76 8 M30 92 L82 8 M30 80 L36 80 M44 58 L50 58 M58 34 L64 34"/>`, 'bo baton combat'),
  s('tanto', 'Tantō', 'armes', () => `<path d="M50 10 C58 20 58 40 54 56 H46 C46 40 46 24 50 10 Z M40 56 H60 M46 56 V86 H54 V56 M46 66 H54 M46 74 H54"/>`, 'tanto poignard lame'),
  s('quiver', 'Carquois', 'armes', () => `<path d="M34 34 H58 L62 92 H38 Z M40 34 L36 8 M48 34 V6 M56 34 L62 10 M32 8 L36 4 L40 8 M44 6 L48 2 L52 6 M58 10 L62 6 L66 10 M38 50 H60 M39 70 H61"/>`, 'carquois fleches archer'),
  s('chakram', 'Chakram', 'armes', () => `${ci(50, 50, 40)}${ci(50, 50, 28)}${around(8, '<path d="M50 10 L54 4 L58 12"/>')}`, 'chakram anneau lancer'),
  s('flail', 'Fléau d’armes', 'armes', (c) => `<path d="M24 92 L40 56 M40 56 L48 46 M50 44 L56 38 M58 36 L62 32"/>${ci(70, 26, 12)}${[0, 60, 120, 180, 240, 300].map((r) => `<path d="M70 14 L70 8" transform="rotate(${r} 70 26)"/>`).join('')}${dot(70, 26, 3, c)}`, 'fleau masse chaine'),
  s('crossbow', 'Arbalète', 'armes', () => `<path d="M50 90 V18 M14 34 Q50 14 86 34 M14 34 L50 52 L86 34 M44 18 L50 8 L56 18 M44 76 H56 V86 H44 Z"/>`, 'arbalete carreau'),
  s('morning-star', 'Étoile du matin', 'armes', () => `<path d="M50 94 V58"/>${poly(10, 26, -90, 18, 50, 34)}${ci(50, 34, 8)}`, 'etoile du matin masse pointes'),

  // ---------------------------------------------------------------- Repères et signes
  s('curved-arrow', 'Flèche courbe', 'reperes', () => `<path d="M16 76 C16 40 44 24 76 28 M64 16 L78 28 L64 40"/>`, 'fleche detour'),
  s('double-arrow', 'Double flèche', 'reperes', () => `<path d="M10 50 H90 M24 36 L10 50 L24 64 M76 36 L90 50 L76 64"/>`, 'fleche aller retour'),
  s('crossed-arrows', 'Flèches croisées', 'reperes', () => `<path d="M16 84 L84 16 M84 84 L16 16 M66 16 H84 V34 M34 16 H16 V34 M16 72 L28 84 M84 72 L72 84"/>`, 'fleches croisees'),
  s('warning', 'Danger', 'reperes', (c) => `<path d="M50 10 L92 86 H8 Z M50 36 V62"/>${dot(50, 74, 3.4, c)}`, 'danger attention alerte triangle'),
  s('question', 'Point d’interrogation', 'reperes', (c) => `<path d="M34 32 C34 16 66 14 66 32 C66 46 50 48 50 62 V66"/>${dot(50, 82, 4, c)}`, 'question mystere inconnu'),
  s('exclamation', 'Point d’exclamation', 'reperes', (c) => `<path d="M50 12 V64 M44 12 H56 L54 64 H46 Z"/>${dot(50, 82, 5, c)}`, 'exclamation alerte'),
  s('no-entry', 'Sens interdit', 'reperes', () => `${ci(50, 50, 40)}<path d="M24 44 H76 V56 H24 Z"/>`, 'interdit sens defense'),
  s('stop', 'Octogone d’arrêt', 'reperes', () => `${poly(8, 42, -90 + 22.5)}${poly(8, 34, -90 + 22.5)}<path d="M36 50 H64"/>`, 'stop arret halte'),
  s('check', 'Coche', 'reperes', () => `<path d="M16 54 L40 78 L86 24"/>`, 'coche valide oui reussite'),
  s('radar', 'Radar', 'reperes', (c) => `${ci(50, 50, 40)}${ci(50, 50, 26)}${ci(50, 50, 12)}<path d="M50 50 L82 26 M50 10 V90 M10 50 H90" stroke-opacity="0.5"/><path d="M50 50 L82 26 A40 40 0 0 1 90 50 Z" stroke-dasharray="2 4"/>${dot(68, 38, 3, c)}`, 'radar detection reperage localisation'),
  s('beacon', 'Balise', 'reperes', (c) => `<path d="M38 90 L44 46 H56 L62 90 Z M30 90 H70 M44 46 L46 34 H54 L56 46"/>${dot(50, 28, 5, c)}<path d="M30 20 Q24 28 30 36 M70 20 Q76 28 70 36 M20 14 Q10 28 20 42 M80 14 Q90 28 80 42"/>`, 'balise phare signal localisation'),
];
