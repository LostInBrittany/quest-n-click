# Variables d’environnement

Toutes les variables d’environnement que lit quest-n-click, et celles que Clever Cloud et ses add-ons donnent au Studio
hébergé. Chacune a sa propre section : liez-la sous la forme
`reference.environment-variables.md#studio-session-key` (le nom en minuscules, `_` écrit `-`).

<a name="how-to-read"></a>

## Comment lire cette page

- **Origine** dit qui pose la variable : vous (le code la lit), la construction, la plateforme (Clever Cloud, GitHub
  Actions, npm, le système), ou un add-on Clever Cloud. Une variable qu’une commande de quest-n-click pose elle-même le
  dit : vous ne la posez pas.
- **Secret** : lue une fois au démarrage du Studio Server, puis retirée de son environnement, pour qu’aucun processus
  enfant n’en hérite ; jamais écrite dans un journal. Chaque secret peut aussi venir d’un fichier :
  `STUDIO_SESSION_KEY_FILE=/run/secrets/session` lit la clé dans ce fichier, lisible par son seul propriétaire (mode
  0600) sous Linux et macOS. Le fichier passe avant la variable.
- **Lue par** renvoie aux fichiers du code qui la lisent, dans la version documentée.
- Sur Clever Cloud, posez une variable avec `clever env set NOM valeur` sur la bonne application ; `clever env`
  affiche en entier les valeurs sur plusieurs lignes, filtrez sa sortie avant de la partager.

> [!LIMIT id=generated-scope]
> Les sections qui suivent sont générées depuis `wiki/data/env.json` et depuis le code : ce que lisent `process.env`,
> `import.meta.env`, `os.environ` en Python et les scripts shell de `ops/` et `clevercloud/`. Une variable lue
> seulement par une bibliothèque tierce (les `OTEL_*` standard, `NODE_OPTIONS`, `PG*`) ou seulement par un fichier de
> workflow de CI n’y figure pas.

<!-- env:begin -->

<a name="studio-server"></a>

## Studio Server (Studio hébergé)

Ce que lit l’application `studio-server` : sur Clever Cloud, posez-les avec `clever env set` sur l’application studio, jamais sur le worker. Chaque secret peut venir d’un fichier (`<NOM>_FILE`, mode 0600), et quitte l’environnement une fois lu.

<a name="git-dir"></a>

### `GIT_DIR`

Pas lue dans votre environnement : le Studio Server la pose pour ses propres commandes `git` sur le dépôt du jeu, et la retire pour `git init`.

- Origine : posée par le Studio Server lui-même.
- Lue par : [`studio-server/src/server/git.ts`](../../studio-server/src/server/git.ts).

<a name="studio-backup-cron"></a>

### `STUDIO_BACKUP_CRON`

`1` active la sauvegarde quotidienne vers le bucket que `clevercloud/cron.json` lance à 03:17 UTC (`ops/studio/backup-cron.sh`). À poser sur l’application studio seulement, jamais sur le worker.

- Origine : vous la posez ; le code la lit.
- Lue par : [`ops/studio/backup-cron.sh`](../../ops/studio/backup-cron.sh).

<a name="studio-backup-keep"></a>

### `STUDIO_BACKUP_KEEP`

Le nombre de sauvegardes que la sauvegarde quotidienne garde dans le bucket (`--keep`) ; 14 quand elle n’est pas posée.

- Origine : vous la posez ; le code la lit.
- Lue par : [`ops/studio/backup-cron.sh`](../../ops/studio/backup-cron.sh).

<a name="studio-config"></a>

### `STUDIO_CONFIG`

Le chemin du fichier de configuration, lu quand aucun `--config <fichier>` n’est donné. Il passe avant `STUDIO_CONFIG_JSON`.

- Origine : vous la posez ; le code la lit.
- Lue par : [`studio-server/src/server/main.ts`](../../studio-server/src/server/main.ts).

<a name="studio-config-json"></a>

### `STUDIO_CONFIG_JSON`

Toute la configuration en JSON sur une ligne, pour une plateforme qui ne donne pas de fichier (Clever Cloud). Elle ne contient aucun secret ; le chargeur refuse une clé inconnue.

- Origine : vous la posez ; le code la lit.
- Lue par : [`studio-server/src/server/main.ts`](../../studio-server/src/server/main.ts).

<a name="studio-database-url"></a>

### `STUDIO_DATABASE_URL`

L’URI de connexion PostgreSQL (`store.kind: postgres`). Sur Clever Cloud, ne la posez pas : la variable `POSTGRESQL_ADDON_URI` de l’add-on lié est lue à sa place. Pour un exercice de restauration, faites-la pointer vers la base vide de l’exercice, jamais vers la production.

- Origine : vous la posez ; le code la lit.
- Secret : oui, lue une fois au démarrage, puis retirée de l’environnement ; jamais journalisée.
- Depuis un fichier : `STUDIO_DATABASE_URL_FILE` nomme un fichier où la lire à la place (mode 0600 sous Linux et macOS).
- Lue par : [`studio-server/src/server/config.ts`](../../studio-server/src/server/config.ts).

<a name="studio-git-key"></a>

### `STUDIO_GIT_KEY`

Facultative (4.2.3) : la clé de déploiement SSH du dépôt Git du jeu (`git.remote`). Inutile pour un dépôt public en https.

