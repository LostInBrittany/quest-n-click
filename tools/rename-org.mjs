#!/usr/bin/env node
// node tools/rename-org.mjs [--check] (4.5.2 "Org", D51): the repository moved from the user wanoo to the Quest-n-Click
// organization, and its site from wanoo.github.io/quest-n-click to quest-n-click.github.io (the game under /play/, the
// documentation under /docs/). This script rewrites the addresses in every tracked text file, the same way each time:
//   - https://wanoo.github.io/quest-n-click/docs/… → https://quest-n-click.github.io/docs/…
//   - https://wanoo.github.io/quest-n-click/studio.html, and any other page of the old site → …/play/…
//   - github.com/wanoo/quest-n-click, and `wanoo/quest-n-click` in a `-R` or a repository string (or URL-encoded,
//     `wanoo%2Fquest-n-click`) → Quest-n-Click/…
// It is idempotent: a second run changes nothing. `--check` writes nothing and exits 1 naming each file that still
// holds an old address outside the exceptions (tests/rename-org.test.ts runs it).
// The exceptions keep history true: what was written of a released version (the CHANGELOG, the LOG, the decisions, the
// ADRs, the plans and pass sheets of past releases), the provenance constants of the identities attested before the
// transfer and the tests that name them on purpose, and a few sentences of the wiki that say where things were.
// The former name, wanoo/web-scumm, is not touched: what still names it is history (D47).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Paths kept whole (a folder ends with `/`). */
export const EXCLUDED = [
  'CHANGELOG.md',
  'docs/dev/LOG.md',
  'docs/dev/DECISIONS.md',
  'docs/dev/adr/',
  'docs/dev/passes/',
  'docs/dev/plans/',
  'docs/dev/PLAN-4.5-WIKI.md',
  'changes/452-org.md',
  'changes/452-org.log.md',
  'tools/rename-org.mjs',
  'tests/rename-org.test.ts',
  'tools/release/provenance.mjs',
  'tests/release-provenance.test.ts',
  'tests/wiki-pages.test.ts',
];

/** Sentences kept as they are inside a file that is otherwise renamed: where the repository and its site were. */
export const KEEP = {
  'wiki/en/install.from-web-scumm.md': ['from\nv4.2.5 to v4.5.1 they name `wanoo/quest-n-click`'],
  'wiki/fr/install.from-web-scumm.md': ['de la v4.2.5 à la v4.5.1, elles nomment `wanoo/quest-n-click`'],
  'wiki/en/install.upgrade-notes-4-2.md': ['from v4.2.5 to v4.5.1 the attestations name\n`wanoo/quest-n-click`'],
  'wiki/fr/install.upgrade-notes-4-2.md': ['de la v4.2.5 à la v4.5.1, les attestations nomment\n`wanoo/quest-n-click`'],
  'wiki/en/install.from-repository.md': ['`github.com/wanoo/quest-n-click` (4.2.5 to 4.5.1)'],
  'wiki/fr/install.from-repository.md': ['`github.com/wanoo/quest-n-click` (de la 4.2.5 à la 4.5.1)'],
  'wiki/en/start.play-online.md': ['`wanoo.github.io/quest-n-click` (4.2.5 to 4.5.1)'],
  'wiki/fr/start.play-online.md': ['`wanoo.github.io/quest-n-click` (de la 4.2.5 à la 4.5.1)'],
  'wiki/en/start.what-it-is.md': ['(`wanoo/quest-n-click`, `wanoo/web-scumm`)', 'and `wanoo.github.io/quest-n-click`'],
  'tools/release/ship.mjs': ['wanoo/quest-n-click\n    // up to 4.5.1'],
  'tools/field/bundle.ts': ['was attested by wanoo/quest-n-click'],
  'wiki/fr/start.what-it-is.md': ['(`wanoo/quest-n-click`, `wanoo/web-scumm`)', 'et `wanoo.github.io/quest-n-click`'],
};

/** What an old address looks like; `renameText` leaves none outside what it keeps. */
export const OLD =
  /wanoo\.github\.io\/quest-n-click(?![\w-])|(?:(?<![\w.-])|(?<=%3A))wanoo(?:\/|%2F)quest-n-click(?![\w-])/;

const SITE = /(https?:\/\/)?wanoo\.github\.io\/quest-n-click(?![\w-])(\/)?/g;
const REPO = /(?:(?<![\w.-])|(?<=%3A))wanoo(\/|%2F)quest-n-click(?![\w-])/g;

/** One text renamed (the parts of it `keep` lists left as they are). */
export function renameText(text, keep = []) {
  if (keep.length) {
    const at = keep.map((k) => text.indexOf(k)).filter((i) => i >= 0);
    if (at.length) {
      const i = Math.min(...at);
      const k = keep.find((s) => text.indexOf(s) === i);
      return renameText(text.slice(0, i), keep) + k + renameText(text.slice(i + k.length), keep);
    }
  }
  return text
    .replace(SITE, (_m, scheme = '', slash, offset, all) => {
      const rest = all.slice(offset + _m.length);
      // The documentation keeps its path: /docs/<v>/r<n>/… is the same tree on the organization's site.
      if (slash && /^docs(?![\w-])/.test(rest)) return `${scheme}quest-n-click.github.io/`;
      return `${scheme}quest-n-click.github.io/play${slash || scheme ? '/' : ''}`;
    })
    .replace(REPO, (_m, sep) => `Quest-n-Click${sep}quest-n-click`);
}

const excluded = (f) => EXCLUDED.some((e) => (e.endsWith('/') ? f.startsWith(e) : f === e));

/** The tracked text files of a checkout, outside the exceptions. */
function files(root) {
  return execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 })
    .split('\0')
    .filter((f) => f && !excluded(f));
}

/** Each file whose text the renaming changes: `{ file, before, after }`. */
export function pending(root = '.') {
  const out = [];
  for (const file of files(root)) {
    let before;
    try {
      before = readFileSync(join(root, file), 'utf8');
    } catch {
      continue; // a file deleted in the working tree, a submodule
    }
    if (before.includes('\0') || !OLD.test(before)) continue;
    const after = renameText(before, KEEP[file]);
    if (after !== before) out.push({ file, before, after });
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const check = process.argv.includes('--check');
  const todo = pending();
  for (const { file, after } of todo) {
    if (check) console.error(`✖ ${file}: an address of the repository or the site before the transfer`);
    else writeFileSync(file, after);
  }
  if (check && todo.length) {
    console.error(`✖ ${todo.length} file(s) to rename: node tools/rename-org.mjs`);
    process.exit(1);
  }
  console.log(check ? '✔ no address before the transfer outside the exceptions' : `✔ ${todo.length} file(s) renamed`);
}
