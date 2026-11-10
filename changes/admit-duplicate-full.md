### Fixed

- **The SQL store's duplicate-when-full answer is tested in one process (next)**: `SqlRunStore.admit`'s
  `if (dup) return 'duplicate'` forced false was killed only by the three-process race of
  `tests/bridge-admission.test.ts`, when a duplicate happened to arrive after the queue was full; in the other
  interleavings the insert's unique key answered `duplicate` anyway. It survived the `runs` set of #527's run
  42785051498. A test on one SQLite store now fills the queue, then admits the same run: `duplicate`, not `full`. The
  test only; the store was right.
