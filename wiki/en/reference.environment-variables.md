# Environment variables

Every environment variable quest-n-click reads, and the ones Clever Cloud and its add-ons give the hosted Studio. Each
has its own section: link to it as `reference.environment-variables.md#studio-session-key` (the name in lowercase,
`_` written `-`).

<a name="how-to-read"></a>

## How to read this page

- **Origin** says who sets the variable: you (the code reads it), the build, the platform (Clever Cloud, GitHub
  Actions, npm, the system), or a Clever Cloud add-on. A variable that a command of quest-n-click sets itself says so:
  you do not set it.
- **Secret**: read once when the Studio Server starts, then removed from its environment, so no child process inherits
  it; never written to a log. Each secret can also come from a file: `STUDIO_SESSION_KEY_FILE=/run/secrets/session`
  reads the key from that file, which must be readable by its owner only (mode 0600) on Linux and macOS. The file wins
  over the variable.
- **Read by** links the files of the code that read it, at the documented version.
- On Clever Cloud, set a variable with `clever env set NAME value` on the right app; `clever env` prints multi-line
  values in full, so filter its output before you share it.

> [!LIMIT id=generated-scope]
> The sections below are generated from `wiki/data/env.json` and from the code: what `process.env`,
> `import.meta.env`, Python's `os.environ` and the shell scripts of `ops/` and `clevercloud/` read. A variable read
> only by a third-party library (the standard `OTEL_*`, `NODE_OPTIONS`, `PG*`) or only by a CI workflow file is not
> listed.

<!-- env:begin -->

<a name="studio-server"></a>

## Studio Server (hosted Studio)

What the `studio-server` app reads: on Clever Cloud, set them with `clever env set` on the studio app, never on the worker. Each secret can come from a file instead (`<NAME>_FILE`, mode 0600), and leaves the environment once read.

<a name="git-dir"></a>

### `GIT_DIR`

Not read from your environment: the Studio Server sets it for its own `git` commands on the game's repository, and removes it for `git init`.

- Origin: set by the Studio Server itself.
- Read by: [`studio-server/src/server/git.ts`](../../studio-server/src/server/git.ts).

<a name="studio-backup-cron"></a>

### `STUDIO_BACKUP_CRON`

`1` turns on the daily backup to the bucket that `clevercloud/cron.json` runs at 03:17 UTC (`ops/studio/backup-cron.sh`). Set it on the studio app only, never on the worker.

- Origin: you set it; the code reads it.
- Read by: [`ops/studio/backup-cron.sh`](../../ops/studio/backup-cron.sh).

<a name="studio-backup-keep"></a>

### `STUDIO_BACKUP_KEEP`

How many backups the daily backup keeps in the bucket (`--keep`); 14 when unset.

- Origin: you set it; the code reads it.
- Read by: [`ops/studio/backup-cron.sh`](../../ops/studio/backup-cron.sh).

<a name="studio-config"></a>

### `STUDIO_CONFIG`

The path of the configuration file, read when no `--config <file>` is given. It wins over `STUDIO_CONFIG_JSON`.

- Origin: you set it; the code reads it.
- Read by: [`studio-server/src/server/main.ts`](../../studio-server/src/server/main.ts).

<a name="studio-config-json"></a>

### `STUDIO_CONFIG_JSON`

The whole configuration as JSON on one line, for a platform that gives no file (Clever Cloud). It holds no secret; the loader refuses an unknown key.

- Origin: you set it; the code reads it.
- Read by: [`studio-server/src/server/main.ts`](../../studio-server/src/server/main.ts).

<a name="studio-database-url"></a>

### `STUDIO_DATABASE_URL`

The PostgreSQL connection URI (`store.kind: postgres`). On Clever Cloud, leave it unset: the linked add-on's `POSTGRESQL_ADDON_URI` is read instead. For a restore drill, point it at the drill's empty database, never at production.

- Origin: you set it; the code reads it.
- Secret: yes: read once at start, then removed from the environment; never logged.
- From a file: `STUDIO_DATABASE_URL_FILE` names a file to read it from instead (mode 0600 on Linux and macOS).
- Read by: [`studio-server/src/server/config.ts`](../../studio-server/src/server/config.ts).

<a name="studio-git-key"></a>

### `STUDIO_GIT_KEY`

Optional (4.2.3): the SSH deploy key of the game's Git repository (`git.remote`). Not needed for a public https remote.

- Origin: you set it; the code reads it.
- Secret: yes: read once at start, then removed from the environment; never logged.
- From a file: `STUDIO_GIT_KEY_FILE` names a file to read it from instead (mode 0600 on Linux and macOS).
- Read by: [`studio-server/src/server/config.ts`](../../studio-server/src/server/config.ts).

