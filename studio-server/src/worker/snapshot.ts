// What the worker needs of a game to run it (4.2.1, ADR 0028): its sources and data, never its art or sound (the
// validator reads `assets.gen.json`, not the pictures). One JSON document, its sha256 bound into the job. A game that
// imports files outside its own folder cannot run on a hosted Studio (they are not in the snapshot).
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';

const SKIP_DIR = /^(art|audio|private|playtests|tests)$/;
const TEXT = /\.(ts|mts|cts|tsx|js|mjs|cjs|jsx|json|md)$/;
const MAX_FILES = 5_000;
const MAX_BYTES = 32 * 1024 * 1024;

/** Whether a file of the game (its path with `/`) goes into a snapshot: the rules a folder is packed by. */
export function packable(path: string, o: { playtests?: boolean } = {}): boolean {
  const parts = path.split('/');
  if (parts.some((p) => p.startsWith('.') || p === 'node_modules' || p === '..' || p === '')) return false;
  if (parts.length > 1 && SKIP_DIR.test(parts[0]!) && !(o.playtests && parts[0] === 'playtests')) return false;
  return TEXT.test(path);
}

/**
 * A snapshot from files rather than a folder (4.2.2: a past revision, from the journal's blobs), under the same rules
 * as a folder's: sources and data only, no art, sound, private notes or tests, nothing hidden.
 */
export function packFiles(files: { path: string; bytes: Buffer }[], o: { playtests?: boolean } = {}): Buffer {
  const out: { path: string; text: string }[] = [];
  let bytes = 0;
  for (const f of files) {
    if (!packable(f.path, o)) continue;
    const text = f.bytes.toString('utf8');
    bytes += text.length;
    out.push({ path: f.path, text });
    if (out.length > MAX_FILES || bytes > MAX_BYTES)
      throw new Error(
        `the game is too large to run on the processing worker (${MAX_FILES} files, ${MAX_BYTES >> 20} MiB at most)`,
      );
  }
  out.sort((a, b) => (a.path < b.path ? -1 : 1));
  return Buffer.from(JSON.stringify({ v: 1, files: out }));
}

/** `playtests`: their sessions too (the `playtests` job replays them; nothing else needs them). */
export function packSnapshot(dir: string, o: { playtests?: boolean } = {}): Buffer {
  const files: { path: string; text: string }[] = [];
  let bytes = 0;
  const walk = (d: string, top: boolean) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      if (top && SKIP_DIR.test(e.name) && !(o.playtests && e.name === 'playtests')) continue;
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p, false);
      else if (e.isFile() && TEXT.test(e.name)) {
        const text = readFileSync(p, 'utf8');
        bytes += text.length;
        files.push({ path: relative(dir, p).split(sep).join('/'), text });
        // The same bounds as unpacking, said here, where the author can act on them.
        if (files.length > MAX_FILES || bytes > MAX_BYTES)
          throw new Error(
            `the game is too large to run on the processing worker (${MAX_FILES} files, ${MAX_BYTES >> 20} MiB at most)`,
          );
      }
    }
  };
  walk(dir, true);
  files.sort((a, b) => (a.path < b.path ? -1 : 1));
  return Buffer.from(JSON.stringify({ v: 1, files }));
}

/** Writes a snapshot into an empty folder; refuses paths that leave it, too many files, too many bytes. */
export function unpackSnapshot(bytes: Buffer, dir: string): number {
  if (bytes.length > MAX_BYTES) throw new Error('the snapshot is too large');
  const s = JSON.parse(bytes.toString('utf8')) as { v: number; files: { path: string; text: string }[] };
  if (s.v !== 1 || !Array.isArray(s.files) || s.files.length > MAX_FILES) throw new Error('not a snapshot');
  for (const f of s.files) {
    if (typeof f.path !== 'string' || typeof f.text !== 'string' || !TEXT.test(f.path))
      throw new Error('not a snapshot');
    if (f.path.startsWith('/') || f.path.split('/').some((x) => x === '..' || x === '' || x.startsWith('.')))
      throw new Error(`a snapshot path leaves its folder: ${f.path}`);
    const target = join(dir, ...f.path.split('/'));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, f.text);
  }
  return s.files.length;
}
