## The mouth-kit tools find the game folder in a project (#307)

Moving "Jack cherche un taf" (https://github.com/LostInBrittany/web-scumm-jack-cherche-un-taf) out of the engine
repository showed that `talk-kit.py` and `talk-apply.py` built every path as `games/{GAME}/…` from the current folder,
with `GAME` from the environment or `config.game`, while `tools/game.ts` and `tools/assets.py` already honour
`GAME_DIR` and `WEB_SCUMM_PROJECT`. A small module, `tools/game_folder.py` (`game_id()`, `game_dir()`), gives the
Python side the same answer: `$GAME_DIR`; `$WEB_SCUMM_PROJECT/game` (the `quest-n-click` command sets it); `./game/`
when `game/index.ts` is there (the tool run by hand from a project's folder); else `games/<id>/`, the id read like
`tools/game.ts` reads it (the `.cache/game` link included, which the talk tools ignored before). The CLI gains
`talk-kit`, `talk-apply` and `talk-normalize`, which run the package's scripts in the project's folder. `talk-apply.py`
checks its kit and reply before importing OpenCV, so the path checks of `tests/talk-tools.test.ts` run in CI (whose
requirements leave OpenCV out); pasting the mouths runs where `cv2` is installed. The wiki's two limits on the talk
tools are gone. `tools/cut-sheet.py` has its own copy of `game_id()` and could import this module.

→ next: `create-quest-n-click` could add `game/private/` to a new project's `.gitignore` (the wiki says to, by hand).