- Origine : vous la posez ; le code la lit.
- Secret : oui, lue une fois au démarrage, puis retirée de l’environnement ; jamais journalisée.
- Depuis un fichier : `STUDIO_GIT_KEY_FILE` nomme un fichier où la lire à la place (mode 0600 sous Linux et macOS).
- Lue par : [`studio-server/src/server/config.ts`](../../studio-server/src/server/config.ts).

<a name="studio-metrics-token"></a>

### `STUDIO_METRICS_TOKEN`

Facultative (4.2.3) : le jeton bearer de `GET /metrics`, 32 caractères ou plus. Sans elle, la route `/metrics` n’existe pas (404).

- Origine : vous la posez ; le code la lit.
- Secret : oui, lue une fois au démarrage, puis retirée de l’environnement ; jamais journalisée.
- Depuis un fichier : `STUDIO_METRICS_TOKEN_FILE` nomme un fichier où la lire à la place (mode 0600 sous Linux et macOS).
- Lue par : [`studio-server/src/server/config.ts`](../../studio-server/src/server/config.ts).

<a name="studio-oidc-client-secret"></a>

### `STUDIO_OIDC_CLIENT_SECRET`

Le secret du fournisseur OpenID pour le client `studio`. Obligatoire quand la configuration a `oidc`.

- Origine : vous la posez ; le code la lit.
- Secret : oui, lue une fois au démarrage, puis retirée de l’environnement ; jamais journalisée.
- Depuis un fichier : `STUDIO_OIDC_CLIENT_SECRET_FILE` nomme un fichier où la lire à la place (mode 0600 sous Linux et macOS).
- Lue par : [`studio-server/src/server/config.ts`](../../studio-server/src/server/config.ts).

<a name="studio-s3-key-id"></a>

### `STUDIO_S3_KEY_ID`

L’identifiant de clé d’accès S3 (Cellar) du bucket (`blobs.kind: s3`). Sur Clever Cloud, `CELLAR_ADDON_KEY_ID` de l’add-on est lue quand elle n’est pas posée.

- Origine : vous la posez ; le code la lit.
- Secret : oui, lue une fois au démarrage, puis retirée de l’environnement ; jamais journalisée.
- Depuis un fichier : `STUDIO_S3_KEY_ID_FILE` nomme un fichier où la lire à la place (mode 0600 sous Linux et macOS).
- Lue par : [`studio-server/src/server/config.ts`](../../studio-server/src/server/config.ts).

<a name="studio-s3-key-secret"></a>

### `STUDIO_S3_KEY_SECRET`

La clé secrète S3 (Cellar) du bucket. Sur Clever Cloud, `CELLAR_ADDON_KEY_SECRET` de l’add-on est lue quand elle n’est pas posée.

- Origine : vous la posez ; le code la lit.
- Secret : oui, lue une fois au démarrage, puis retirée de l’environnement ; jamais journalisée.
- Depuis un fichier : `STUDIO_S3_KEY_SECRET_FILE` nomme un fichier où la lire à la place (mode 0600 sous Linux et macOS).
- Lue par : [`studio-server/src/server/config.ts`](../../studio-server/src/server/config.ts).

<a name="studio-session-key"></a>

### `STUDIO_SESSION_KEY`

Les clés qui scellent les cookies de session des membres : une clé, ou plusieurs séparées par des virgules, chacune de 32 caractères ou plus (`openssl rand -base64 48`). La première scelle ; toutes celles de la liste ouvrent. Pour la faire tourner, mettez la nouvelle clé en tête et gardez l’ancienne dans la liste jusqu’à l’expiration des sessions qu’elle a scellées ; retirer une clé déconnecte les sessions scellées avec elle. Obligatoire avec `oidc`.

- Origine : vous la posez ; le code la lit.
- Secret : oui, lue une fois au démarrage, puis retirée de l’environnement ; jamais journalisée.
- Depuis un fichier : `STUDIO_SESSION_KEY_FILE` nomme un fichier où la lire à la place (mode 0600 sous Linux et macOS).
- Lue par : [`studio-server/src/server/config.ts`](../../studio-server/src/server/config.ts).

<a name="studio-worker-key"></a>

### `STUDIO_WORKER_KEY`

La clé privée Ed25519 (PEM) qui signe les jobs envoyés au worker ; les retours à la ligne peuvent s’écrire `\n`. Produite par `npm run studio-server -- worker-keys --out <dossier>`. Obligatoire avec un worker.

- Origine : vous la posez ; le code la lit.
- Secret : oui, lue une fois au démarrage, puis retirée de l’environnement ; jamais journalisée.
- Depuis un fichier : `STUDIO_WORKER_KEY_FILE` nomme un fichier où la lire à la place (mode 0600 sous Linux et macOS).
- Lue par : [`studio-server/src/server/config.ts`](../../studio-server/src/server/config.ts).

<a name="web-scumm-studio-client"></a>

### `WEB_SCUMM_STUDIO_CLIENT`

Le dossier de la page du Studio construite que le serveur sert, quand la configuration n’a pas de `clientDir` ; `.cache/studio-client` à côté du moteur par défaut. Le lanceur de l’archive de publication la pose.

- Origine : vous la posez ; le code la lit.
- Lue par : [`scripts/pack.mjs`](../../scripts/pack.mjs), [`studio-server/src/server/main.ts`](../../studio-server/src/server/main.ts).

<a name="studio-worker"></a>

## Worker du Studio

