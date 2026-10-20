## 4.2.5: web-scumm becomes quest'n'click

- **Asked** (20 October, D47): rename the project quest'n'click, keep the trace of web-scumm in the README, a redirect,
  "ne pas perdre les gens qui étaient déjà sur le sujet"; the slug `quest-n-click`; the old names still working through
  4.2.x, gone in 4.3; Horacio's #202 left to 4.3.
- **Done**:
  - every occurrence of the old name inventoried (about 430 files) and classed: a name people see or install is
    renamed; an identifier written in a file, a store, a header or a signature is a format and kept byte for byte; a
    historical record (CHANGELOG, LOG, plans, passes, baselines, ADRs) is left as written;
  - the docs (en, fr): the READMEs with the new logo and a "Formerly web-scumm" note (old Pages address not
    redirected), every guide's names, commands and URLs, UPGRADING §38, SUPPORT "4.2.5" (the aliases deprecated through
    4.2.x), D47 with the maintainer's words;
  - the packages, their commands and the release's files under the new names, the old ones as aliases (the same files,
    the old package name), the old commands with a notice, both import names resolved; past releases' names and
    attestation identity kept for the tools that fetch and verify them.
- **What stays open**: the Clever applications' names (the reference deployment) and the private game (D8), not
  touched; npm publishing, which will take the new names; the local folder, renamed by the maintainer.
  The sample games' own credits and title-screen line (demo, reference) still say web-scumm: they enter the
  presentation fingerprint the reference run is sealed with, so they move with the 4.2.5 release commit, which records
  that run again. The README's quick start stays on v4.2.4's archive (`web-scumm-4.2.4.tgz`, under the new repository's
  URL) until that commit too. The Bridge's qualification files are renamed (image, lock, compose project), so the
  surfaces of the passes that read them change: those passes are not carried from 4.2.4.

→ next: the maintainer (the review of the pull request; the folder renamed), then the 4.2.5 release
