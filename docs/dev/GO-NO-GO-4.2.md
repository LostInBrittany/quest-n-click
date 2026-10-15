# GO / NO-GO for 4.2 "Stable World" (written at 4.1.18 "Dress Rehearsal", updated at 4.1.19 "Field Closure", 4.1.20 "Last Mile" and 4.2.0)

What 4.2 may promise, surface by surface, from what 4.1.18, 4.1.19 and 4.1.20 proved. The rule (D18, the plan's §14.2 and §19): a surface
is **stable** in 4.2 only with its machine proof **and** the people's pass the plan's §14.2 names for it, `passed`;
where §14.2 names none or makes it optional ("si faite": the SQLite Bridge's long install, the Chromium PWA's real
install), the machine proof is the proof, and this sheet says so in its row. Otherwise the surface is limited,
experimental, or out of 4.2's stable scope, and 4.2 says so. A pass made on one sub-surface promotes no other.

**At the 4.1.20 tag no people's pass has been made**, by construction (D34): they run on the `4.2.0-rc` candidate that follows 4.1.20, a change of the version only, because the version is part of every surface's files (D35) and a pass made on 4.1.20 could not be carried to 4.2. Each of the thirteen is an open `field-pass` issue (#75 to #87), closed by the maintainer once its report checks (`npm run field:check`, `docs/en/FIELD.md`). This sheet is written again when they are made; until then every verdict below that needs a pass is **NO-GO for "stable"**.

**At the 4.2.0 tag still no pass has been made** (D38, the maintainer's decision of 15 October): 4.2.0 ships on the reduced scope below, and the thirteen passes are made on `v4.2.0` itself. The rows did not move.

## By surface

| Surface | Machine proof (4.1.18, 4.1.19) | People's pass | Verdict for 4.2 today |
|---|---|---|---|
| Player, DOM | Chromium and WebKit e2e at a phone's size, touch and keyboard, French; axe-core on every screen; the external consumer plays a new game and a 4.1.17 save to the end from the archives | `phone-both-renderers` (#83), `code-wheel-human` (#78), `blind-playtesters` (#76): not run | **limited**: desktop and CI browsers; phones and screen readers untried |
| Player, Canvas | the same game drawn and played by the Canvas painter in CI; the logical equivalence of the two painters | `phone-both-renderers` (#83): not run | **experimental** |
| PWA, Chromium | install, update after a durable save, reinstall, offline in CI | optional in §14.2 (a real install), not made | **stable** for desktop Chromium on the machine proof (the optional pass not made); phones with #83 |
| PWA, Safari | WebKit e2e, offline | `safari-ios-offline-update` (#86): not run | **limited**: no iPhone tried |
| Firefox | the PWA only (`pwa-firefox`) | `firefox-real-offline` (#80): not run | **PWA only**, untried on a real machine |
| Bridge, SQLite (`local`) | store contract, three processes on one file, a kill during 1 000 proposals, backup and restore (runs and daily records since 4.1.18; one snapshot and an all-or-nothing restore since 4.1.19, ADR 0021), nightly load; installed from its archive on three systems | optional in §14.2 (a long install), not made | **stable** on the machine proof (the optional pass not made) |
| Bridge, Postgres (`distributed`) | the contract on Postgres 16, nightly and candidate loads; the qualification profile (`ops/qualify/`): three instances behind HTTPS, a kill with proposals in flight, tenants apart, backup, destroy, restore — 12 steps green; 4.1.19: the image built once and qualified by its digests, and the full profile in the `qualify` workflow, the candidate running its `--short` form (23 steps: Daily and Mystery across instances, a worker killed mid-verification and the run verified once by another, the shared quota, 20 000 runs, a restore after destruction, a 4.1.17 store read); 4.1.20: the full profile in every candidate a tag may name, judged by its gate, both restore modes under the maintenance lease | `bridge-postgres-https` (#77): not run | **experimental** until the 24–48 h behind a real domain passes |
| Email connector | signed webhook and IMAP tests, fuzz, abuse, gated mutation (MIME and SDK: 0 unexplained); a recorded scenario through the installed Bridge on three systems; 4.1.19: webhook and IMAP played from the archive (`connector-archive-e2e`), `connectors-edge` measured | `connectors-real-security` (#79): not run | **experimental** |
| SSH connector | contract, abuse, gated mutation (line editor, virtual disk); not on Windows; 4.1.19: played from the archive, a wrong password refused as such | #79: not run | **experimental** |
| Telnet connector | as SSH | #79: not run | **experimental** |
| Open Badge connector | OB2 and OB3 fixtures, SSRF policy, gated mutation (crypto, fetch: a JWS of another algorithm, a private key turned public, a redirect on a 404 now killed) | #79: not run | **experimental** |
| Speedrun and Remix | replays in four runtimes, five world policies, resume in each, the candidate's `.wsrun` verified and published, three gated mutation sets | `runs-real-players` (#85), `run-resume-power-cycle` (#84), `mystery-deployed` (#82), `livesplit-obs` (#81), `code-wheel-human` (#78): not run | **limited**: machine-proved; no person's run yet |
| Voices and music | the music director in Chromium and WebKit, the stems, offline | `voices-listening` (#87): not run | **limited** |
| Archives and install | the four archives from the candidate installed outside the repository on Ubuntu (Node 22 and 24), macOS and Windows; a 4.1.17 game moved to them; 4.1.19: games from 4.1.16 and 4.1.18-rc.1 too, the older engines checked against their sums; the Bridge and connectors locked; five CycloneDX SBOMs | `archive-human-install` (#75): not run | **limited** until #75: the automated path is green, a person's install from the READMEs alone is untried |
| Content format and its tools | `validate`, the solver and its proof, lint, i18n, the IR, the golden saves and the migrations, in every CI run on every system; the DSL frozen after 4.1.15 | none in the list | **stable** on the machine proof |
| Studio | e2e in CI; Windows runs the unit suite but six POSIX files | none in the list | **partial support**: Windows untried by a person |

## What 4.2 needs before it starts (plan §19)

- [x] every surface 4.2 announces as stable has its machine proof **and** its pass `passed`, or needs none (the rows
  above): at 4.2.0, only the surfaces that need none are stable (D38);
- [x] every other surface is said limited, experimental or out of scope in `docs/en/SUPPORT.md` and the 4.2 notes;
- [x] no field P0 or P1 open;
- [ ] a consumer outside the repository uses the archives without the checkout (automated: done; a person: #75, on
  `v4.2.0`);
- [x] this sheet approved by the maintainer (D38, 15 October);
- [ ] the npm publication (moved to a later 4.2.x by D38: every step needs the maintainer's 2FA); the signed tag is
  rehearsed (`v4.2.0-rc.1`, `v4.2.0-rc.2`).

## Recommendation at 4.1.18, unchanged at 4.1.19

**NO-GO for 4.2 today**, as expected of a release made before any pass: the machine side is ready for a stable
contract on the desktop Chromium PWA and the SQLite Bridge (their passes optional); the rest waits on the
thirteen issues. The shortest path: #77 (Postgres behind HTTPS), #79 (connectors), #83 and #86 (phones), #75 (an
install by a person); each turns a row green or says, with its report, why it leaves 4.2's stable scope.

At 4.1.19 the machine side closed what 4.1.18's second reading found (the restore, the image, the SBOMs, a bundle
checked on its own); no verdict above moves, since none moves without its pass. The passes now stand on 4.1.19's
candidate: each `field-pass` issue names it.

## Decision at 4.2.0 (D38)

**GO for 4.2 on a reduced scope.** The maintainer decided on 15 October to ship 4.2.0 without waiting for the people's
passes. 4.2.0 promises as stable the surfaces that need no pass: the content format and its tools, the desktop
Chromium PWA and the Bridge on SQLite. Every other row keeps its verdict above, limited or experimental, and
`docs/en/SUPPORT.md` says the same (its "4.2.0: what is promised" section). The thirteen passes stay open issues (#75–#87), made on `v4.2.0`'s candidate:
each `failed` opens its fix; turning a row stable in a 4.2.x needs its pass `passed` on that 4.2.x (made again on its candidate, or carried once a version exclusion is declared for its surface, D35, D38). This is not the GO the
plan's §19 describes, which needs the thirteen passes: `ship preflight-stable` still blocks a plain **GO** that the
reports contradict, and reads this verdict as what it is.
