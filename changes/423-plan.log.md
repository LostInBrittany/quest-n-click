## 4.2.3: the detailed plan (draft for the maintainer)

- `docs/dev/PLAN-4.2.3-COORDINATION.md` (French, the source): what 4.2.2 leaves open (the archive's worker cannot
  `prepare`, sprite sheets and uploads local, the restore drill only in CI, the preview threshold measured locally,
  `studio-workshop` measured), ten guarantees with their limits and tests (H1–H10: the scenario map, anchored comments,
  the semantic diff, the remote MCP, the Git push and import, the engine upgrade, the archive's worker preparing, the
  asset tools hosted with progress and cancellation, the reference deployment run, the revision read and the 409 with
  its diff), what stays open after 4.2.3 and why, its departures from the master plan's §9 (merging it amends them), the PRs in order, exit criteria, six decisions
  asked of the maintainer (the name, the second OIDC provider, deploy key or GitHub App, the diff's captures hosted,
  the yes to sign `v4.2.3`, the spike's Clever resources) and the risks.
- No code of 4.2.3 before the maintainer merges this plan; `v4.2.3` is signed only on its own yes (D37).

→ next: the maintainer (read and merge, or amend; answer §4)