Ce que lit le worker de traitement (`npm run studio-worker`). Il ne détient aucun secret : seulement la clé publique qui vérifie les jobs que le Studio signe.

<a name="worker-instance"></a>

### `WORKER_INSTANCE`

Le nom du seul Studio dont ce worker exécute les jobs : le même que `worker.instance` dans la configuration du Studio.

- Origine : vous la posez ; le code la lit.
- Lue par : [`studio-server/src/worker/main.ts`](../../studio-server/src/worker/main.ts).

<a name="worker-public-key"></a>

### `WORKER_PUBLIC_KEY`

La clé publique Ed25519 (PEM) qui vérifie les jobs signés du Studio : le contenu de `studio-worker.pub`.

- Origine : vous la posez ; le code la lit.
- Lue par : [`studio-server/src/worker/main.ts`](../../studio-server/src/worker/main.ts).

<a name="worker-public-key-file"></a>

### `WORKER_PUBLIC_KEY_FILE`

Un fichier qui contient la clé publique, lu à la place de `WORKER_PUBLIC_KEY` quand elle est posée.

- Origine : vous la posez ; le code la lit.
- Lue par : [`studio-server/src/worker/main.ts`](../../studio-server/src/worker/main.ts).

<a name="worker-python-path"></a>

### `WORKER_PYTHON_PATH`

L’endroit où le hook de construction a installé les paquets Python des outils d’images ; `.python` dans le dossier du worker quand elle n’est pas posée.

- Origine : vous la posez ; le code la lit.
- Lue par : [`studio-server/src/worker/prepare.ts`](../../studio-server/src/worker/prepare.ts).

<a name="clever-cloud"></a>

## Posées par Clever Cloud et ses add-ons

Clever Cloud les donne à une application, ou les lit lui-même pour la construire et la lancer. Les variables d’un add-on n’arrivent à l’application studio que si l’add-on lui est lié.

<a name="app-folder"></a>

### `APP_FOLDER`

À ne pas poser : les deux applications se construisent depuis la racine du dépôt. Une application qui a contenu un autre projet peut encore en avoir une (`clever env rm APP_FOLDER`).

- Origine : posée par vous ; Clever Cloud la lit.
- Lue par : aucun fichier du code ; la plateforme la lit.

<a name="app-home"></a>

### `APP_HOME`

Le dossier de l’application sur l’instance ; la sauvegarde quotidienne s’y lance (`cd "$APP_HOME"` dans une session `clever ssh` aussi).

- Origine : posée par Clever Cloud.
- Lue par : [`ops/studio/backup-cron.sh`](../../ops/studio/backup-cron.sh).

<a name="cc-health-check-path"></a>

### `CC_HEALTH_CHECK_PATH`

Le chemin que Clever Cloud sonde avant d’envoyer du trafic à une nouvelle instance : `/startz` sur l’application studio.

- Origine : posée par vous ; Clever Cloud la lit.
- Lue par : aucun fichier du code ; la plateforme la lit.

<a name="cc-node-dev-dependencies"></a>

### `CC_NODE_DEV_DEPENDENCIES`

À poser à `install` sur les deux applications : le serveur tourne depuis le dépôt avec `tsx`, une dépendance de développement.

- Origine : posée par vous ; Clever Cloud la lit.
- Lue par : aucun fichier du code ; la plateforme la lit.

<a name="cc-post-build-hook"></a>

### `CC_POST_BUILD_HOOK`

Une commande que Clever Cloud lance après la construction : `npm run studio-client` sur l’application studio ; celle du worker installe les paquets Python de `ops/studio/worker-requirements.lock`.

- Origine : posée par vous ; Clever Cloud la lit.
- Lue par : aucun fichier du code ; la plateforme la lit.

<a name="cc-run-command"></a>

### `CC_RUN_COMMAND`

La commande qui lance l’application : `npm run studio-server -- serve` sur l’application studio, `npm run studio-worker` sur le worker.

- Origine : posée par vous ; Clever Cloud la lit.
- Lue par : aucun fichier du code ; la plateforme la lit.

<a name="cellar-addon-key-id"></a>

### `CELLAR_ADDON_KEY_ID`

L’identifiant de clé de l’add-on Cellar, lu quand `STUDIO_S3_KEY_ID` n’est pas posée.

- Origine : injectée par l’add-on Cellar de Clever Cloud.
- Secret : oui, lue une fois au démarrage, puis retirée de l’environnement ; jamais journalisée.
- Lue à la place de `STUDIO_S3_KEY_ID` quand `STUDIO_S3_KEY_ID` n’est pas posée.
- Lue par : [`studio-server/src/server/config.ts`](../../studio-server/src/server/config.ts).

<a name="cellar-addon-key-secret"></a>

### `CELLAR_ADDON_KEY_SECRET`

La clé secrète de l’add-on Cellar, lue quand `STUDIO_S3_KEY_SECRET` n’est pas posée.

- Origine : injectée par l’add-on Cellar de Clever Cloud.
- Secret : oui, lue une fois au démarrage, puis retirée de l’environnement ; jamais journalisée.
- Lue à la place de `STUDIO_S3_KEY_SECRET` quand `STUDIO_S3_KEY_SECRET` n’est pas posée.
- Lue par : [`studio-server/src/server/config.ts`](../../studio-server/src/server/config.ts).

<a name="instance-number"></a>

### `INSTANCE_NUMBER`

