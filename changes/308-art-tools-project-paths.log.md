## The art tools in a created project: prompts.md and cut-sheet.py find game/ (#308)

Found while moving "Jack cherche un taf" out of the engine repository into a project made by `@quest-n-click/create`:
its `game/prompts.md` sent the author to `games/jack/private/sheets/`, attached `../../../game/art/_reference.png` and
cut with `python3 tools/cut-sheet.py`, and the cutter, run as told, wrote into `games/jack/art/`.

Root cause: `buildPrompts` made its paths relative to `root`, which the CLI, the MCP and the Studio all set to the
engine's folder (`ROOT`, the installed package in a project), and hard-coded `games/${id}/` and `tools/`. The paths now
come from `gameDir` and from the folder the author works in (`workRoot`: the parent of `games/`, or the folder holding
`game/`; the CLI passes `WORK`), the tools' paths from the engine's folder relative to it, the commands from whether
the two differ (`npm run …` or `npx quest-n-click …`, the mouth kits through #307's `talk-kit` / `talk-apply`).
`cut-sheet.py` uses #307's `tools/game_folder.py`, one rule for the Python tools (`GAME_DIR`, `WEB_SCUMM_PROJECT`,
`game/index.ts` in the current folder even beside a stray `games/`, then `games/<GAME>`). Built on #307's branch. The
demo's `prompts.md` is byte-identical.

→ next: nothing for the art tools; `assets.py` still has its own copy of the rule, which could use `game_folder.py`.