<a name="studio-metrics-token"></a>

### `STUDIO_METRICS_TOKEN`

Optional (4.2.3): the bearer token of `GET /metrics`, 32 characters or more. Without it there is no `/metrics` route (404).

- Origin: you set it; the code reads it.
- Secret: yes: read once at start, then removed from the environment; never logged.
- From a file: `STUDIO_METRICS_TOKEN_FILE` names a file to read it from instead (mode 0600 on Linux and macOS).
- Read by: [`studio-server/src/server/config.ts`](../../studio-server/src/server/config.ts).

<a name="studio-oidc-client-secret"></a>

### `STUDIO_OIDC_CLIENT_SECRET`

The OpenID provider's secret for the `studio` client. Required when the configuration has `oidc`.

- Origin: you set it; the code reads it.
- Secret: yes: read once at start, then removed from the environment; never logged.
- From a file: `STUDIO_OIDC_CLIENT_SECRET_FILE` names a file to read it from instead (mode 0600 on Linux and macOS).
- Read by: [`studio-server/src/server/config.ts`](../../studio-server/src/server/config.ts).

<a name="studio-s3-key-id"></a>

### `STUDIO_S3_KEY_ID`

The S3 (Cellar) access key id for the bucket (`blobs.kind: s3`). On Clever Cloud the add-on's `CELLAR_ADDON_KEY_ID` is read when it is unset.

- Origin: you set it; the code reads it.
- Secret: yes: read once at start, then removed from the environment; never logged.
- From a file: `STUDIO_S3_KEY_ID_FILE` names a file to read it from instead (mode 0600 on Linux and macOS).
- Read by: [`studio-server/src/server/config.ts`](../../studio-server/src/server/config.ts).

<a name="studio-s3-key-secret"></a>

### `STUDIO_S3_KEY_SECRET`

The S3 (Cellar) secret key for the bucket. On Clever Cloud the add-on's `CELLAR_ADDON_KEY_SECRET` is read when it is unset.

- Origin: you set it; the code reads it.
- Secret: yes: read once at start, then removed from the environment; never logged.
- From a file: `STUDIO_S3_KEY_SECRET_FILE` names a file to read it from instead (mode 0600 on Linux and macOS).
- Read by: [`studio-server/src/server/config.ts`](../../studio-server/src/server/config.ts).

<a name="studio-session-key"></a>

### `STUDIO_SESSION_KEY`

The keys that seal the members' session cookies: one key, or several separated by commas, each 32 characters or more (`openssl rand -base64 48`). The first key seals; every key listed opens. To rotate, put the new key first and keep the old one listed until the sessions it sealed have expired; dropping a key logs out the sessions sealed with it. Required with `oidc`.

- Origin: you set it; the code reads it.
- Secret: yes: read once at start, then removed from the environment; never logged.
- From a file: `STUDIO_SESSION_KEY_FILE` names a file to read it from instead (mode 0600 on Linux and macOS).
- Read by: [`studio-server/src/server/config.ts`](../../studio-server/src/server/config.ts).

<a name="studio-worker-key"></a>

### `STUDIO_WORKER_KEY`

The Ed25519 private key (PEM) that signs the jobs sent to the worker; line breaks may be written `\n`. Made by `npm run studio-server -- worker-keys --out <folder>`. Required with a worker.

- Origin: you set it; the code reads it.
- Secret: yes: read once at start, then removed from the environment; never logged.
- From a file: `STUDIO_WORKER_KEY_FILE` names a file to read it from instead (mode 0600 on Linux and macOS).
- Read by: [`studio-server/src/server/config.ts`](../../studio-server/src/server/config.ts).

<a name="web-scumm-studio-client"></a>

### `WEB_SCUMM_STUDIO_CLIENT`

The folder of the built Studio page the server serves, when the configuration has no `clientDir`; `.cache/studio-client` beside the engine by default. The release archive's launcher sets it.

- Origin: you set it; the code reads it.
- Read by: [`scripts/pack.mjs`](../../scripts/pack.mjs), [`studio-server/src/server/main.ts`](../../studio-server/src/server/main.ts).

<a name="studio-worker"></a>

## Studio worker

What the processing worker (`npm run studio-worker`) reads. The worker holds no secret: only the public key that checks the jobs the Studio signs.

<a name="worker-instance"></a>

### `WORKER_INSTANCE`

The name of the one Studio whose jobs this worker runs: the same as `worker.instance` in the Studio's configuration.

- Origin: you set it; the code reads it.
- Read by: [`studio-server/src/worker/main.ts`](../../studio-server/src/worker/main.ts).

<a name="worker-public-key"></a>

### `WORKER_PUBLIC_KEY`

