## The wiki's claims match .each test names

4.5.2's `docs-publish` (run 40130164629) failed `check --publish` with 9 errors; one was `bridge-restore-refused-while-serving`
"not executed", although the candidate's report has `maintenance leases on sqlite › restore refuses…` passed. The claim
names the test as its source writes it (`… on $name …`), which the static check needs; the report holds the name the run
filled in. `sameTest` (tools/wiki/claims.ts) now reads `$x`, `$a.b` and `%s %d %i %f %j %o %#` as any text, so every
variant the report holds counts, and all of them must have passed. Checked against candidate 40121513569's report:
the claim is "executed on 36049e12f06b". The other 8 errors are reviews only a person can record (7 claims, 263
translation pairs).

→ next: the human review of the 7 claims and the 263 pairs; then 4.5.2's docs as r2 or with 4.5.3 (a docs revision may only change wiki/ files, so it cannot carry this fix).
