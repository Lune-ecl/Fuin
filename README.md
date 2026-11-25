# 封 Fuinjutsu · Archives de Zenkai

Le grimoire des sceaux du Conclave de Zenkai : un site rouge et noir où chaque shinobi ne lit **que les
sceaux de son cercle**, et où **le Conclave** gère les comptes, les cercles, les slots et le contenu.

- **Connexion par nom RP** : prénom + nom RP + mot de passe remis par le Conclave.
- **Accès par cercle** (du 1er au 5e) : un 1er cercle ne voit que les sceaux du 1er cercle, un 3e cercle
  voit les cercles 1 à 3, etc. Le Conclave voit tout. Le contrôle est fait **dans la base de données** :
  le contenu d'un sceau verrouillé n'est jamais envoyé au navigateur.
- **Une page par sceau** (`/premier-cercle/dissimulation`, `/troisieme-cercle/silence`…), avec formule de
  kanjis, icône, règles, statut de slot et sceaux liés.
- **Recherche** instantanée (Ctrl K / ⌘ K) par nom, catégorie ou kanji, limitée à ton cercle.
- **Console du Conclave** (`/conclave`) :
  - **Membres** : inscrire un shinobi (prénom, nom RP, cercle, mot de passe généré ou choisi), changer son
    cercle, le passer au Conclave, régénérer son mot de passe, le supprimer. Le mot de passe s'affiche
    une seule fois avec un bouton « Copier le message complet » à envoyer au joueur.
  - **Slots** : suivi des places par village (Ame, Konoha, Suna… modifiables), attribution / libération,
    catalogue de tous les sceaux, configuration des quotas et notes internes.
  - **Éditeur de sceaux** : création et modification des fiches (Markdown avec aperçu en direct, encadrés,
    tableaux, icône SVG, badge MJ, brouillons invisibles des joueurs, cercle minimum par fiche).
  - **Créateur de sceau** (dans l'éditeur) : le visuel d'un sceau se compose en cliquant sur une bibliothèque
    de pièces (contours, anneau de kanjis, ornements, symboles, kanji central, encre, rotation). Sur la fiche,
    le sceau se trace à l'encre puis son anneau tourne lentement. Un sceau sans visuel est dessiné
    automatiquement à partir de sa formule de kanjis.
  - **Catégories & droits** : cercle requis par catégorie, catégories réservées au Conclave.
  - **Journal** : historique de toutes les actions du Conclave.
- Chaque joueur peut changer son mot de passe dans **Mon compte**.
- **Demande de création de sceau** (`/demandes`, à partir du 3e cercle) : le shinobi décrit son sceau
  (nom, cercle visé, formule, effet et règles) et compose son visuel dans le créateur. La demande part en
  attente ; le Conclave la valide ou la refuse avec une explication, et peut en faire une fiche brouillon.
- **Mes sceaux maîtrisés** (`/mon-compte/sceaux`) : chaque shinobi coche les sceaux qu'il maîtrise, sur la
  fiche du sceau ou cercle par cercle ; le Conclave voit qui maîtrise quoi (fiche du sceau, page Membres).
- **Traducteur de kanjis** (`/traducteur`, ouvert à tous, même sans compte : lien sur la page de connexion) :
  on colle un kanji, un mot ou une phrase japonaise et le traducteur la découpe en mots (verbes conjugués
  compris), avec leur lecture en rōmaji et leur sens, puis donne le détail de chaque kanji ; dans l'autre
  sens, on cherche un mot français pour trouver ses kanjis. Sens en français : lexique du site
  (`src/lib/lexique.ts`, vocabulaire RP et mots courants) et kanjis de KANJIDIC2 ; les autres mots viennent
  de JMdict, en anglais. Les dictionnaires sont servis par le site (`public/kanji/`, © EDRDG, licence
  CC BY-SA 4.0, voir `public/kanji/LICENCE.txt`).
- **Trames** (Conclave → Trames) : le Conclave crée des trames faites d'épreuves, chacune avec ses propres
  essais. Le catalogue range les 17 types d'épreuves en familles, avec pour chacune une explication (ce que
  fait le joueur, ce qu'il faut régler) :
  - énigmes et savoir : énigme, question à choix, l'intrus, suite logique, mise en situation ;
  - kanjis et formules : inscription à déchiffrer, kanjis manquants, ordre des kanjis, associations,
    code du Conclave (message codé lettre par lettre en kanjis) ;
  - mini-jeux : verrou à cercles (tourner les cercles d'un sceau), résonance du sceau (deviner une
    formule grâce aux lueurs), flux de chakra (tracer un chemin dans une grille de kanjis), mémoire du
    sceau (retenir une séquence de kanjis ou de signes des mains) ;
  - sceaux et rolls : désenclavement ; récit et Conclave : épreuve validée par le Conclave, récit.

  La **bibliothèque d'épreuves** propose une cinquantaine d'épreuves toutes prêtes autour des kanjis et des
  sceaux, à ajouter en un clic puis à adapter. Côté joueur, chaque étape rappelle comment elle se joue.
  « Ouvrir la trame » fait apparaître une page temporaire dans le menu des joueurs ; « Terminer la trame »
  la retire. Toutes les réponses sont vérifiées par la base, et les rolls y sont tirés. Suivi en direct
  des réponses, des rolls et des résolutions. Aides : tables de roll modifiables et déchiffreur de kanjis.
- **Catégorie « Autre »** (en bas du sommaire) : demande de création de sceau, traducteur de kanjis,
  sceaux maîtrisés et suggestions.
- **Suggestions pour le site** (`/suggestions`) : chaque membre propose une fonctionnalité, une fiche, une
  idée de trame ou signale un problème. Les autres peuvent la soutenir ; le Conclave lui donne un statut
  (nouvelle, prévue, faite, refusée) et répond. Un compteur signale au Conclave les suggestions sans réponse.

---

## Architecture

| Élément | Choix |
| --- | --- |
| Frontend | React 18 + TypeScript + Vite, CSS sur mesure (aucun framework CSS) |
| Base de données | Supabase (PostgreSQL) |
| Authentification | Comptes gérés par le Conclave, mots de passe hachés en **bcrypt** (pgcrypto), sessions par jeton aléatoire (haché en SHA-256 côté base, 30 jours glissants) |
| Sécurité | Tables dans un schéma privé `fuin` **inaccessible** à l'API ; le site appelle uniquement les fonctions `public.fuin_*` qui vérifient la session et le cercle avant de renvoyer quoi que ce soit. Verrouillage 15 min après 8 mauvais mots de passe. |
| Hébergement | Site statique : GitHub Pages (workflow fourni), Vercel ou Netlify |

```
supabase/schema.sql      → tout le schéma (tables, sécurité, fonctions) — à exécuter une fois
src/lib/api.ts           → appels aux fonctions Supabase
src/pages/               → pages joueurs (connexion, accueil, fiche, compte)
src/pages/conclave/      → console du Conclave
src/styles/              → design rouge & noir
```

> ⚠️ **Le dépôt est public.** Le contenu des sceaux et la liste des membres ne sont **pas** dans le dépôt
> (sinon n'importe qui pourrait lire les sceaux du 5e cercle sur GitHub). Ils sont fournis à part dans
> `fuin-installation-complete.sql`. Ne commite jamais ce fichier (il est déjà ignoré par `.gitignore`, dossier `prive/`).

---

## Installation (≈ 15 minutes)

### 1. Créer la base Supabase

1. Crée un projet sur [supabase.com](https://supabase.com) (l'offre gratuite suffit).
2. Ouvre **SQL Editor → New query**, colle **tout** le fichier **`fuin-installation-complete.sql`**
   (fourni à part) et clique **Run**. Il contient le schéma *et* le grimoire (46 fiches, 3 villages,
   20 sceaux slottés), sans aucun compte.

   Sans ce fichier : colle [`supabase/schema.sql`](supabase/schema.sql) et clique **Run** — le site
   fonctionne alors avec un grimoire vide, à remplir depuis l'éditeur du Conclave.
3. Crée ton accès Conclave (remplace par ton nom RP et un mot de passe solide) :

   ```sql
   select fuin.bootstrap_conclave('Prénom', 'Nom', 'UnMotDePasseSolide');
   ```

   Si ton nom existe déjà (import), cette commande lui donne simplement le mot de passe et le rang Conclave.

### 2. Récupérer les clés

Dans Supabase : **Project Settings → API Keys** (ou **Data API**) :

- **Project URL** → `VITE_SUPABASE_URL` (ex. `https://abcd1234.supabase.co`)
- **Publishable key** (`sb_publishable_…`) ou clé **anon** (legacy) → `VITE_SUPABASE_ANON_KEY`

> Ces deux valeurs sont publiques par nature (elles finissent dans le site). **N'utilise jamais** la clé
> `service_role` / `sb_secret_…`.

### 3. Mettre en ligne

#### Option A — GitHub Pages (workflow inclus)

1. Fusionne le travail sur la branche `main`.
2. Dépôt GitHub → **Settings → Pages → Build and deployment → Source : GitHub Actions**.
3. **Settings → Secrets and variables → Actions → Variables → New repository variable** :
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - (facultatif) `VITE_BASE` = `/` si tu branches un domaine personnalisé. Sans domaine, le site est servi
     sur `https://<compte>.github.io/fuin/` et le chemin est réglé automatiquement.
4. Onglet **Actions → Déploiement GitHub Pages → Run workflow** (ou pousse sur `main`).

#### Option B — Vercel ou Netlify

Importe le dépôt, puis : commande de build `npm run build`, dossier de sortie `dist`, et ajoute les deux
variables d'environnement ci-dessus. Les redirections pour les URLs des sceaux sont déjà fournies
(`vercel.json`, `public/_redirects`).

### 4. Mises à jour de la base

Quand une mise à jour du site demande un changement dans la base, un fichier apparaît dans
[`supabase/migrations/`](supabase/migrations). Colle-le dans **SQL Editor** et clique **Run** (une seule
fois, mais le relancer ne casse rien).

- `002_sceaux_mj_et_veille.sql` : catégorie **Sceaux MJ** (réservée au Conclave, tous les sceaux MJ y
  sont rangés ; un sceau MJ n'est jamais visible d'un joueur) et fonction de veille `fuin_ping`.
- `003_conclave_invisible.sql` : les catégories réservées au Conclave (Sceaux MJ, Sceaux de clan)
  n'existent plus du tout pour les joueurs, et les pages des cercles ne leur citent plus les sceaux MJ.
- `004_demandes_et_trames.sql` : demandes de création de sceau et outils de trame (tables de roll).
- `005_trames.sql` : trames (énigmes, désenclavement, récit) ouvertes aux joueurs le temps d'un événement.
- `006_sceau_des_trames.sql` : sceau dessiné dans le créateur pour les étapes de désenclavement ; il rougeoie plus fort à chaque roll raté, se fissure à chaque verrou brisé et vole en éclats quand il cède.
- `007_memorial.sql` : page **Mémorial des maîtres** dans Fondations (Grands Maîtres et Maîtres avec portrait, titre, statut et histoire), gérée par le Conclave directement sur la page.
- `008_trames_reservees.sql` : trames réservées à des shinobi choisis (eux seuls et le Conclave les voient) et réussite critique qui brise deux verrous au désenclavement.
- `009_demandes_et_fiches_des_maitres.sql` : demandes de création de sceau modifiables, annulables (elles redeviennent des brouillons, invisibles du Conclave) et renvoyables ; au mémorial, chaque fiche peut être liée à un shinobi qui modifie lui-même son portrait, son titre et son histoire (liaison automatique par le nom).
- `010_sceaux_maitrises.sql` : les demandes de création de sceau s'ouvrent au 3ème cercle ; chaque shinobi coche les sceaux qu'il maîtrise (sur la fiche ou dans « Mes sceaux maîtrisés »), le Conclave voit qui maîtrise quoi.
- `011_trames_epreuves.sql` : trames plus complètes. Chaque étape a ses propres essais ; au désenclavement, le Conclave choisit le nombre de cercles à désenclaver (1 à 10) et le nombre d'essais (fixe ou selon le cercle). Nouvelles épreuves : kanjis manquants, mise en situation, énigme, question à choix, ordre des kanjis, associations et épreuve validée par le Conclave. Trames de test visibles du Conclave seulement.
- `012_rolls_d_etude.sql` : rolls d'étude dans les trames. Le joueur lance un roll (table de déchiffrement) pour comprendre le sens d'un kanji (même d'un kanji manquant, sans le voir) ou découvrir l'indice suivant ; le Conclave écrit les sens et les indices, et choisit le nombre de rolls par étape.
- `013_traducteur.sql` : réserve l'adresse `/traducteur` (aucune fiche ne peut la prendre) et retire la fonction d'une première version du traducteur si elle a été installée. Le traducteur lui-même n'a pas besoin de la base.
- `014_suggestions_et_mini_jeux.sql` : page Suggestions (proposer, soutenir, réponse et statut du Conclave) et sept mini-jeux de plus dans les trames, vérifiés par la base : verrou à cercles, résonance du sceau, flux de chakra, suite logique, mémoire du sceau, l'intrus et code du Conclave. Réserve aussi les adresses `/suggestions` et `/autre`.

### 5. Base toujours éveillée

L'offre gratuite de Supabase met la base en pause après 7 jours sans activité. Le workflow
[`keepalive.yml`](.github/workflows/keepalive.yml) la contacte **tous les jours** automatiquement
(onglet **Actions → Veille Supabase**), même si personne ne visite le site. Il se maintient lui-même
actif. Si la base est déjà en pause, relance-la une fois depuis le tableau de bord Supabase.

### 6. Premier passage dans la console

1. Connecte-toi avec ton nom RP → menu du compte → **Console du Conclave**.
2. **Membres** : les membres importés sont marqués « Non activé ». Clique **Activer** pour générer leur
   mot de passe, puis **Copier le message complet** et envoie-le au joueur.
3. **Catégories** : vérifie le cercle requis de chaque catégorie (par défaut : Fondations et Archives
   instables = 1er cercle, chaque cercle = son numéro, Sceaux MJ et Sceaux de clan = Conclave
   uniquement, invisibles des joueurs).

---

## Rédiger une fiche

Le contenu est en Markdown, avec quelques ajouts :

````markdown
| Cercle | Kanjis | Activation |
| --- | --- | --- |
| 3ème cercle | 黙 封 口 秘 | Contact |

## Définition
Texte avec du **gras** et de l'*italique*.

:::danger[Déclenchement mortel]
Encadré rouge. Types disponibles : note, tip, caution, danger.
:::

- Une règle
- Une autre règle, avec un [lien vers une fiche](/systeme-de-slots)
````

La **formule de kanjis** (champ dédié) s'affiche en grand en haut de la fiche avec un bouton « Copier ».
Une fiche en **brouillon** n'est visible que du Conclave.

---

## Développement local

```bash
cp .env.example .env        # puis renseigne l'URL et la clé Supabase
npm install
npm run dev                 # http://localhost:5173
npm run build               # build de production dans dist/
```

## Réinitialiser un mot de passe à la main

Depuis la console (Membres → **Nouveau mdp**), ou en SQL :

```sql
select fuin.bootstrap_conclave('Prénom', 'Nom', 'NouveauMotDePasse'); -- Conclave uniquement
update fuin.members set password_hash = fuin.hash_password('NouveauMotDePasse')
 where login_key = fuin.name_key('Prénom Nom');                     -- n'importe quel membre
```