Le numéro de l’instance de l’application. La sauvegarde quotidienne ne tourne que sur l’instance `0`, pour que deux instances ne sauvegardent pas toutes les deux.

- Origine : posée par Clever Cloud.
- Lue par : [`ops/studio/backup-cron.sh`](../../ops/studio/backup-cron.sh).

<a name="port"></a>

### `PORT`

Le port d’écoute. Clever Cloud la donne aux applications studio et worker ; ailleurs, 8080 quand elle n’est pas posée. Un `port` dans la configuration du Studio passe avant.

- Origine : posée par l’hébergeur (Clever Cloud la donne).
- Lue par : [`scripts/start.mjs`](../../scripts/start.mjs), [`studio-server/src/server/config.ts`](../../studio-server/src/server/config.ts), [`studio-server/src/worker/main.ts`](../../studio-server/src/worker/main.ts).

<a name="postgresql-addon-uri"></a>

### `POSTGRESQL_ADDON_URI`

L’URI de connexion de l’add-on PostgreSQL. Le Studio Server la lit quand `STUDIO_DATABASE_URL` n’est pas posée.

- Origine : injectée par l’add-on PostgreSQL de Clever Cloud.
- Secret : oui, lue une fois au démarrage, puis retirée de l’environnement ; jamais journalisée.
- Lue à la place de `STUDIO_DATABASE_URL` quand `STUDIO_DATABASE_URL` n’est pas posée.
- Lue par : [`studio-server/src/server/config.ts`](../../studio-server/src/server/config.ts).

<a name="root"></a>

### `ROOT`

Le dossier de l’application, utilisé par `clevercloud/cron.json` (les crons veulent des chemins absolus) et par le script de sauvegarde quand `APP_HOME` manque.

- Origine : posée par Clever Cloud.
- Lue par : [`clevercloud/cron.json`](../../clevercloud/cron.json), [`ops/studio/backup-cron.sh`](../../ops/studio/backup-cron.sh).

<a name="local-tools"></a>

## Moteur, Studio local et outils

Lues par les commandes du moteur, le Studio local et son serveur MCP, dans le dépôt du moteur ou dans un projet créé.

<a name="assets-dir"></a>

### `ASSETS_DIR`

Le dossier des images et sons construits livrés, à la place de `public/assets` (les fichiers propres à une fixture de test).

- Origine : vous la posez ; le code la lit.
- Lue par : [`tools/game.ts`](../../tools/game.ts).

<a name="dist-dir"></a>

### `DIST_DIR`

Le dossier construit que mesure `npm run weight` ; `dist` quand elle n’est pas posée.

- Origine : vous la posez ; le code la lit.
- Lue par : [`tools/weight.ts`](../../tools/weight.ts).

<a name="furnace-bin"></a>

### `FURNACE_BIN`

Le chemin de l’exécutable Furnace avec lequel la chaîne audio fait son rendu, quand il n’est pas là où `python -m mdpipe setup` l’a mis.

- Origine : vous la posez ; le code la lit.
- Lue par : [`tools/audio/mdpipe/render.py`](../../tools/audio/mdpipe/render.py).

<a name="game"></a>

### `GAME`

Le jeu de `games/` sur lequel travaillent les commandes du dépôt du moteur (`GAME=reference npm run validate`). Sans elle, le dernier jeu choisi (`npm run game -- <id>`), puis `config.game` de `package.json`, puis `demo`.

- Origine : vous la posez ; le code la lit.
- Lue par : [`scripts/e2e-studio.mjs`](../../scripts/e2e-studio.mjs), [`scripts/e2e-visual.mjs`](../../scripts/e2e-visual.mjs), [`scripts/e2e.mjs`](../../scripts/e2e.mjs), et 7 de plus.

<a name="game-dir"></a>

### `GAME_DIR`

Un dossier de jeu n’importe où sur le disque, à la place de `games/<GAME>` ; ignorée quand `GAME` est posée.

- Origine : vous la posez ; le code la lit.
- Lue par : [`scripts/e2e-worker-container.ts`](../../scripts/e2e-worker-container.ts), [`scripts/ops-qualify/setup.mjs`](../../scripts/ops-qualify/setup.mjs), [`tools/assets.py`](../../tools/assets.py), et 3 de plus.

<a name="proof-cache"></a>

### `PROOF_CACHE`

`0` coupe le cache des résultats du solveur pour une exécution (comme `--no-cache`).

- Origine : vous la posez ; le code la lit.
- Lue par : [`tools/proof-cache.ts`](../../tools/proof-cache.ts).

<a name="proof-cache-dir"></a>

### `PROOF_CACHE_DIR`

L’endroit où vit le cache des résultats du solveur ; `.cache/proofs` du projet quand elle n’est pas posée.

- Origine : vous la posez ; le code la lit.
- Lue par : [`tools/proof-cache.ts`](../../tools/proof-cache.ts).

<a name="python"></a>

### `PYTHON`

L’interpréteur Python que lance `quest-n-click assets` ; `python3` quand elle n’est pas posée.

- Origine : vous la posez ; le code la lit.
- Lue par : [`cli/quest-n-click.mjs`](../../cli/quest-n-click.mjs).

<a name="web-scumm-allow-custom-provider"></a>

### `WEB_SCUMM_ALLOW_CUSTOM_PROVIDER`

`1` permet à l’Assistant du Studio d’appeler une URL de fournisseur que vous saisissez vous-même ; refusé sinon.

