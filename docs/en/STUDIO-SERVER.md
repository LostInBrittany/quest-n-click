# Studio Server: one game, several people, online

The Studio Server puts a game's Studio online for a small team. Everyone logs in through an OpenID Connect provider
(Keycloak or another), works on the same game at the same time, and sees every change as it lands. It is the 4.2.x
line's work (plan `docs/dev/PLAN-4.2.1-4.2.3-STUDIO-SERVER.md`). Alone on your machine, `npm run studio` stays as
it was: none of this is needed.

> **Status (4.2.1, experimental).** The journal (no confirmed change is lost), logins and roles, the processing
> worker, spans and leases, the live stream, the game's own origin with its live preview, and the Studio's screens for
> all of this. It stays experimental until its people's passes (`studio-hosted`, `studio-collab`) are made. This guide
> deploys from the repository; the release archive `web-scumm-studio-server` is the same server (below).

## What runs where

```text
browsers ─HTTPS─▶ studio (Node app, one instance) ──signed jobs──▶ studio-worker (Node app, no secrets)
CLI, MCP ─Bearer─┘   │  public_url: the Studio and /api        ▲ presigned snapshot and result
                     │  play_url:   the game (another origin)  │
                     ├──▶ PostgreSQL: journal, members, sessions, leases
                     ├──▶ Cellar (S3): the files' contents, the worker's snapshots ─┘
                     └──▶ OpenID provider: who people are (never what they may do)
```

- **The game's files** live in Postgres (which version of each file) and Cellar (their contents). The app's disk
  is a cache: Clever Cloud's disk does not survive a restart, and nothing is lost when it goes.
- **The game's code never runs in the Studio**: validating it and reading it go to `studio-worker`, a second app that
  holds no password, key or database access (ADR 0028).
- **The game is played on another origin** (`playUrl`): its code cannot act with a member's Studio session.

## Deploying on Clever Cloud

You need: two Node.js applications, a PostgreSQL add-on, a Cellar add-on and bucket, and an OpenID provider (a
managed Keycloak add-on works). With `clever-tools`:

```sh
clever create --type node my-game-studio
clever create --type node my-game-worker
clever addon create postgresql-addon my-game-pg --plan dev      # 5 connections: tight (the server keeps 4); larger for a team
clever addon create cellar-addon my-game-cellar
clever service link-addon my-game-pg --app my-game-studio
clever service link-addon my-game-cellar --app my-game-studio
clever scale --min-instances 1 --max-instances 1 --app my-game-studio
```

Create the bucket in Cellar (its console, or any S3 tool). Only the studio app is linked to the add-ons: **never link
them to the worker.**

**The job keys.** On your machine, in an empty folder kept out of Git:

```sh
mkdir -p ~/secrets/my-game && npm run studio-server -- worker-keys --out ~/secrets/my-game
```

`studio-worker.key` (0600) is the Studio's; `studio-worker.pub` is the worker's.

**The studio app's variables:**

