# Le moteur en paquet

Depuis la 3.9, un jeu n'a plus à vivre dans ce dépôt. Le moteur est empaqueté en `quest-n-click` (le moteur, ses pages,
ses outils et la commande `quest-n-click`, le modèle de jeu), `create-quest-n-click` (`npx create-quest-n-click`) et, depuis la
4.1.1, `quest-n-click-bridge` (le Reality Bridge de référence, `docs/fr/REALITY-OPS.md`).

Jusqu'à la 4.2.4, ils s'appelaient `web-scumm`, `create-web-scumm` et `web-scumm-bridge` (le projet s'appelait
web-scumm, D47). À partir de la 4.2.5, chaque release les livre aussi sous leurs anciens noms, les mêmes fichiers à la
même version, et les anciennes commandes et les anciens imports (`web-scumm dev`, `web-scumm/content`) marchent
toujours, après une ligne d'avertissement, pendant toute la 4.2.x ; ils disparaissent en 4.3. UPGRADING §38 dit
comment passer aux nouveaux noms.

## Un nouveau jeu

Tant que les paquets ne sont pas sur npm, prendre l'archive jointe à une release (`T=https://github.com/wanoo/quest-n-click/releases/download/v<version>/quest-n-click-<version>.tgz`) :
`npx --package=$T quest-n-click create mon-jeu "Mon jeu" --engine=$T`. Une fois publiés :

```bash
npx create-quest-n-click mon-jeu "Mon jeu"     # ou : npx quest-n-click create mon-jeu "Mon jeu"
cd mon-jeu
npm install
npm run assets      # art/ et audio/ vers public/assets (Python 3 avec Pillow : pip install -r node_modules/quest-n-click/requirements.txt)
npm run dev         # ouvrir l'URL sur un téléphone, en paysage ; ?edit=start place les choses
```

Le projet :

| Chemin | Quoi |
|---|---|
| `game/` | le jeu : `game.ts`, `rooms/`, `cast.ts`, `items.ts`, `rules.ts`, `layout/`, `locales/`, `art/`, `audio/`, `provenance.json` |
| `public/` | les icônes de la page, la police complète ; `public/assets` est écrit par `npm run assets` (pas commité) |
| `dist/` | le build, avec `licenses/` (`npm run build`) |
| `tsconfig.json` | `@engine/*` pointe dans `node_modules/quest-n-click/src/engine` |

L'art du modèle est provisoire, dessiné à partir de formes (`tools/placeholder-art.py`) : `provenance.json` le dit, et
une release le refuse tant que chaque fichier n'est pas remplacé et revu.

## Commandes

`npx quest-n-click help` les liste. Le `package.json` du projet nomme les habituelles :

| Commande | Quoi |
|---|---|
| `quest-n-click dev` / `studio` | le jeu, le Studio |
| `quest-n-click assets` | l'art et l'audio vers `public/assets` |
| `quest-n-click verify` | validation, solveur, traductions, lint, playtests |
| `quest-n-click doctor` | les prérequis : Node et Chromium requis ; Python, ffmpeg et WebKit optionnels, signalés s'ils manquent (4.1.6) |
| `quest-n-click mcp` | le serveur MCP de ce jeu, sur stdio, pour un assistant (4.1.6) |
| `quest-n-click build` | assets, verify, le build, chaque fichier de `dist/` justifié (`docs/fr/TOOLS.md`, « Ce que l'archive contient ») |
| `quest-n-click release [--commercial]` | build, puis les portes de release : verrou de provenance, budgets, traductions, voix, playtests stricts, la preuve |
| `quest-n-click validate`, `solve`, `lint`, `i18n`, `weight`, `provenance`, `playtests`, `voices`, `prompts` | chaque outil, avec ses options (`docs/fr/TOOLS.md`) |
| `quest-n-click speedrun verify <run.wsrun>` | un speedrun rejoué contre le jeu : son verdict, son code et sa raison (`docs/fr/SPEEDRUN.md`) |
| `quest-n-click migrate` | amène les sources du jeu au format du moteur installé (`docs/fr/UPGRADING.md`) |

Elles tournent avec le projet comme dossier de travail (`WEB_SCUMM_PROJECT`) : le moteur dans `node_modules/quest-n-click`
est lu, jamais écrit.

## Mettre à jour

`npm install quest-n-click@<version>`, puis `npx quest-n-click migrate`, puis `npm run verify`. `docs/fr/UPGRADING.md` dit ce
que chaque version change ; `docs/fr/SUPPORT.md` quelles versions sont suivies et combien de temps dure une
dépréciation.

## Comment c'est vérifié

`npm run fresh-install` (un job de CI) : empaquette le moteur (`npm run pack`), crée un jeu depuis le modèle empaqueté
dans un dossier vide hors du dépôt, installe l'archive, lance `assets`, `verify` et `build`, et joue le jeu jusqu'à sa
fin dans Chromium. Un fichier du nouveau projet qui nomme le dépôt le fait échouer. Chaque release joint les trois
archives ; les publier sur npm revient au mainteneur (un jeton, les noms des paquets).
