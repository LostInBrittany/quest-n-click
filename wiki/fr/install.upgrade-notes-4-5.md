# Notes de mise à jour : 4.5

Ce que la 4.5.0 « Wiki », la 4.5.1, la 4.5.2, la 4.5.3, la 4.5.4 et la 4.5.5 ont changé. Rien à changer jusqu'à la 4.5.1 (la doc a
déménagé) ; en 4.5.2, `npx quest-n-click migrate` passe les imports aux paquets à scope ; la 4.5.3 change la façon de
faire une release, pas un jeu.

La mise à jour elle-même est [Mettre à jour](install.upgrade.md).

<a name="from-4-4-0-to-4-5-0"></a>
<!-- applies: 4.5.0.. -->

## De la 4.4.0 à la 4.5.0 « Wiki »

Rien à changer : un jeu se construit, se joue et se sauvegarde comme en 4.4.0 (mêmes empreintes, sauvegardes et runs de
référence). Le moteur s'installe depuis `releases/download/v4.5.0/…`. Ce qui est nouveau :

- **La documentation, c'est le wiki.** Elle vit dans le wiki GitHub, en français et en anglais, et dans la
  documentation de chaque release (`/docs/<version>/` sur le site du projet). Les anciennes pages sous `docs/` sont
  désormais des pages de transition : chaque ancien titre reste et renvoie à sa nouvelle place, si bien qu'un ancien
  lien arrive encore, et le texte complet de la 4.4.0 reste lisible au tag `v4.4.0`.
- **`read_doc {name}` marche toujours** : les huit noms (`CONTENT_GUIDE`, `ENGINE`, `TOOLS`, `STUDIO`, `WORKFLOW`,
  `AUDIO`, `UPGRADING`, `CLASSICS`) répondent un seul bloc de texte, avec les arguments de la 4.4.0 ; la page est
  reconstruite à partir des sections du wiki, et une section trop longue pour sa borne est réduite à son titre, son
  premier paragraphe et le `read_doc { id, section }` qui donne la suite.
- **Deux nouveaux outils MCP** : `search_docs` (par mots ou par une question, en français ou en anglais) et
  `list_docs` ; et `read_doc {id, section, lang}` lit une section d'une page par son id. Un agent cherche d'abord, puis
  lit par id.
- **Le package porte sa documentation**, `docs-bundle/` : `npx quest-n-click mcp` dans un projet créé la lit, là où la
  4.4.0 ne trouvait rien à lire.
- **Correctifs** : `npx quest-n-click doctor` fonctionne dans un projet créé (Playwright y est optionnel) ;
  `npm run page:world` et `page:puzzles` écrivent un fichier `.html` par défaut ; un Studio partagé accepte un bail sur
  la portée de la carte du scénario (`groupings`).

<a name="from-4-5-0-to-4-5-1"></a>
<!-- applies: 4.5.1.. -->

## De la 4.5.0 à la 4.5.1

Rien à changer : un jeu se construit, se joue et se sauvegarde comme en 4.5.0 (mêmes empreintes, sauvegardes et runs de
référence). Le moteur s'installe depuis `releases/download/v4.5.1/…`. Ce qu'un jeu peut utiliser, chaque fois en option :

