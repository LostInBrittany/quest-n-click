-- Version 5 (4.1.20, ADR 0023, plan §6.4): the maintenance leases. One row per lease: an instance that serves the store
-- (`serving`: `serve`, a command that writes), or the one operation that must have it alone (`exclusive`: a restore,
-- a migration down). Times are milliseconds since the epoch, taken from the database's own clock by the code (never an
-- instance's). At most one exclusive lease: the partial unique index.
CREATE TABLE maintenance (
  instance_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('serving', 'exclusive')),
  acquired_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL
);
CREATE UNIQUE INDEX maintenance_one_exclusive ON maintenance (kind) WHERE kind = 'exclusive';
CREATE INDEX maintenance_expires ON maintenance (expires_at);
