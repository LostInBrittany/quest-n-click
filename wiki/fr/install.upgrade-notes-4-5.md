# Notes de mise à jour : 4.5

Ce que la 4.5.0 « Wiki », la 4.5.1, la 4.5.2, la 4.5.3, la 4.5.4, la 4.5.5 et la 4.5.6 ont changé. Rien à changer jusqu'à la 4.5.1 (la doc a
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

Rien à changer dans un jeu qui se valide : il se construit, se joue et se sauvegarde comme en 4.5.4 (aucun champ
de contenu, aucune sauvegarde, aucun schéma ni aucune empreinte de jeu ne bouge). Installez
`@quest-n-click/engine@4.5.5` ([Installer depuis npm](install.from-npm.md)).

- **`npm run validate` refuse une clé `seen` que rien n'enregistre.** Un `{ seen: 'room.npc.<n>' }` écrit pour un
  sujet qui a un identifiant était toujours faux dans un jeu au schéma 3 ; c'est maintenant une erreur qui donne la clé
  à écrire (`topic.<id>`, `event.<id>`, `choice.<id>`). Si votre jeu ne se valide plus après la mise à jour, cette
  condition n'a jamais marché : écrivez la clé que donne l'erreur.
- **Une réplique doublée dont le son ne peut pas jouer** (avant le premier toucher, son coupé, fichier absent) reste
  affichée le temps de sa lecture au lieu de se fermer aussitôt.
- **`npm run i18n -- extract`** écrit les textes des mini-jeux propres à un jeu (`textParams`) : plus besoin de les
  ajouter à la main, et ils ne reviennent plus en `_stale`.
- **Un chien dans les prompts d'images** : un personnage dont le `kind` contient `'dog'` a la planche à quatre pattes,
  décrite avec des mots de chien.
- **Dans un projet créé depuis npm**, `npx quest-n-click page <nom>` écrit les pages pour téléphone (`storyboard`,
  `review`, `placement`, `world`, `puzzles`), et `page storyboard --readonly` une histoire à publier à côté du jeu :
  le service worker du jeu ne répond plus à `pages/`.
