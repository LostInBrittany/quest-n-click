## The candidate is the release's only test pass (#291, D55)

A release commit was tested four times: main's `ci`, the candidate (about 85 minutes: release-check, heavy, mutation,
pack, image, the signing rehearsal…), the tag's `ci` (the same SHA as main's), then `release.yml`, which ran
`release-check:ci` and the whole mutation matrix again before publishing (up to two hours), although since 4.1.20 it
builds nothing and copies every file from the candidate. Now `release.yml` starts on the tag's push (`push: tags:
['v*']`, the `workflow_run` trigger and #290's `branches:` filter gone) and runs from the tag's own commit. Its gate:
the SemVer tag, the tag still on the commit the run was started for, that commit on main's first-parent line and
main's `ci` green on a push at that SHA (`tools/release/main-ci.mjs`, new), the previous stable tag an ancestor, the
candidate the tag names (green, dispatched on main, its manifest this SHA's, every file matching), not published yet.
The mutation jobs, `release-check:ci` and the python, ffmpeg and Chromium setup are gone; Node and `npm ci` stay for
the release notes, `speedrun:verify`, the manifest's check and `ship verify`. The Remix proofs, the one check the
candidate did not run, move to its new `remix-proof` job: `remix/remix-<game>.json` in the manifest from 4.5.3
(`tools/release/artifacts.mjs`, the release-made entries kept up to 4.5.2 so older releases still verify), listed as
evidence in `docs/dev/surfaces.json`, and a candidate without them is refused like one without its site. `ci.yml` no
longer runs on tags; `ship tag` always waits for main's run (`--now` refused) and `ship watch` waits for the release
run only. Found on the way: `docs-publish` in release mode required `refs/heads/main` (true under `workflow_run`), now
`refs/tags/v<version>` (`tools/wiki/publication.ts` too), and the `docs-publish` environment's deployment policy
(main, docs/*) needs a tag rule `v*`, a repository setting the maintainer adds. npm's provenance and the release's
attestations now name the tag and its commit instead of main's head; `npm-stage`'s summary says so, and flags a run
whose commit is not the tag's. 4.5.2 was released with the old workflow (candidate 40121513569 predates this).

→ next: the maintainer adds the `v*` tag rule to the `docs-publish` environment, then the next rc tag (on a fresh
candidate, npm-stage rehearsing) exercises the new trigger and gate end to end.