| Variable | Value |
|---|---|
| `CC_NODE_DEV_DEPENDENCIES` | `install` (4.2.1 runs from the repository with `tsx`) |
| `CC_POST_BUILD_HOOK` | `npm run studio-client` (builds the Studio's page the server serves) |
| `CC_RUN_COMMAND` | `npm run studio-server -- serve` |
| `CC_HEALTH_CHECK_PATH` | `/startz` |
| `STUDIO_CONFIG_JSON` | the configuration below, on one line |
| `STUDIO_OIDC_CLIENT_SECRET` | the provider's secret for the `studio` client |
| `STUDIO_SESSION_KEY` | 32 random characters or more (`openssl rand -base64 48`); several, comma-separated, to rotate |
| `STUDIO_WORKER_KEY` | the content of `studio-worker.key` (line breaks may be written `\n`) |

The database and Cellar credentials arrive from the add-ons (`POSTGRESQL_ADDON_URI`, `CELLAR_ADDON_KEY_ID`,
`CELLAR_ADDON_KEY_SECRET`). At start the server reads every secret and removes it from its environment. Outside
Clever, each can be a file instead: `STUDIO_SESSION_KEY_FILE`, and so on (mode 0600).

**The configuration** (`ops/studio/studio.config.example.json`):

```json
{
  "publicUrl": "https://studio.example.fr",
  "playUrl": "https://play.example.fr",
  "game": "my-game",
  "workDir": "/home/bas/work",
  "host": "0.0.0.0",
  "trustProxy": ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"],
  "store": { "kind": "postgres" },
  "blobs": { "kind": "s3", "host": "cellar-c2.services.clever-cloud.com", "bucket": "my-game-studio" },
  "oidc": { "issuer": "https://keycloak.example.fr/realms/web-scumm", "clientId": "studio", "audience": "studio-api", "cliClientId": "web-scumm-cli" },
  "worker": { "url": "https://worker.example.fr", "instance": "my-game-studio" }
}
```

- `publicUrl` and `playUrl` are two domains of the studio app (`clever domain add`). **Use two subdomains of your own
  domain** (`studio.example.fr`, `play.example.fr`): one site, so the game's frame keeps its session cookie in every
  browser. Two `*.cleverapps.io` names are two sites: the game's cookie then lives in a frame of another site only
  because it is partitioned (CHIPS). Chromium, Firefox and WebKit on macOS keep it (the hosted e2e). WebKit on Linux
  (GNOME Web) stores no cookie a frame of another host sets, even on one site: the game's frames stay empty there. A
  real Safari, on macOS and iOS, is the `studio-hosted` pass.
- `trustProxy`: the addresses of Clever's proxies, so that each person is told apart (the server refuses to start
  with OIDC and none). The private ranges above are an assumption, to be narrowed to Clever's actual proxies by the
  `studio-hosted` pass: an address in them could otherwise claim any `X-Forwarded-For`.
- No `port`: the server listens on the `PORT` Clever gives it (a `port` in the configuration would override it).
- `worker.instance`: any name; the worker runs no other Studio's jobs.
- `publicDir` (optional): the game's prepared images and sounds, `public/` of the deployed repository by default
  (`npm run assets` writes them there and they are committed). The Studio shows them to members and the live preview
  plays them; they are read only on a hosted Studio in 4.2.1.
- `clientDir` (optional): the built Studio, `.cache/studio-client` by default (`npm run studio-client`). With OIDC the
  server refuses to start without it.

**The worker app's variables:** `CC_NODE_DEV_DEPENDENCIES=install`, `CC_RUN_COMMAND=npm run studio-worker`,
`WORKER_PUBLIC_KEY` (the content of `studio-worker.pub`), `WORKER_INSTANCE` (the same name as `worker.instance`).
Give it a domain (`worker.url`).

**Deploy** both (`clever deploy`), then import the game once, and invite the first owner:

```sh
clever ssh --app my-game-studio
npm run studio-server -- import games/my-game
npm run studio-server -- invite --email you@example.fr --role owner
```

Whether the shell of `clever ssh` has the app's variables (here `STUDIO_CONFIG_JSON`) is checked by the
`studio-hosted` pass; otherwise run both commands once from a machine with the same variables. The invitation
prints a link: open it and log in with that verified email. `/readyz` answers 200 once the instance
serves writes.

## From the release archives

From 4.2.1 a release carries `web-scumm-studio-server-<version>.tgz`: the two commands `web-scumm-studio-server` and
`web-scumm-studio-worker`, the Studio's page already built, and its own dependencies (OpenID Connect, JWT, Postgres).
Their versions are locked in its `npm-shrinkwrap.json` and its SBOM; npm reads that lock when it installs from the
registry, not from an archive file, where `pg` takes the latest 8.x its range allows (`web-scumm-studio-server deps`
says which). It runs the server of the engine installed beside it, which must be the same version:

```sh
npm install web-scumm-4.2.1.tgz web-scumm-studio-server-4.2.1.tgz
npx web-scumm-studio-server import ./my-game --config studio.config.json
npx web-scumm-studio-server serve --config studio.config.json
npx web-scumm-studio-worker          # on the worker's machine, with WORKER_PUBLIC_KEY and WORKER_INSTANCE
```

