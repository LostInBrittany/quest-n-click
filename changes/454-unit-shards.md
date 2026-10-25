### Changes

- **The unit suite runs in four shards at once** (4.5.4): CI's new `unit` job splits the suite and the asset tests in four (`--shard=<i>/4`), under coverage when product code changed; `coverage`, still the check the ruleset requires, merges the four reports (`npm run test:merge`, the floors of `vite.config.ts` on the whole suite), runs the ratchet, and is red when a shard is not. New scripts `test:unit` (the files of `test:coverage`, no instrumentation) and `test:merge`.