- Origine : vous la posez ; le code la lit.
- Lue par : [`tools/studio/assistant.ts`](../../tools/studio/assistant.ts).

<a name="web-scumm-dev-url"></a>

### `WEB_SCUMM_DEV_URL`

Le serveur de développement qu’ouvre l’outil MCP `screenshot` ; `http://localhost:5173/` quand elle n’est pas posée.

- Origine : vous la posez ; le code la lit.
- Lue par : [`tools/mcp/server.ts`](../../tools/mcp/server.ts).

<a name="web-scumm-lan"></a>

### `WEB_SCUMM_LAN`

`1` fait écouter le serveur de développement et le Studio local sur le réseau local, derrière un jeton. `npm run dev:lan` et `studio:lan` la posent.

- Origine : posée par `npm run dev:lan` et `studio:lan`.
- Lue par : [`tools/studio/security.ts`](../../tools/studio/security.ts), [`vite.config.ts`](../../vite.config.ts).

<a name="web-scumm-project"></a>

### `WEB_SCUMM_PROJECT`

Le projet créé sur lequel travaillent les outils du moteur. La commande `quest-n-click` la pose sur le dossier où elle tourne ; vous ne la posez pas vous-même.

- Origine : posée par la commande `quest-n-click`.
- Lue par : [`tools/assets.py`](../../tools/assets.py), [`tools/game.ts`](../../tools/game.ts).

<a name="web-scumm-studio-hosts"></a>

### `WEB_SCUMM_STUDIO_HOSTS`

Les noms d’hôte auxquels répond le Studio local en mode réseau local, séparés par des virgules ; tout autre `Host` est refusé. `studio:lan` la pose d’après les adresses de la machine.

- Origine : posée par `npm run dev:lan` et `studio:lan`.
- Lue par : [`tools/studio/security.ts`](../../tools/studio/security.ts).

<a name="web-scumm-studio-token"></a>

### `WEB_SCUMM_STUDIO_TOKEN`

Le jeton que demande le Studio local en mode réseau local. `studio:lan` en tire un au hasard sauf si vous la posez.

- Origine : vous la posez ; le code la lit.
- Lue par : [`tools/serve-args.ts`](../../tools/serve-args.ts), [`tools/studio/security.ts`](../../tools/studio/security.ts).

<a name="build"></a>

## Construction des pages

Lues quand Vite construit le jeu, le Studio ou une prévisualisation. Les scripts npm posent la plupart d’entre elles ; `VITE_*`, `BASE_URL` et `DEV` finissent dans la page construite.

<a name="base-path"></a>

### `BASE_PATH`

Le sous-chemin sous lequel le jeu est servi (`/<dépôt>/` sur GitHub Pages) ; `/` quand elle n’est pas posée.

- Origine : lue à la construction de la page ou du paquet.
- Lue par : [`tools/vite/plugins.ts`](../../tools/vite/plugins.ts).

<a name="base-url"></a>

### `BASE_URL`

La base pour laquelle la page a été construite, tirée de `BASE_PATH`.

- Origine : posée par Vite (lue à la construction de la page ou du paquet).
- Lue par : [`src/main.ts`](../../src/main.ts), [`src/studio/api.ts`](../../src/studio/api.ts), [`src/studio/game-origin.ts`](../../src/studio/game-origin.ts).

<a name="dev"></a>

### `DEV`

Vrai sous le serveur de développement (`npm run dev`), faux dans une version construite.

- Origine : posée par Vite (lue à la construction de la page ou du paquet).
- Lue par : [`src/main.ts`](../../src/main.ts).

<a name="studio"></a>

### `STUDIO`

`1` construit ou sert les pages du Studio à côté du jeu (`npm run studio`, le Studio de démonstration).

- Origine : posée par les scripts npm (lue à la construction de la page ou du paquet).
- Lue par : [`tools/vite/plugins.ts`](../../tools/vite/plugins.ts), [`vite.config.ts`](../../vite.config.ts).

<a name="studio-client"></a>

### `STUDIO_CLIENT`

`1` ne construit que la page du Studio hébergé (`npm run studio-client`).

- Origine : posée par `npm run studio-client` (lue à la construction de la page ou du paquet).
- Lue par : [`vite.config.ts`](../../vite.config.ts).

<a name="vite-studio-demo"></a>

### `VITE_STUDIO_DEMO`

`1` construit le Studio de démonstration, qui tourne dans le navigateur sans serveur (`npm run build:studio-demo`).

- Origine : posée par `npm run build:studio-demo` (lue à la construction de la page ou du paquet).
- Lue par : [`src/engine/dev/editor.ts`](../../src/engine/dev/editor.ts), [`src/main.ts`](../../src/main.ts), [`src/studio/main.ts`](../../src/studio/main.ts).

<a name="vite-studio-hosted"></a>

### `VITE_STUDIO_HOSTED`

`1` construit le Studio pour un Studio Server (`npm run studio-client`).

- Origine : posée par `npm run studio-client` (lue à la construction de la page ou du paquet).
- Lue par : [`src/studio/main.ts`](../../src/studio/main.ts).

<a name="vite-studio-preview"></a>

### `VITE_STUDIO_PREVIEW`

`1` dans la prévisualisation d’une révision, que le worker construit avec les outils d’édition ; `0` dans une version publiée.

