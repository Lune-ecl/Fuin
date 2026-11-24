// Lexique français du traducteur, écrit pour le site : le vocabulaire qu'on croise le plus dans un RP
// ninja (techniques, éléments, esprits, combat, liens…) et des mots courants. Il passe avant le
// dictionnaire général (JMdict, en anglais). Une ligne : forme écrite | lecture en kana | sens.

const LIGNES = `
# Techniques et arts
術|じゅつ|technique, art
忍術|にんじゅつ|ninjutsu, art ninja
忍法|にんぽう|art ninja, technique ninja
幻術|げんじゅつ|genjutsu, art de l'illusion
体術|たいじゅつ|taijutsu, combat à mains nues
剣術|けんじゅつ|art du sabre
武術|ぶじゅつ|art martial
呪術|じゅじゅつ|sorcellerie, art des malédictions
妖術|ようじゅつ|sorcellerie, magie démoniaque
魔術|まじゅつ|magie
魔法|まほう|magie
封印術|ふういんじゅつ|technique de scellement
結界術|けっかいじゅつ|technique de barrière
禁術|きんじゅつ|technique interdite
秘術|ひじゅつ|technique secrète
秘伝|ひでん|secret transmis, technique héréditaire
奥義|おうぎ|technique ultime, secret de l'art
極意|ごくい|secret ultime d'un art
術式|じゅつしき|formule (d'une technique)
口寄せ|くちよせ|invocation
召喚|しょうかん|invocation, convocation
分身|ぶんしん|clone, double
影分身|かげぶんしん|clone de l'ombre
変化|へんげ|transformation, métamorphose
変身|へんしん|métamorphose
身代わり|みがわり|substitution, remplaçant
瞬身|しゅんしん|déplacement instantané
流派|りゅうは|école (de combat), courant
修行|しゅぎょう|entraînement, ascèse
訓練|くんれん|entraînement
試練|しれん|épreuve
覚醒|かくせい|éveil
発動|はつどう|activation, déclenchement
起動|きどう|activation, mise en marche
制御|せいぎょ|contrôle, maîtrise
暴走|ぼうそう|emballement, perte de contrôle
吸収|きゅうしゅう|absorption
放出|ほうしゅつ|libération, émission
チャクラ|ちゃくら|chakra
# Éléments
火遁|かとん|art du feu (katon)
水遁|すいとん|art de l'eau (suiton)
風遁|ふうとん|art du vent (fūton)
土遁|どとん|art de la terre (doton)
雷遁|らいとん|art de la foudre (raiton)
木遁|もくとん|art du bois (mokuton)
氷遁|ひょうとん|art de la glace
属性|ぞくせい|élément, nature (d'une technique)
火|ひ|feu
水|みず|eau
風|かぜ|vent
土|つち|terre
雷|かみなり|foudre, tonnerre
木|き|arbre, bois
氷|こおり|glace
炎|ほのお|flamme
光|ひかり|lumière
闇|やみ|ténèbres
影|かげ|ombre
天|てん|ciel
地|ち|terre, sol
空|そら|ciel
海|うみ|mer
山|やま|montagne
川|かわ|rivière
森|もり|forêt
月|つき|lune
太陽|たいよう|soleil
星|ほし|étoile
雲|くも|nuage
雨|あめ|pluie
雪|ゆき|neige
嵐|あらし|tempête
霧|きり|brume
花|はな|fleur
桜|さくら|cerisier, fleur de cerisier
石|いし|pierre
# Sceaux, barrières, liens
封印|ふういん|sceau, scellement
封印式|ふういんしき|formule de scellement
封|ふう|scellé, sceau
封じる|ふうじる|sceller, enfermer
封ずる|ふうずる|sceller, enfermer
解封|かいふう|descellement, ouverture d'un scellé
封鎖|ふうさ|blocus, verrouillage
結界|けっかい|barrière (protectrice), frontière sacrée
印|いん|signe, sceau (mudrā)
結印|けついん|composition des signes (mudrā)
呪印|じゅいん|marque maudite, sceau de malédiction
刻印|こくいん|empreinte gravée, marque
紋|もん|emblème, motif
紋章|もんしょう|blason, armoiries
家紋|かもん|blason familial
陣|じん|formation, camp
魔法陣|まほうじん|cercle magique
符|ふ|talisman, signe
札|ふだ|talisman, étiquette, carte
護符|ごふ|amulette, talisman protecteur
呪符|じゅふ|talisman de sorcellerie
起爆札|きばくふだ|parchemin explosif
巻物|まきもの|rouleau, parchemin
鎖|くさり|chaîne
縛る|しばる|lier, attacher, entraver
束縛|そくばく|entrave, contrainte
拘束|こうそく|immobilisation, détention
鍵|かぎ|clé, verrou
錠|じょう|serrure, cadenas
門|もん|porte, portail
扉|とびら|porte, battant
開門|かいもん|ouverture de la porte
解除|かいじょ|levée, annulation, désactivation
解放|かいほう|libération
解く|とく|dénouer, défaire, résoudre
解ける|とける|se dénouer, se défaire
結ぶ|むすぶ|nouer, lier, conclure
繋ぐ|つなぐ|relier, attacher
開く|ひらく|ouvrir
閉じる|とじる|fermer
放つ|はなつ|libérer, lancer
# Esprits et sacré
魂|たましい|âme
霊|れい|esprit, âme d'un mort
霊魂|れいこん|âme, esprit
精霊|せいれい|esprit (de la nature)
悪霊|あくりょう|esprit maléfique
怨霊|おんりょう|esprit vengeur
幽霊|ゆうれい|fantôme
亡霊|ぼうれい|spectre, revenant
妖怪|ようかい|yōkai, créature surnaturelle
魑魅魍魎|ちみもうりょう|démons et esprits en tous genres
鬼|おに|démon, ogre (oni)
悪魔|あくま|démon, diable
魔|ま|démon, mal
魔物|まもの|monstre, démon
神|かみ|dieu, divinité
神様|かみさま|dieu, divinité (respectueux)
仏|ほとけ|bouddha
天狗|てんぐ|tengu
神社|じんじゃ|sanctuaire shinto
寺|てら|temple bouddhiste
祠|ほこら|petit sanctuaire
鳥居|とりい|portique shinto (torii)
巫女|みこ|prêtresse (miko)
僧|そう|moine
祈り|いのり|prière
祈る|いのる|prier
祓う|はらう|exorciser, purifier
お祓い|おはらい|exorcisme, purification
除霊|じょれい|exorcisme
浄化|じょうか|purification
呪い|のろい|malédiction
呪う|のろう|maudire
呪詛|じゅそ|malédiction, imprécation
祟り|たたり|malédiction (d'un esprit)
禁忌|きんき|tabou
契約|けいやく|contrat, pacte
盟約|めいやく|pacte, alliance
誓い|ちかい|serment
誓う|ちかう|jurer, faire serment
代償|だいしょう|prix à payer, compensation
生贄|いけにえ|sacrifice, offrande vivante
犠牲|ぎせい|sacrifice, victime
儀式|ぎしき|rituel, cérémonie
聖|せい|sacré, saint
神聖|しんせい|sacré
邪悪|じゃあく|maléfique
禁断|きんだん|interdit
伝説|でんせつ|légende
伝承|でんしょう|tradition, légende transmise
古代|こだい|antiquité
遺跡|いせき|ruines, vestiges
宝|たから|trésor
鏡|かがみ|miroir
勾玉|まがたま|magatama (joyau incurvé)
地獄|じごく|enfer
天国|てんごく|paradis
冥界|めいかい|monde des morts
黄泉|よみ|royaume des morts (yomi)
世界|せかい|monde
異界|いかい|autre monde
境界|きょうかい|frontière, limite
空間|くうかん|espace
時空|じくう|espace-temps
次元|じげん|dimension
虚空|こくう|vide, néant
無|む|néant, rien
# Créatures
狐|きつね|renard
九尾|きゅうび|neuf queues
龍|りゅう|dragon
竜|りゅう|dragon
蛇|へび|serpent
虎|とら|tigre
鳥|とり|oiseau
烏|からす|corbeau
鴉|からす|corbeau
狼|おおかみ|loup
獣|けもの|bête, fauve
蝶|ちょう|papillon
蜘蛛|くも|araignée
猫|ねこ|chat
犬|いぬ|chien
蛙|かえる|grenouille
鷹|たか|faucon
# Ninjas, gens, liens
忍|しのび|ninja; endurer
忍者|にんじゃ|ninja
忍び|しのび|ninja, discrétion
くノ一|くのいち|kunoichi (femme ninja)
侍|さむらい|samouraï
武士|ぶし|guerrier, samouraï
浪人|ろうにん|rōnin, samouraï sans maître
戦士|せんし|guerrier
暗殺|あんさつ|assassinat
暗殺者|あんさつしゃ|assassin
隠密|おんみつ|agent secret; en secret
密偵|みってい|espion
任務|にんむ|mission
里|さと|village
村|むら|village
国|くに|pays
城|しろ|château
師匠|ししょう|maître, mentor
先生|せんせい|maître, professeur
弟子|でし|disciple
先輩|せんぱい|aîné (senpai)
後輩|こうはい|cadet (kōhai)
仲間|なかま|camarade, compagnon
友|とも|ami
友達|ともだち|ami
敵|てき|ennemi
味方|みかた|allié
主|あるじ|maître, seigneur
殿|との|seigneur
王|おう|roi
皇帝|こうてい|empereur
姫|ひめ|princesse
頭領|とうりょう|chef (de clan)
当主|とうしゅ|chef de famille
家族|かぞく|famille
父|ちち|père
母|はは|mère
兄|あに|grand frère
姉|あね|grande sœur
弟|おとうと|petit frère
妹|いもうと|petite sœur
子|こ|enfant
息子|むすこ|fils
娘|むすめ|fille
先祖|せんぞ|ancêtre
祖先|そせん|ancêtre
血|ち|sang
血族|けつぞく|lignée, parents par le sang
血筋|ちすじ|lignée
一族|いちぞく|clan, famille
氏族|しぞく|clan
人|ひと|personne
者|もの|personne (qui…)
私|わたし|je, moi
僕|ぼく|je (masculin)
俺|おれ|je (familier, masculin)
我|われ|je, moi (soutenu)
我が|わが|mon, notre
我々|われわれ|nous
貴方|あなた|vous, toi
お前|おまえ|toi (familier)
貴様|きさま|toi (insultant)
彼|かれ|il, lui
彼女|かのじょ|elle
誰|だれ|qui
様|さま|(titre respectueux)
# Combat
戦い|たたかい|combat, bataille
戦う|たたかう|combattre
戦争|せんそう|guerre
決闘|けっとう|duel
勝利|しょうり|victoire
敗北|はいぼく|défaite
攻撃|こうげき|attaque
防御|ぼうぎょ|défense
守る|まもる|protéger
守護|しゅご|protection, garde
守護者|しゅごしゃ|gardien
盾|たて|bouclier
刀|かたな|sabre (katana)
剣|けん|épée
刃|やいば|lame
槍|やり|lance
弓|ゆみ|arc
矢|や|flèche
手裏剣|しゅりけん|shuriken
苦無|くない|kunai
鎌|かま|faucille
鎧|よろい|armure
拳|こぶし|poing
力|ちから|force, pouvoir
気|き|énergie, esprit (ki)
精神|せいしん|esprit, mental
心|こころ|cœur, esprit
命|いのち|vie
死|し|mort
死ぬ|しぬ|mourir
殺す|ころす|tuer
生きる|いきる|vivre
不死|ふし|immortalité
倒す|たおす|abattre, vaincre
勝つ|かつ|gagner
負ける|まける|perdre
斬る|きる|trancher
切る|きる|couper
刺す|さす|poignarder, piquer
打つ|うつ|frapper
撃つ|うつ|tirer (arme)
壊す|こわす|détruire, briser
壊れる|こわれる|se briser
破る|やぶる|briser, déchirer, enfreindre
砕く|くだく|broyer, briser
燃える|もえる|brûler
助ける|たすける|aider, sauver
救う|すくう|sauver
傷|きず|blessure
痛み|いたみ|douleur
# Sentiments et idées
運命|うんめい|destin
宿命|しゅくめい|destinée, fatalité
永遠|えいえん|éternité
夢|ゆめ|rêve
希望|きぼう|espoir
絶望|ぜつぼう|désespoir
怒り|いかり|colère
憎しみ|にくしみ|haine
愛|あい|amour
恐怖|きょうふ|peur, terreur
涙|なみだ|larme
笑顔|えがお|sourire
記憶|きおく|mémoire, souvenir
真実|しんじつ|vérité
嘘|うそ|mensonge
秘密|ひみつ|secret
意志|いし|volonté
覚悟|かくご|détermination, résolution
誇り|ほこり|fierté
名誉|めいよ|honneur
忠誠|ちゅうせい|loyauté
裏切り|うらぎり|trahison
復讐|ふくしゅう|vengeance
平和|へいわ|paix
自由|じゆう|liberté
正義|せいぎ|justice
罪|つみ|péché, crime
罰|ばつ|châtiment
# Corps
目|め|œil
瞳|ひとみ|pupille, regard
手|て|main
腕|うで|bras
足|あし|pied, jambe
頭|あたま|tête
顔|かお|visage
口|くち|bouche
体|からだ|corps
骨|ほね|os
髪|かみ|cheveux
声|こえ|voix
# Verbes courants
来る|くる|venir
行く|いく|aller
見る|みる|voir, regarder
聞く|きく|entendre, écouter
言う|いう|dire
話す|はなす|parler
知る|しる|savoir, connaître
分かる|わかる|comprendre
思う|おもう|penser
感じる|かんじる|ressentir
待つ|まつ|attendre
止める|とめる|arrêter
逃げる|にげる|fuir
走る|はしる|courir
飛ぶ|とぶ|voler, sauter
消す|けす|effacer, éteindre
消える|きえる|disparaître
隠す|かくす|cacher
隠れる|かくれる|se cacher
現れる|あらわれる|apparaître
呼ぶ|よぶ|appeler
信じる|しんじる|croire, avoir confiance
忘れる|わすれる|oublier
覚える|おぼえる|retenir, apprendre
目覚める|めざめる|s'éveiller
眠る|ねむる|dormir
開ける|あける|ouvrir
閉める|しめる|fermer
使う|つかう|utiliser
戻る|もどる|revenir
帰る|かえる|rentrer
出る|でる|sortir
入る|はいる|entrer
持つ|もつ|tenir, porter, posséder
取る|とる|prendre
与える|あたえる|donner, accorder
失う|うしなう|perdre
探す|さがす|chercher
見つける|みつける|trouver
始める|はじめる|commencer
終わる|おわる|finir
作る|つくる|fabriquer, créer
書く|かく|écrire
読む|よむ|lire
食べる|たべる|manger
飲む|のむ|boire
立つ|たつ|se lever, se tenir debout
座る|すわる|s'asseoir
落ちる|おちる|tomber
襲う|おそう|attaquer, assaillir
叫ぶ|さけぶ|crier
泣く|なく|pleurer
笑う|わらう|rire, sourire
許す|ゆるす|pardonner, permettre
願う|ねがう|souhaiter, implorer
求める|もとめる|rechercher, demander
集める|あつめる|rassembler
生まれる|うまれる|naître
変わる|かわる|changer
続ける|つづける|continuer
動く|うごく|bouger
止まる|とまる|s'arrêter
する|する|faire
ある|ある|il y a, exister (choses)
いる|いる|être là, exister (êtres)
なる|なる|devenir
ならない|ならない|il ne faut pas (…てはならない), insupportable
# Adjectifs
強い|つよい|fort, puissant
弱い|よわい|faible
速い|はやい|rapide
美しい|うつくしい|beau
暗い|くらい|sombre
明るい|あかるい|lumineux, clair
深い|ふかい|profond
古い|ふるい|ancien, vieux
新しい|あたらしい|nouveau
大きい|おおきい|grand
小さい|ちいさい|petit
長い|ながい|long
高い|たかい|haut, cher
恐ろしい|おそろしい|effrayant, terrible
悲しい|かなしい|triste
嬉しい|うれしい|joyeux, content
痛い|いたい|douloureux, « aïe »
黒い|くろい|noir
白い|しろい|blanc
赤い|あかい|rouge
青い|あおい|bleu
冷たい|つめたい|froid (au toucher)
熱い|あつい|brûlant
優しい|やさしい|gentil, doux
危ない|あぶない|dangereux
# Couleurs, nombres, mots utiles
赤|あか|rouge
紅|くれない|écarlate
青|あお|bleu
白|しろ|blanc
黒|くろ|noir
緑|みどり|vert
金|きん|or
銀|ぎん|argent (métal)
鉄|てつ|fer
一|いち|un
二|に|deux
三|さん|trois
四|よん|quatre
五|ご|cinq
六|ろく|six
七|なな|sept
八|はち|huit
九|きゅう|neuf
十|じゅう|dix
百|ひゃく|cent
千|せん|mille
万|まん|dix mille
円|えん|cercle; yen
輪|わ|anneau, cercle
大|だい|grand
小|しょう|petit
真|しん|vrai, vérité
今|いま|maintenant
時|とき|moment, quand
時間|じかん|temps, heure
物|もの|chose
事|こと|chose, fait
所|ところ|endroit
道|みち|voie, chemin
名|な|nom
名前|なまえ|nom
言葉|ことば|mot, parole
文字|もじ|caractère, écriture
漢字|かんじ|kanji
意味|いみ|sens, signification
何|なに|quoi
# Expressions
はい|はい|oui
いいえ|いいえ|non
ありがとう|ありがとう|merci
ありがとうございます|ありがとうございます|merci beaucoup
すみません|すみません|pardon, excusez-moi
ごめんなさい|ごめんなさい|désolé
さようなら|さようなら|au revoir
こんにちは|こんにちは|bonjour
こんばんは|こんばんは|bonsoir
おはよう|おはよう|bonjour (le matin)
おはようございます|おはようございます|bonjour (le matin, poli)
お願いします|おねがいします|s'il vous plaît
よろしく|よろしく|enchanté, je compte sur toi
`;

