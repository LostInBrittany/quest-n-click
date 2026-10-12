// The backup's files (4.1.19, ADR 0021): read bounded without trusting them, written atomically, and the Bridge's
// version an envelope names. Split from `bridge/src/backup.ts` (4.1.20 PR 1a).
import { randomBytes } from 'node:crypto';
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  readSync,
  renameSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { BackupError } from './schema';

/**
 * Reads a backup file without trusting it: a link or anything but a regular file refused, its size checked before a
 * byte is read, at most `max + 1` bytes read, and a file that changed size while read refused.
 */
export function readBounded(path: string, max: number): string {
  const l = lstatSync(path, { throwIfNoEntry: false });
  if (!l) throw new BackupError(`${path} does not exist`);
  if (l.isSymbolicLink() || !l.isFile()) throw new BackupError(`${path} is not a regular file`);
  // No link followed where the system can refuse one (a link swapped in after the lstat), and the file opened must be
  // the one looked at.
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const st = fstatSync(fd);
    if (!st.isFile() || st.ino !== l.ino || st.dev !== l.dev)
      throw new BackupError(`${path} is not a regular file (or changed while it was opened)`);
    if (st.size > max) throw new BackupError(`${path} holds ${st.size} bytes, more than ${max} (--max-bytes=)`);
    const buf = Buffer.alloc(st.size + 1);
    let got = 0;
    for (;;) {
      const n = readSync(fd, buf, got, buf.length - got, got);
      if (n === 0) break;
      got += n;
      if (got === buf.length) break;
    }
    if (got !== st.size) throw new BackupError(`${path} changed while it was read`);
    return buf.subarray(0, got).toString('utf8');
  } finally {
    closeSync(fd);
  }
}

/**
 * Writes a file of mode 600 the way a backup must be: a private temporary file beside it, written, flushed, closed,
 * renamed over the target, then the folder flushed where the system allows. An interruption leaves the old file or
 * the new one, never half of one.
 */
export function writeAtomic(path: string, content: string): void {
  const tmp = join(dirname(path), `.${basename(path)}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`);
  const fd = openSync(tmp, 'wx', 0o600);
  try {
    const buf = Buffer.from(content, 'utf8');
    let off = 0;
    while (off < buf.length) off += writeSync(fd, buf, off, buf.length - off);
    fsyncSync(fd);
  } catch (e) {
    closeSync(fd);
    unlinkSync(tmp);
    throw e;
  }
  closeSync(fd);
  try {
    renameSync(tmp, path);
  } catch (e) {
    unlinkSync(tmp);
    throw e;
  }
  try {
    const dir = openSync(dirname(path), 'r');
    try {
      fsyncSync(dir);
    } finally {
      closeSync(dir);
    }
  } catch {
    /* a folder cannot be flushed on every system (Windows): the rename is what makes it whole */
  }
}

/**
 * This Bridge's version: its package's (the packed web-scumm-bridge is one bundle, `src/cli.mjs`), else the
 * repository's, three folders up from this file.
 */
export function bridgeVersion(): string {
  for (const rel of ['../package.json', '../../../package.json']) {
    const f = new URL(rel, import.meta.url);
    if (!existsSync(f)) continue;
    try {
      const pkg = JSON.parse(readFileSync(f, 'utf8')) as { name?: string; version?: string };
      if ((pkg.name === 'web-scumm-bridge' || pkg.name === 'web-scumm') && pkg.version) return pkg.version;
    } catch {
      /* not this one */
    }
  }
  return 'unknown';
}
