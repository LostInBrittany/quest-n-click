// Published builds (4.2.2 PR 5, plan §2.5, G6): a member publishes the head; the processing worker builds the player's
// game from the revision's snapshot (base `/play/<n>/`, no editing tools); the Studio keeps its files by content and
// signs its manifest (the epoch and revision, the engine, the snapshot's hash, each file's hash), with its Ed25519 key:
// the worker's public key verifies it. A build never changes. The game's origin serves `/play/<n>/` and sends `/play/`
// to the last green build: the latest whose revision the health judged valid (computed when asked, not frozen at
// publication). A fresh rebuild (an owner's option) builds the same snapshot again and says whether the files are the
// same, byte for byte: it checks that a build is reproducible, not that its content is harmless.
import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { SqlDb } from '../../../bridge/src/store-sql';
import type { BlobStore } from '../ops/blobs';
import { StudioError } from '../ops/errors';
import type { PreviewParams } from '../worker/preview-build';
import { serveBuilt, servedPath, text } from './previews';

export interface BuildManifest {
  v: 1;
  n: number;
  epoch: string;
  rev: number;
  engine: string;
  /** sha256 of the snapshot the build was made from. */
  snapshot: string;
  /** The health of the revision when it was published: ok, failed, or unknown (not judged yet). */
  health: 'ok' | 'failed' | 'unknown';
  /** Each file of the build, by its path under the base, and its sha256. */
  files: Record<string, string>;
}

export interface BuildInfo {
  n: number;
  rev: number;
  by: string;
  at: number;
  /** The revision's health now (a build is green when its revision was judged valid). */
  health: 'ok' | 'failed' | 'unknown';
  rebuilt: { at: number; same: boolean; differ: string[] } | null;
}

export interface BuildsOptions {
  db: SqlDb;
  blobs: BlobStore;
  publicDir: string;
  game: string;
  studioOrigin: string;
  engine: string;
  assetsVersion: () => string;
  /** The folder packed at its revision, holding the instance's lock. */
  snapshot: () => Promise<{ epoch: string; rev: number; bytes: Buffer }>;
  /** A past revision's snapshot, rebuilt from the journal (the fresh rebuild). */
  snapshotAt: (rev: number) => Promise<Buffer>;
  /** The worker's build. */
  build: (snapshot: Buffer, params: PreviewParams, at: { epoch: string; rev: number }) => Promise<Map<string, Buffer>>;
  /** The Studio's signature of a manifest's bytes (Ed25519, base64url). */
  sign: (bytes: Buffer) => string;
  now?: () => number;
}

/** A manifest's bytes, as signed: its keys sorted, its files sorted by path. */
export function manifestBytes(m: BuildManifest): Buffer {
  const files = Object.fromEntries(Object.entries(m.files).sort(([a], [b]) => (a < b ? -1 : 1)));
  const sorted = { ...m, files };
  const keys = Object.keys(sorted).sort();
  return Buffer.from(JSON.stringify(sorted, keys.concat(Object.keys(files))));
}

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

export class Builds {
  private gate: Promise<unknown> = Promise.resolve();
  private manifests = new Map<number, BuildManifest>();
  private now: () => number;

  constructor(private o: BuildsOptions) {
    this.now = o.now ?? Date.now;
  }

