#!/usr/bin/env node
// node scripts/npm-install.mjs <npm install's arguments> (#471): `npm install` in the current folder, tried again on a
// registry hiccup (scripts/lib/archive-harness.mjs `npmInstall`), for a workflow step that installs without a lockfile.
import { npmInstall } from './lib/archive-harness.mjs';

try {
  npmInstall(['install', ...process.argv.slice(2)], { cwd: process.cwd() });
} catch (e) {
  console.error(`✖  ${e.message}`);
  process.exit(1);
}
