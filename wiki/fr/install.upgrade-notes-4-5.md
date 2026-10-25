# Notes de mise à jour : 4.5

Ce que la 4.5.0 « Wiki », la 4.5.1, la 4.5.2, la 4.5.3 et la 4.5.4 ont changé. Rien à changer jusqu'à la 4.5.1 (la doc a
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

TODO(release) : ce qui change dans un jeu (« Rien à changer dans un jeu : il se construit, se joue et se sauvegarde comme en 4.5.3 » quand rien ne change), puis pour un hébergeur ou un mainteneur. Les entrées du CHANGELOG de la release, à réécrire pour qui met à jour :

- **The mouth-kit tools work in a created project** (#307): `tools/talk-kit.py` and `tools/talk-apply.py` read and
- **The art prompts name a created project's own paths**: in a project (`game/`, the engine in `node_modules`),
- **`cut-sheet.py` cuts into a project's `game/art` by default**: run from a project's folder (or through the
- **A character's variant shows the moment its flag changes (4.5.4, #316)**: a `{ set }` in the middle of a
- **The Studio Server's lock follows jose 6.2.13** (#299): Dependabot's `minor-and-patch` group moved `jose` from 6.2.12 to 6.2.13 (a refactor that keeps the cause of an error) in the root lock, and `scripts/locks/quest-n-click-studio-server.json` still pinned 6.2.12, so `pack` refused it and the `connectors` and `smoke` jobs failed. `npm run locks` brings that one lock in step; the other three locks are unchanged, and so is every version an install of the Studio Server takes, apart from jose.
- **A docs, tooling or release pull request waits less for its CI** (4.5.4, #302): the unit suite runs under coverage only when product code changes (the plan's new `coverage` gate), `windows` and `node-24` no longer run for the release and wiki tools nor for tests alone, `pwa-firefox` warns instead of failing `pr-gate` until #257 is fixed, and the candidate runs its mutation sets 8 at a time so pull requests are not queued behind it. `main`, a tag and `full-ci` still run everything.
- **`cables` fits a game's own plug and board art**: the plug's tip direction (120°), the sockets' place on the board
- **The unit suite runs in four shards at once** (4.5.4): CI's new `unit` job splits the suite and the asset tests in four (`--shard=<i>/4`), under coverage when product code changed; `coverage`, still the check the ruleset requires, merges the four reports (`npm run test:merge`, the floors of `vite.config.ts` on the whole suite), runs the ratchet, and is red when a shard is not. New scripts `test:unit` (the files of `test:coverage`, no instrumentation) and `test:merge`.
- **A new project's `.gitignore` lists `game/private`**: the raw sheets the art prompts save there stay out of git. In
- **The release pull request by one command** (4.5.4): `npm run release -- prepare <x.y.z> --name="<name>"` makes the branch `release/<version>` with every file a release branch wrote (version, CHANGELOG and LOG from the fragments, the LOG's release entry, the upgrade notes' section in both languages, transition pages, golden save, reference run, passes sheet and `passIssues`, the README's current-release line, quality baseline), `TODO(release)` where prose is needed, one commit and the pull request; `npm run release -- check <x.y.z>` says what is left before merging. `npm run changes -- --assemble` makes its own `## Unreleased` and folds a `.log.md` alone; the golden saves are listed in `tests/fixtures/saves/index.json`, so a release no longer changes the test file the save claims are reviewed on.
- **Two pull requests no longer conflict on the test count** (4.5.4): `npm run quality:baseline -- --check` compares the READMEs' figures with the committed `tests/quality-baseline.json`, not with what the checkout measures, so a pull request that adds tests passes without rewriting the READMEs and the baseline (it says the gain as `⚠ better than the baseline`); the figures move at the release (`npm run release -- prepare` runs `quality:baseline`) or whenever someone rewrites them. A changed behaviour still fails until it is rewritten on purpose.
- **The candidate of a release starts itself** (4.5.4): the release pull request's merge (a push to `main` that moves `package.json`'s version) starts `candidate` on the merge commit; `ship tag`, `release.yml` and the provenance check accept that run as they accept one started by hand on main, and it is qualified, fully profiled and attested the same way. A dependency bump starts none.
- **A docs problem shows on the release pull request, never after the tag** (4.5.4): its CI runs `npm run release -- check`, which now includes `npm run wiki -- check --publish --reviews-only` (every publication gate but "executed", which needs the candidate's report): a claim or a pair a person must read fails the pull request. The candidate then checks its docs against its own report, as a warning.
- **A release's docs publish without a click** (4.5.4): `docs-publish` runs a release's call under the environment `docs-publish` (no reviewer: the signed tag is the approval) and the runs by hand under `docs-publish-manual` (its reviewers approve each).
- **A `church_organ` FM patch in the audio palette**: a full pipe organ that carries a lead (a Toccata), beside the soft
- **A release is one command after the release pull request's merge** (4.5.4, D57): `npm run release -- <x.y.z>` refuses first what would fail later (not the merged release, uncommitted changes, no CHANGELOG section, no SSH signing, `gh` or `npm` not signed in, an npm user who is not an owner), finds the candidate the merge started and waits for it with its progress (its failed jobs re-run once), signs and pushes the tag (`ship tag`), follows the release and verifies it, then approves the staged npm packages with the maintainer's 2FA, the engine first. Run again after a stop, it goes on where it stopped.
