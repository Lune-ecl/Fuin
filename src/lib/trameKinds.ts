// Catalogue des épreuves des trames : nom, kanji, famille, et deux explications —
// « how » pour le Conclave (ce que fait le joueur, ce qu'il faut régler), « play » pour le joueur.
import type { TrameStepKind } from './api';

export type KindFamily = 'savoir' | 'kanji' | 'jeu' | 'sceau' | 'recit';

export interface KindInfo {
  label: string;
  glyph: string;
  family: KindFamily;
  /** une ligne, sur la carte du catalogue */
  hint: string;
  /** pour le Conclave : comment l'épreuve se joue et ce qu'on règle */
  how: string;
  /** pour le joueur, sous le titre de l'étape en cours */
  play: string;
}

export const FAMILIES: Record<KindFamily, { label: string; glyph: string; hint: string }> = {
  savoir: { label: 'Énigmes et savoir', glyph: '問', hint: 'Faire réfléchir : devinettes, questions, logique, terrain.' },
  kanji: { label: 'Kanjis et formules', glyph: '字', hint: 'Lire, compléter, ordonner et décoder des kanjis.' },
  jeu: { label: 'Mini-jeux', glyph: '遊', hint: 'Des jeux interactifs autour des sceaux.' },
  sceau: { label: 'Sceaux et rolls', glyph: '封', hint: 'Briser un sceau à coups de rolls.' },
  recit: { label: 'Récit et Conclave', glyph: '巻', hint: 'Raconter, ou juger soi-même une réponse.' },
};

