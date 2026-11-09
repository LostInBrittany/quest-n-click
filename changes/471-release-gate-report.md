### Changes

- **The release command judges every gate before it does anything (next, #471)**: `npm run release -- <x.y.z>` prints
  one line per gate – the preflight, main's `ci` on the release commit, the docs' human gates on its tree, its
  candidate, and what `ship tag` checks itself (the CHANGELOG section at that commit, the previous stable tag an
  ancestor, immutable releases on) – then refuses, naming every red gate, before it starts a candidate or tags
  anything. A gate still running (a candidate, main's `ci`) is waited for as before, and said so. When the release
  commit's candidate is missing, or was cancelled by a later candidate of the version, the report names that later
  commit and its run, and prints the command with the SHA in full. `--dry-run` prints the same report and does
  nothing else; its exit status is the verdict. 4.7.2 met these gates one at a time, each after a command had started.

### Fixed

- **A candidate is the run whose name says the commit it tests (next, #471)**: the release command found a commit's
  candidate by the run's head, which for a dispatch is main's tip. So `--commit=<not the tip> --start-candidate` never
  found the run it had just started (it gave up after five minutes and started another), and a run started at the tip
  for an older commit counted as the tip's candidate, until `ship tag` refused it. It now reads `candidate <sha>` in
  the run's name, as `ship tag` does.
