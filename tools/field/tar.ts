// The Field Kit's bundles as tar.gz, read and written here (4.1.19, plan §6.5): a bundle comes from someone else, so
// it is never handed to a system `tar` to unpack. Reading parses the archive in memory, under budgets set before a
// byte is inflated, and keeps regular files only: a link (symbolic or hard), a device, a FIFO, an extended header, an
// absolute path, a `..`, a backslash or a name twice refuses the whole bundle. Writing makes plain ustar entries in a
// fixed order with no owner, mode 0644 and time 0, the same bytes on every system.
import { gunzipSync, gzipSync } from 'node:zlib';

/** The bounds of a bundle; a bundle beyond any of them is refused before it is read further. */
export interface Budget {
  /** The compressed file. */
  maxArchiveBytes: number;
  /** One file once inflated. */
  maxFileBytes: number;
  /** Every file once inflated. */
  maxTotalBytes: number;
  maxEntries: number;
}
export const BUDGET: Budget = {
  // Never below the total: a bundle of evidence that does not compress (recordings, images) is still one bundle.
  maxArchiveBytes: 64 * 1024 * 1024,
  maxFileBytes: 16 * 1024 * 1024,
  maxTotalBytes: 64 * 1024 * 1024,
  maxEntries: 256,
};

const BLOCK = 512;

/** A name a bundle may hold: relative, `/`-separated, no `.` or `..` part, printable, at most 255 bytes. */
function safeName(name: string): string | null {
  if (!name || name.length > 255 || name.startsWith('/') || /^[A-Za-z]:/.test(name)) return null;
  if (name.includes('\\') || /[\u0000-\u001f\u007f]/.test(name)) return null;
  const parts = name.split('/');
  if (parts.some((p) => p === '' || p === '.' || p === '..')) return null;
  return name;
}

function field(h: Buffer, at: number, len: number): string {
  const s = h.subarray(at, at + len);
  const z = s.indexOf(0);
  return s.subarray(0, z < 0 ? len : z).toString('utf8');
}
const octal = (h: Buffer, at: number, len: number) => {
  const s = field(h, at, len).trim();
  return /^[0-7]+$/.test(s) ? Number.parseInt(s, 8) : Number.NaN;
};

/** The files of a tar.gz, in order; throws saying why the bundle is refused. */
export function readTarGz(archive: Buffer, budget: Budget = BUDGET): Map<string, Buffer> {
  if (archive.length > budget.maxArchiveBytes)
    throw new Error(`the bundle holds ${archive.length} bytes, more than ${budget.maxArchiveBytes}`);
  let tar: Buffer;
  try {
    // Inflated at most to the total budget plus the headers: a bomb stops here.
    tar = gunzipSync(archive, { maxOutputLength: budget.maxTotalBytes + (budget.maxEntries + 2) * BLOCK * 2 });
  } catch (e) {
    throw new Error(`not a gzip within its budget (${(e as Error).message})`);
  }
  const files = new Map<string, Buffer>();
  let total = 0;
  for (let at = 0; at + BLOCK <= tar.length; ) {
    const h = tar.subarray(at, at + BLOCK);
    if (h.every((b) => b === 0)) break;
    let sum = 0;
    for (let i = 0; i < BLOCK; i++) sum += i >= 148 && i < 156 ? 32 : h[i]!;
    if (sum !== octal(h, 148, 8)) throw new Error('a tar header does not check');
    const type = String.fromCharCode(h[156]!);
    // The prefix is ustar's: an old GNU header keeps other fields there (second reading of 4.1.19 PR 2b).
    const prefix = h.subarray(257, 263).toString('latin1') === 'ustar\0' ? field(h, 345, 155) : '';
    const raw = (prefix ? `${prefix}/` : '') + field(h, 0, 100);
    const size = octal(h, 124, 12);
    if (!Number.isSafeInteger(size)) throw new Error(`${raw}: a size that does not read`);
    at += BLOCK;
    const name = raw.replace(/^\.\//, '').replace(/\/$/, '');
    if (type === '5') {
      if (name && !safeName(name)) throw new Error(`${raw}: not a name a bundle may hold`);
      continue; // a folder: the files name their path
    }
    if (type !== '0' && type !== '\0')
      throw new Error(
        `${raw}: ${{ '1': 'a hard link', '2': 'a symbolic link', '3': 'a device', '4': 'a device', '6': 'a FIFO', x: 'an extended header', g: 'an extended header', L: 'a long name' }[type] ?? `an entry of type ${type}`}, refused`,
      );
    if (!safeName(name)) throw new Error(`${raw}: not a name a bundle may hold`);
    if (files.has(name)) throw new Error(`${name}: twice in the bundle`);
    if (files.size + 1 > budget.maxEntries) throw new Error(`more than ${budget.maxEntries} files`);
    if (size > budget.maxFileBytes) throw new Error(`${name}: ${size} bytes, more than ${budget.maxFileBytes}`);
    total += size;
    if (total > budget.maxTotalBytes) throw new Error(`more than ${budget.maxTotalBytes} bytes once inflated`);
    if (at + size > tar.length) throw new Error(`${name}: truncated`);
    files.set(name, Buffer.from(tar.subarray(at, at + size)));
    at += Math.ceil(size / BLOCK) * BLOCK;
  }
  return files;
}

function header(name: string, size: number): Buffer {
  const h = Buffer.alloc(BLOCK);
  let base = name;
  let prefix = '';
  // Cut by bytes, never by characters: a name in UTF-8 is never truncated or split (second reading of 4.1.19 PR 2b).
  if (Buffer.byteLength(name) > 100) {
    const cuts = [...name.matchAll(/\//g)].map((m) => m.index!);
    const cut = cuts.find(
      (i) => Buffer.byteLength(name.slice(0, i)) <= 155 && Buffer.byteLength(name.slice(i + 1)) <= 100,
    );
    if (cut === undefined) throw new Error(`${name}: too long for a bundle`);
    prefix = name.slice(0, cut);
    base = name.slice(cut + 1);
  }
  h.write(base, 0, 100, 'utf8');
  h.write('0000644\0', 100);
  h.write('0000000\0', 108);
  h.write('0000000\0', 116);
  h.write(`${size.toString(8).padStart(11, '0')}\0`, 124);
  h.write('00000000000\0', 136);
  h.write('        ', 148);
  h.write('0', 156);
  h.write('ustar\0', 257);
  h.write('00', 263);
  h.write(prefix, 345, 155, 'utf8');
  let sum = 0;
  for (const b of h) sum += b;
  h.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148);
  return h;
}

/** A tar.gz of these files, sorted by name: the same bytes for the same files. */
export function writeTarGz(files: Map<string, Buffer>): Buffer {
  const parts: Buffer[] = [];
  for (const name of [...files.keys()].sort()) {
    if (!safeName(name)) throw new Error(`${name}: not a name a bundle may hold`);
    const body = files.get(name)!;
    parts.push(header(name, body.length), body, Buffer.alloc((BLOCK - (body.length % BLOCK)) % BLOCK));
  }
  parts.push(Buffer.alloc(BLOCK * 2));
  return gzipSync(Buffer.concat(parts), { level: 9 });
}
