### Changes

- **web-scumm becomes quest'n'click (4.2.5, D47)**: the project, its repository (`github.com/wanoo/quest-n-click`, the
  old links redirect) and its Pages site (`wanoo.github.io/quest-n-click`; the old address redirects there through
  `wanoo.github.io`) take the name quest'n'click. The packages and commands are now `quest-n-click`, `create-quest-n-click`,
  `quest-n-click-bridge`, `quest-n-click-connectors` (command `quest-n-click-connector`) and
  `quest-n-click-studio-server` (commands `quest-n-click-studio-server`, `quest-n-click-studio-worker`); a game imports
  `quest-n-click/content`, `/player`, `/minigames`, `/testing`, `/reality`; a release's files are named
  `quest-n-click-<version>.tgz` and `quest-n-click-<tag>-…`. Nothing to change in a game: through 4.2.x each release
  also ships `web-scumm-<version>.tgz` and the other old archives (the same files, the old package name), the old
  commands run after a one-line notice, and `web-scumm/content` and the other old imports still resolve; the aliases go
  in 4.3. The formats keep their identifiers (`web-scumm-save`, `web-scumm-session`, `.wsrun`, `web-scumm-remix-1`, the
  IndexedDB and localStorage names, the `X-Web-Scumm-*` headers, `WEB_SCUMM_*`), so saves, runs, sessions and
  deployments load and run as before. Releases up to v4.2.4 keep their files' names and their attestations' repository,
  `wanoo/web-scumm`. The READMEs open on the new logo and a short "Formerly web-scumm" note; UPGRADING §38 says how to
  switch, when you like.
