# Changelog

## 4.5.3 — 2026-10-25

LOG #300–#308: "One pass", a patch on 4.5.2 that reworks the release chain. The candidate is now a release's only test
pass (D55): the push of a `v*` tag starts `release.yml`, which checks the tag, main's `ci` on its commit and the
candidate it names, then publishes that candidate's files in minutes, testing nothing again; a tag runs no `ci` of its
own, `ship tag` always waits for main's `ci` (`--now` is refused), and the Remix catalogues are proved by the candidate.
