// What the worker needs of a game to validate it (4.2.1, ADR 0028): its sources and data, never its art or sound
// (the validator reads `assets.gen.json`, not the pictures). One JSON document, its sha256 bound into the job.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';

const SKIP_DIR = /^(art|audio|private|playtests|tests)$/;
const TEXT = /\.(ts|mts|json|md|mjs)$/;
const MAX_FILES = 5_000;
const MAX_BYTES = 32 * 1024 * 1024;

export function packSnapshot(dir: string): Buffer {
  const files: { path: string; text: string }[] = [];
  const walk = (d: string, top: boolean) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.') || (top && SKIP_DIR.test(e.name))) continue;
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p, false);
      else if (e.isFile() && TEXT.test(e.name)) files.push({ path: relative(dir, p).split(sep).join('/'), text: readFileSync(p, 'utf8') });
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
    if (typeof f.path !== 'string' || typeof f.text !== 'string' || !TEXT.test(f.path)) throw new Error('not a snapshot');
    if (f.path.startsWith('/') || f.path.split('/').some((x) => x === '..' || x === '' || x.startsWith('.')))
      throw new Error(`a snapshot path leaves its folder: ${f.path}`);
    const target = join(dir, ...f.path.split('/'));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, f.text);
  }
  return s.files.length;
}
