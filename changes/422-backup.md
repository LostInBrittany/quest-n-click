### Changes

- **Backup, restore and the journal shipped (4.2.2)**: a hosted Studio ships each confirmed operation to the bucket
  (`/readyz` gives the RPO); `studio-server backup` writes the project's tables in one snapshot, `restore --replay`
  brings them back into an empty database then replays the journal shipped since; `gc` lists (and with `--delete`
  deletes) the blobs no row names and the worker's old staging.
