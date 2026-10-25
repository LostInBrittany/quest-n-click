### Fixed

- **The art prompts name a created project's own paths**: in a project (`game/`, the engine in `node_modules`),
  `npx quest-n-click prompts`, the MCP tool `asset_prompts` and the Studio's prompts wrote the engine repository's
  paths (`games/<id>/private/sheets/`, `games/<id>/site.json`, `python3 tools/cut-sheet.py`, `npm run prompts`) and
  paths climbing out of the package (`../../../game/art/_reference.png`). Every path now starts from the project's
  folder: `game/art/_reference.png`, `game/private/sheets/<sheet>.png`,
  `python3 node_modules/@quest-n-click/engine/tools/cut-sheet.py …`, `npx quest-n-click assets`. The repository's
  `games/<id>/prompts.md` is unchanged. Found while moving "Jack cherche un taf" to a standalone project.
- **`cut-sheet.py` cuts into a project's `game/art` by default**: run from a project's folder (or through the
  `quest-n-click` command), it wrote into `games/<config.game>/art/`, where the game never reads, unless `--out
  game/art` was given. Its default output is now the game's own `art/`: `GAME_DIR`, else a project's `game/`, else
  `games/<GAME>/`.

### Changes

- **A new project's `.gitignore` lists `game/private`**: the raw sheets the art prompts save there stay out of git. In
  a project whose `.gitignore` lacks the line, `prompts.md` says to add it instead of calling the folder gitignored.
