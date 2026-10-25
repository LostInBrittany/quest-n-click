### Fixed

- **The mouth-kit tools work in a created project** (#307): `tools/talk-kit.py` and `tools/talk-apply.py` read and
  wrote `games/<id>/…` only, so in a project made with `create-quest-n-click` they stopped at once on
  `games/<id>/talk-kits.json`. They now find the game's folder as the other tools do (`$GAME_DIR`, then a project's
  `game/`, then `games/<id>/` with the game `npm run game` selected), through a new `tools/game_folder.py`. In a project,
  `npx quest-n-click talk-kit [<character> …]`, `talk-apply <character>_<pose>` and `talk-normalize` run them; kits go
  to `game/private/talk_kits/`, frames to `game/art/talk_<character>/<pose>/`. A missing `talk-kits.json`, kit or reply
  is named in one line instead of a Python traceback. Found while moving "Jack cherche un taf" to a standalone project.