- **`games/<id>/spans.json`** : les pans des fichiers propres au jeu (les modules qu'importe son `index.ts`, ses
  notes, ses scripts), qu'un Studio partagé refusait d'écrire jusqu'ici. Les règles du moteur passent d'abord ; un
  fichier que ni l'un ni l'autre ne nomme reste refusé ([pan](team.concepts.md#span)).
- **`games/<id>/audit-allow.json`** : un mot que l'audit des fuites bloque et qui est aussi, par hasard, un mot du jeu
  (le prénom d'une vraie personne), autorisé par son préfixe SHA-1 et une raison, dans le dossier du jeu et ses assets
  construits seulement ([audit-allow.json](create.build-release.md#audit-allow)).
- **`url` dans `site.json`** : l'adresse publique du jeu. Avec elle, l'`og:image` de la page est absolue et un `og:url`
  s'ajoute, si bien que LinkedIn et Facebook montrent l'image de partage ; sans elle, la page est comme en 4.5.0
  ([site.json](create.project-layout.md#site-json)).
- **La documentation** : les corrections de l'audit du wiki par le mainteneur (liens dont le libellé est du code, le
  premier tutoriel, les sauvegardes, la fenêtre de support, la recherche). Un lien vers une page ou une section de la
  4.5.0 arrive toujours.

<a name="from-4-5-1-to-4-5-2"></a>
<!-- applies: 4.5.2.. -->

## De la 4.5.1 à la 4.5.2

Les paquets du moteur sont nommés sous le scope de l'organisation npm (D53) : `quest-n-click` est
`@quest-n-click/engine`, et `create-quest-n-click`, `quest-n-click-bridge`, `quest-n-click-connectors` et
`quest-n-click-studio-server` sont `@quest-n-click/create`, `@quest-n-click/bridge`, `@quest-n-click/connectors` et
`@quest-n-click/studio-server`. Les commandes gardent leur nom (`quest-n-click dev`, `npx quest-n-click migrate`,
`npx quest-n-click-bridge serve`), et les fichiers de la release aussi (`quest-n-click-4.5.2.tgz`, …). Un jeu se
construit, se joue et se sauvegarde comme en 4.5.1. Ce qu'un projet créé change :

1. Installez le nouveau moteur à la place de l'ancien paquet (le paquet de l'archive est maintenant
   `@quest-n-click/engine`) :

   ```bash
   # dans le projet créé
   npm uninstall quest-n-click
   npm install https://github.com/Quest-n-Click/quest-n-click/releases/download/v4.5.2/quest-n-click-4.5.2.tgz
   ```

2. Laissez `migrate` déplacer le reste, puis vérifiez :

   ```bash
   # dans le projet créé
   npx quest-n-click migrate
   npx quest-n-click migrate --check
   npm install
   npm run verify
   ```

   `migrate` renomme les imports `quest-n-click/content`, `/player`, `/minigames`, `/testing`, `/reality` (et
   `quest-n-click-bridge/cli`) en `@quest-n-click/engine/…` (`@quest-n-click/bridge/cli`) dans chaque fichier source ;
   dans `tsconfig.json`, le chemin `quest-n-click/*` et les cibles `node_modules/quest-n-click/…` vers
   `@quest-n-click/engine` ; dans `package.json`, il retire la dépendance à un paquet sans scope une fois son nom à
   scope installé, et dit celles qui restent (`package.json depends on quest-n-click-bridge: npm uninstall
   quest-n-click-bridge && npm install @quest-n-click/bridge`). Il ne renomme aucune commande : les scripts restent
   tels quels.

- **Pas encore migré ?** Pendant toute la 4.5.x, les imports sans scope `quest-n-click/…` se résolvent encore, dans un
  build (Vite) et dans le `tsconfig.json` du moteur lui-même, si bien qu'un jeu qui n'a pas lancé `migrate` se
  construit encore ; son propre `tsconfig.json` pointe encore dans `node_modules/quest-n-click`, que la nouvelle
  installation a retiré, jusqu'à ce que `migrate` le renomme.
- **Un Studio hébergé** renomme lui-même les imports sans scope d'un jeu, à la mise à jour du moteur, comme il l'a
  fait pour les `web-scumm/…` ([Mettre à jour le moteur hébergé](team.upgrade-engine.md)).
- **Le Bridge, les connecteurs et le Studio Server** s'installent depuis leurs archives comme avant ; dans
  `node_modules`, ils sont maintenant sous `@quest-n-click/` (`node_modules/@quest-n-click/bridge`, …).
- **Le hook de build d'un worker du Studio** installe `requirements.txt`, qui porte maintenant toutes les empreintes
  (D54) : `python3 -m pip install --target .python --require-hashes --only-binary=:all: -r
  node_modules/@quest-n-click/engine/requirements.txt`. `ops/studio/worker-requirements.lock` n'existe plus : un hook
  qui le nomme échoue tant qu'il n'est pas changé ([Premier déploiement](clever.first-deployment.md)).
- **Un nouveau projet** se crée comme avant depuis l'archive (`npx --package=<URL de l'archive> quest-n-click create …`).
  Une fois les paquets sur npm, `npm init @quest-n-click mon-jeu` le crée en une commande, et
  `npx create-quest-n-click mon-jeu` marche toujours : ce nom sans scope relaie vers `@quest-n-click/create`.
- **L'adresse du dépôt** est `github.com/Quest-n-Click/quest-n-click` (D51). Les anciennes adresses y redirigent,
  téléchargements des releases compris, si bien qu'une URL d'archive déjà dans un `package.json` installe encore ;
  écrivez la nouvelle la prochaine fois que vous la changez. Un fichier de la 4.5.2 se vérifie avec `gh attestation verify <file> -R Quest-n-Click/quest-n-click` ;
  une release faite avant le déménagement garde ses attestations sous l'utilisateur `wanoo`
  ([Publier une release](contribute.releasing.md#expected-result)). La démo et la documentation la plus récente sont
  sur le site du projet, `quest-n-click.cleverapps.io`, et non plus sur GitHub Pages ([Jouer en ligne](start.play-online.md)).
- **npm** : la 4.5.2 est la première release dont release.yml met les paquets en attente sur npm ; ils sont publiés
  une fois qu'un propriétaire de l'organisation les approuve avec la 2FA, pas avant. Tant que
  `npm view @quest-n-click/engine version` ne répond pas 4.5.2, installez depuis l'archive
  ([Installer depuis npm, une fois publié](install.from-npm.md)). Les noms sans scope deviennent des pointeurs
  dépréciés vers les noms à scope.

<a name="from-4-5-2-to-4-5-3"></a>
<!-- applies: 4.5.3.. -->

## De la 4.5.2 à la 4.5.3 « One pass »

Rien à changer dans un jeu : il se construit, se joue et se sauvegarde comme en 4.5.2 (aucun champ de contenu, aucune
sauvegarde, aucun schéma ni aucune empreinte de jeu ne bouge). Le moteur s'installe depuis npm,
`npm install @quest-n-click/engine@4.5.3` dans un projet créé une fois qu'un propriétaire l'a approuvé, ou depuis
`releases/download/v4.5.3/…` ([Installer depuis npm](install.from-npm.md)). Ce qui change, c'est la façon de faire une
release, pour les mainteneurs ([Publier une release](contribute.releasing.md#the-chain)) :

- **Le candidat est la seule passe de tests de la release** (D55). L'ordre reste le même : un candidat lancé à la main
  sur le commit de main, puis un tag signé qui le nomme. Le push du tag lance `release.yml`, et non plus le run `ci`
  du tag lui-même (un tag ne lance plus de `ci`). Il vérifie que le commit du tag est sur la ligne des premiers parents
  de main et que le `ci` de main y a réussi, que le tag stable précédent est un ancêtre et que le candidat est un run
  vert lancé à la main sur main, puis publie les fichiers de ce candidat sans rien retester : des minutes, plus des
  heures.
- **`ship tag` attend toujours le `ci` de main** : `--now` est refusé, et `ship watch` n'attend plus que le run de
  release.
- **Un candidat fait avant la 4.5.3 ne peut pas être publié** : les preuves des catalogues Remix sont maintenant faites
  par le candidat (son job `remix-proof`) et un candidat qui ne les a pas est refusé. Lancez-en un nouveau sur le
  commit à taguer.
- **L'environnement `docs-publish` demande une règle de tag `v*`**, une fois : Settings → Environments → docs-publish →
  Deployment branches and tags, à côté de `main` et `docs/*`. Le job de documentation tourne maintenant sur la ref du
  tag ; sans la règle, il est refusé, la release elle-même étant publiée (`mode=promote` depuis main rattrape la
  documentation) ([Publier une release](contribute.releasing.md#maintainer-settings)).
- **La provenance npm nomme le tag et son commit**, et non plus la tête de main comme pour la 4.5.2.
- **L'un ou l'autre co-mainteneur signe un tag** : `.github/allowed_signers` nomme la clé de LostInBrittany à côté de
  celle de wanoo, et `ship preflight-stable` compte un nom publié par `lostinbrittany` ou `wanoo` comme celui du
  projet.
- **Une paire de traduction vérifiée par son auteur IA n'arrête plus une publication** (D56) :
  `npm run wiki -- check --publish` range ces paires parmi ses lacunes, une paire « à relire » le fait toujours
  échouer, et une affirmation publiée demande toujours la relecture d'une personne. L'en-tête d'une page dit toujours
  qui l'a lue ([Écrire la documentation](contribute.writing-docs.md#reviews)).
- **Le candidat d'une pull request** ne démarre que quand on ajoute le label `full-ci` ; retirez le label et
  remettez-le pour le relancer.

<a name="from-4-5-3-to-4-5-4"></a>
<!-- applies: 4.5.4.. -->

## De la 4.5.3 à la 4.5.4 « Simple release »

Rien à changer dans un jeu : il se construit, se joue et se sauvegarde comme en 4.5.3 (aucun champ de contenu,
aucune sauvegarde, aucun schéma ni aucune empreinte de jeu ne bouge). Installez `@quest-n-click/engine@4.5.4`
([Installer depuis npm](install.from-npm.md)).

- **Dans un projet créé depuis npm**, les outils trouvent son `game/` : les prompts d'images
  (`npx quest-n-click prompts`, l'outil MCP `asset_prompts`) nomment les chemins du projet, `cut-sheet.py` découpe
  dans `game/art` par défaut, et les kits de bouches se lancent avec `npx quest-n-click talk-kit`, `talk-apply`,
  `talk-normalize`. Le `.gitignore` d'un nouveau projet liste `game/private`.
- **`cables`** prend `tipDeg`, `socketX`, `socketY` et `plugInset` pour s'ajuster à la fiche et au tableau d'un jeu.
- **La variante d'un personnage** (un costume, un accessoire) s'affiche dès que son drapeau change, au milieu d'une
  conversation aussi.
- **La palette audio** gagne `church_organ`, un grand orgue qui porte une mélodie.
- **Pour les mainteneurs**, une release se fait en trois actions (D57,
  [Publier une release](contribute.releasing.md#release-command)) : `npm run release -- prepare <version>
  --name="<nom>"` fait la pull request de release (sa CI lance `npm run release -- check`, relectures humaines des
  docs comprises) ; son merge lance le candidat ; `npm run release -- <version>` signe le tag, suit la release et
  approuve npm. La documentation se publie sans clic sous l'environnement `docs-publish` ; les lancements à la main
  attendent un relecteur sous `docs-publish-manual`.
- **Pour les contributeurs**, une pull request qui ne touche pas au code du produit attend moins, et un nouveau test
  n'oblige plus à réécrire les chiffres des README ni la référence.

<a name="from-4-5-4-to-4-5-5"></a>
<!-- applies: 4.5.5.. -->

## De la 4.5.4 à la 4.5.5 « Reworked CI »

TODO(release) : ce qui change dans un jeu (« Rien à changer dans un jeu : il se construit, se joue et se sauvegarde comme en 4.5.4 » quand rien ne change), puis pour un hébergeur ou un mainteneur. Les entrées du CHANGELOG de la release, à réécrire pour qui met à jour :

- **`npm run release -- <version>` finds the candidate of a merged release pull request (4.5.5)**: it looked for the
  release commit down every line of `package.json`'s history, the merged `release/<version>` branch included, so it
  named the `prepare` commit instead of the merge the candidate ran on and stopped with "no candidate of … on main".
  It now follows main's first parents only.
- **`prepare` starts the upgrade notes from whole CHANGELOG bullets (4.5.5, #333)**: the release's section of the
  upgrade notes listed each CHANGELOG bullet cut to its first line, often mid-sentence, so 4.5.4's had to be rewritten
  from the CHANGELOG by hand. Each bullet now comes whole, with its continuation lines, a nested list and an indented
  paragraph as written; the headings and the blank lines between bullets are left out, one list for the page.
- **`npm run changes -- --check` refuses a fragment the release would stop on (4.5.5, #335)**: it only asked whether a
  branch that changes the code carries a fragment, so `### Fixes` (#328) passed its pull request and would have stopped
  4.5.5's `npm run release -- prepare` at the changelog step. It now reads every fragment in `changes/` as `--assemble`
  does, with the same three headings, and names each problem with its file and line: a heading other than
  `### Breaking`, `### Fixed` or `### Changes`, text before the first heading, a `.log.md` that does not open on
  `## <title>`. CI's `check` job already runs it on every pull request.
- **A merge on `main` no longer cancels the previous commit's `ci` run (4.5.5, #337)**: `ci` ran in one group per
  ref and cancelled the run in progress, so on `main` a merge right after the release pull request's cancelled the
  release commit's run, the one its tag needs, and `ship tag` re-ran it (10 to 15 minutes on 4.5.4). A push to `main`
  now runs in a group of its own SHA and is never cancelled; on a pull request a newer push still cancels the run it
  supersedes. `qualify` follows the same rule.
- **`npm run release -- <version>` checks the docs' human gates on the release commit before the tag (4.5.5, #339)**:
  the release pull request's CI checked them on its own branch, so a claim merged to `main` before the release pull
  request (4.5.4's `import-layout-merges`, #318) was only found by `docs-publish`, an hour after the tag. The preflight
  now runs the same check on the release commit's own tree (a temporary worktree of it) and stops before anything is
  waited for, with each pending item and its command. That commit can no longer take a review, so the stop gives the
  way on: `--docs-revision` releases as usual, npm included, and prints the steps of the docs revision to publish after.
- **An install attempt that stalls in CI no longer spends the whole step (4.5.5, #340)**: the workflows' retry loops
  (`npm ci`, `pip install`, `playwright install --with-deps`, `docker pull`, the candidate's image and Studio install
  smokes, the release's pinned npm) give each of their three attempts its own `timeout <n>m` on Linux, and each step's
  `timeout-minutes` leaves room for the three and the two pauses. On #338 apt served a few kB/s under `playwright
  install --with-deps` and the first attempt ran out the step's 10 minutes, so the retries never ran; that step now has
  20 minutes, 6 an attempt, and the 8-minute install steps have 10. The macOS and Windows jobs keep the step's limit
  only (no `timeout` there), said in a comment. A test pins the rule over every workflow.
- **Only a release commit keeps its own `ci` run on `main`; a burst of merges no longer starves the pull requests
  (4.5.5, #345)**: since #337 every push of `main` ran in a group of its own SHA, never cancelled, and four merges in
  a row queued four full runs that took the runners from the pull requests. Now a push of `main` whose head commit is a
  release commit (the merge of `release/<x.y.z>`, or the subject `prepare` writes, which a squash lists and a rebase
  keeps) still runs in a group of its own SHA and is never cancelled; every other push of `main` shares one group and
  cancels the run it supersedes, as before #337. A `ci` run started by hand has a group of its own and cancels
  nothing. `qualify` cancels on `main` again: no release step reads its `main` run.
- **`npm run i18n -- extract` writes a custom minigame's texts (4.5.5, #250)**: the `textParams` a game's own minigame
  declares were left out of the locale files (only the built-in minigames' were written), so an author added their
  paths by hand and a later extract parked them as `_stale`. The extract, `i18n -- status` and the content report now
  read the game module's `minigames`, as the player and the validator already did.
- **A voiced line whose clip cannot play stays on screen for its reading time (4.5.5, #249)**: before the player's
  first gesture, with the sounds off, the voice volume at 0, or a clip that fails to load or play, the speech bubble
  used to close at once; it now shows for the reading time an unvoiced line gets (what remains of it when the clip
  fails late). A clip that plays still sets the line's length, and a tap still skips it. `create.voices` (en, fr) no
  longer states it as a limit.
- **The four unit shards take about the same time (4.5.5, #349)**: vitest's `--shard` gave each shard as many files,
  in the order of a hash of their paths, and 4.5.4's shard 4 ran its tests in about 85 s when the others took 150 to
  270 s. The sequencer of `vite.config.ts` (`tools/unit-shards.ts`) now splits by each file's duration, recorded in
  `tools/unit-durations.json`: a shard's time counts as the larger of its longest file and its total over two, each
  file goes to the shard it leaves the shortest, the longest file of a shard starts first, and a file the table does
  not know counts as the median. `npx tsx tools/unit-shards.ts --record <vitest json report>` refreshes the table.
- **A change to `tools/studio/diff-rooms.ts` runs `studio-hosted` (#349)**: the CI plan's hosted-Studio rule named it,
  but the generic `tools/` rule came first and took it; it has its own rule now, before that one.
- **`npm run release -- <version>` starts again (4.5.5, #348)**: since #339 the release command imported the docs'
  gates from `tools/release/prepare.ts`, whose dispatch awaits the release command at its top level; the cycle never
  settled, and the command exited at once with "Detected unsettled top-level await". The gates have their own module
  (`tools/release/gates.ts`).
- **The release command's candidate wait (4.5.5, #348)**: it re-ran a failed candidate once per process, so a relaunch
  re-ran it a second time; the run's attempt number now says it was re-run (by the command or by hand), and the same
  holds for `ship`'s re-run of main's `ci`. A candidate cancelled before any job failed is re-run whole, and said so,
  never with an empty list. An attempt still going after 3 hours stops the command with the run's link and how to
  resume, instead of waiting forever.
- **`npm run release -- prepare` and `check` (4.5.5, #348)**: `check` fails without the passes sheet
  (`docs/dev/passes/<version>.md`) or the golden save (its entry in `tests/fixtures/saves/index.json`, its file).
  `prepare` refuses a release name its files cannot hold (one with `( ) [ ] " « » \` \ $ < > |`, which broke the
  README's release link), and a newest passes sheet without its `<!-- field:begin -->` marker (it was cut at the wrong
  place). The CHANGELOG's intro calls an `x.0.0` a major release, and says `LOG #N` when there is one LOG entry.
- **A slow apt mirror no longer makes CI's Playwright install fail on a lock (4.5.5, #353)**: since #340 each attempt
  of `npx playwright install --with-deps` ran under `timeout`, which killed Playwright but not the apt-get it started
  through sudo; that apt-get went on holding the dpkg lock, and the second and third attempts failed on it at once
  (#350). The four jobs that install browsers on the runner (`studio-hosted`, the candidate's `release-core` and
  `cross-runtime`, the nightly's `cross-runtime`) now install Playwright's system packages with
  `scripts/ci-playwright-deps.sh`, never under `timeout`: apt fails by itself when the mirror sends nothing for a minute,
  retries a file, and waits for a lock still held; the browsers' download keeps its limit an attempt. `studio-hosted`
  has 40 minutes instead of 30 for a slow mirror.
- **The recurring CI flakes of the last two weeks, by cause (4.5.5, #356)**: the unit tests that passed alone and
  timed out in a loaded run cost less where the cost was their fixture's (the scenario map imports the game once per
  state of its files instead of a child per call; the wiki push copies one seeded repository and reads its tip without
  a clone, a test 0.04 to 1.4 s where it took 0.8 to 4.5), and set their own limit, with a comment that says why,
  where the processes are the test's subject (real bash steps, git pushes, Python cuts, real-time walks, the whole
  wiki's bundle). `e2e:studio-hosted` clicks "Reload view" once more when Firefox's room editor stays silent 15 s, as
  its step 6b does since #264; `e2e:pwa` asks WebKit's "due to access control checks" loads again offline the same
  way and counts only those refused again; the walkthrough waits for the title screen before reading it. Nothing is
  skipped; the CI page's "Known flakes" table says each.
- **A wiki claim's test is found under a comment that ends a sentence (4.5.5, #356)**: the claims' scanner of test
  names read the character before `describe(` in the raw source, so a comment ending with a period right above a
  describe made it a method call and dropped its title (`studio.map`'s `groupings-only` went "not referenced" when its
  block got a comment). It reads the last significant character now, never a comment's.
- **`npm run validate` refuses a `seen` key that nothing records (4.5.5, #248)**: a topic with an id is recorded as
  `topic.<id>`, so `{ seen: 'house.grandma.0' }` (the positional form of the 3.x pages) was silently false in a
  schema 3 game. The validator now checks every `seen` key a condition reads or a checkpoint marks against the
  topics, `once` listeners, `once` choice options and Reality signals of the game; when the key is the old place of
  something that has an id, the error names the key to write (`topic.<id>`, `event.<id>`, `choice.<id>`).
  `create.conditions` (en, fr) no longer states it as a limit, and its key table lists `reality.<signal>`.
- **A `TODO(release)` quoted as code is not a marker left (4.5.5, #364)**: `prepare`'s stop before the push and
  `npm run release -- check` counted every line holding the text, so a CHANGELOG bullet about the markers, copied
  whole into the upgrade notes, was a marker no one could ever write, and 4.5.5's release could not pass (found by a
  rehearsal). An occurrence in backticks or a fenced block is now a quotation; every marker `prepare` writes is bare
  prose and still counts. `npm run changes -- --check` refuses a fragment with a bare `TODO(release)`, which would
  land in the CHANGELOG or the LOG the same way, and the LOG title that had one now quotes it.
- **A read-only storyboard to publish beside the game (4.5.5, #318)**: `npm run page:storyboard -- --readonly` renders
  the same story without the notes box, the rewrites or any saving, with a `noindex, nofollow` meta. The game's service
  worker no longer answers `pages/` with the game, so such a page (or any page a game publishes beside itself under
  `pages/`) can live in the same `dist/`.
- **`quest-n-click page` in a created project (4.5.5, #318)**: the phone pages (`storyboard`, with `--md` and
  `--readonly`, `review`, `placement`, `world`, `puzzles`) were only `npm run page:*` scripts of the engine repository;
  a project now writes them with `npx quest-n-click page <name> [options]`. Found while moving clever-onboarding onto
  the npm package, whose deploy script becomes `npx quest-n-click page storyboard --readonly --out
  dist/pages/storyboard-$SLUG.html`.
- **A dog in the image prompts (4.5.5, #317)**: `npm run prompts` draws a character whose `kind` holds `'dog'` on the
  four-legged sheet, the cat's cells (the same `cat()` helper and pose keys) described with a dog's words ("barking",
  "panting happily, tongue out", "stretching in a play bow"), so a game's dog no longer gets a cat's meowing and purring.
- **The unit suite can be green on a developer's Mac (4.5.5, #320)**: the Telnet connector's stress test (a thousand
  connections at once, which macOS's default limits fail) runs only where `CI` is set, as on every GitHub Actions
  job, or with `TELNET_STRESS=1`; skipped otherwise.
- **`prepare` checks the docs' human gates before it pushes (4.5.5)**: `npm run release -- prepare` runs
  `wiki -- check --publish --reviews-only`, the check the release pull request's CI fails on, after its commit. A claim
  or a pair still to review stops it there, nothing pushed and no pull request, each printed with its command for a
  person to type (the tool never records a review); run the same command again once they are committed and it resumes
  at the gates on `release/<version>`, then pushes and opens the pull request, so its CI runs once. On `main`,
  `npm run release -- check <version>` lists them earlier.
- **`prepare` stops before the push on `TODO(release)` prose too (4.5.5)**: the stop before the push now covers the
  `TODO(release)` markers left in the release's files (the same ones `npm run release -- check` counts) as well as the
  docs' human gates, in one stop: each marker with its file, line and brief, each review with its command, nothing
  pushed. Write the prose yourself or ask your AI assistant to, with those markers as the brief, read the diff, record
  the reviews, commit on `release/<version>` and run the same `prepare` again: it pushes and opens the pull request
  only when nothing is left, so its CI runs once. The tool still writes no prose, records no review and calls no AI.
- **A release's candidate reuses the nightly's mutation measures (4.5.5, #329)**: the nightly's mutation shards, still
  measured from scratch, now save each passed gated shard's report in the cache on `main`, under the very key the
  candidate restores (the shard and its set's input hash). The candidate a release's merge starts then runs again only
  the sets whose inputs moved since the night, the others reused in a minute or two each: the same gate, about half an
  hour instead of over an hour when nothing shared by every set moved. `gh workflow run nightly --ref main -f
  jobs=mutation` runs the mutation jobs only, reusing what is cached: a warm-up after a release's last merge. The
  nightly's matrix runs 8 shards at a time, as the candidate's.
- **`prepare` starts the mutation cache's warm-up when it pushes (4.5.5, #331)**: once the release pull request is
  pushed, `npm run release -- prepare` runs `gh workflow run nightly --repo <the organisation's repository> --ref main
  -f jobs=mutation` (#330) and prints the run's link; the pull request's body says it too. The release commit moves
  only version fields, outside the mutation input hashes, so the cache filled while the pull request is in review is
  the one the candidate its merge starts reads: nobody has to remember the warm-up. A dispatch refused is a warning with
  that command to run by hand, never a failure; a stop before the push starts nothing; `--no-pr` starts nothing and
  prints the command.
- **A resumed `npm run release -- <version>` verifies the release once (4.5.5, #343)**: run again after a stop (4.5.4's
  at the npm 2FA step), it ran `ship verify` from scratch, about 5 minutes on 35 files. After a passing verify it now
  records the tag object, its commit, the release and each asset's digest in
  `.cache/release/v<version>.verified.json`, and a later run skips the verify only when all of it is still exactly
  there and the release is immutable, saying when it passed; otherwise, or with `--reverify`, it verifies again.
  `ship verify` and the release workflow's own verify are unchanged.
- **The CI page says what the workflows do since 4.5.3 (#349)**: a tag runs no `ci`; `release` starts on the tag's
  push and tests nothing again; the candidate starts on the release pull request's merge and is the release's only
  test pass; `release -- prepare` warms the nightly's mutation cache; the shards by duration. Two comments of
  `ci.yml` and `pr-gate`'s line for a skipped mutation job said otherwise.
- **An end-to-end test of the release command (4.5.5, #348)**: `tests/release-command.test.ts` runs
  `npm run release -- <version>` through its CLI dispatch on a scratch repository shaped like 4.5.4's history, against
  fake `gh`, `npm` and `ship`, its waits on a virtual clock (`QNC_RELEASE_CLOCK=virtual`): the merge found as the
  release commit, a candidate failed or cancelled then re-run, a relaunch after the tag, a failing docs-publish, an
  empty or partial `npm stage list`, main's `ci` cancelled then re-run.
- **A branch records its translation acks and claim reviews in its own pending file: two pull requests no longer
  conflict on `wiki/translations.json` (4.5.5, #360)**: on an open branch, `npm run wiki -- translations --ack` and
  `review-claim` write `changes/<slug>.acks.json` (the branch without its prefix, as for the fragments) instead of
  `wiki/translations.json` and `wiki/reviews.json`, which only `main`, `master` and a `release/*` branch write. Every
  reader (`wiki -- check`, `--publish`, the release's gates, `candidate`, `docs-publish`, the page headers) sees the
  two files plus the pending ones: the records of the current text win, their reviewers merged. The release's
  `prepare` folds them in a new step, `wiki acks` (`npm run wiki -- acks --fold`): what still holds goes into the two
  files, the pending files are deleted, and what no longer holds is listed with its reviewers and the command to record
  it again, and repeated in prepare's stop. A doc revision's reviews on `docs/<v>` land in `changes/<v>.acks.json`,
  which its publication accepts as documentation. A detached HEAD needs `--pending <slug>`. Records of a section or
  claim gone are no longer warnings: the fold removes them.
