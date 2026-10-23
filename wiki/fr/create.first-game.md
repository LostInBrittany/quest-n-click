# Votre premier jeu

Le plus court chemin entre rien et une salle jouable sur votre téléphone, avec, à chaque étape, les fichiers que vous
touchez.

<a name="overview"></a>

## Ce que vous allez construire

Un jeu d'une salle à partir du modèle : un jardin, un seau, un portail. On prend le seau, on l'utilise sur le portail,
c'est fini. Vous y ajoutez une lampe que le héros peut allumer, vous la placez à la souris, vous la racontez dans le
storyboard, vous vérifiez le jeu avec le validateur et le solveur, et vous y jouez sur votre téléphone. Les étapes sont
prévues pour une quinzaine de minutes. Tout ce que vous écrirez ensuite est une variation de ce qui est déjà là.

**Le contenu est une donnée.** Salles, accessoires à états, personnages, objets, règles, conversations, indices,
scripts et événements sont de simples objets TypeScript, sans code dedans : chaque outil peut les lire, les vérifier
et y jouer.

```ts
export const garden: RoomDef = {
  id: 'garden', name: 'Le jardin', decor: 'garden',
  props: { tank: { name: 'citerne', states: { full: 'tank_full', empty: 'tank_empty' } } },
  exits: { back_door: { name: 'porte de derrière', to: 'house', entry: 'garden' } },
  on: [
    { verb: 'use', a: 'pipe', b: 'tank', if: '!tank_drained',
      do: [{ minigame: 'pipes' }, { lose: 'pipe' }, { set: 'tank_drained' }, { prop: ['tank', 'empty'] }] },
  ],
  hints: [{ until: 'tank_drained', lines: ['Utilise le tuyau sur la citerne.'] }],
};
```

Une règle, c'est un verbe, une cible, une condition et une liste de commandes. Ce dont un jeu a besoin au-delà, une
commande sur mesure, est du TypeScript à lui : du code de confiance, nommé dans le jeu et haché avec lui
([code sur mesure](create.custom-code.md)). Des mécaniques célèbres du genre sont écrites ainsi dans
[mécaniques classiques](create.classics.md). Le Studio, c'est le vrai moteur avec un éditeur par-dessus : les salles et
leurs placements, le storyboard case par case, les vérifications après chaque enregistrement
([le Studio local](studio.overview.md)).

**Images, sons et langues.** Un prompt pour chaque planche, chaque objet et chaque décor dans un même style, et des
planches découpées en sprites ([images](create.images.md)) ; une musique chiptune arrangée depuis un MIDI et des
bruitages tirés d'une même palette ([musique](create.music.md), [bruitages](create.sound-effects.md)) ; chaque
réplique traduisible, une traduction manquante repérée avant la release ([traductions](create.translations.md)).

<a name="what-you-need"></a>

## Ce qu'il vous faut

- Node 22.12 ou plus récent ; Python 3 avec Pillow pour `npm run assets`
  (`pip install -r node_modules/quest-n-click/requirements.txt` dans un projet créé, `pip install -r requirements.txt`
  dans le dépôt du moteur). Voir [prérequis](install.requirements.md).
- Un téléphone sur le même réseau, pour la dernière étape (facultatif).
- Un des deux endroits où travailler, avec les mêmes étapes ([lequel est lequel](create.project-layout.md)) :
  - **un projet créé**, où le jeu est `game/` ; les chemins de cette page disent `game/` ;
  - **le dépôt du moteur**, où le jeu est `games/<id>/` (ici `games/lamp/`).

<a name="steps"></a>

## Étapes

<a name="from-the-template"></a>

### 1. Un jeu à partir du modèle (une minute)

<!-- step: create -->
Dans le dossier de votre choix, fabriquez un projet :

```sh
# n'importe où sur votre machine : crée le dossier my-game
npx create-quest-n-click my-game "My Game"     # ou : npx quest-n-click create my-game "My Game"
cd my-game
npm install
npm run assets      # les images provisoires dans public/assets
npm run dev         # http://127.0.0.1:5173/ : un jardin, un seau, un portail
```

