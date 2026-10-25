## The test count no longer conflicts between pull requests

On 25 October, #305, #306, #309, #310 and #311 each conflicted with the others on `README.md`, `README.fr.md` and
`tests/quality-baseline.json`: each added tests, so `quality:baseline -- --check` failed until the branch rewrote the
three files, and every merge then put the next branch in conflict. `readmeDrift` (tools/quality-baseline.ts) now checks
the READMEs against the committed baseline; the test count may only grow (`differences` already said so), and a gain is
reported, not required. The README says its figures are the last baseline's, rewritten at each release; the PR
template, CONTRIBUTING, contribute.before-a-pr and contribute.quality-baseline (en, fr) say a new test alone needs no
rewrite.

→ next: none.