  /** One publication or rebuild at a time: each takes the worker for a whole build. */
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.gate.then(fn);
    this.gate = p.catch(() => undefined);
    return p;
  }

  private async health(epoch: string, rev: number): Promise<BuildManifest['health']> {
    const [r] = await this.o.db
      .all('SELECT ok FROM studio_health WHERE epoch = $1 AND rev = $2', [epoch, rev])
      .catch(() => []);
    return r ? (Number(r.ok) === 1 ? 'ok' : 'failed') : 'unknown';
  }

  private async files(built: Map<string, Buffer>): Promise<Record<string, string>> {
    const out: [string, string][] = [];
    for (const [path, bytes] of built) out.push([path, await this.o.blobs.put(bytes)]);
    return Object.fromEntries(out.sort(([a], [b]) => (a < b ? -1 : 1)));
  }

  /** Publishes the head: built, signed, numbered. */
  publish(by: string): Promise<BuildInfo> {
    return this.serial(async () => {
      const snap = await this.o.snapshot();
      const [last] = await this.o.db.all('SELECT MAX(n) AS n FROM studio_builds');
      const n = Number(last?.n ?? 0) + 1;
      const built = await this.o.build(snap.bytes, this.params(snap.rev, n), snap);
      const m: BuildManifest = {
        v: 1,
        n,
        epoch: snap.epoch,
        rev: snap.rev,
        engine: this.o.engine,
        snapshot: sha(snap.bytes),
        health: await this.health(snap.epoch, snap.rev),
        files: await this.files(built),
      };
      const at = this.now();
      await this.o.db.run(
        'INSERT INTO studio_builds (n, epoch, rev, manifest, signature, made_by, made_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [n, m.epoch, m.rev, JSON.stringify(m), this.o.sign(manifestBytes(m)), by, at],
      );
      this.manifests.set(n, m);
      return { n, rev: m.rev, by, at, health: m.health, rebuilt: null };
    });
  }

  private params(rev: number, n: number): PreviewParams {
    return {
      rev,
      game: this.o.game,
      studioOrigin: this.o.studioOrigin,
      assetsVersion: this.o.assetsVersion(),
      play: n,
    };
  }

  /** A build's manifest and signature (what anyone can check with the worker's public key). */
  async get(n: number): Promise<{ manifest: BuildManifest; signature: string } | undefined> {
    const [r] = await this.o.db.all('SELECT manifest, signature FROM studio_builds WHERE n = $1', [n]);
    return r
      ? { manifest: JSON.parse(String(r.manifest)) as BuildManifest, signature: String(r.signature) }
      : undefined;
  }

  /** The builds, latest first, with their revision's health now. */
  async list(limit = 100): Promise<BuildInfo[]> {
    const rows = await this.o.db.all(
      'SELECT n, epoch, rev, made_by, made_at, rebuilt FROM studio_builds ORDER BY n DESC LIMIT $1',
      [limit],
    );
    const out: BuildInfo[] = [];
    for (const r of rows)
      out.push({
        n: Number(r.n),
        rev: Number(r.rev),
        by: String(r.made_by),
        at: Number(r.made_at),
        health: await this.health(String(r.epoch), Number(r.rev)),
        rebuilt: r.rebuilt ? (JSON.parse(String(r.rebuilt)) as BuildInfo['rebuilt']) : null,
      });
    return out;
  }

  /** The last green build: the latest whose revision was judged valid. */
  async green(): Promise<number | null> {
    for (const b of await this.list(500)) if (b.health === 'ok') return b.n;
    return null;
  }

  /**
   * Builds build `n`'s snapshot again (from the journal), and compares the files with the published ones, byte for
   * byte; the comparison is kept with the build. The published build does not change.
   */
  rebuild(n: number): Promise<{ n: number; same: boolean; differ: string[] }> {
    return this.serial(async () => {
      const b = await this.get(n);
      if (!b) throw new StudioError(`no build ${n}`, 404);
      const m = b.manifest;
      const bytes = await this.o.snapshotAt(m.rev);
      if (sha(bytes) !== m.snapshot)
        throw new StudioError(
          `build ${n}: the revision's snapshot rebuilt from the journal is not the one published`,
          409,
        );
      const again = await this.files(await this.o.build(bytes, this.params(m.rev, n), m));
      const paths = [...new Set([...Object.keys(m.files), ...Object.keys(again)])].sort();
      const differ = paths.filter((p) => m.files[p] !== again[p]);
      const rebuilt = { at: this.now(), same: differ.length === 0, differ: differ.slice(0, 50) };
      await this.o.db.run('UPDATE studio_builds SET rebuilt = $1 WHERE n = $2', [JSON.stringify(rebuilt), n]);
      return { n, same: rebuilt.same, differ: rebuilt.differ };
    });
  }

  /** `/play/` (the last green build) and `/play/<n>/…` on the game's origin. */
  async handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    if (req.method !== 'GET' && req.method !== 'HEAD') return text(res, 405, 'GET only');
    const path = servedPath(url);
    if (path === null) return text(res, 404, 'not found');
    if (path === '/play' || path === '/play/') {
      const n = await this.green();
      if (n === null) return text(res, 404, 'no build is green yet');
      res.writeHead(302, { location: `/play/${n}/${url.search}`, 'cache-control': 'no-store' });
      return void res.end();
    }
    const m = /^\/play\/(\d{1,9})\/(.*)$/.exec(path);
    if (!m) return text(res, 404, 'not found');
    const n = Number(m[1]);
    let manifest = this.manifests.get(n);
    if (!manifest) {
      manifest = (await this.get(n))?.manifest;
      if (!manifest) return text(res, 404, 'no such build');
      this.manifests.set(n, manifest);
    }
    return serveBuilt(req, res, this.o, manifest.files, m[2] || 'index.html');
  }
}
