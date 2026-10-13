### Breaking

- **`restore` says its mode** (4.1.20): `bridge restore` without `--mode` restores nothing. `--mode=merge` is 4.1.19's
  restore unchanged. `--mode=replace-store --yes-replace-store --safety-out=<new file>` makes the store the backup,
  after a safety backup of the store, written and checked first (`docs/en/UPGRADING.md` §32).

### Changes

- **A Bridge backup is schema 4** (4.1.20, ADR 0023): its digest covers the whole envelope, not only its rows. It says
  what it holds (`completeness`), and it carries the speedrun quota, which no backup carried before. Every SQL table is
  classified, so a future table cannot slip out of a "whole store" backup. Files of schemas 1 to 3 are still restored,
  with `--mode=merge`. The digest is an integrity check, not a signature.
