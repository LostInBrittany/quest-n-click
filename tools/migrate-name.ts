// The project's former name in a game project (4.3.0, D47): `quest-n-click migrate` rewrites what still says
// `web-scumm`, now that the aliases are gone. A module of its own, so a test reads it (tools/migrate.ts runs at
// import), and the Studio Server's engine upgrade renames a hosted game's imports with it (studio-server/src/worker).
// Only the names of the package, its imports and its commands move: a format identifier (`web-scumm-save`, the
// `WEB_SCUMM_*` variables, the storage keys) has no `/` after it and is not a command, so it stays as it is.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** `'web-scumm/content'` and `"web-scumm/…"` → `quest-n-click/…`, in either quote style. */
const IMPORT = /(['"])web-scumm\//g;

/** A source file's text with its `web-scumm/…` imports renamed, or null when it has none. */
export function renameImports(text: string): string | null {
  const next = text.replace(IMPORT, '$1quest-n-click/');
  return next === text ? null : next;
}

/** tsconfig.json: the `web-scumm/*` path and the `node_modules/web-scumm/…` targets and includes. */
export function renameTsconfig(text: string): string | null {
  const next = text.replace(/(['"/])web-scumm\//g, '$1quest-n-click/');
  return next === text ? null : next;
}

/** Each package by its former name (through 4.2.x) and its name since 4.2.5. */
export const FORMER_PACKAGES: Record<string, string> = {
  'web-scumm': 'quest-n-click',
  'create-web-scumm': 'create-quest-n-click',
  'web-scumm-bridge': 'quest-n-click-bridge',
  'web-scumm-connectors': 'quest-n-click-connectors',
  'web-scumm-studio-server': 'quest-n-click-studio-server',
};

/** The former commands in a script line: `web-scumm dev`, `web-scumm-bridge serve`, `npx create-web-scumm`. */
const COMMAND = /(?<![\w./@-])(create-)?web-scumm(-bridge|-connectors?|-studio-server|-studio-worker)?(?![\w.@/-])/g;

export interface RenamedPackage {
  /** The new text, or null when nothing is to change. */
  text: string | null;
  /** What the author still does by hand: a former package the project depends on whose new name it lacks. */
  todo: string[];
}

/**
 * package.json: the scripts' commands and a script named after the command; a dependency on a former package dropped
 * when the new one is there too (`npm install` then prunes it), otherwise said, never guessed (its spec names an
 * archive or a version of the old package).
 */
export function renamePackageJson(text: string): RenamedPackage {
  const pkg = JSON.parse(text) as Record<string, unknown> & {
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const todo: string[] = [];
  if (pkg.scripts)
    pkg.scripts = Object.fromEntries(
      Object.entries(pkg.scripts).map(([k, v]) => [
        k === 'web-scumm' ? 'quest-n-click' : k,
        String(v).replace(COMMAND, '$1quest-n-click$2'),
      ]),
    );
  const all = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const field of ['dependencies', 'devDependencies'] as const) {
    const deps = pkg[field];
    if (!deps) continue;
    for (const [old, now] of Object.entries(FORMER_PACKAGES))
      if (old in deps) {
        if (now in all) delete deps[old];
        else todo.push(`package.json depends on ${old}: npm uninstall ${old} && npm install ${now}`);
      }
  }
  const next = `${JSON.stringify(pkg, null, 2)}\n`;
  return { text: JSON.stringify(JSON.parse(text)) === JSON.stringify(pkg) ? null : next, todo };
}

/** The folders of a project the rename never enters: dependencies, builds, caches, the built assets, anything hidden. */
const SKIP = new Set(['node_modules', 'dist', 'public']);
const SOURCE = /\.(?:[cm]?[jt]s|tsx|jsx)$/;

/** Every source file of a project (`/` paths), its folders above left out. */
export function sourcesIn(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.') || SKIP.has(e.name)) continue;
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && SOURCE.test(e.name)) out.push(relative(dir, p).split(sep).join('/'));
    }
  };
  walk(dir);
  return out.sort();
}

/**
 * The former name in a game project (`dir`): its sources' imports, its tsconfig.json, its package.json. `write`: the
 * files rewritten, otherwise only named. Returns the files that change (`/` paths) and what is left to the author.
 */
export function renameProject(dir: string, o: { write: boolean }): { files: string[]; todo: string[] } {
  const files: string[] = [];
  const todo: string[] = [];
  const change = (path: string, next: string | null) => {
    if (next === null) return;
    files.push(path);
    if (o.write) writeFileSync(join(dir, path), next);
  };
  for (const f of sourcesIn(dir)) change(f, renameImports(readFileSync(join(dir, f), 'utf8')));
  if (existsSync(join(dir, 'tsconfig.json')))
    change('tsconfig.json', renameTsconfig(readFileSync(join(dir, 'tsconfig.json'), 'utf8')));
  if (existsSync(join(dir, 'package.json'))) {
    const r = renamePackageJson(readFileSync(join(dir, 'package.json'), 'utf8'));
    change('package.json', r.text);
    todo.push(...r.todo);
  }
  return { files, todo };
}