The Ed25519 public key (PEM) that checks the Studio's signed jobs: the content of `studio-worker.pub`.

- Origin: you set it; the code reads it.
- Read by: [`studio-server/src/worker/main.ts`](../../studio-server/src/worker/main.ts).

<a name="worker-public-key-file"></a>

### `WORKER_PUBLIC_KEY_FILE`

A file holding the public key, read in place of `WORKER_PUBLIC_KEY` when set.

- Origin: you set it; the code reads it.
- Read by: [`studio-server/src/worker/main.ts`](../../studio-server/src/worker/main.ts).

<a name="worker-python-path"></a>

### `WORKER_PYTHON_PATH`

Where the build hook installed the asset tools' Python packages; `.python` in the worker's folder when unset.

- Origin: you set it; the code reads it.
- Read by: [`studio-server/src/worker/prepare.ts`](../../studio-server/src/worker/prepare.ts).

<a name="clever-cloud"></a>

## Set by Clever Cloud and its add-ons

Clever Cloud gives these to an app, or reads them itself to build and run it. The add-ons' variables reach the studio app only when the add-on is linked to it.

<a name="app-folder"></a>

### `APP_FOLDER`

Leave it unset: both apps build from the repository's root. An app that held another project may still have one (`clever env rm APP_FOLDER`).

- Origin: set by you; Clever Cloud reads it.
- Read by: no file of the code; the platform reads it.

<a name="app-home"></a>

### `APP_HOME`

The app's folder on the instance; the daily backup runs from it (`cd "$APP_HOME"` in a `clever ssh` session too).

- Origin: set by Clever Cloud.
- Read by: [`ops/studio/backup-cron.sh`](../../ops/studio/backup-cron.sh).

<a name="cc-health-check-path"></a>

### `CC_HEALTH_CHECK_PATH`

The path Clever Cloud probes before it sends traffic to a new instance: `/startz` on the studio app.

- Origin: set by you; Clever Cloud reads it.
- Read by: no file of the code; the platform reads it.

<a name="cc-node-dev-dependencies"></a>

### `CC_NODE_DEV_DEPENDENCIES`

Set it to `install` on both apps: the server runs from the repository with `tsx`, a development dependency.

- Origin: set by you; Clever Cloud reads it.
- Read by: no file of the code; the platform reads it.

<a name="cc-post-build-hook"></a>

### `CC_POST_BUILD_HOOK`

A command Clever Cloud runs after the build: `npm run studio-client` on the studio app; the worker's installs the Python packages from `ops/studio/worker-requirements.lock`.

- Origin: set by you; Clever Cloud reads it.
- Read by: no file of the code; the platform reads it.

<a name="cc-run-command"></a>

### `CC_RUN_COMMAND`

The command that starts the app: `npm run studio-server -- serve` on the studio app, `npm run studio-worker` on the worker.

- Origin: set by you; Clever Cloud reads it.
- Read by: no file of the code; the platform reads it.

<a name="cellar-addon-key-id"></a>

### `CELLAR_ADDON_KEY_ID`

The Cellar add-on's access key id, read when `STUDIO_S3_KEY_ID` is not set.

- Origin: injected by the Clever Cloud Cellar add-on.
- Secret: yes: read once at start, then removed from the environment; never logged.
- Read in place of `STUDIO_S3_KEY_ID` when `STUDIO_S3_KEY_ID` is not set.
- Read by: [`studio-server/src/server/config.ts`](../../studio-server/src/server/config.ts).

<a name="cellar-addon-key-secret"></a>

### `CELLAR_ADDON_KEY_SECRET`

The Cellar add-on's secret key, read when `STUDIO_S3_KEY_SECRET` is not set.

- Origin: injected by the Clever Cloud Cellar add-on.
- Secret: yes: read once at start, then removed from the environment; never logged.
- Read in place of `STUDIO_S3_KEY_SECRET` when `STUDIO_S3_KEY_SECRET` is not set.
- Read by: [`studio-server/src/server/config.ts`](../../studio-server/src/server/config.ts).

<a name="instance-number"></a>

### `INSTANCE_NUMBER`

The number of the app's instance. The daily backup runs only on instance `0`, so two instances never both back up.

- Origin: set by Clever Cloud.
- Read by: [`ops/studio/backup-cron.sh`](../../ops/studio/backup-cron.sh).

<a name="port"></a>

### `PORT`

The port to listen on. Clever Cloud gives it to the studio and worker apps; elsewhere 8080 when unset. A `port` in the Studio's configuration wins over it.

- Origin: set by the host (Clever Cloud gives it).
- Read by: [`scripts/start.mjs`](../../scripts/start.mjs), [`studio-server/src/server/config.ts`](../../studio-server/src/server/config.ts), [`studio-server/src/worker/main.ts`](../../studio-server/src/worker/main.ts).

