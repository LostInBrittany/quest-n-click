// The tests a mutant is judged by (npm run test:mutation:core, 4.1.0 "Clarity"; `MUTATION_SET` since 4.1.2): for the
// core set, conditions, saves, sessions and migrations and the tests that exercise them; for the reality set, the
// signal's protocol, the engine's receive, the client and the Bridge. The rest of the suite is not run per mutant.
import { defineConfig } from 'vitest/config';
import { BaseSequencer } from 'vitest/node';
import base from './vite.config';
import { SERIAL, setNamed, setsOf, TESTS } from './tools/mutation-sets';

// The base's `include` is replaced, not merged (mergeConfig would concatenate the lists). The lists live in
// tools/mutation-sets.ts (4.1.8), with the sources each set mutates.
const set = setNamed(process.env.MUTATION_SET ?? 'core');

export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: setsOf(set).flatMap((k) => TESTS[k]),
    // vitest's own order, not the base's duration sequencer (4.5.6, #387). Each mutant runs with `--bail 1`, and vitest
    // starts with the files that failed the run before (its results cache): the file that killed a mutant is the first
    // to judge the next one, its neighbour in the source, and kills it in a second. The duration sequencer (#349,
    // ci.yml's unit shards) started the longest files first whatever failed: every set ran two to five times longer,
    // `speedrun` from 38 to more than 120 minutes, and 20 mutants of verify.ts took 132 s against 30 s (three workers).
    sequence: { ...base.test?.sequence, sequencer: BaseSequencer },
    // The files that run against a real Postgres, one after the other (4.1.20 PR 2a): side by side they hold more
    // connections than a server's default hundred, as CI's `bridge-postgres` job knew (`--maxWorkers=1`). Each still
    // has a database of its own (tests/fixtures/pg-database.ts).
    ...(SERIAL.includes(set) ? { fileParallelism: false } : {}),
  },
});