- Origine : posée par le worker du Studio (lue à la construction de la page ou du paquet).
- Lue par : [`src/main.ts`](../../src/main.ts), [`studio-server/src/worker/preview-build.ts`](../../studio-server/src/worker/preview-build.ts).

<a name="bridge"></a>

## Reality Bridge

Lues par `quest-n-click-bridge` (ou `npm run bridge` dans le dépôt du moteur).

<a name="bridge-store"></a>

### `BRIDGE_STORE`

Le stockage du Bridge quand aucun `--store=` n’est donné : `jsonl`, `sqlite`, `sqlite:<fichier>` ou une URL `postgres://`. Elle passe avant `store` de `config.json`.

- Origine : vous la posez ; le code la lit.
- Lue par : [`bridge/src/cli-store.ts`](../../bridge/src/cli-store.ts), [`tools/load-report.ts`](../../tools/load-report.ts).

<a name="bridge-store-file"></a>

### `BRIDGE_STORE_FILE`

Un fichier qui contient l’URL du stockage, lu quand `BRIDGE_STORE` est vide, pour qu’un mot de passe de base soit monté en fichier secret et n’apparaisse jamais dans une liste de processus.

- Origine : vous la posez ; le code la lit.
- Lue par : [`bridge/src/cli-store.ts`](../../bridge/src/cli-store.ts).

<a name="otel-exporter-otlp-endpoint"></a>

### `OTEL_EXPORTER_OTLP_ENDPOINT`

L’adresse où le Bridge exporte ses mesures en OTLP, quand `@opentelemetry/sdk-node` est installé à côté ; rien n’est exporté sinon. Le SDK lit lui-même les autres variables `OTEL_*` standard.

- Origine : vous la posez ; le code la lit.
- Lue par : [`bridge/src/telemetry.ts`](../../bridge/src/telemetry.ts).

<a name="contributing"></a>

## Tests, CI et versions du moteur

Lues seulement par les scripts de test, de CI et de publication du dépôt du moteur. Un projet créé n’en a jamais besoin.

<a name="bridge-pg-module"></a>

### `BRIDGE_PG_MODULE`

Le module `pg` qu’importe `tools/backup-memory.ts`, quand ce n’est pas celui du dépôt.

- Origine : vous la posez ; le code la lit.
- Lue par : [`tools/backup-memory.ts`](../../tools/backup-memory.ts).

<a name="bridge-pg-url"></a>

### `BRIDGE_PG_URL`

Une URL PostgreSQL sur laquelle les tests font tourner le stockage du Bridge et les mutations ; ces tests sont sautés sans elle.

- Origine : vous la posez ; le code la lit.
- Lue par : [`tools/mutate.ts`](../../tools/mutate.ts).

<a name="consumer-pg-url"></a>

### `CONSUMER_PG_URL`

Une URL PostgreSQL sur laquelle `npm run external-consumer` fait aussi tourner le Bridge installé.

- Origine : vous la posez ; le code la lit.
- Lue par : [`scripts/external-consumer.mjs`](../../scripts/external-consumer.mjs).

<a name="e2e-browser"></a>

### `E2E_BROWSER`

Le navigateur dans lequel tourne un test de bout en bout (`chromium`, `firefox`, `webkit`) ; Chromium quand elle n’est pas posée.

- Origine : vous la posez ; le code la lit.
- Lue par : [`scripts/e2e-a11y.mjs`](../../scripts/e2e-a11y.mjs), [`scripts/e2e-pwa.mjs`](../../scripts/e2e-pwa.mjs), [`scripts/e2e.mjs`](../../scripts/e2e.mjs), et 1 de plus.

<a name="e2e-cpu"></a>

### `E2E_CPU`

Un facteur de ralentissement du processeur pour les tests de bout en bout sous Chromium (`4` tourne quatre fois plus lentement).

- Origine : vous la posez ; le code la lit.
- Lue par : [`scripts/e2e/lib.mjs`](../../scripts/e2e/lib.mjs).

<a name="e2e-debug"></a>

### `E2E_DEBUG`

Toute valeur fait afficher au test de bout en bout du Studio hébergé ce qu’il fait.

- Origine : vous la posez ; le code la lit.
- Lue par : [`scripts/e2e-studio-hosted.ts`](../../scripts/e2e-studio-hosted.ts).

<a name="e2e-input"></a>

### `E2E_INPUT`

`keyboard` joue la soluce de bout en bout au clavier au lieu de touchers.

- Origine : vous la posez ; le code la lit.
- Lue par : [`scripts/e2e/lib.mjs`](../../scripts/e2e/lib.mjs).

<a name="e2e-out"></a>

### `E2E_OUT`

L’endroit où un test de bout en bout écrit ses captures et ses rapports.

- Origine : vous la posez ; le code la lit.
- Lue par : [`scripts/e2e-a11y.mjs`](../../scripts/e2e-a11y.mjs), [`scripts/e2e/lib.mjs`](../../scripts/e2e/lib.mjs).

<a name="e2e-weight-debug"></a>

### `E2E_WEIGHT_DEBUG`

Toute valeur fait afficher à `e2e:weight` les requêtes qu’il a comptées.

- Origine : vous la posez ; le code la lit.
- Lue par : [`scripts/e2e-weight.mjs`](../../scripts/e2e-weight.mjs).

<a name="gh-token"></a>

### `GH_TOKEN`

Le jeton GitHub de la commande `gh`, lu quand `GITHUB_TOKEN` n’est pas posée.