Tant que les paquets ne sont pas sur npm, prenez l'archive jointe à une release
([installer depuis l'archive de release](install.from-archive.md)) :

```sh
# n'importe où sur votre machine
T=https://github.com/wanoo/quest-n-click/releases/download/v<version>/quest-n-click-<version>.tgz
npx --package=$T quest-n-click create my-game "My Game" --engine=$T
```

Ou, dans le dépôt du moteur, le même modèle devient `games/lamp`, choisi comme jeu courant (`.cache/game`) :

```sh
# dans le dépôt du moteur
npm install
npm run new-game lamp "The Lamp"
npm run assets
npm run dev
```

Vous voyez un jardin. Le modèle est un jeu complet d'une salle. Ses images sont provisoires, dessinées à partir de
formes (`tools/placeholder-art.py`) : `provenance.json` le dit, et une release les refuse tant que chaque fichier n'est
pas remplacé et relu.

<a name="read-the-room"></a>

### 2. Lire la salle que vous allez changer (deux minutes)

<!-- step: read-room -->
`game/rooms/start.ts` (`games/lamp/rooms/start.ts`) est toute la salle. Lisez-la de haut en bas : `props` (les
choses qui ont une image), `hotspots` (des endroits du décor), `look` (une réplique, ou trois qui tournent, pour chacun),
`on` (les règles : un verbe, une cible, une condition, ce qui se passe), `hints` (ce que dit l'objet d'indices, tant
qu'un drapeau n'est pas posé), `onEnter`. La géométrie n'est pas là : `layout/start.json` dit où sont les choses, et
seuls le Studio ou l'éditeur de placement l'écrivent ([géométrie](create.geometry.md)).

<a name="add-a-prop"></a>

### 3. Ajouter un accessoire et sa règle (cinq minutes)

<!-- step: add-prop -->
Ajoutez une lampe au jardin. Dans `rooms/start.ts` :

```ts
props: {
  bucket: { name: 'seau', img: 'starter/items/bucket' },
  lamp: { name: 'lampe', img: 'starter/items/bucket', states: { off: 'starter/items/bucket', on: 'starter/items/bucket' } },
},
look: {
  // …
  lamp: ['Une lampe de jardin. Éteinte.', 'Toujours éteinte.', 'Elle réfléchit.'],
},
on: [
  // …
  { id: 'start.light-lamp', verb: 'use', a: 'lamp', if: '!lamp_on',
    do: [{ set: 'lamp_on' }, { prop: ['lamp', 'on'] }, 'Et la lumière fut.'] },
],
```

L'image est celle du seau pour l'instant (`npm run prompts` écrit le prompt d'une vraie, et l'onglet Assets du Studio
découpe ce que vous générez : [images](create.images.md)). Une règle est un verbe, une cible, une condition et une liste
de commandes ; une chaîne dans `do` est une réplique du héros. `{ prop: ['lamp', 'on'] }` change l'état de
l'accessoire, `{ set: 'lamp_on' }` le retient dans la sauvegarde ([réactions](create.reactions.md),
[commandes](create.commands.md)).

<a name="place-it"></a>

### 4. La placer (deux minutes)

<!-- step: place -->
```sh
# dans le projet créé, ou dans le dépôt du moteur
npm run studio      # le Studio s'ouvre ; onglet Rooms, « start »
```

La lampe n'a pas encore de place : le Studio la montre à l'endroit par défaut. Faites-la glisser où vous voulez,
ajustez sa hauteur, enregistrez : `layout/start.json` gagne une entrée `lamp`. Ne tapez jamais de coordonnées à la
main ; l'éditeur et le Studio sont faits pour ça. Tant qu'elle n'est pas placée, `validate` dit
`no position in the layout`.

<a name="story-then-check"></a>

### 5. Raconter d'abord, puis vérifier (trois minutes)

<!-- step: story-check -->
`storyboard.json` est la source de vérité du texte : ajoutez une case à la planche du jardin (`"action": "Use lamp"`,
la réplique du héros) ([le storyboard](create.storyboard.md)). L'onglet Storyboard montre ce qui est fait et ce qui ne
l'est pas ; l'onglet Check relance le validateur et le solveur après chaque enregistrement. Depuis le terminal :

```sh
# dans le dépôt du moteur
npm run validate   # un accessoire sans texte Regarder, un drapeau que rien ne lit, une règle inaccessible : c'est dit ici
npm run solve      # un chemin de Nouvelle partie à la fin, étape par étape ; « softlock » si le joueur peut rester bloqué
npm test           # les tests du moteur et la soluce de votre jeu (games/lamp/tests/game.test.ts)
```

```sh
# dans le projet créé
npx quest-n-click validate
npx quest-n-click solve
npm run verify     # validate, solve, i18n status, lint, playtests
```

Une règle dont le solveur n'a jamais besoin n'est pas un bug (la lampe est décorative), mais `npm run lint`
(`npx quest-n-click lint`) vous dit qu'elle l'est ([vérifier son jeu](create.checking.md)).

<a name="play-on-your-phone"></a>

### 6. Y jouer sur votre téléphone (deux minutes)

<!-- step: play-phone -->
```sh
# dans le dépôt du moteur
npm run dev:lan     # le serveur sur votre réseau ; ouvrez l'URL affichée sur le téléphone, en paysage
```

Un projet créé n'a pas de `dev:lan` : [tester sur un téléphone par le réseau local](create.lan-testing.md) dit comment
faire. Touchez la lampe avec Utiliser. La réplique s'affiche, l'accessoire change, et la sauvegarde s'en souvient au
rechargement.

> [!LIMIT id=tutorial-scope]
> Ce tutoriel laisse de côté les images (la lampe garde celle du seau), la carte, les personnages et les
> conversations, et la publication. Chacun a sa page ci-dessous.

<a name="what-you-learned"></a>

## Ce que vous avez appris

C'est la boucle : écrire une règle, la placer, vérifier, jouer ([la boucle de travail](create.working-loop.md)).

- Une salle est une donnée : accessoires, zones, textes Regarder, règles ([salles](create.rooms.md)).
- La géométrie vit dans `layout/`, placée à la souris ([géométrie](create.geometry.md)).
- Le validateur et le solveur vérifient le jeu après chaque changement ([vérifier son jeu](create.checking.md)).

<a name="next"></a>

## Et ensuite

- [Salles](create.rooms.md), champ par champ ; [réactions](create.reactions.md) ; [commandes](create.commands.md) ;
  [conditions](create.conditions.md).
- [Mécaniques classiques](create.classics.md) : des énigmes célèbres écrites avec ces champs.
- [Le Studio local](studio.overview.md), et [concevoir les énigmes](create.puzzle-design.md) pour un jeu entier, de la
  première idée à la release.
