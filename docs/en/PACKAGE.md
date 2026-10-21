# The engine as a package

Since 3.9 a game does not have to live in this repository. The engine is packed as `quest-n-click` (the engine, its
pages, its tools and the `quest-n-click` command, the game template), `create-quest-n-click` (`npx create-quest-n-click`) and,
since 4.1.1, `quest-n-click-bridge` (the reference Reality Bridge, `docs/en/REALITY-OPS.md`).

Until 4.2.4 these were `web-scumm`, `create-web-scumm` and `web-scumm-bridge` (the project was called web-scumm, D47).
From 4.2.5 each release also ships them under their old names, the same files at the same version, and the old
commands and imports (`web-scumm dev`, `web-scumm/content`) still work, after a one-line notice, through 4.2.x; they
are removed in 4.3. UPGRADING §38 says how to switch.

## A new game

Until the packages are on npm, take the tarball a release attaches (`T=https://github.com/wanoo/quest-n-click/releases/download/v<version>/quest-n-click-<version>.tgz`):
`npx --package=$T quest-n-click create my-game "My Game" --engine=$T`. Once published:

```bash
npx create-quest-n-click my-game "My Game"     # or: npx quest-n-click create my-game "My Game"
cd my-game
npm install
npm run assets      # art/ and audio/ into public/assets (Python 3 with Pillow: pip install -r node_modules/quest-n-click/requirements.txt)
npm run dev         # open the URL on a phone, landscape; ?edit=start places things
```

The project:

| Path | What |
|---|---|
| `game/` | the game: `game.ts`, `rooms/`, `cast.ts`, `items.ts`, `rules.ts`, `layout/`, `locales/`, `art/`, `audio/`, `provenance.json` |
| `public/` | the page's icons, the full font; `public/assets` is written by `npm run assets` (not committed) |
| `dist/` | the build, with `licenses/` (`npm run build`) |
| `tsconfig.json` | `@engine/*` points into `node_modules/quest-n-click/src/engine` |

The template's art is a placeholder drawn from shapes (`tools/placeholder-art.py`): `provenance.json` says so, and a
release refuses it until each file is replaced and reviewed.

## Commands

`npx quest-n-click help` lists them. The project's `package.json` names the usual ones:

| Command | What |
|---|---|
| `quest-n-click dev` / `studio` | the game, the Studio |
| `quest-n-click assets` | art and audio into `public/assets` |
| `quest-n-click verify` | validate, solve, translations, lint, playtests |
| `quest-n-click doctor` | the prerequisites: Node and Chromium required; Python, ffmpeg and WebKit optional, said when missing (4.1.6) |
| `quest-n-click mcp` | the MCP server of this game, on stdio, for an assistant (4.1.6) |
| `quest-n-click build` | assets, verify, the build, every file of `dist/` accounted for (`docs/en/TOOLS.md`, "What the archive holds") |
| `quest-n-click release [--commercial]` | build, then the release gates: provenance lock, budgets, translations, voices, strict playtests, the proof |
| `quest-n-click validate`, `solve`, `lint`, `i18n`, `weight`, `provenance`, `playtests`, `voices`, `prompts` | each tool, with its options (`docs/en/TOOLS.md`) |
| `quest-n-click speedrun verify <run.wsrun>` | a speedrun replayed against the game: its verdict, code and reason (`docs/en/SPEEDRUN.md`) |
| `quest-n-click migrate` | bring the game's sources to the installed engine's format (`docs/en/UPGRADING.md`) |

They run with the project as their working folder (`WEB_SCUMM_PROJECT`): the engine in `node_modules/quest-n-click` is
read, never written.

## Upgrading

`npm install quest-n-click@<version>`, then `npx quest-n-click migrate`, then `npm run verify`. `docs/en/UPGRADING.md` says
what each version changes; `docs/en/SUPPORT.md` which versions are supported and how long a deprecation lasts.

## How it is checked

`npm run fresh-install` (a CI job): packs the engine (`npm run pack`), creates a game from the packed template in an
empty folder outside the repository, installs the tarball, runs `assets`, `verify` and `build`, and plays the game to
its ending in Chromium. A file of the new project that names the repository fails it. Each release attaches the three
tarballs; publishing them to npm is the maintainer's (a token, the package names).