- Origine : vous la posez ; le code la lit.
- Lue par : [`tools/release/run-jobs.mjs`](../../tools/release/run-jobs.mjs), [`tools/wiki.ts`](../../tools/wiki.ts).

<a name="github-token"></a>

### `GITHUB_TOKEN`

Un jeton GitHub pour les outils de publication et de documentation. Sur un runner, GitHub Actions le donne ; sur votre machine, `gh` fournit plutôt `GH_TOKEN`.

- Origine : vous la posez ; le code la lit.
- Lue par : [`tools/release/run-jobs.mjs`](../../tools/release/run-jobs.mjs), [`tools/wiki.ts`](../../tools/wiki.ts).

<a name="mutation-set"></a>

### `MUTATION_SET`

L’ensemble de tests qui juge un mutant (`core`, `reality`…) ; `core` quand elle n’est pas posée. `npm run test:mutation:*` la pose.

- Origine : vous la posez ; le code la lit.
- Lue par : [`vitest.mutation.config.ts`](../../vitest.mutation.config.ts).

<a name="needs"></a>

### `NEEDS`

Les résultats des jobs d’un workflow, en JSON, que lit le verdict du candidat. Le workflow la pose.

- Origine : vous la posez ; le code la lit.
- Lue par : [`tools/release/candidate.mjs`](../../tools/release/candidate.mjs).

<a name="qualify-app"></a>

### `QUALIFY_APP`

Posée par `npm run ops:qualify` pour `ops/qualify/compose.yml` : l’arbre commité que lit le worker des speedruns.

- Origine : posée par `npm run ops:qualify`.
- Lue par : [`ops/qualify/compose.yml`](../../ops/qualify/compose.yml).

<a name="qualify-build"></a>

### `QUALIFY_BUILD`

Posée par `npm run ops:qualify` pour `ops/qualify/compose.yml` : le dossier du contexte de construction de l’image du Bridge.

- Origine : posée par `npm run ops:qualify`.
- Lue par : [`ops/qualify/compose.yml`](../../ops/qualify/compose.yml).

<a name="qualify-data"></a>

### `QUALIFY_DATA`

Posée par `npm run ops:qualify` pour `ops/qualify/compose.yml` : le dossier des données des deux tenants.

- Origine : posée par `npm run ops:qualify`.
- Lue par : [`ops/qualify/compose.yml`](../../ops/qualify/compose.yml).

<a name="qualify-gid"></a>

### `QUALIFY_GID`

Posée par `npm run ops:qualify` pour `ops/qualify/compose.yml` : l’identifiant de groupe des conteneurs (1000 par défaut).

- Origine : posée par `npm run ops:qualify`.
- Lue par : [`ops/qualify/compose.yml`](../../ops/qualify/compose.yml), [`scripts/ops-qualify/backup.mjs`](../../scripts/ops-qualify/backup.mjs).

<a name="qualify-modules"></a>

### `QUALIFY_MODULES`

Posée par `npm run ops:qualify` pour `ops/qualify/compose.yml` : les modules installés montés à côté.

- Origine : posée par `npm run ops:qualify`.
- Lue par : [`ops/qualify/compose.yml`](../../ops/qualify/compose.yml).

<a name="qualify-port"></a>

### `QUALIFY_PORT`

Posée par `npm run ops:qualify` pour `ops/qualify/compose.yml` : le port local du proxy (8443 par défaut).

- Origine : posée par `npm run ops:qualify`.
- Lue par : [`ops/qualify/compose.yml`](../../ops/qualify/compose.yml).

<a name="qualify-port-1"></a>

### `QUALIFY_PORT_1`

Posée par `npm run ops:qualify` pour `ops/qualify/compose.yml` : le deuxième port local du proxy (8444 par défaut).

- Origine : posée par `npm run ops:qualify`.
- Lue par : [`ops/qualify/compose.yml`](../../ops/qualify/compose.yml).

<a name="qualify-port-2"></a>

### `QUALIFY_PORT_2`

Posée par `npm run ops:qualify` pour `ops/qualify/compose.yml` : le troisième port local du proxy (8445 par défaut).

- Origine : posée par `npm run ops:qualify`.
- Lue par : [`ops/qualify/compose.yml`](../../ops/qualify/compose.yml).

<a name="qualify-port-3"></a>

### `QUALIFY_PORT_3`

Posée par `npm run ops:qualify` pour `ops/qualify/compose.yml` : le quatrième port local du proxy (8446 par défaut).

- Origine : posée par `npm run ops:qualify`.
- Lue par : [`ops/qualify/compose.yml`](../../ops/qualify/compose.yml).

<a name="qualify-secrets"></a>

### `QUALIFY_SECRETS`

Posée par `npm run ops:qualify` pour `ops/qualify/compose.yml` : le dossier du mot de passe de la base et de l’URL du stockage.

- Origine : posée par `npm run ops:qualify`.
- Lue par : [`ops/qualify/compose.yml`](../../ops/qualify/compose.yml).

<a name="qualify-uid"></a>

### `QUALIFY_UID`

Posée par `npm run ops:qualify` pour `ops/qualify/compose.yml` : l’identifiant d’utilisateur des conteneurs (1000 par défaut).

- Origine : posée par `npm run ops:qualify`.
- Lue par : [`ops/qualify/compose.yml`](../../ops/qualify/compose.yml), [`scripts/ops-qualify/backup.mjs`](../../scripts/ops-qualify/backup.mjs).

