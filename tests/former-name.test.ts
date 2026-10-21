// The project's former name (4.2.5, D47): web-scumm is now quest-n-click. Through 4.2.x the old names were aliases;
// 4.3.0 removes them (D47, D48): no `web-scumm` command, no `web-scumm/…` import, no package packed under the old name.
// `quest-n-click migrate` renames what a game project of 4.2.x or before still says (tools/migrate-name.ts), and the
// formats keep their names.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error: a plain .mjs module without declarations
import * as manifests from '../scripts/pack-manifests.mjs';
import { renameImports, renamePackageJson, renameProject, renameTsconfig, sourcesIn } from '../tools/migrate-name';

const root = JSON.parse(readFileSync('package.json', 'utf8'));

describe('the former name, web-scumm, gone in 4.3.0', () => {
  it('has no command, no import path and no build alias left', () => {
    expect(existsSync('cli/web-scumm.mjs')).toBe(false);
    const paths = JSON.parse(readFileSync('tsconfig.json', 'utf8')).compilerOptions.paths;
    expect(Object.keys(paths).filter((k) => k.includes('web-scumm'))).toEqual([]);
    for (const f of ['vite.config.ts', 'studio-server/src/worker/preview-build.ts']) {
      const s = readFileSync(f, 'utf8');
      expect(s, f).toContain('/^quest-n-click\\/(content|player|minigames|testing)$/');
      expect(s, f).not.toContain('|web-scumm)');
    }
  });

  it('packs each package under its own name only, its commands the new ones', () => {
    expect(manifests.aliasManifest).toBeUndefined();
    for (const m of [
      manifests.bridgeManifest(root),
      manifests.connectorsManifest(root),
      manifests.studioServerManifest(root),
    ]) {
      expect(m.name).toMatch(/^quest-n-click-/);
      expect(JSON.stringify(m.bin), m.name).not.toContain('web-scumm');
      expect(Object.keys(m.peerDependencies ?? {}).join(), m.name).not.toContain('web-scumm');
    }
    const pack = readFileSync('scripts/pack.mjs', 'utf8');
    expect(pack).not.toMatch(/create-web-scumm|bin-web-scumm|oldCommand|aliasManifest|'web-scumm'/);
    for (const f of ['quest-n-click-bridge', 'quest-n-click-connectors', 'quest-n-click-studio-server'])
      expect(readFileSync(`scripts/locks/${f}.json`, 'utf8'), f).not.toContain('web-scumm');
  });

  it('creates a project under the engine package’s own name', () => {
    const create = readFileSync('cli/create.mjs', 'utf8');
    expect(create).toContain(
      "const { name: NAME, version } = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8'));",
    );
    expect(create).toContain('dependencies: { [NAME]: engine }');
    for (const f of ['game.ts', 'index.ts', 'items.ts', 'rules.ts', 'cast.ts', 'rooms/start.ts'])
      expect(readFileSync(`games/_template/${f}`, 'utf8'), f).not.toMatch(/from 'web-scumm\//);
  });
});

describe('quest-n-click migrate and the former name', () => {
  it('renames the imports in either quote style, and nothing that only starts like them', () => {
    expect(renameImports("import { defineGame } from 'web-scumm/content';\n")).toBe(
      "import { defineGame } from 'quest-n-click/content';\n",
    );
    expect(renameImports('import type { M } from "web-scumm/minigames";\nawait import(\'web-scumm/testing\');')).toBe(
      'import type { M } from "quest-n-click/minigames";\nawait import(\'quest-n-click/testing\');',
    );
    // The formats keep their names (D47): a save envelope, a storage key, a variable, a URL.
    for (const kept of [
      "const f = 'web-scumm-save';",
      "localStorage.getItem('web-scumm.settings');",
      'process.env.WEB_SCUMM_PROJECT',
      "fetch('https://wanoo.github.io/web-scumm/')",
      "import { x } from 'quest-n-click/content';",
    ])
      expect(renameImports(kept), kept).toBeNull();
  });

  it("renames a project tsconfig's paths and includes", () => {
    const before = {
      compilerOptions: {
        paths: {
          '@engine/*': ['./node_modules/web-scumm/src/engine/*'],
          'web-scumm/*': ['./node_modules/web-scumm/src/engine/api/*'],
          '@game': ['./game/index.ts'],
        },
      },
      include: ['game', 'node_modules/web-scumm/src/env.d.ts'],
    };
    expect(JSON.parse(renameTsconfig(JSON.stringify(before, null, 2))!)).toEqual({
      compilerOptions: {
        paths: {
          '@engine/*': ['./node_modules/quest-n-click/src/engine/*'],
          'quest-n-click/*': ['./node_modules/quest-n-click/src/engine/api/*'],
          '@game': ['./game/index.ts'],
        },
      },
      include: ['game', 'node_modules/quest-n-click/src/env.d.ts'],
    });
    expect(renameTsconfig(JSON.stringify({ include: ['game'] }))).toBeNull();
  });

  it("renames package.json's commands, drops a former dependency the new one replaces, says the rest", () => {
    const pkg = {
      name: 'keeper',
      scripts: {
        dev: 'web-scumm dev',
        bridge: 'web-scumm-bridge serve && web-scumm-connector email --config c.json',
        studio: 'WEB_SCUMM_LAN=1 web-scumm studio',
        save: 'cp web-scumm-save.json out/',
        'web-scumm': 'web-scumm',
      },
      dependencies: { 'quest-n-click': 'file:quest-n-click-4.3.0.tgz', 'web-scumm': '^4.2.5' },
      devDependencies: { 'web-scumm-bridge': '^4.2.5' },
    };
    const r = renamePackageJson(`${JSON.stringify(pkg, null, 2)}\n`);
    const after = JSON.parse(r.text!);
    expect(after.scripts).toEqual({
      dev: 'quest-n-click dev',
      bridge: 'quest-n-click-bridge serve && quest-n-click-connector email --config c.json',
      studio: 'WEB_SCUMM_LAN=1 quest-n-click studio',
      save: 'cp web-scumm-save.json out/',
      'quest-n-click': 'quest-n-click',
    });
    expect(after.dependencies).toEqual({ 'quest-n-click': 'file:quest-n-click-4.3.0.tgz' });
    expect(after.devDependencies).toEqual({ 'web-scumm-bridge': '^4.2.5' });
    expect(r.todo).toEqual([
      'package.json depends on web-scumm-bridge: npm uninstall web-scumm-bridge && npm install quest-n-click-bridge',
    ]);
    const done = { name: 'g', scripts: { dev: 'quest-n-click dev' }, dependencies: { 'quest-n-click': '4.3.0' } };
    expect(renamePackageJson(JSON.stringify(done))).toEqual({ text: null, todo: [] });
  });

  it('finds every file of a project to rename, outside node_modules, builds and hidden folders, and writes them', () => {
    const dir = mkdtempSync(join(tmpdir(), 'qnc-former-'));
    try {
      const put = (f: string, s: string) => {
        mkdirSync(join(dir, f, '..'), { recursive: true });
        writeFileSync(join(dir, f), s);
      };
      const imp = "import { defineGame } from 'web-scumm/content';\n";
      put('game/game.ts', imp);
      put('game/rooms/start.ts', imp);
      put('game/items.ts', "import type { ItemDef } from 'quest-n-click/content';\n");
      put('make-save.ts', "import { solve } from 'web-scumm/testing';\n");
      put('node_modules/web-scumm/x.ts', imp);
      put('dist/a.js', imp);
      put('.cache/a.ts', imp);
      put(
        'tsconfig.json',
        '{ "compilerOptions": { "paths": { "web-scumm/*": ["./node_modules/web-scumm/src/engine/api/*"] } } }\n',
      );
      put('package.json', `${JSON.stringify({ name: 'k', scripts: { dev: 'web-scumm dev' } }, null, 2)}\n`);
      expect(sourcesIn(dir)).toEqual(['game/game.ts', 'game/items.ts', 'game/rooms/start.ts', 'make-save.ts']);
      const want = ['game/game.ts', 'game/rooms/start.ts', 'make-save.ts', 'tsconfig.json', 'package.json'];
      expect(renameProject(dir, { write: false })).toEqual({ files: want, todo: [] });
      expect(readFileSync(join(dir, 'game/game.ts'), 'utf8')).toBe(imp);
      expect(renameProject(dir, { write: true }).files).toEqual(want);
      expect(readFileSync(join(dir, 'game/game.ts'), 'utf8')).toContain("from 'quest-n-click/content'");
      expect(readFileSync(join(dir, 'tsconfig.json'), 'utf8')).toContain('"quest-n-click/*"');
      expect(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).scripts.dev).toBe('quest-n-click dev');
      expect(readFileSync(join(dir, 'node_modules/web-scumm/x.ts'), 'utf8')).toBe(imp);
      expect(renameProject(dir, { write: false })).toEqual({ files: [], todo: [] });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('runs before the game is loaded, then again in a new process', () => {
    const m = readFileSync('tools/migrate.ts', 'utf8');
    expect(m.indexOf('renameProject(PROJECT')).toBeGreaterThan(0);
    expect(m.indexOf('renameProject(PROJECT')).toBeLessThan(m.indexOf('await loadGameModule()'));
  });
});
