### Fixed

- **The mutation sets run at their old speed again, and `speedrun` in two shards (4.5.6, #387)**: since the unit
  shards' duration sequencer (#349, 4.5.5), `vitest.mutation.config.ts` inherited it from `vite.config.ts`. Each mutant
  runs its set's tests with `--bail 1`, and vitest's own order starts with the files that failed the run before, so the
  file that killed a mutant judges its neighbour first and kills it in a second; the duration sequencer started the
  longest files first instead. Every set ran two to five times longer, and `speedrun` (539 mutants in one job) went
  from 38 minutes to past the job's 120: the 4.5.6 warm-up cancelled it, and its candidate would have been red. The
  mutation config keeps vitest's own order (`BaseSequencer`), and `speedrun` runs in two shards: `verify.ts` (398
  mutants) alone, the envelope and the recorder (141) in the other.