export interface LexEntry {
  written: string;
  reading: string;
  fr: string;
}

export const LEXIQUE: Map<string, LexEntry> = new Map();
for (const line of LIGNES.split('\n')) {
  if (!line || line.startsWith('#')) continue;
  const [written, reading, fr] = line.split('|');
  if (written && fr && !LEXIQUE.has(written)) LEXIQUE.set(written, { written, reading, fr });
}

/** Particules et petits mots de grammaire : leur rôle dans la phrase. */
export const PARTICULES: Record<string, string> = {
  は: '(thème : quant à…)',
  が: '(sujet)',
  を: '(complément d’objet)',
  の: 'de (appartenance)',
  に: 'à, vers, dans',
  へ: 'vers',
  で: 'à, avec, par',
  と: 'et, avec',
  も: 'aussi, même',
  や: 'et (entre autres)',
  か: '(question) ?',
  よ: '! (insistance)',
  ね: 'n’est-ce pas',
  な: '(ne… pas !, insistance)',
  ぞ: '! (affirmation forte)',
  ぜ: '! (affirmation familière)',
  わ: '(adoucissement)',
  から: 'depuis, parce que',
  まで: 'jusqu’à',
  より: 'plus que, à partir de',
  だけ: 'seulement',
  しか: 'ne… que',
  けど: 'mais',
  ので: 'parce que',
  のに: 'alors que',
  って: '(citation : « … »)',
  です: 'c’est, être (poli)',
  でした: 'c’était (poli)',
  だ: 'c’est, être',
  だった: 'c’était',
  である: 'c’est, être (écrit)',
  ます: '(terminaison polie)',
  ました: '(terminaison polie, passé)',
  ません: '(terminaison polie, négatif)',
};