<a name="postgresql-addon-uri"></a>

### `POSTGRESQL_ADDON_URI`

The PostgreSQL add-on's connection URI. The Studio Server reads it when `STUDIO_DATABASE_URL` is not set.

- Origin: injected by the Clever Cloud PostgreSQL add-on.
- Secret: yes: read once at start, then removed from the environment; never logged.
- Read in place of `STUDIO_DATABASE_URL` when `STUDIO_DATABASE_URL` is not set.
- Read by: [`studio-server/src/server/config.ts`](../../studio-server/src/server/config.ts).

<a name="root"></a>

### `ROOT`

The app's folder, used by `clevercloud/cron.json` (crons need absolute paths) and by the backup script when `APP_HOME` is missing.

- Origin: set by Clever Cloud.
- Read by: [`clevercloud/cron.json`](../../clevercloud/cron.json), [`ops/studio/backup-cron.sh`](../../ops/studio/backup-cron.sh).

<a name="local-tools"></a>

## Engine, local Studio and tools

Read by the engine's commands, the local Studio and its MCP server, in the engine repository or in a created project.

<a name="assets-dir"></a>

### `ASSETS_DIR`

The folder of the built assets that ship, in place of `public/assets` (a test fixture's own files).

- Origin: you set it; the code reads it.
- Read by: [`tools/game.ts`](../../tools/game.ts).

<a name="dist-dir"></a>

### `DIST_DIR`

The built folder `npm run weight` measures; `dist` when unset.

- Origin: you set it; the code reads it.
- Read by: [`tools/weight.ts`](../../tools/weight.ts).

<a name="furnace-bin"></a>

### `FURNACE_BIN`

The path of the Furnace executable the audio pipeline renders with, when it is not where `python -m mdpipe setup` put it.

- Origin: you set it; the code reads it.
- Read by: [`tools/audio/mdpipe/render.py`](../../tools/audio/mdpipe/render.py).

<a name="game"></a>

### `GAME`

Which game of `games/` the engine repository's commands work on (`GAME=reference npm run validate`). Without it, the game last selected (`npm run game -- <id>`), then `config.game` of `package.json`, then `demo`.

- Origin: you set it; the code reads it.
- Read by: [`scripts/e2e-studio.mjs`](../../scripts/e2e-studio.mjs), [`scripts/e2e-visual.mjs`](../../scripts/e2e-visual.mjs), [`scripts/e2e.mjs`](../../scripts/e2e.mjs), and 7 more.

<a name="game-dir"></a>

### `GAME_DIR`

A game folder anywhere on disk, in place of `games/<GAME>`; ignored when `GAME` is set.

- Origin: you set it; the code reads it.
- Read by: [`scripts/e2e-worker-container.ts`](../../scripts/e2e-worker-container.ts), [`scripts/ops-qualify/setup.mjs`](../../scripts/ops-qualify/setup.mjs), [`tools/assets.py`](../../tools/assets.py), and 3 more.

<a name="proof-cache"></a>

### `PROOF_CACHE`

`0` turns the solver's result cache off for one run (like `--no-cache`).

- Origin: you set it; the code reads it.
- Read by: [`tools/proof-cache.ts`](../../tools/proof-cache.ts).

<a name="proof-cache-dir"></a>

### `PROOF_CACHE_DIR`

Where the solver's result cache lives; `.cache/proofs` of the project when unset.

- Origin: you set it; the code reads it.
- Read by: [`tools/proof-cache.ts`](../../tools/proof-cache.ts).

<a name="python"></a>

### `PYTHON`

The Python interpreter `quest-n-click assets` runs; `python3` when unset.

- Origin: you set it; the code reads it.
- Read by: [`cli/quest-n-click.mjs`](../../cli/quest-n-click.mjs).

<a name="web-scumm-allow-custom-provider"></a>

### `WEB_SCUMM_ALLOW_CUSTOM_PROVIDER`

`1` lets the Studio's Assistant call a provider URL you type yourself; refused otherwise.

- Origin: you set it; the code reads it.
- Read by: [`tools/studio/assistant.ts`](../../tools/studio/assistant.ts).

<a name="web-scumm-dev-url"></a>

### `WEB_SCUMM_DEV_URL`

The dev server the MCP `screenshot` tool opens; `http://localhost:5173/` when unset.

- Origin: you set it; the code reads it.
- Read by: [`tools/mcp/server.ts`](../../tools/mcp/server.ts).

<a name="web-scumm-lan"></a>

### `WEB_SCUMM_LAN`

`1` makes the dev server and the local Studio listen on the local network, behind a token. `npm run dev:lan` and `studio:lan` set it.

- Origin: set by `npm run dev:lan` and `studio:lan`.
- Read by: [`tools/studio/security.ts`](../../tools/studio/security.ts), [`vite.config.ts`](../../vite.config.ts).

<a name="web-scumm-project"></a>

### `WEB_SCUMM_PROJECT`

The created project the engine's tools work on. The `quest-n-click` command sets it to the folder it runs in; you do not set it yourself.

- Origin: set by the `quest-n-click` command.
- Read by: [`tools/assets.py`](../../tools/assets.py), [`tools/game.ts`](../../tools/game.ts).

<a name="web-scumm-studio-hosts"></a>

### `WEB_SCUMM_STUDIO_HOSTS`

The host names the local Studio answers to in LAN mode, comma-separated; any other `Host` is refused. `studio:lan` sets it from the machine's addresses.

- Origin: set by `npm run dev:lan` and `studio:lan`.
- Read by: [`tools/studio/security.ts`](../../tools/studio/security.ts).

<a name="web-scumm-studio-token"></a>

### `WEB_SCUMM_STUDIO_TOKEN`

The token the local Studio asks for in LAN mode. `studio:lan` draws one at random unless you set it.

- Origin: you set it; the code reads it.
- Read by: [`tools/serve-args.ts`](../../tools/serve-args.ts), [`tools/studio/security.ts`](../../tools/studio/security.ts).

<a name="build"></a>

## Building the pages

Read when Vite builds the game, the Studio or a preview. The npm scripts set most of them; `VITE_*`, `BASE_URL` and `DEV` end up inside the built page.

<a name="base-path"></a>

### `BASE_PATH`

The sub-path the game is served under (`/<repo>/` on GitHub Pages); `/` when unset.

- Origin: read when the page or the package is built.
- Read by: [`tools/vite/plugins.ts`](../../tools/vite/plugins.ts).

<a name="base-url"></a>

### `BASE_URL`

The base the page was built for, from `BASE_PATH`.

- Origin: set by Vite (read when the page or the package is built).
- Read by: [`src/main.ts`](../../src/main.ts), [`src/studio/api.ts`](../../src/studio/api.ts), [`src/studio/game-origin.ts`](../../src/studio/game-origin.ts).

<a name="dev"></a>

### `DEV`

True under the dev server (`npm run dev`), false in a build.

- Origin: set by Vite (read when the page or the package is built).
- Read by: [`src/main.ts`](../../src/main.ts).

<a name="studio"></a>

### `STUDIO`

`1` builds or serves the Studio's pages beside the game (`npm run studio`, the demo Studio).

- Origin: set by the npm scripts (read when the page or the package is built).
- Read by: [`tools/vite/plugins.ts`](../../tools/vite/plugins.ts), [`vite.config.ts`](../../vite.config.ts).

<a name="studio-client"></a>

### `STUDIO_CLIENT`

`1` builds the hosted Studio's page only (`npm run studio-client`).

- Origin: set by `npm run studio-client` (read when the page or the package is built).
- Read by: [`vite.config.ts`](../../vite.config.ts).

<a name="vite-studio-demo"></a>

### `VITE_STUDIO_DEMO`

`1` builds the demo Studio, which runs in the browser with no server (`npm run build:studio-demo`).

- Origin: set by `npm run build:studio-demo` (read when the page or the package is built).
- Read by: [`src/engine/dev/editor.ts`](../../src/engine/dev/editor.ts), [`src/main.ts`](../../src/main.ts), [`src/studio/main.ts`](../../src/studio/main.ts).

<a name="vite-studio-hosted"></a>

### `VITE_STUDIO_HOSTED`

`1` builds the Studio for a Studio Server (`npm run studio-client`).

- Origin: set by `npm run studio-client` (read when the page or the package is built).
- Read by: [`src/studio/main.ts`](../../src/studio/main.ts).

<a name="vite-studio-preview"></a>

### `VITE_STUDIO_PREVIEW`

`1` in a revision's preview, which the worker builds with the editing tools in; `0` in a published build.

- Origin: set by the Studio worker (read when the page or the package is built).
- Read by: [`src/main.ts`](../../src/main.ts), [`studio-server/src/worker/preview-build.ts`](../../studio-server/src/worker/preview-build.ts).

<a name="bridge"></a>

## Reality Bridge

Read by `quest-n-click-bridge` (or `npm run bridge` in the engine repository).

<a name="bridge-store"></a>

### `BRIDGE_STORE`

The Bridge's store when no `--store=` is given: `jsonl`, `sqlite`, `sqlite:<file>` or a `postgres://` URL. It wins over `store` in `config.json`.

- Origin: you set it; the code reads it.
- Read by: [`bridge/src/cli-store.ts`](../../bridge/src/cli-store.ts), [`tools/load-report.ts`](../../tools/load-report.ts).

<a name="bridge-store-file"></a>

### `BRIDGE_STORE_FILE`

A file holding the store's URL, read when `BRIDGE_STORE` is empty, so a database password is mounted as a secret file and never shows in a process listing.

- Origin: you set it; the code reads it.
- Read by: [`bridge/src/cli-store.ts`](../../bridge/src/cli-store.ts).

<a name="otel-exporter-otlp-endpoint"></a>

### `OTEL_EXPORTER_OTLP_ENDPOINT`

Where the Bridge exports its measures over OTLP, when `@opentelemetry/sdk-node` is installed beside it; nothing is exported otherwise. The SDK reads the other standard `OTEL_*` variables itself.

- Origin: you set it; the code reads it.
- Read by: [`bridge/src/telemetry.ts`](../../bridge/src/telemetry.ts).

<a name="contributing"></a>

## Tests, CI and releases of the engine

Read by the engine repository's test, CI and release scripts only. A created project never needs them.

<a name="bridge-pg-module"></a>

### `BRIDGE_PG_MODULE`

The `pg` module `tools/backup-memory.ts` imports, when it is not the repository's own.

- Origin: you set it; the code reads it.
- Read by: [`tools/backup-memory.ts`](../../tools/backup-memory.ts).

<a name="bridge-pg-url"></a>

### `BRIDGE_PG_URL`

A PostgreSQL URL the tests run the Bridge's store and the mutation runs against; those tests are skipped without it.

- Origin: you set it; the code reads it.
- Read by: [`tools/mutate.ts`](../../tools/mutate.ts).

<a name="consumer-pg-url"></a>

### `CONSUMER_PG_URL`

A PostgreSQL URL `npm run external-consumer` also runs the installed Bridge against.

- Origin: you set it; the code reads it.
- Read by: [`scripts/external-consumer.mjs`](../../scripts/external-consumer.mjs).

<a name="e2e-browser"></a>

### `E2E_BROWSER`

The browser an end-to-end test runs in (`chromium`, `firefox`, `webkit`); Chromium when unset.

- Origin: you set it; the code reads it.
- Read by: [`scripts/e2e-a11y.mjs`](../../scripts/e2e-a11y.mjs), [`scripts/e2e-pwa.mjs`](../../scripts/e2e-pwa.mjs), [`scripts/e2e.mjs`](../../scripts/e2e.mjs), and 1 more.

<a name="e2e-cpu"></a>

### `E2E_CPU`

A CPU slow-down factor for the end-to-end tests in Chromium (`4` runs four times slower).

- Origin: you set it; the code reads it.
- Read by: [`scripts/e2e/lib.mjs`](../../scripts/e2e/lib.mjs).

<a name="e2e-debug"></a>

### `E2E_DEBUG`

Any value makes the hosted Studio's end-to-end test print what it does.

- Origin: you set it; the code reads it.
- Read by: [`scripts/e2e-studio-hosted.ts`](../../scripts/e2e-studio-hosted.ts).

<a name="e2e-input"></a>

### `E2E_INPUT`

`keyboard` plays the end-to-end walkthrough with the keyboard instead of taps.

- Origin: you set it; the code reads it.
- Read by: [`scripts/e2e/lib.mjs`](../../scripts/e2e/lib.mjs).

<a name="e2e-out"></a>

### `E2E_OUT`

Where an end-to-end test writes its screenshots and reports.

- Origin: you set it; the code reads it.
- Read by: [`scripts/e2e-a11y.mjs`](../../scripts/e2e-a11y.mjs), [`scripts/e2e/lib.mjs`](../../scripts/e2e/lib.mjs).

<a name="e2e-weight-debug"></a>

### `E2E_WEIGHT_DEBUG`

Any value makes `e2e:weight` print the requests it counted.

- Origin: you set it; the code reads it.
- Read by: [`scripts/e2e-weight.mjs`](../../scripts/e2e-weight.mjs).

<a name="gh-token"></a>

### `GH_TOKEN`

The GitHub token of the `gh` command, read when `GITHUB_TOKEN` is not set.

- Origin: you set it; the code reads it.
- Read by: [`tools/release/run-jobs.mjs`](../../tools/release/run-jobs.mjs), [`tools/wiki.ts`](../../tools/wiki.ts).

<a name="github-token"></a>

### `GITHUB_TOKEN`

A GitHub token for the release and documentation tools. On a runner GitHub Actions gives it; on your machine `gh` usually provides `GH_TOKEN` instead.

- Origin: you set it; the code reads it.
- Read by: [`tools/release/run-jobs.mjs`](../../tools/release/run-jobs.mjs), [`tools/wiki.ts`](../../tools/wiki.ts).

<a name="mutation-set"></a>

### `MUTATION_SET`

The set of tests a mutant is judged by (`core`, `reality`…); `core` when unset. `npm run test:mutation:*` sets it.

- Origin: you set it; the code reads it.
- Read by: [`vitest.mutation.config.ts`](../../vitest.mutation.config.ts).

<a name="needs"></a>

### `NEEDS`

The results of a workflow's jobs, as JSON, that the candidate's verdict reads. The workflow sets it.

- Origin: you set it; the code reads it.
- Read by: [`tools/release/candidate.mjs`](../../tools/release/candidate.mjs).

<a name="qualify-app"></a>

### `QUALIFY_APP`

Set by `npm run ops:qualify` for `ops/qualify/compose.yml`: the committed tree the speedrun worker reads.

- Origin: set by `npm run ops:qualify`.
- Read by: [`ops/qualify/compose.yml`](../../ops/qualify/compose.yml).

<a name="qualify-build"></a>

### `QUALIFY_BUILD`

Set by `npm run ops:qualify` for `ops/qualify/compose.yml`: the folder of the Bridge image's build context.

- Origin: set by `npm run ops:qualify`.
- Read by: [`ops/qualify/compose.yml`](../../ops/qualify/compose.yml).

<a name="qualify-data"></a>

### `QUALIFY_DATA`

Set by `npm run ops:qualify` for `ops/qualify/compose.yml`: the folder of the two tenants' data.

- Origin: set by `npm run ops:qualify`.
- Read by: [`ops/qualify/compose.yml`](../../ops/qualify/compose.yml).

<a name="qualify-gid"></a>

### `QUALIFY_GID`

Set by `npm run ops:qualify` for `ops/qualify/compose.yml`: the group id the containers run as (1000 by default).

- Origin: set by `npm run ops:qualify`.
- Read by: [`ops/qualify/compose.yml`](../../ops/qualify/compose.yml), [`scripts/ops-qualify/backup.mjs`](../../scripts/ops-qualify/backup.mjs).

<a name="qualify-modules"></a>

### `QUALIFY_MODULES`

Set by `npm run ops:qualify` for `ops/qualify/compose.yml`: the installed modules mounted beside it.

- Origin: set by `npm run ops:qualify`.
- Read by: [`ops/qualify/compose.yml`](../../ops/qualify/compose.yml).

<a name="qualify-port"></a>

### `QUALIFY_PORT`

Set by `npm run ops:qualify` for `ops/qualify/compose.yml`: the local port of the proxy (8443 by default).

- Origin: set by `npm run ops:qualify`.
- Read by: [`ops/qualify/compose.yml`](../../ops/qualify/compose.yml).

<a name="qualify-port-1"></a>

### `QUALIFY_PORT_1`

Set by `npm run ops:qualify` for `ops/qualify/compose.yml`: the proxy's second local port (8444 by default).

- Origin: set by `npm run ops:qualify`.
- Read by: [`ops/qualify/compose.yml`](../../ops/qualify/compose.yml).

<a name="qualify-port-2"></a>

### `QUALIFY_PORT_2`

Set by `npm run ops:qualify` for `ops/qualify/compose.yml`: the proxy's third local port (8445 by default).

- Origin: set by `npm run ops:qualify`.
- Read by: [`ops/qualify/compose.yml`](../../ops/qualify/compose.yml).

<a name="qualify-port-3"></a>

### `QUALIFY_PORT_3`

Set by `npm run ops:qualify` for `ops/qualify/compose.yml`: the proxy's fourth local port (8446 by default).

- Origin: set by `npm run ops:qualify`.
- Read by: [`ops/qualify/compose.yml`](../../ops/qualify/compose.yml).

<a name="qualify-secrets"></a>

### `QUALIFY_SECRETS`

Set by `npm run ops:qualify` for `ops/qualify/compose.yml`: the folder of the database password and the store's URL.

- Origin: set by `npm run ops:qualify`.
- Read by: [`ops/qualify/compose.yml`](../../ops/qualify/compose.yml).

<a name="qualify-uid"></a>

### `QUALIFY_UID`

Set by `npm run ops:qualify` for `ops/qualify/compose.yml`: the user id the containers run as (1000 by default).

- Origin: set by `npm run ops:qualify`.
- Read by: [`ops/qualify/compose.yml`](../../ops/qualify/compose.yml), [`scripts/ops-qualify/backup.mjs`](../../scripts/ops-qualify/backup.mjs).

<a name="ship-pids"></a>

### `SHIP_PIDS`

The folder where `npm run ship` writes its process ids; `.cache/pids` when unset.

- Origin: you set it; the code reads it.
- Read by: [`tools/release/lib.mjs`](../../tools/release/lib.mjs).

<a name="ship-trailers"></a>

### `SHIP_TRAILERS`

Extra trailer lines `npm run ship` adds to a merge commit, after `Agent: Claude`.

- Origin: you set it; the code reads it.
- Read by: [`tools/release/ship.mjs`](../../tools/release/ship.mjs).

<a name="studio-test-s3"></a>

### `STUDIO_TEST_S3`

The S3 endpoint, credentials and bucket of the CI's object store, as one URL, for the hosted Studio's tests.

- Origin: you set it; the code reads it.
- Read by: [`ops/studio/ci/s3-ready.ts`](../../ops/studio/ci/s3-ready.ts).

<a name="web-scumm-repo"></a>

### `WEB_SCUMM_REPO`

The GitHub repository the release tools work on; `wanoo/quest-n-click` when unset.

- Origin: you set it; the code reads it.
- Read by: [`tools/release/lib.mjs`](../../tools/release/lib.mjs), [`tools/release/provenance.mjs`](../../tools/release/provenance.mjs).

<a name="wiki-deploy-key"></a>

### `WIKI_DEPLOY_KEY`

The SSH deploy key that pushes the documentation to the GitHub wiki (`npm run wiki -- publish`); `GITHUB_TOKEN` is used without it.

- Origin: you set it; the code reads it.
- Read by: [`tools/wiki.ts`](../../tools/wiki.ts).

<a name="system"></a>

## Set by the system, npm or GitHub Actions

Nobody sets these by hand: the operating system, npm, Vitest or a GitHub runner does. The code only reads them.

<a name="github-actions"></a>

### `GITHUB_ACTIONS`

`true` on a GitHub runner: the tests and ratchets adapt their output and their limits.

- Origin: set by GitHub Actions.
- Read by: [`scripts/e2e-pwa.mjs`](../../scripts/e2e-pwa.mjs), [`scripts/e2e.mjs`](../../scripts/e2e.mjs), [`tools/coverage-ratchet.ts`](../../tools/coverage-ratchet.ts).

<a name="github-api-url"></a>

### `GITHUB_API_URL`

The GitHub API's address on a runner.

- Origin: set by GitHub Actions.
- Read by: [`tools/release/run-jobs.mjs`](../../tools/release/run-jobs.mjs).

<a name="github-step-summary"></a>

### `GITHUB_STEP_SUMMARY`

The file a job writes its summary to; `npm run ci:plan` writes the plan there.

- Origin: set by GitHub Actions.
- Read by: [`tools/ci-plan.ts`](../../tools/ci-plan.ts).

<a name="imageos"></a>

### `ImageOS`

The runner's image, recorded beside a measurement.

- Origin: set by GitHub Actions.
- Read by: [`tools/backup-memory.ts`](../../tools/backup-memory.ts), [`tools/load-median.ts`](../../tools/load-median.ts), [`tools/release/baseline.mjs`](../../tools/release/baseline.mjs).

<a name="path"></a>

### `PATH`

The system's search path. The Studio Server and the worker pass it to their child processes, and nothing else of the environment.

- Origin: set by the operating system.
- Read by: [`bridge/src/runs.ts`](../../bridge/src/runs.ts), [`scripts/e2e-worker-container.ts`](../../scripts/e2e-worker-container.ts), [`scripts/studio-install-smoke.mjs`](../../scripts/studio-install-smoke.mjs), and 3 more.

<a name="runner-os"></a>

### `RUNNER_OS`

The runner's system, recorded beside a measurement.

- Origin: set by GitHub Actions.
- Read by: [`tools/backup-memory.ts`](../../tools/backup-memory.ts), [`tools/load-median.ts`](../../tools/load-median.ts), [`tools/release/baseline.mjs`](../../tools/release/baseline.mjs).

<a name="systemroot"></a>

### `SystemRoot`

The Windows folder; the tools find `tar.exe` under it.

- Origin: set by Windows.
- Read by: [`scripts/lib/archive-harness.mjs`](../../scripts/lib/archive-harness.mjs), [`tools/field/field.ts`](../../tools/field/field.ts).

<a name="vitest"></a>

### `VITEST`

Set while Vitest runs: the local Studio's plugin then starts nothing.

- Origin: set by Vitest.
- Read by: [`tools/studio/plugin.ts`](../../tools/studio/plugin.ts).

<a name="npm-lifecycle-event"></a>

### `npm_lifecycle_event`

The npm script that is running; a tool that writes the game records it as the author of the change.

- Origin: set by npm.
- Read by: [`tools/game-write.ts`](../../tools/game-write.ts).

<!-- env:end -->
