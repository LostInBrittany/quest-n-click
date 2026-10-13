#!/usr/bin/env node
// node tools/release/site-files.mjs --dir=dist --out=<file> (4.1.20 PR 4, docs/dev/PLAN-4.1.20-LAST-MILE.md §9.2): the
// built site a person plays, file by file: each path under `dist/` (forward slashes), its size and SHA-256. The
// candidate writes it beside the site's archive; a pass on the player, the PWA, the voices or a run is bound to the
// files it served through it (docs/dev/surfaces.json), not to the commit as a whole.
import { createHash } from 'node:crypto';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { filesUnder } from './candidate.mjs';

/** Every file of a built site, sorted by path. */
export function siteFiles(dir) {
  return {
    format: 'web-scumm-site-files',
    schema: 1,
    files: filesUnder(dir).map((path) => ({
      path,
      bytes: statSync(join(dir, path)).size,
      sha256: createHash('sha256')
        .update(readFileSync(join(dir, path)))
        .digest('hex'),
    })),
  };
}

const flag = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const dir = flag('dir');
  const out = flag('out');
  if (!dir || !out) {
    console.error('usage: node tools/release/site-files.mjs --dir=dist --out=<file>');
    process.exit(2);
  }
  const s = siteFiles(dir);
  if (!s.files.length) {
    console.error(`✖  ${dir}: no file (build the site first)`);
    process.exit(1);
  }
  writeFileSync(out, `${JSON.stringify(s, null, 1)}\n`);
  console.log(`✔  ${s.files.length} files of ${dir}, by SHA-256, in ${out}`);
}
