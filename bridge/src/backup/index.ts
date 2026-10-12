// The Bridge's backup and restore (4.1.19, ADR 0021): a backup is one logical snapshot of the whole store, described
// by its envelope (schema 3: backend, Bridge and SQL schema versions, start and end, counts per family, a SHA-256 of
// the canonical payload), written to a private temporary file then renamed; a restore reads a bounded file, validates
// every row before the first write, and writes tenants, runs and daily records in one SQL transaction whose result is
// compared with the file before it commits. A restore that fails changes nothing. The JSON-lines journal is refused
// before anything is touched (it has no transaction to restore into): migrate it to SQLite first.
// This is an operator's capability of the SQL stores, not of `RealityStore`: the runtime never restores.
// 4.1.20 PR 1a: split by responsibility (schema, canonical, files, snapshot, restore); this module is its public face.
export { payloadDigest, stableJson } from './canonical';
export { readBounded, writeAtomic } from './files';
export { auditRestore, RestoreUnknown, restoreBackup } from './restore';
export {
  BackupError,
  type BackupPayload,
  DAILY_COLUMNS,
  MAX_BACKUP_BYTES,
  MAX_BACKUP_ROWS,
  RUN_COLUMNS,
  readBackup,
} from './schema';
export { makeBackup } from './snapshot';
