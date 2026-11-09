### Changes

- **The release checks run the unit suite once (next, #506)**: `release-check` and `release-check:ci` ran `build`,
  whose `check` ran `tsc` and the unit suite (`test:node`) again before `test:coverage` ran the same files under
  coverage. They now run `npm run game && … && npm run build:game`: `quality` already runs `tsc` on both configs, and
  `test:coverage` runs every file `test:node` ran. The candidate saves one pass of the unit suite and one of `tsc`.
- **The heavy test files are listed in one exclusion script (next, #506)**: `test:coverage` is now
  `npm run test:unit -- --coverage` and `test:node` is `npm run test:unit -- --exclude …` with its three asset files,
  so a new heavy file goes in `test:unit` and `test:heavy`, not four places. Arguments after `--` (CI's `--shard`,
  reporters, `--outputFile…`) still reach Vitest.
