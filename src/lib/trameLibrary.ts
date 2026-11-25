// Bibliothèque d'épreuves toutes prêtes pour les trames, autour du fuin et des kanjis.
// Elles s'appuient sur le sens des kanjis plutôt que sur les règles du RP, pour convenir à toutes les trames.
// Le Conclave les ajoute en un clic, puis les adapte comme il veut.
import type { TrameStepDef, TrameStepKind } from './api';
import { buildKey, encode, hideSome } from './substitution';

export type Level = 'facile' | 'moyen' | 'difficile';

export interface Preset {
  id: string;
  kind: TrameStepKind;
  level: Level;
  /** ce que le Conclave voit dans la bibliothèque */
  summary: string;
  step: TrameStepDef;
}

const base = (kind: TrameStepKind, title: string, prompt_md: string, success_md: string) => ({ kind, title, prompt_md, success_md });

export const PRESETS: Preset[] = [
  // ---------------------------------------------------------------- énigmes
  {
    id: 'enigme-sceau',
    kind: 'riddle',
    level: 'facile',
    summary: 'Devinette : ce qui ferme toutes les bouches. Réponse : un sceau.',
    step: {
      ...base('riddle', 'Le gardien du silence', 'Une voix monte des pierres :\n\n> *Je n’ai pas de bouche, mais je ferme toutes les autres. Posé sur une lettre, je la garde ; posé sur un démon, je le retiens. Que suis-je ?*', 'Les pierres s’écartent : « Un sceau, bien sûr. »'),
      answers: ['un sceau', 'sceau', 'le sceau', 'fuin', 'fuinjutsu'],
      max_attempts: 3,
    },
  },
  {
    id: 'enigme-silence',
    kind: 'riddle',
    level: 'facile',
    summary: 'Devinette : plus on en parle, moins il existe. Réponse : le silence.',
    step: {
      ...base('riddle', 'Ce qui meurt quand on le nomme', '*Plus on parle de moi, moins j’existe. Les sceaux de bâillon me protègent, les espions me cherchent. Qui suis-je ?*', 'Un sceau de silence se dessine sur la porte, puis s’efface.'),
      answers: ['le silence', 'silence'],
      max_attempts: 3,
    },
  },
  {
    id: 'enigme-ombre',
    kind: 'riddle',
    level: 'facile',
    summary: 'Devinette : te suit le jour, disparaît à midi. Réponse : l’ombre (影).',
    step: {
      ...base('riddle', 'Celle qui suit', '*Je te suis le jour, je disparais à midi, je grandis le soir et je meurs la nuit. Les shinobi se cachent en moi. Qui suis-je ?*', 'Le kanji 影, l’ombre, apparaît gravé dans la pierre.'),
      answers: ['l ombre', 'ombre', 'une ombre', '影', 'kage'],
      max_attempts: 3,
    },
  },
  {
    id: 'enigme-contrat',
    kind: 'riddle',
    level: 'moyen',
    summary: 'Devinette : tracé à l’encre, signé de sang, sans lui pas d’invocation. Réponse : un contrat.',
    step: {
      ...base('riddle', 'L’encre et le sang', '*On me trace avec de l’encre, on me nourrit de chakra, on me signe de son sang. Sans moi, aucune bête ne répond à l’appel. Que suis-je ?*', 'Un rouleau se déroule de lui-même : le contrat est là.'),
      answers: ['un contrat', 'contrat', 'le contrat', 'un pacte', 'pacte', 'contrat + invocation', 'parchemin + contrat'],
      max_attempts: 3,
    },
  },
  {
    id: 'enigme-foret',
    kind: 'riddle',
    level: 'facile',
    summary: 'Kanji composé : 木 l’arbre, 林 le bois… quel kanji pour la forêt ? Réponse : 森.',
    step: {
      ...base('riddle', 'Les arbres du sceau', 'Un arbre s’écrit **木**. Deux arbres forment **林**, le bois.\n\nQuel kanji écrit la **forêt** ?', 'Trois arbres : **森**, la forêt. Les kanjis se construisent comme des sceaux, pièce par pièce.'),
      answers: ['森', 'mori', 'shin'],
      max_attempts: 3,
      study_rolls: 2,
      hints: ['Compte les arbres : un, deux… et ensuite ?'],
    },
  },
  {
    id: 'enigme-clarte',
    kind: 'riddle',
    level: 'moyen',
    summary: 'Kanji composé : soleil 日 + lune 月 = 明 (lumineux).',
    step: {
      ...base('riddle', 'Le soleil et la lune', 'Place le soleil **日** à côté de la lune **月**.\n\nQuel kanji obtiens-tu ? (Le kanji ou son sens.)', '**明** : la clarté, ce qui est lumineux.'),
      answers: ['明', 'lumineux', 'clair', 'clarte', 'lumiere', 'brillant'],
      max_attempts: 3,
    },
  },
  {
    id: 'enigme-endurance',
    kind: 'riddle',
    level: 'moyen',
    summary: 'Kanji composé : un cœur 心 sous une lame 刃 = 忍, endurer (le kanji du shinobi).',
    step: {
      ...base('riddle', 'Le cœur sous la lame', 'Un cœur **心** surmonté d’une lame **刃** : c’est la vertu des shinobi, endurer sans rien dire.\n\nQuel est ce kanji ?', '**忍** : endurer, se cacher. Le kanji des shinobi.'),
      answers: ['忍', 'shinobi', 'nin', 'endurer', 'endurance'],
      max_attempts: 3,
    },
  },
  {
    id: 'enigme-repos',
    kind: 'riddle',
    level: 'facile',
    summary: 'Kanji composé : une personne 亻 contre un arbre 木 = 休, le repos.',
    step: {
      ...base('riddle', 'Le voyageur', 'Une personne **亻** s’adosse à un arbre **木**. Que fait-elle ? Donne le kanji ou son sens.', '**休** : se reposer. Le voyageur peut reprendre son souffle.'),
      answers: ['休', 'repos', 'se reposer', 'reposer', 'pause'],
      max_attempts: 3,
    },
  },
  // ---------------------------------------------------------------- questions
  {
    id: 'choix-fu',
    kind: 'choice',
    level: 'facile',
    summary: 'Que signifie 封 ? Réponse : sceller.',
    step: { ...base('choice', 'Le premier kanji', 'Que signifie le kanji **封** ?', '**封** : sceller, fermer.'), options: ['Sceller', 'Brûler', 'Invoquer', 'Guérir'], correct: [0], max_attempts: 2 },
  },
  {
    id: 'choix-kekkai',
    kind: 'choice',
    level: 'facile',
    summary: 'Que désigne 結界 ? Réponse : une barrière.',
    step: { ...base('choice', 'Le mot gravé', 'Que désigne le mot **結界** ?', '**結界** : une barrière, une frontière protégée.'), options: ['Une barrière', 'Une explosion', 'Un poison', 'Un clone'], correct: [0], max_attempts: 2 },
  },
  {
    id: 'choix-ame',
    kind: 'choice',
    level: 'facile',
    summary: 'Lequel de ces kanjis signifie « âme » ? Réponse : 魂.',
    step: { ...base('choice', 'L’âme du sceau', 'Lequel de ces kanjis signifie **âme** ?', '**魂**, l’âme.'), options: ['魂', '雷', '鎖', '門'], correct: [0], max_attempts: 2 },
  },
  {
    id: 'choix-elements',
    kind: 'choice',
    level: 'moyen',
    summary: 'Plusieurs réponses : quels kanjis sont des éléments ? 火 水 土.',
    step: { ...base('choice', 'Les éléments', 'Coche **tous** les kanjis qui désignent un élément.', '**火** le feu, **水** l’eau, **土** la terre.'), options: ['火', '水', '心', '土', '夢'], correct: [0, 1, 3], max_attempts: 2 },
  },
  {
    id: 'choix-kai',
    kind: 'choice',
    level: 'moyen',
    summary: 'Que veut dire 解 dans une formule ? Réponse : défaire, libérer.',
    step: { ...base('choice', 'Le kanji de la fin', 'Dans une formule de sceau, que veut dire **解** ?', '**解** : défaire, dénouer, libérer. Le kanji des descellements.'), options: ['Défaire, libérer', 'Brûler', 'Invoquer', 'Protéger'], correct: [0], max_attempts: 2 },
  },
  {
    id: 'choix-signe',
    kind: 'choice',
    level: 'moyen',
    summary: 'Quel signe vient après le Rat (子) ? Réponse : le Buffle (丑).',
    step: { ...base('choice', 'L’ordre des signes', 'Dans l’ordre des douze signes, quel signe vient juste après **子** (le Rat) ?', '**丑**, le Buffle.'), options: ['丑 · Buffle', '寅 · Tigre', '亥 · Sanglier', '午 · Cheval'], correct: [0], max_attempts: 2 },
  },
  // ---------------------------------------------------------------- l'intrus
  {
    id: 'intrus-elements',
    kind: 'intruder',
    level: 'facile',
    summary: '火 水 風 雷 猫 : le chat n’est pas un élément.',
    step: { ...base('intruder', 'L’élément de trop', 'Les éléments du sceau se sont mélangés à autre chose. Lequel n’a rien à faire là ?', '**猫**, le chat. Les autres sont le feu, l’eau, le vent et la foudre.'), options: ['火', '水', '風', '猫', '雷'], correct: [3], max_attempts: 2 },
  },
  {
    id: 'intrus-ouvrir',
    kind: 'intruder',
    level: 'moyen',
    summary: '封 縛 鎖 開 錠 : 開 ouvre, les autres enferment.',
    step: { ...base('intruder', 'Le kanji qui ne scelle pas', 'Quatre de ces kanjis enferment. Lequel fait l’inverse ?', '**開**, ouvrir. Les autres scellent, lient, enchaînent et verrouillent.'), options: ['封', '縛', '鎖', '開', '錠'], correct: [3], max_attempts: 2 },
  },
  {
    id: 'intrus-lumiere',
    kind: 'intruder',
    level: 'facile',
    summary: '光 明 輝 照 闇 : 闇, les ténèbres, au milieu de la lumière.',
    step: { ...base('intruder', 'L’ombre parmi la lumière', 'Un de ces kanjis n’appartient pas à la lumière.', '**闇**, les ténèbres.'), options: ['光', '明', '闇', '輝', '照'], correct: [2], max_attempts: 2 },
  },
  {
    id: 'intrus-corps',
    kind: 'intruder',
    level: 'moyen',
    summary: '魂 霊 心 気 骨 : 骨 (l’os) est le seul qui se touche.',
    step: { ...base('intruder', 'Ce qui se touche', 'Quatre de ces kanjis ne se touchent pas. Lequel est matériel ?', '**骨**, l’os. Les autres sont l’âme, l’esprit, le cœur et l’énergie.'), options: ['魂', '霊', '骨', '心', '気'], correct: [2], max_attempts: 2 },
  },
  {
    id: 'intrus-signe',
    kind: 'intruder',
    level: 'difficile',
    summary: '子 丑 寅 竜 巳 : 竜 est un dragon, mais pas le signe du Dragon (辰).',
    step: { ...base('intruder', 'Le signe égaré', 'Parmi ces kanjis, un seul ne fait pas partie des douze signes des mains.', '**竜** est bien un dragon, mais le signe du Dragon s’écrit **辰**.'), options: ['子', '丑', '寅', '竜', '巳'], correct: [3], max_attempts: 2 },
  },
  {
    id: 'intrus-nombres',
    kind: 'intruder',
    level: 'facile',
    summary: '一 二 三 王 四 : 王 (le roi) n’est pas un nombre.',
    step: { ...base('intruder', 'Le faux nombre', 'Lequel de ces kanjis n’est pas un nombre ?', '**王**, le roi. Trois traits et un trait vertical.'), options: ['一', '二', '三', '王', '四'], correct: [3], max_attempts: 2 },
  },
  // ---------------------------------------------------------------- suites
  {
    id: 'suite-nombres',
    kind: 'sequence',
    level: 'facile',
    summary: '一 二 三 ? → 四 (quatre).',
    step: { ...base('sequence', 'Les marches du temple', 'Chaque marche porte un kanji. Que porte la quatrième ?', '**四**, quatre.'), items: ['一', '二', '三', '?'], answers: ['四', 'quatre', '4', 'yon', 'shi'], options: ['四', '五', '王', '十'], max_attempts: 2 },
  },
  {
    id: 'suite-signes',
    kind: 'sequence',
    level: 'moyen',
    summary: '子 丑 寅 ? → 卯 (Lièvre).',
    step: { ...base('sequence', 'La suite des signes', 'Les premiers signes des mains s’enchaînent. Lequel vient ensuite ?', '**卯**, le Lièvre.'), items: ['子', '丑', '寅', '?'], answers: ['卯', 'lievre', 'le lievre', 'lapin'], options: ['卯', '辰', '午', '亥'], max_attempts: 2 },
  },
  {
    id: 'suite-cercles',
    kind: 'sequence',
    level: 'facile',
    summary: '1 2 4 8 ? → 16 (chaque cercle double).',
    step: { ...base('sequence', 'Les cercles du maître', 'Chaque cercle du sceau double la force du précédent.', 'Seize : le sceau suivant pèse deux fois plus que le précédent.'), items: ['1', '2', '4', '8', '?'], answers: ['16', 'seize'], max_attempts: 2 },
  },
  {
    id: 'suite-verrous',
    kind: 'sequence',
    level: 'moyen',
    summary: '1 1 2 3 5 ? → 8 (chaque nombre est la somme des deux précédents).',
    step: { ...base('sequence', 'Les verrous qui s’ajoutent', 'À chaque tour, le sceau ajoute autant de verrous que les deux tours précédents réunis.', 'Huit verrous : trois plus cinq.'), items: ['1', '1', '2', '3', '5', '?'], answers: ['8', 'huit'], max_attempts: 2 },
  },
  {
    id: 'suite-arbres',
    kind: 'sequence',
    level: 'facile',
    summary: '木 林 ? → 森 (un, deux, trois arbres).',
    step: { ...base('sequence', 'La forêt qui pousse', 'Le sceau grandit comme une forêt.', '**森** : trois arbres, la forêt.'), items: ['木', '林', '?'], answers: ['森'], options: ['森', '本', '休', '体'], max_attempts: 2 },
  },
  {
    id: 'suite-semaine',
    kind: 'sequence',
    level: 'moyen',
    summary: '月 火 水 木 ? → 金 (les jours de la semaine : lundi… vendredi).',
    step: { ...base('sequence', 'Les jours du calendrier', 'Ces kanjis rythment la semaine japonaise, du lundi au jeudi. Quel jour vient ensuite ?', '**金**, vendredi (le jour du métal).'), items: ['月', '火', '水', '木', '?'], answers: ['金', 'vendredi', 'metal', 'or'], options: ['金', '土', '日', '風'], max_attempts: 2 },
  },
  {
    id: 'suite-cycle',
    kind: 'sequence',
    level: 'difficile',
    summary: 'Cycle des éléments 木 火 土 ? 水 → 金 (chaque élément fait naître le suivant).',
    step: { ...base('sequence', 'Le cycle qui fait naître', 'Le bois nourrit le feu, le feu donne la terre… Quel élément manque dans ce cycle ?', '**金**, le métal : la terre le fait naître, et il donne l’eau.'), items: ['木', '火', '土', '?', '水'], answers: ['金', 'metal', 'le metal'], max_attempts: 2, study_rolls: 2, hints: ['Le métal se trouve dans la terre.'] },
  },
  // ---------------------------------------------------------------- associations
  {
    id: 'assoc-elements',
    kind: 'match',
    level: 'facile',
    summary: 'Relier 火 水 風 土 雷 à leur élément.',
    step: {
      ...base('match', 'Les cinq éléments', 'Relie chaque kanji à son élément.', 'Les cinq éléments répondent à l’appel du sceau.'),
      pairs: [
        { left: '火', right: 'feu' },
        { left: '水', right: 'eau' },
        { left: '風', right: 'vent' },
        { left: '土', right: 'terre' },
        { left: '雷', right: 'foudre' },
      ],
      max_attempts: 3,
      reveal: true,
    },
  },
  {
    id: 'assoc-sceau',
    kind: 'match',
    level: 'facile',
    summary: 'Relier 封 印 結 界 à leur sens.',
    step: {
      ...base('match', 'Les kanjis du sceau', 'Relie chaque kanji de la formule à son sens.', 'Sceller, sceau, nouer, limite : la formule d’une barrière.'),
      pairs: [
        { left: '封', right: 'sceller' },
        { left: '印', right: 'sceau, marque' },
        { left: '結', right: 'nouer' },
        { left: '界', right: 'monde, limite' },
      ],
      max_attempts: 3,
      reveal: true,
    },
  },
  {
    id: 'assoc-signes',
    kind: 'match',
    level: 'moyen',
    summary: 'Relier six signes des mains à leur animal.',
    step: {
      ...base('match', 'Les signes des mains', 'Relie chaque signe à son animal.', 'Six signes sur douze : la base de toute technique.'),
      pairs: [
        { left: '子', right: 'Rat' },
        { left: '丑', right: 'Buffle' },
        { left: '寅', right: 'Tigre' },
        { left: '卯', right: 'Lièvre' },
        { left: '辰', right: 'Dragon' },
        { left: '巳', right: 'Serpent' },
      ],
      max_attempts: 3,
      reveal: true,
    },
  },
  {
    id: 'assoc-corps',
    kind: 'match',
    level: 'facile',
    summary: 'Relier 魂 心 血 骨 気 à leur sens.',
    step: {
      ...base('match', 'Le corps et l’esprit', 'Relie chaque kanji à ce qu’il désigne.', 'Âme, cœur, sang, os, énergie : tout ce qu’un sceau peut lier.'),
      pairs: [
        { left: '魂', right: 'âme' },
        { left: '心', right: 'cœur' },
        { left: '血', right: 'sang' },
        { left: '骨', right: 'os' },
        { left: '気', right: 'énergie' },
      ],
      max_attempts: 3,
      reveal: true,
    },
  },
  {
    id: 'assoc-ouvrir',
    kind: 'match',
    level: 'moyen',
    summary: 'Relier 開 閉 解 縛 : ouvrir, fermer, défaire, lier.',
    step: {
      ...base('match', 'Ouvrir et fermer', 'Relie chaque kanji à son action.', 'Deux qui ouvrent, deux qui ferment.'),
      pairs: [
        { left: '開', right: 'ouvrir' },
        { left: '閉', right: 'fermer' },
        { left: '解', right: 'défaire' },
        { left: '縛', right: 'lier' },
      ],
      max_attempts: 3,
      reveal: true,
    },
  },
  // ---------------------------------------------------------------- formules
  {
    id: 'inscription-seuil',
    kind: 'cipher',
    level: 'facile',
    summary: 'Traduire 封印解除 : lever le sceau. Avec le sens de chaque kanji pour les rolls d’étude.',
    step: {
      ...base('cipher', 'L’inscription du seuil', 'Une inscription est gravée au-dessus de la porte. Que dit-elle ?', 'La porte reconnaît la formule et s’entrouvre.'),
      cipher_text: '封印解除',
      answers: ['lever le sceau', 'levee du sceau', 'sceau + lev', 'sceau + liber', 'sceau + defai', 'sceau + annul', 'sceau + retir', 'desceller', 'descellement', 'le descellement'],
      meanings: ['sceller', 'sceau', 'défaire', 'retirer'],
      study_rolls: 3,
      max_attempts: 2,
    },
  },
  {
    id: 'inscription-interdit',
    kind: 'cipher',
    level: 'moyen',
    summary: 'Traduire 禁術封印 : la technique interdite est scellée.',
    step: {
      ...base('cipher', 'La mise en garde', 'Un avertissement court sur le coffre. Que dit-il ?', 'Le coffre renferme une technique que personne ne devait retrouver.'),
      cipher_text: '禁術封印',
      answers: ['technique interdite + scell', 'technique interdite + sceau', 'art interdit + scell', 'interdit + scell'],
      meanings: ['interdire', 'technique', 'sceller', 'sceau'],
      study_rolls: 3,
      max_attempts: 2,
    },
  },
  {
    id: 'ordre-barriere',
    kind: 'order',
    level: 'facile',
    summary: 'Remettre 封印結界 dans l’ordre.',
    step: { ...base('order', 'L’ordre de tracé', 'Les kanjis de la barrière ont été mélangés. Remets-les dans l’ordre : sceller, sceau, nouer, limite.', 'La barrière se referme derrière vous.'), formula: '封印結界', max_attempts: 3, reveal: true },
  },
  {
    id: 'ordre-liberation',
    kind: 'order',
    level: 'moyen',
    summary: 'Remettre 解封開門 dans l’ordre : défaire le scellé, ouvrir la porte.',
    step: { ...base('order', 'La formule de libération', 'Pour ouvrir, il faut d’abord défaire le scellé, puis ouvrir la porte.', 'La porte pivote sans un bruit.'), formula: '解封開門', max_attempts: 3, reveal: true },
  },
  {
    id: 'manquant-ame',
    kind: 'missing',
    level: 'facile',
    summary: 'Sceau 魂封印 : retrouver 魂 parmi des leurres.',
    step: { ...base('missing', 'Le sceau de l’âme', 'Un kanji a été arraché au sceau. Celui qui manque désigne ce que le sceau retient : l’âme.', 'Le sceau se reforme et l’âme reste prisonnière.'), formula: '魂封印', missing: [0], decoys: '雷火', max_attempts: 3, reveal: true },
  },
  {
    id: 'manquant-verrou',
    kind: 'missing',
    level: 'moyen',
    summary: 'Sceau 鎖門封界 : retrouver 門 et 界.',
    step: { ...base('missing', 'Le verrou du temple', 'Deux kanjis du verrou se sont effacés. La chaîne garde une porte, et le sceau garde une limite.', 'Le verrou se reforme, plus solide qu’avant.'), formula: '鎖門封界', missing: [1, 3], decoys: '開光', max_attempts: 3, reveal: true },
  },
  {
    id: 'code-minuit',
    kind: 'substitution',
    level: 'moyen',
    summary: 'Message codé en kanjis : « le sceau cede a minuit ».',
    step: { ...base('substitution', 'Le message intercepté', 'Un messager transportait ce rouleau codé. Chaque kanji remplace une lettre.', 'Il faut agir avant minuit.'), answers: ['le sceau cede a minuit', 'sceau + minuit'], max_attempts: 3 },
  },
  {
    id: 'code-temple',
    kind: 'substitution',
    level: 'difficile',
    summary: 'Message codé : « rendez vous au temple a l aube ».',
    step: { ...base('substitution', 'L’ordre du Conclave', 'Le Conclave n’écrit jamais en clair. Décode ses ordres.', 'Rendez-vous au temple, à l’aube.'), answers: ['rendez vous au temple a l aube', 'temple + aube'], max_attempts: 3 },
  },
  // ---------------------------------------------------------------- mini-jeux
  {
    id: 'verrou-liberation',
    kind: 'dial',
    level: 'facile',
    summary: 'Trois cercles à tourner sur 解 封 開 (défaire, sceller, ouvrir).',
    step: {
      ...base('dial', 'Le verrou à trois cercles', 'Le verrou s’ouvre quand ses cercles forment la formule de libération, du centre vers le bord : **défaire, sceller, ouvrir**.', 'Les trois cercles s’alignent dans un déclic.'),
      rings: [
        { answer: '解', decoys: '結縛閉' },
        { answer: '封', decoys: '魂印鎖' },
        { answer: '開', decoys: '門閉光' },
      ],
      max_attempts: 3,
      reveal: true,
    },
  },
  {
    id: 'verrou-elements',
    kind: 'dial',
    level: 'moyen',
    summary: 'Quatre cercles : 火 水 雷 風, du centre vers le bord.',
    step: {
      ...base('dial', 'Le cadenas des éléments', 'Une inscription entoure le cadenas : *« Au cœur le feu, puis l’eau qui l’éteint, la foudre qui tombe, et le vent qui emporte tout. »*', 'Le cadenas tombe en poussière.'),
      rings: [
        { answer: '火', decoys: '水土木' },
        { answer: '水', decoys: '火氷雪' },
        { answer: '雷', decoys: '雲雨風' },
        { answer: '風', decoys: '嵐空気' },
      ],
      max_attempts: 3,
      reveal: false,
    },
  },
  {
    id: 'resonance-formule',
    kind: 'mastermind',
    level: 'moyen',
    summary: 'Deviner 封印結 parmi 5 kanjis, 8 essais.',
    step: {
      ...base('mastermind', 'La formule perdue', 'Le sceau a oublié sa formule, mais il vibre quand on s’en approche. Trois kanjis, pris parmi ceux gravés autour.', 'Le sceau reconnaît sa formule et s’illumine.'),
      formula: '封印結',
      palette: '封印結界魂',
      max_attempts: 8,
    },
  },
  {
    id: 'resonance-elements',
    kind: 'mastermind',
    level: 'difficile',
    summary: 'Deviner 火水風雷 parmi 6 kanjis, 10 essais.',
    step: {
      ...base('mastermind', 'La résonance des éléments', 'Quatre éléments, dans un ordre précis, réveillent le sceau.', 'Les quatre éléments tournent autour du sceau, puis s’apaisent.'),
      formula: '火水風雷',
      palette: '火水風雷土木',
      max_attempts: 10,
    },
  },
  {
    id: 'flux-barriere',
    kind: 'path',
    level: 'facile',
    summary: 'Grille 3×3 : tracer 封 → 印 → 結 → 界.',
    step: {
      ...base('path', 'Le flux du sceau', 'Fais circuler ton chakra à travers le sceau pour écrire **封印結界**, case voisine après case voisine.', 'Le chakra s’écoule et la barrière s’active.'),
      grid: ['封印魂', '雷結火', '水界風'],
      path: [0, 1, 4, 7],
      show_start: true,
      max_attempts: 3,
      reveal: true,
    },
  },
  {
    id: 'flux-cycle',
    kind: 'path',
    level: 'difficile',
    summary: 'Grille 4×4 : suivre le cycle 木 → 火 → 土 → 金 → 水.',
    step: {
      ...base('path', 'Le chemin des éléments', 'Le chakra suit le cycle qui fait naître chaque élément du précédent : le bois nourrit le feu, le feu donne la terre, la terre porte le métal, le métal donne l’eau.', 'Le cycle est complet : le sceau respire.'),
      grid: ['木火雷風', '闇土光氷', '月金水雪', '心魂血星'],
      path: [0, 1, 5, 9, 10],
      show_start: false,
      max_attempts: 3,
      reveal: true,
    },
  },
  {
    id: 'memoire-signes',
    kind: 'memory',
    level: 'moyen',
    summary: 'Retenir 4 signes des mains montrés 6 secondes.',
    step: {
      ...base('memory', 'Les signes du descellement', 'Le maître enchaîne les signes une seule fois, très vite. Reproduis-les.', 'Les signes résonnent et le sceau se relâche.'),
      formula: '寅巳申亥',
      signs: true,
      show_seconds: 6,
      max_attempts: 3,
      reveal: true,
    },
  },
  {
    id: 'memoire-eclair',
    kind: 'memory',
    level: 'moyen',
    summary: 'Retenir 5 kanjis apparus 5 secondes, parmi des leurres.',
    step: {
      ...base('memory', 'L’éclair du sceau', 'Le sceau ne s’est montré qu’un instant avant de s’effacer. Retrace-le de mémoire.', 'Le sceau se redessine sous tes doigts.'),
      formula: '封魂雷縛結',
      decoys: '印界火水',
      show_seconds: 5,
      max_attempts: 3,
      reveal: true,
    },
  },
  {
    id: 'memoire-incantation',
    kind: 'memory',
    level: 'difficile',
    summary: 'Retenir 7 signes des mains montrés 8 secondes.',
    step: {
      ...base('memory', 'La longue incantation', 'Sept signes, une seule démonstration. Le moindre faux pas et tout est à refaire.', 'L’incantation est complète.'),
      formula: '子丑寅卯辰巳午',
      signs: true,
      show_seconds: 8,
      max_attempts: 3,
      reveal: true,
    },
  },
  // ---------------------------------------------------------------- sceaux et récit
  {
    id: 'desenclavement-ancien',
    kind: 'unseal',
    level: 'moyen',
    summary: 'Sceau ancien : 3 verrous, à partir du 3e cercle, essais selon le cercle.',
    step: {
      ...base('unseal', 'Le sceau ancien', 'Un sceau très ancien verrouille le passage. Seuls les shinobi qui maîtrisent le désenclavement peuvent tenter de le briser.', 'Le sceau se fissure, puis vole en éclats.'),
      locks: 3,
      min_rank: 3,
      attempts_mode: 'rank',
      roll_table: 'desenclavement',
    },
  },
  {
    id: 'desenclavement-grand',
    kind: 'unseal',
    level: 'difficile',
    summary: 'Grand sceau : 6 verrous, à partir du 4e cercle, 8 essais.',
    step: {
      ...base('unseal', 'Le grand sceau', 'Six cercles de kanjis entrelacés. Il faudra plusieurs shinobi, ou beaucoup de chance.', 'Le grand sceau cède enfin.'),
      locks: 6,
      min_rank: 4,
      attempts_mode: 'fixed',
      max_attempts: 8,
      roll_table: 'desenclavement',
    },
  },
  {
    id: 'conclave-improvise',
    kind: 'review',
    level: 'moyen',
    summary: 'Réponse libre : décrire un sceau improvisé pour contenir une fuite de chakra.',
    step: {
      ...base('review', 'Le sceau improvisé', 'Une fuite de chakra menace d’exploser. Ton shinobi n’a que ce qu’il porte sur lui. Décris le sceau qu’il improvise : les kanjis choisis, le support, et comment il le trace.', 'Le Conclave approuve : la fuite est contenue.'),
      max_attempts: 3,
    },
  },
  {
    id: 'recit-prologue',
    kind: 'text',
    level: 'facile',
    summary: 'Texte d’introduction à adapter.',
    step: { ...base('text', 'Le message du Conclave', 'Un corbeau dépose un rouleau scellé à vos pieds. Le sceau du Conclave se brise de lui-même :\n\n> *Un ancien sceau s’est réveillé sous le temple. Trouvez-le avant la nuit.*', '') },
  },
  {
    id: 'recit-recompense',
    kind: 'text',
    level: 'facile',
    summary: 'Texte de récompense à adapter.',
    step: { ...base('text', 'Le coffre', 'Au fond de la salle, un coffre ouvert. À l’intérieur : un rouleau vierge, encore tiède de chakra, et une note du Conclave.', '') },
  },
];

/** Prépare une épreuve de la bibliothèque pour la trame (copie, et code du Conclave généré). */
export function presetStep(p: Preset): TrameStepDef {
  const step: TrameStepDef = JSON.parse(JSON.stringify(p.step));
  if (step.kind === 'substitution' && !step.cipher_text) {
    const message = step.answers?.[0] ?? '';
    step.key = hideSome(buildKey(message));
    step.cipher_text = encode(message, step.key);
  }
  return step;
}
