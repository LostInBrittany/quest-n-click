"""Where the current game's folder is, for the Python tools (the same answer as tools/game.ts).

- $GAME_DIR, when set: that folder (a test fixture, a game kept elsewhere);
- in a created project: its game/ folder. The `quest-n-click` command sets $WEB_SCUMM_PROJECT to the project; run by
  hand from the project's folder (python3 node_modules/@quest-n-click/engine/tools/<tool>.py), ./game/index.ts says so;
- in the engine repository: games/<id>/, the id from $GAME, the game `.cache/game` links to (npm run game), package.json's
  "config": { "game" }, else "demo".

Paths are relative to the current folder, as the tools have always read them.
"""
import json
import os


def game_id():
    """The current game's id in the engine repository: $GAME, the `.cache/game` link, package.json's config.game, demo."""
    g = os.environ.get('GAME', '').strip()
    if g:
        return g
    try:
        g = os.path.basename(os.readlink(os.path.join('.cache', 'game')).rstrip('/\\'))
        if g:
            return g
    except OSError:
        pass
    try:
        g = json.load(open('package.json')).get('config', {}).get('game')
        if g:
            return g
    except Exception:
        pass
    return 'demo'


def game_dir():
    """The current game's folder: $GAME_DIR, a project's game/, else games/<id>/."""
    d = os.environ.get('GAME_DIR', '').strip()
    if d:
        return os.path.relpath(d)
    project = os.environ.get('WEB_SCUMM_PROJECT', '').strip()
    if project:
        return os.path.relpath(os.path.join(project, 'game'))
    if os.path.isfile(os.path.join('game', 'index.ts')):
        return 'game'
    return os.path.join('games', game_id())
