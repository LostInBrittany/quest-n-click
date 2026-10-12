### Changes

- **The Bridge's backup code is split by responsibility** (4.1.20): `bridge/src/backup/` holds the file's schema, its
  canonical form, its bounded and atomic files, the snapshot and the restore, with `index.ts` as the public face. No
  behaviour changes: a test pins the messages a refused file gets, the command line's codes and lines and a backup's
  canonical form, and it passes before and after. The layers test now walks the Bridge's sub-folders.
