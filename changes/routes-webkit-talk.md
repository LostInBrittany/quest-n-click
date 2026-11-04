### Fixed

- **The routes example's e2e meets Lou at his desk (4.6.0, #394)**: `games/routes/e2e.mjs` took Lou's map and talked
  to him as soon as Pixel came in, near the end of his first paperwork, when he was already walking to the door: on
  CI's slower WebKit runner the tap aimed at him landed where he was, or after he left, and the conversation never
  opened (`routes (webkit)` red on 3 of the 15 runs that played it since d4117b15, main among them). Each check now waits for a
  paperwork just begun, Lou standing still at his desk for 2.5 s. The engine was right: a tap that meets a walking
  Lou holds him. Nothing changes for a player, an author or a host.