The engine's archive brings Vite and tsx, which the live preview and the game's code need. Set `publicDir` to your
game's prepared assets (`public/` of your game's repository): the engine's own holds only its icons and font. Each
release's candidate installs these two archives in an empty folder and serves a game from them, its dependencies
found whether npm hoists or nests them (`scripts/studio-install-smoke.mjs`).

## The OpenID provider

The test realm `ops/studio/keycloak/realm.json` shows every setting. On any provider:

- **The `studio` client**: confidential, Authorization Code with PKCE S256, redirect URI `<publicUrl>/auth/callback`,
  post-logout redirect `<publicUrl>`, back-channel logout to `<publicUrl>/auth/backchannel` with the session id.
- **The `web-scumm-cli` client**: public, the device authorization grant.
- **An audience mapper** adding `studio-api` (the `audience` above) to the access tokens of `web-scumm-cli`. It must
  differ from the `studio` client's id: an id_token is never accepted as an access token.
- **Access tokens of 5 min.** Up to 15 if the configuration says so (`oidc.maxTokenSeconds`, 900 at most): a longer
  token is refused.

The provider says who someone is. What they may do is decided in the Studio.

## People and roles

| Role | May |
|---|---|
| `owner` | everything a dev may; members, roles, invitations, sessions, the audit; take a span over; the exclusive lease |
| `dev` | write the game, span by span |
| `reviewer` | read and play |

Nobody is a member by default: an invitation (7 days, used once, for a verified email) makes one. The last owner can
be neither removed nor demoted. Removing someone ends their access at their next request; their live streams close
within 5 s. When the provider disables an account, its sessions end within 15 min.

## Working together

- **Spans.** Every file of the game belongs to one span: a room (its code and its layout), a language, the story, the
  items, the cast, the rules, the voices, the assets, the notes, the rest (`meta`). Writing a file takes its span for
  2 min, renewed while you are active. Someone else's span refuses your write (423, with their name); your draft
  stays with you.
- **Live.** The Studio follows `GET /api/events`: every revision, who holds what, who is here.
- **Undo** is not available on a shared Studio yet (4.2.2).

## The command line

```sh
npm run studio-server -- login --server https://studio.example.fr   # the device flow: open the link, type the code
npm run studio-server -- token --server https://studio.example.fr   # an access token for scripts and the MCP
```

The tokens are kept in `~/.config/web-scumm/studio-tokens.json` (0600), and only sent over https.

## Trying it locally

`ops/studio/compose.yml` starts Postgres, MinIO and Keycloak with the test realm and one test user
(`lea@example.org`, password `lea-local-only`, email verified). It is a starting point, not a turnkey setup: with
OIDC you still need a configuration with `oidc.allowInsecure: true` (a provider over http), a MinIO bucket, a worker
(`npm run studio-worker`) and `trustProxy`. Docker is never required. The server also runs without OIDC, with
SQLite and a folder for the contents, on the loopback only.

## Known limits (4.2.1)

- One game per instance, one instance (the server takes a lease; a second one waits).
- The game in the Studio is a live preview, not frozen at a revision: per-revision previews come in 4.2.2.
- The Assets tab (uploads, sprite sheets, `prepare`) is not on a hosted Studio yet: the prepared images and sounds
  come with the deployment (`publicDir`), and are changed on a local Studio.
- A game frame left idle past its 15 min session shows nothing new: "Reload view" (or the Play tab) opens it again.
- Captures are not available on a hosted Studio.
- The Play tab shows the game with its DEV panel; the state inspector, the rule explainer and the replays beside it
  need the game on the Studio's origin, so the local Studio only.
- The Assistant is not on a hosted Studio yet.
- The Studio's editors do not yet send the revision of what they read (the journal checks it when sent): within a span
  you hold, your save replaces the file. Editors reload what others commit, so this matters only for an edit begun
  just before a span changed hands.
- The room editor's own Save does nothing on a hosted Studio: "Save layout" in the Studio saves (the editor's page is
  the game's, and only the member starts a write).
- A game that imports files outside its own folder cannot run on the worker.
