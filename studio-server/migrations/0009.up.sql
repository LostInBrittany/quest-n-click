-- Published builds (4.2.2 PR 5, plan §2.5, G6): each publication of a revision, numbered, immutable. `manifest`: the
-- canonical JSON the Studio signed (epoch, revision, engine, the snapshot's hash, each file's hash); `signature`: its
-- Ed25519 signature by the Studio's key; `rebuilt`: the last fresh rebuild's comparison, when one was asked for.
CREATE TABLE studio_builds (
  n INTEGER PRIMARY KEY,
  epoch TEXT NOT NULL,
  rev BIGINT NOT NULL,
  manifest TEXT NOT NULL,
  signature TEXT NOT NULL,
  made_by TEXT NOT NULL,
  made_at BIGINT NOT NULL,
  rebuilt TEXT
);
