#!/usr/bin/env node
// node scripts/npm-install.mjs <npm install's arguments> (#471): `npm install` in the current folder, tried again on a
// registry hiccup (scripts/lib/archive-harness.mjs `npmInstall`), for a workflow step that installs without a lockfile.
// `node scripts/npm-install.mjs ci …` runs `npm ci` the same way (#539, .github/actions/setup), each try bounded by
// NPM_TRY_MINUTES when set. Node's own modules only: it runs before `npm ci`.
import { npmInstall } from './lib/archive-harness.mjs';

const argv = process.argv.slice(2);
try {
  npmInstall(argv[0] === 'ci' ? argv : ['install', ...argv], {
    cwd: process.cwd(),
    timeout: Number(process.env.NPM_TRY_MINUTES || 0) * 60_000,
  });
} catch (e) {
  console.error(`✖  ${e.message}`);
  process.exit(1);
}
