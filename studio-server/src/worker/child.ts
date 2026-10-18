// The worker's child process (4.2.1, ADR 0028): runs the game's code in the folder it is given and prints one JSON
// document: `validate`, the validator's verdict; `load`, the game module as data (functions dropped, as the Studio
// reads it). It is started with an emptied environment, in a fresh folder, and killed with its process group at its
// deadline; the game's code runs here, never in the supervisor... as far as one machine and one user allow (ADR 0028).
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tsImport } from 'tsx/esm/api';
import { validateDir } from '../ops/validate-dir';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const [dir, kind] = process.argv.slice(2);
if (!dir) process.exit(2);
const importFresh = (file: string) => tsImport(pathToFileURL(file).href, import.meta.url);
if (kind === 'load') {
  const m = await importFresh(join(dir, 'index.ts'));
  process.stdout.write(JSON.stringify(m, (_k, v) => (typeof v === 'function' ? undefined : v)));
} else {
  const r = await validateDir(dir, { root: ROOT, importFresh });
  process.stdout.write(JSON.stringify({ errors: r.errors, warnings: r.warnings }));
}