export const KINDS: Record<TrameStepKind, KindInfo> = {
  riddle: {
    label: 'Énigme',
    glyph: '問',
    family: 'savoir',
    hint: 'Une devinette, réponse libre vérifiée par le site.',
    how: 'Le joueur lit ta question et écrit sa réponse. Tu donnes une ou plusieurs réponses acceptées (accents et majuscules ignorés), ou des mots-clés séparés par « + ».',
    play: 'Écris ta réponse : les accents et les majuscules ne comptent pas.',
  },
  choice: {
    label: 'Question à choix',
    glyph: '択',
    family: 'savoir',
    hint: 'Cocher la ou les bonnes réponses.',
    how: 'Le joueur coche une réponse parmi celles que tu proposes (2 à 8). Si tu coches plusieurs bonnes réponses, il doit toutes les trouver.',
    play: 'Coche la bonne réponse, ou toutes les bonnes s’il y en a plusieurs.',
  },
  intruder: {
    label: 'L’intrus',
    glyph: '異',
    family: 'savoir',
    hint: 'Trouver l’élément qui n’a rien à faire là.',
    how: 'Le joueur voit 3 à 9 tuiles (kanjis, sceaux, mots) et désigne celle qui ne suit pas la règle commune. Explique la règle dans le texte révélé à la fin.',
    play: 'Un élément ne suit pas la même règle que les autres : touche-le.',
  },
  sequence: {
    label: 'Suite logique',
    glyph: '続',
    family: 'savoir',
    hint: 'Compléter une suite qui suit une règle cachée.',
    how: 'Le joueur voit une suite (nombres, kanjis, traits…) avec une case « ? » et écrit ce qui la remplit. Tu peux proposer des tuiles qu’il touche pour répondre plus vite.',
    play: 'Trouve la règle de la suite et écris ce qui remplace le « ? ».',
  },
  situation: {
    label: 'Mise en situation',
    glyph: '境',
    family: 'savoir',
    hint: 'Trouver le sceau à utiliser pour chaque situation.',
    how: 'Tu décris 1 à 8 situations de terrain. Pour chacune, le joueur choisit le sceau du codex qu’il faut adapter. Tu peux limiter les sceaux proposés.',
    play: 'Pour chaque situation, choisis le sceau qu’il faut utiliser.',
  },
  cipher: {
    label: 'Inscription à déchiffrer',
    glyph: '謎',
    family: 'kanji',
    hint: 'Une inscription en kanjis à traduire.',
    how: 'Le joueur traduit une inscription en kanjis. Tu donnes les traductions acceptées et, si tu veux, le sens de chaque kanji pour les rolls d’étude.',
    play: 'Traduis l’inscription. Les rolls d’étude t’aident à comprendre chaque kanji.',
  },
  missing: {
    label: 'Kanjis manquants',
    glyph: '欠',
    family: 'kanji',
    hint: 'Un sceau incomplet : retrouver les kanjis effacés.',
    how: 'Tu écris la formule d’un sceau et tu caches certains kanjis. Le joueur les retrouve, en les écrivant ou parmi des leurres que tu choisis.',
    play: 'Retrouve les kanjis effacés pour reconstruire le sceau.',
  },
  order: {
    label: 'Ordre des kanjis',
    glyph: '順',
    family: 'kanji',
    hint: 'Remettre les kanjis d’une formule dans l’ordre.',
    how: 'Les kanjis de ta formule sont mélangés. Le joueur les touche dans l’ordre de tracé pour la reconstituer.',
    play: 'Touche les kanjis dans le bon ordre pour reformer la formule.',
  },
  match: {
    label: 'Associations',
    glyph: '合',
    family: 'kanji',
    hint: 'Relier chaque kanji (ou sceau) à son sens.',
    how: 'Tu écris 2 à 8 paires (à gauche un kanji, un sceau ou un mot ; à droite son sens). Le joueur relie chaque élément au bon sens.',
    play: 'Relie chaque élément de gauche à son sens.',
  },
  substitution: {
    label: 'Code du Conclave',
    glyph: '暗',
    family: 'kanji',
    hint: 'Un message codé lettre par lettre en kanjis.',
    how: 'Tu écris un message en clair : le site le code (chaque lettre devient un kanji) et montre la table au joueur. Cache quelques lettres de la table pour qu’il doive les déduire.',
    play: 'Chaque kanji remplace une lettre. Sers-toi de la table pour décoder le message, et devine les lettres cachées.',
  },
  dial: {
    label: 'Verrou à cercles',
    glyph: '輪',
    family: 'jeu',
    hint: 'Tourner les cercles d’un sceau jusqu’aux bons kanjis.',
    how: 'Le sceau a 2 à 6 cercles. Sur chacun tournent un bon kanji et des leurres. Le joueur fait tourner chaque cercle pour placer le bon kanji sous la marque, puis tente d’ouvrir le verrou.',
    play: 'Fais tourner chaque cercle (flèches ou clic) pour amener le bon kanji sous la marque rouge, puis ouvre le verrou.',
  },
  mastermind: {
    label: 'Résonance du sceau',
    glyph: '響',
    family: 'jeu',
    hint: 'Deviner une formule secrète grâce aux lueurs du sceau.',
    how: 'Une formule secrète de 3 à 6 kanjis, prise parmi ceux que tu proposes. À chaque essai, le sceau répond par des lueurs : rouges pour un kanji bien placé, blanches pour un kanji juste mais mal placé. Prévois 6 à 10 essais.',
    play: 'Compose une formule. Lueur rouge : bon kanji à la bonne place. Lueur blanche : bon kanji, mauvaise place.',
  },
  path: {
    label: 'Flux de chakra',
    glyph: '流',
    family: 'jeu',
    hint: 'Tracer le chemin du chakra à travers une grille de kanjis.',
    how: 'Tu remplis une grille de kanjis (2 à 6 de côté) et tu traces un chemin de case voisine en case voisine. Le joueur doit retrouver ce flux : les kanjis traversés, dans l’ordre, forment ta formule.',
    play: 'Touche les cases une à une, chacune voisine de la précédente, pour faire circuler le chakra dans le bon ordre.',
  },
  memory: {
    label: 'Mémoire du sceau',
    glyph: '憶',
    family: 'jeu',
    hint: 'Retenir une séquence montrée un instant, puis la reproduire.',
    how: 'Une séquence de kanjis (ou de signes des mains) s’affiche quelques secondes, puis disparaît. Le joueur la reproduit de mémoire. Tu règles la durée et les leurres.',
    play: 'Observe la séquence : elle disparaît vite. Reproduis-la ensuite dans l’ordre.',
  },
  unseal: {
    label: 'Désenclavement',
    glyph: '封',
    family: 'sceau',
    hint: 'Briser un sceau par des rolls : verrous et essais au choix.',
    how: 'Le joueur lance des rolls (tirés par le site) pour briser les verrous du sceau. Tu règles le nombre de verrous, le cercle minimum, les essais et la table de roll.',
    play: 'Chaque roll réussi brise un verrou, une réussite critique en brise deux.',
  },
  review: {
    label: 'Épreuve du Conclave',
    glyph: '議',
    family: 'recit',
    hint: 'Une réponse libre que le Conclave valide lui-même.',
    how: 'Le joueur écrit ce que fait son shinobi. Tu valides ou refuses sa réponse dans le suivi en direct, avec un commentaire.',
    play: 'Décris ce que fait ton shinobi : le Conclave lira ta réponse et la validera.',
  },
  text: {
    label: 'Récit ou récompense',
    glyph: '巻',
    family: 'recit',
    hint: 'Un texte qui s’affiche quand les joueurs y arrivent.',
    how: 'Un simple texte (récit, récompense, transition). Il s’affiche dès que les joueurs atteignent cette étape.',
    play: '',
  },
};

/** Les douze signes des mains, dans l'ordre du zodiaque. */
export const HAND_SIGNS: { k: string; name: string }[] = [
  { k: '子', name: 'Rat' },
  { k: '丑', name: 'Buffle' },
  { k: '寅', name: 'Tigre' },
  { k: '卯', name: 'Lièvre' },
  { k: '辰', name: 'Dragon' },
  { k: '巳', name: 'Serpent' },
  { k: '午', name: 'Cheval' },
  { k: '未', name: 'Bélier' },
  { k: '申', name: 'Singe' },
  { k: '酉', name: 'Coq' },
  { k: '戌', name: 'Chien' },
  { k: '亥', name: 'Sanglier' },
];
export const signName = (k: string) => HAND_SIGNS.find((s) => s.k === k)?.name ?? '';
