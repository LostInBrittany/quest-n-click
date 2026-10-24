### Fixed

- **A claim backed by a `.each` test is executed again** (4.5.3): the wiki's publication check matched a claim's test name literally, so a test whose title is filled in by `describe.each` (`maintenance leases on $name`, run as `… on sqlite`) never counted as run, and 4.5.2's `docs-publish` refused `bridge-restore-refused-while-serving` as "not executed".
