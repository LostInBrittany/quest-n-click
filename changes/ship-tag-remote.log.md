## ship tag: the organisation's remote, and the CHANGELOG section before the tag

Tagging `4.5.3-rc.1` from LostInBrittany's checkout, where `origin` is the fork, would have pushed the tag to the fork:
it went out through a `remote.origin.pushurl` override. Its release run then failed at `release-notes.mjs`: no
`## 4.5.3` on e88ef808, and the tag ruleset keeps the tag, so rc.1 is spent. `ship tag` now uses `releaseRemote()`
(tools/release/lib.mjs: the remote whose fetch URL is REPO, `origin` first) for its fetches, its tag look-up and its
push, and reads `CHANGELOG.md` at the commit with release.yml's own `releaseNotes` before tagging (a dynamic import:
tools/ ships in the package, scripts/ does not).

→ next: tag 4.5.3 (rc.2 or final) on the release pull request's merge commit, without the pushurl override.
