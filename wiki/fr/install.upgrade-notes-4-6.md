# Notes de mise à jour : 4.6

Ce que la 4.6.0 « Routes » a changé. Rien à modifier dans un jeu : il se construit, se joue et se sauvegarde comme en
4.5.6, sauf si sa première visite dépassait son budget `initialJsKB` de moins d'un demi-kilo-octet (voir plus bas). Un
jeu sans route n'a pas d'horloge du monde : son empreinte logique, ses sauvegardes de référence et ses sessions restent
les mêmes.

La mise à jour elle-même est décrite dans [Mettre à jour](install.upgrade.md).

<a name="from-4-5-6-to-4-6-0"></a>
<!-- applies: 4.6.0.. -->

## De la 4.5.6 à la 4.6.0 « Routes »

Installez `@quest-n-click/engine@4.6.0` ([Installer depuis npm](install.from-npm.md)). Ce qu'un jeu peut utiliser, à
chaque fois en option :

- **Les routes** ([Routes](create.routes.md), ADR 0031) : un script du jeu avec `route: { who, from, steps }` mène un
  personnage de point en point et par les sorties, à l'horloge du monde, affiché ou non. Le clic du joueur le retient,
  une sortie fermée le retient, et `while` faux l'immobilise là où il est.
- **`suspendScript` et `resumeScript`**, pour tout script : un script suspendu garde son étape, et une route suspendue
  garde aussi sa position et l'attente restante.
- **Les points de route dans les layouts** (`points`), placés dans l'éditeur sous « Entry and route points ».
- **`validate`, le lint et le solveur connaissent les routes** : quatre codes de lint (`route-script-conflict`,
  `route-never-starts`, `route-blocked-forever`, `route-resume-misplaced`), et un choix « Route <id> » dans les chemins
  du solveur.
- **Une disposition portrait pour un téléphone tenu droit** (`skin.portrait: true`,
  [Habillage et polices](create.skin-fonts.md#skin-other)) : la scène en haut, les verbes, le sac et les outils en
  dessous, au lieu du message « tournez le téléphone ». Désactivée par défaut : un jeu qui ne la pose pas affiche le
  message comme avant, et les dispositions paysage et ordinateur ne changent pas.
- **Un écran de choix du héros** (`{ choice, screen: { decor, title? } }`,
  [Héros](create.heroes.md#hero-choice-screen)) : le choix couvre la scène sur son propre décor, chaque option qui a une
  `img` s'y tient debout à côté des autres, et un toucher choisit. C'est de la présentation seulement : le solveur, les
  sauvegardes et l'empreinte logique voient le même choix que sans `screen`, et un choix sans `screen` ne change pas.
- **La recherche de chemin est passée dans le cœur** (`core/nav/walk.ts` de `@quest-n-click/engine`) ; le lecteur la
  réexporte, donc un import depuis `dom/walk` fonctionne toujours.

**Pour un jeu qui utilise des routes**, une sauvegarde gagne `world` et `scripts.<id>.route`, et une session gagne `wt`
et les entrées `{ world }` et `{ routeDo }`. Une sauvegarde 4.5 se charge (ses routes commencent à partir d'elle), mais
un moteur 4.5 ne comprend pas une session 4.6 avec des routes.

**Pour le TypeScript d'un projet**, `ScriptDef` est désormais une union, `CmdScriptDef | RouteScriptDef`. Du code qui
lisait `script.do` sur n'importe quel script vérifie d'abord qu'il s'agit d'un script de commandes (`if (s.do)`) ; les
`scripts` d'une salle restent des `CmdScriptDef[]`.

**Pour un jeu qui s'ouvre sur une intro de Nouvelle partie** (`start.intro`), la sauvegarde automatique est écrite une
fois l'intro finie, ou dès qu'elle rend la main au joueur avec une étape du tutoriel (`guide`), et non plus avant elle
([Sauvegardes](play.saves.md#autosave)) : un rechargement pendant l'intro ne laisse rien à continuer, et Nouvelle
partie la rejoue. Rien à modifier ; le format de sauvegarde est le même.

**Pour le budget de première visite d'un jeu**, `assetBudgets.initialJsKB` est désormais comparé en octets
(`initialJsKB` × 1024), et non plus arrondi au kilo-octet ([Images](create.images.md#images)). Un jeu dont la première
visite dépassait son budget d'un demi-kilo-octet au plus passait en 4.5.6 et échoue en 4.6.0 à `npm run verify:dist`
(donc à `npm run build`), son message donnant les octets en trop : relevez le budget ou allégez la première visite. Les
jeux d'exemple gardent une marge d'environ 2 Ko, que chaque release remet à niveau : la démo reste à 140, le chapitre de
référence passe de 143 à 145.

**Corrigé** : tourner le téléphone ou redimensionner la fenêtre pendant l'écran titre remet le titre en page, et une clé
du `spans.json` d'un jeu qui contient un caractère hors du plan multilingue de base (un emoji) correspond désormais à son
fichier dans le Studio.

**Pour les mainteneurs**, la release écrit les chiffres que chaque pull request réécrivait : l'étape `quality baseline`
de `prepare` construit le jeu, puis lance `npm run quality:baseline -- --release --dist`, qui écrit le nombre de tests,
la première visite (désormais avec `initialJsBytes`), ainsi que les chiffres et la ligne d'installation des README. Le
job `heavy` du candidat découpe chacune de ses trois tentatives en trois fragments : neuf jobs d'environ 15 minutes, là
où trois prenaient jusqu'à 44 minutes.

**Pour les contributeurs**, les 131 exemptions de mutation dues à la 4.6.0 ont été relues (`docs/dev/MUTANTS.md`), et la
CI a un job `routes` (Chromium et WebKit). Le `npm run quality:baseline` d'une pull request n'écrit plus que le
comportement (les témoins et les preuves des jeux, les sauvegardes de référence, l'empreinte de l'API, les états
de la preuve de référence dans le README) : deux pull requests n'entrent plus en conflit sur le nombre de tests ni sur
la première visite. `--check` signale par un avertissement les tests en plus et les octets de la première visite
depuis la release, et échoue toujours sur un changement de comportement ou sur moins de déclarations de test
([La référence de qualité](contribute.quality-baseline.md)). Les planchers de couverture sont dans
`tests/coverage-floors.json` ([Le cliquet de couverture](contribute.coverage-ratchet.md)) : en relever un ne relance
aucun ensemble de mutation.
