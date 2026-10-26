## A red nightly opens an issue; the next green one closes it

On 26 Oct 2026 a red nightly was found at the release's candidate, a day late: nothing tells anyone of a red night but
the cross on the Actions page. `nightly.yml` gets a last job, `report`, that needs every other job (a test pins the list
to the workflow's jobs, so a new job cannot be forgotten) and runs on `always() && (needs.guard.outputs.run == 'true' ||
needs.guard.result != 'success')`: never on a night the guard skipped, but a failed guard is red. The decision is
`tools/nightly-report.ts`, Node alone like the guard: the results come in `NIGHTLY_RESULTS` (`toJSON(needs)`; a variable
of its own, since adding a reader to `NEEDS` truncated its "Read by" line in the env reference and dropped a link the
24 Oct audit fixture expects), the open issues from `gh issue list --label nightly-red`, and for a failed
`mutation-merge` the `mutation-merged` artefact, whose survivors not named in `docs/dev/mutants.json` it lists (20 at
most; `sameMutant` copied, a test holds it equal to mutate.ts's). Red is `failure` or `cancelled` (a timeout is a
failure); `continue-on-error` jobs report `success` in `needs` and open nothing. Red with no issue open: `gh label create
--force`, then `gh issue create`; red with one open: a comment on the oldest; green with one open: "Green again on
<run>" and `gh issue close` on each. Warm-ups (`-f jobs=mutation`) report a red gate, since the candidate would fail on
it, and never close: a green warm-up says nothing of the jobs it skipped. `permissions: contents: read, issues: write`
on `report` alone. Proof: tests/nightly-report.test.ts (the decisions, the text, the workflow's shape);
tests/release-candidate.test.ts lets `report` run in a warm-up.

→ next: the first night after the merge: a green night with no issue open does nothing; a red one opens #<n>.