<a name="ship-pids"></a>

### `SHIP_PIDS`

Le dossier où `npm run ship` écrit ses identifiants de processus ; `.cache/pids` quand elle n’est pas posée.

- Origine : vous la posez ; le code la lit.
- Lue par : [`tools/release/lib.mjs`](../../tools/release/lib.mjs).

<a name="ship-trailers"></a>

### `SHIP_TRAILERS`

Des lignes de pied supplémentaires que `npm run ship` ajoute à un commit de fusion, après `Agent: Claude`.

- Origine : vous la posez ; le code la lit.
- Lue par : [`tools/release/ship.mjs`](../../tools/release/ship.mjs).

<a name="studio-test-s3"></a>

### `STUDIO_TEST_S3`

Le point d’accès S3, les identifiants et le bucket du stockage objet de la CI, en une URL, pour les tests du Studio hébergé.

- Origine : vous la posez ; le code la lit.
- Lue par : [`ops/studio/ci/s3-ready.ts`](../../ops/studio/ci/s3-ready.ts).

<a name="web-scumm-repo"></a>

### `WEB_SCUMM_REPO`

Le dépôt GitHub sur lequel travaillent les outils de publication ; `wanoo/quest-n-click` quand elle n’est pas posée.

- Origine : vous la posez ; le code la lit.
- Lue par : [`tools/release/lib.mjs`](../../tools/release/lib.mjs), [`tools/release/provenance.mjs`](../../tools/release/provenance.mjs).

<a name="wiki-deploy-key"></a>

### `WIKI_DEPLOY_KEY`

La clé de déploiement SSH qui pousse la documentation vers le wiki GitHub (`npm run wiki -- publish`) ; `GITHUB_TOKEN` sert sans elle.

- Origine : vous la posez ; le code la lit.
- Lue par : [`tools/wiki.ts`](../../tools/wiki.ts).

<a name="system"></a>

## Posées par le système, npm ou GitHub Actions

Personne ne les pose à la main : le système, npm, Vitest ou un runner GitHub s’en charge. Le code se contente de les lire.

<a name="github-actions"></a>

### `GITHUB_ACTIONS`

`true` sur un runner GitHub : les tests et les cliquets adaptent leur sortie et leurs limites.

- Origine : posée par GitHub Actions.
- Lue par : [`scripts/e2e-pwa.mjs`](../../scripts/e2e-pwa.mjs), [`scripts/e2e.mjs`](../../scripts/e2e.mjs), [`tools/coverage-ratchet.ts`](../../tools/coverage-ratchet.ts).

<a name="github-api-url"></a>

### `GITHUB_API_URL`

L’adresse de l’API GitHub sur un runner.

- Origine : posée par GitHub Actions.
- Lue par : [`tools/release/run-jobs.mjs`](../../tools/release/run-jobs.mjs).

<a name="github-step-summary"></a>

### `GITHUB_STEP_SUMMARY`

Le fichier où un job écrit son résumé ; `npm run ci:plan` y écrit le plan.

- Origine : posée par GitHub Actions.
- Lue par : [`tools/ci-plan.ts`](../../tools/ci-plan.ts).

<a name="imageos"></a>

### `ImageOS`

L’image du runner, notée à côté d’une mesure.

- Origine : posée par GitHub Actions.
- Lue par : [`tools/backup-memory.ts`](../../tools/backup-memory.ts), [`tools/load-median.ts`](../../tools/load-median.ts), [`tools/release/baseline.mjs`](../../tools/release/baseline.mjs).

<a name="path"></a>

### `PATH`

Le chemin de recherche du système. Le Studio Server et le worker la passent à leurs processus enfants, et rien d’autre de l’environnement.

- Origine : posée par le système d’exploitation.
- Lue par : [`bridge/src/runs.ts`](../../bridge/src/runs.ts), [`scripts/e2e-worker-container.ts`](../../scripts/e2e-worker-container.ts), [`scripts/studio-install-smoke.mjs`](../../scripts/studio-install-smoke.mjs), et 3 de plus.

<a name="runner-os"></a>

### `RUNNER_OS`

Le système du runner, noté à côté d’une mesure.

- Origine : posée par GitHub Actions.
- Lue par : [`tools/backup-memory.ts`](../../tools/backup-memory.ts), [`tools/load-median.ts`](../../tools/load-median.ts), [`tools/release/baseline.mjs`](../../tools/release/baseline.mjs).

<a name="systemroot"></a>

### `SystemRoot`

Le dossier de Windows ; les outils y trouvent `tar.exe`.

- Origine : posée par Windows.
- Lue par : [`scripts/lib/archive-harness.mjs`](../../scripts/lib/archive-harness.mjs), [`tools/field/field.ts`](../../tools/field/field.ts).

<a name="vitest"></a>

### `VITEST`

Posée pendant que Vitest tourne : le plugin du Studio local ne lance alors rien.

- Origine : posée par Vitest.
- Lue par : [`tools/studio/plugin.ts`](../../tools/studio/plugin.ts).

<a name="npm-lifecycle-event"></a>

### `npm_lifecycle_event`

Le script npm en cours ; un outil qui écrit le jeu l’enregistre comme auteur du changement.

- Origine : posée par npm.
- Lue par : [`tools/game-write.ts`](../../tools/game-write.ts).

<!-- env:end -->