- **Pour les mainteneurs**, une release reste trois actions, avec maintenant une seule CI chacune
  ([Publier une release](contribute.releasing.md#release-command)) :
  - `npm run release -- prepare` s'arrête avant le push tant que la prose n'est pas écrite et les affirmations pas
    relues, puis pousse une seule fois et préchauffe le cache de mutation, si bien que le candidat prend environ une
    demi-heure ;
  - `npm run release -- <version>` trouve le candidat de la fusion, vérifie les relectures des docs sur le commit de
    release avant le tag (ou publie avec `--docs-revision`), supporte une relance sans relancer ni revérifier, et a un
    test de bout en bout ;
  - sur `main`, seul le commit de release garde sa propre CI, chaque autre fusion annule la précédente.
- **Pour les contributeurs**, une branche enregistre ses traductions relues et ses relectures d'affirmations dans son
  propre `changes/<slug>.acks.json`, si bien que deux pull requests n'entrent plus en conflit sur
  `wiki/translations.json` ; `npm run changes -- --check` refuse un fragment sur lequel la release s'arrêterait ; les
  tests instables récurrents sont corrigés à la cause, les shards unitaires prennent à peu près le même temps, et un
  miroir apt lent ne fait plus échouer l'installation des navigateurs.

<a name="from-4-5-5-to-4-5-6"></a>
<!-- applies: 4.5.6.. -->

## De la 4.5.5 à la 4.5.6 « A stable CI »

TODO(release) : ce qui change dans un jeu (« Rien à changer dans un jeu : il se construit, se joue et se sauvegarde comme en 4.5.5 » quand rien ne change), puis pour un hébergeur ou un mainteneur. Les entrées du CHANGELOG de la release, à réécrire pour qui met à jour :

- **`npm run wiki -- check` reads a page with CRLF line ends as the same page with LF (4.5.6, #367)**: on a page saved
  with CRLF (a Windows editor, or a copy of the wiki without the repository's `.gitattributes`), a code fence never
  opened (a regex's `.` stops at `\r`), so every link written inside a code block was checked as a real link and
  reported as an error. The page parser now reads `\r\n` as `\n`. A change to the wiki's own tools or to a
  `tests/wiki-*.test.ts` now also runs the CI's `windows` job, where #363's tests had failed, first seen on the release
  pull request.
- **`npm run release -- <version> --commit=<sha>` releases on a later commit of main than the release merge (4.5.6,
  #369)**: when main's `ci` is red on the release pull request's merge for a reason fixed only after it, as on 4.5.5
  (its `windows` job, fixed by #368), the release could never be tagged, since `release.yml` wants main's `ci` green on
  the tagged commit. The given commit stands for the release commit everywhere (the docs' gates, the candidate,
  `ship tag`, the release run); it is refused, with what to do, when it is not on main's first-parent line, not at the
  version, not the release merge or after it, or when the tag is already out on another commit. Without the flag,
  nothing changes.
- **The mutation cache's input hash follows only what a test runs (4.5.6, #371)**: a CRLF fix in the wiki checker
  (#368) moved `core`'s hash and re-ran every mutation set of the release candidate (about three hours of CI), through
  `vite.config.ts` → the Studio's dev-server plugin → `import type { DocsSet } from '../wiki/docs'`. The import closure
  now reads each module with the TypeScript parser and skips what the compiler erases (`import type`,
  `export type … from`, an import or re-export whose every name is a type, `typeof import('…')`); an import with one
  value in it is still followed. `vite.config.ts` and `vitest.mutation.config.ts` are hashed as files, and their
  imports followed only into what can change a test's run (`CONFIG_FOLLOWS`: the game's settings, the values of
  `define`, the test order, the sets), not into the Studio plugin (`CONFIG_SKIPS`, with its reason);
  `tests/mutate-hash.test.ts` fails on a new import in a configuration until it is placed. `core`'s inputs go from 260 files to 182, the largest set's
  (`reality`) from 363 to 217. Every set's key changes once with this release: the first candidate or nightly after it
  runs each set cold.
- **A slow apt mirror no longer spends CI's whole Playwright packages step on one attempt (4.5.6, #373)**: on main's
  run 40315817057, `studio-hosted`'s `scripts/ci-playwright-deps.sh` downloaded from `azure.archive.ubuntu.com` at
  about 40 kB/s, never a minute without a byte, and the step's 20 minutes ran out before the second attempt. An attempt
  now downloads first, `apt-get update` and the packages Playwright reports missing (`install-deps --dry-run`), bounded
  to 2 and 3 minutes by a `timeout` that sudo runs, so it kills apt-get itself before dpkg starts; then it installs them
  from apt's cache with nothing bounded, as #353 wants. A retry puts the runner's first mirror last
  (`/etc/apt/apt-mirrors.txt`), since apt changes mirrors on a failed file, never on a slow one; what an attempt
  fetched, partial files included, stays for the next.
- **The scheduled `nightly` and `prove` run in the night, never in the working day (4.5.6, #372)**: GitHub starts
  their scheduled runs hours after their cron times, every time: from 6 to 26 October 2026 the nightly (03:17 UTC)
  started 4 h 36 min to 7 h 44 min late and the weekly prove (Monday 04:00 UTC) 5 h 37 min to 7 h 40 min late, in the
  working day, where their jobs took the runners from a release's candidate and its pull requests. Their crons now
  start the evening before (the nightly at 20:17 UTC, the prove on Sunday at 20:00 UTC), so those delays land them
  between 00:53 and 04:01 UTC. A first `guard` job (`tools/schedule-guard.ts`, a few seconds of Node) skips every
  other job of a scheduled run that still starts in the Paris working day (07:00 to 20:00 Paris time, summer or
  winter), and the run stays green. A run by hand, the release's warm-up of the mutation cache among them, is never
  guarded.
- **CI's ffmpeg apt fallback no longer leaves an apt-get holding the dpkg lock, nor cuts dpkg (4.5.6, #374)**: when
  the static ffmpeg cannot be fetched from GitHub, `scripts/ci-ffmpeg.sh` ran `timeout 240 $SUDO apt-get …`, `timeout`
  above sudo, the shape #353 removed: it killed sudo, not apt-get, and its four minutes also covered dpkg. Now sudo runs
  `timeout`, apt-get's own parent, around `apt-get update` and `apt-get install --download-only ffmpeg` only; the
  install, from apt's cache, is not bounded and waits for a lock still held (`DPkg::Lock::Timeout`). The CI page no
  longer says `release.yml` installs ffmpeg (it has not since #291).
- **`npm run ids -- --write` rewrites the positional `seen` keys of the sources (4.5.6, #359)**: a `{ seen: key }`
  condition or a checkpoint's `seen` key that names the old place of a topic, a `once` listener or a `once` choice
  option (`house.grandma.0`, `event.house.2`, `choice.house.<text>`) becomes the key the engine records once that
  thing has an id (`topic.<id>`, `event.<id>`, `choice.<id>`), in the files the tool writes (`rooms/*.ts`,
  `rules.ts`, `items.ts`, `game.ts`); the dry run lists each one with its line. Before, the save migration renamed
  them in the saves but the sources kept the old keys, which then named nothing (since 4.5.5 the validator said so,
  one key at a time). The Studio's hosted migration writes them too. Texts, flags and keys nothing renames stay as
  they are; a second run changes nothing.
- **The lease renewal tests no longer depend on how fast the runner is (4.5.6, #388)**: main's `ci` went red on
  Windows only, in `tests/studio-engine-upgrade.test.ts`: a run of 30 ms with a renewal every 5 ms was expected to
  log two failed renewals, and Windows' coarse timers (about 15 ms a tick) fit only one. The operation under the lease
  now lasts until the second renewal has been logged (and, without a log, until the first renewal has run), and the
  owner's lease test waits for its two renewals the same way, so each proves what it did with no elapsed time to
  guess. Tests only; the Studio's lease is unchanged.
- **The mutation sets run at their old speed again, and `speedrun` in two shards (4.5.6, #387)**: since the unit
  shards' duration sequencer (#349, 4.5.5), `vitest.mutation.config.ts` inherited it from `vite.config.ts`. Each mutant
  runs its set's tests with `--bail 1`, and vitest's own order starts with the files that failed the run before, so the
  file that killed a mutant judges its neighbour first and kills it in a second; the duration sequencer started the
  longest files first instead. Every set ran two to five times longer, and `speedrun` (539 mutants in one job) went
  from 38 minutes to past the job's 120: the 4.5.6 warm-up cancelled it, and its candidate would have been red. The
  mutation config keeps vitest's own order (`BaseSequencer`), and `speedrun` runs in two shards: `verify.ts` (398
  mutants) alone, the envelope and the recorder (141) in the other.
- **A red nightly opens an issue, and the next green one closes it (4.5.6, #379)**: a red nightly told nobody but the
  cross on the Actions page, and on 26 October 2026 one was found at the next release's candidate, a day late. The
  nightly's last job, `report` (`tools/nightly-report.ts`, Node alone), reads every job's result: a job that failed,
  timed out or was cancelled opens an issue labelled `nightly-red`, or comments on the open one (one issue per red
  streak), with the date, the commit, the run's link, the red jobs and, for a failed mutation gate, the surviving
  mutants `docs/dev/mutants.json` does not name. The first green night comments "Green again on <run>" and closes it.
  A warm-up of the mutation cache reports a red gate too but never closes the issue; a run the `guard` skipped in the
  working day reports nothing. Only that job may write issues; the rest of the workflow keeps its read-only token.
- **"Your first game" starts from npm (4.5.6, #382)**: its first step said the packages were not on npm yet and walked
  a newcomer through a release archive's URL, then said they were. The engine is on npm from 4.5.2, so the page now
  starts with `npm init @quest-n-click my-game "My Game"`, `npm install`, the Python step, `npm run assets` and
  `npm run dev`; the archive is a short fallback (offline, a build pinned to a release's file) and the engine
  repository's path is unchanged. The other pages that still said so are fixed in both languages: "Not supported"
  no longer lists npm as missing, the upgrade page installs `@quest-n-click/engine@<version>` first, and the
  troubleshooting, archive and upgrade pages give the error a project made before 4.5.2 now meets
  (`ETARGET No matching version found for quest-n-click@…`, not a 404) with its fix. `install.from-npm` and
  `install.package` no longer wait for a relay that is republished, and name `npx @quest-n-click/create` as the
  alternative to `npm init`, in place of an unscoped `npx quest-n-click create` that has no command on npm.
- **A created project has a test from the start: `npm test` (4.5.6, #384)**: `npm init @quest-n-click` (`quest-n-click
  create`) used to leave the template's `tests/` out, so a new project had no test, no vitest and no `npm test`,
  although `@quest-n-click/engine/testing` is there for a game's own tests. It now writes `game/tests/game.test.ts`
  (the game can be finished from a new game, and a save reads back as written), a `vitest.config.ts` with no alias
  (the package's `exports` resolve `/testing`), and in `package.json` `"test": "vitest run"` with `vitest` as a
  development dependency, at the engine's own version. The test names no room: it uses the `layouts` that
  `game/index.ts` builds from `layout/*.json`, and it does not wait for a new game that ends on a guided action. It is
  the template's own `tests/game.test.ts`, which the engine repository runs with `GAME=_template`: one file for both.
  An existing project adds the same three files by hand ([layout of a created
  project](https://github.com/Quest-n-Click/quest-n-click/wiki/EN-Create-Project-Layout)).
