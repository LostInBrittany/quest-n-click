// The mutation cache's input hash (4.5.6, #371): what it follows and what it does not. A fix in the wiki checker moved
// `core`'s hash on 26 October 2026 and re-ran every set of the release candidate (about three hours of CI), through
// a type-only import and the dev server's Studio plugin that vite.config.ts imports. Neither can change a verdict.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CONFIG_FOLLOWS,
  CONFIG_SKIPS,
  CONFIGS,
  importClosure,
  inputFiles,
  inputHash,
  runtimeImports,
} from '../tools/mutate';
import { ROOT } from '../tools/game';

describe('the imports a file loads at runtime', () => {
  const of = (src: string) => runtimeImports('x.ts', src);

  it('skips what the compiler erases: import type, export type, and an import whose every name is a type', () => {
    expect(of(`import type { A } from './a';`)).toEqual([]);
    expect(of(`import type * as N from './n';`)).toEqual([]);
    expect(of(`export type { A } from './a';`)).toEqual([]);
    expect(of(`export type * from './a';`)).toEqual([]);
    expect(of(`import { type A, type B } from './a';`)).toEqual([]);
    expect(of(`export { type A, type B } from './a';`)).toEqual([]);
    expect(of(`type T = typeof import('./t');`)).toEqual([]);
  });

  it('follows every import with a value in it', () => {
    expect(of(`import { type A, b } from './a';`)).toEqual(['./a']);
    expect(of(`import d, { type A } from './a';`)).toEqual(['./a']);
    expect(of(`import * as n from './n';`)).toEqual(['./n']);
    expect(of(`import './side-effect';`)).toEqual(['./side-effect']);
    expect(of(`import {} from './empty';`)).toEqual(['./empty']);
    expect(of(`export * from './e';`)).toEqual(['./e']);
    expect(of(`export { x, type Y } from './e';`)).toEqual(['./e']);
    expect(of(`const m = await import('./d');`)).toEqual(['./d']);
    expect(of(`const m = require('./r');`)).toEqual(['./r']);
  });

  it('reads code, not comments or strings', () => {
    expect(of(`// import { a } from './c';\nconst s = "from './s'";`)).toEqual([]);
  });
});

describe('the input hash', () => {
  let root = '';
  afterEach(() => root && rmSync(root, { recursive: true, force: true }));

  // A repository with `core`'s first source importing one module for a value and another for a type, and a
  // vite.config.ts that imports the game's settings (followed) and the Studio plugin (not followed).
  const repo = () => {
    root = mkdtempSync(join(tmpdir(), 'mutate-hash-'));
    const put = (f: string, s: string) => {
      mkdirSync(dirname(join(root, f)), { recursive: true });
      writeFileSync(join(root, f), s);
    };
    put(
      'package-lock.json',
      JSON.stringify({
        version: '1.0.0',
        packages: { '': { version: '1.0.0' } },
      }),
    );
    put('tests/core.test.ts', `import { ok } from '../src/engine/core/cond';\n`);
    put(
      'src/engine/core/cond.ts',
      `import { value } from './value';\nimport type { Shape } from './shape';\nexport const ok = value;\n`,
    );
    put('src/engine/core/value.ts', `export const value = 1;\n`);
    put('src/engine/core/shape.ts', `export interface Shape { a: number }\n`);
    put(
      'vite.config.ts',
      `import { GAME } from './tools/game.ts';\nimport { studioPlugin } from './tools/studio/plugin.ts';\nexport default {};\n`,
    );
    put('tools/game.ts', `export const GAME = 'demo';\n`);
    put('tools/studio/plugin.ts', `import { page } from '../wiki/page.ts';\nexport const studioPlugin = page;\n`);
    put('tools/wiki/page.ts', `export const page = 1;\n`);
    return put;
  };

  it('moves when a module a source imports for a value changes', () => {
    const put = repo();
    const before = inputHash('core', root);
    put('src/engine/core/value.ts', `export const value = 2;\n`);
    expect(inputHash('core', root)).not.toBe(before);
  });

  it('stays when a module a source imports only for a type changes', () => {
    const put = repo();
    const before = inputHash('core', root);
    put('src/engine/core/shape.ts', `export interface Shape { a: string }\n`);
    expect(inputHash('core', root)).toBe(before);
  });

  it("moves when a set's source, a test, the survivors or the lockfile's dependencies change", () => {
    const put = repo();
    const seen = new Set([inputHash('core', root)]);
    put('src/engine/core/cond.ts', `import { value } from './value';\nexport const ok = !value;\n`);
    seen.add(inputHash('core', root));
    put('tests/core.test.ts', `import { ok } from '../src/engine/core/cond';\nok;\n`);
    seen.add(inputHash('core', root));
    put('docs/dev/mutants.json', '[]');
    seen.add(inputHash('core', root));
    put(
      'package-lock.json',
      JSON.stringify({
        version: '1.0.0',
        packages: { 'node_modules/x': { version: '2' } },
      }),
    );
    seen.add(inputHash('core', root));
    expect(seen.size).toBe(5);
  });

  it('stays when only the lockfile’s own version moves (a release)', () => {
    const put = repo();
    const before = inputHash('core', root);
    put(
      'package-lock.json',
      JSON.stringify({
        version: '1.0.1',
        packages: { '': { version: '1.0.1' } },
      }),
    );
    expect(inputHash('core', root)).toBe(before);
  });

  it("moves with vite.config.ts itself and what it imports for the tests, not with the dev server's plugins", () => {
    const put = repo();
    const before = inputHash('core', root);
    put('tools/wiki/page.ts', `export const page = 2;\n`);
    put('tools/studio/plugin.ts', `import { page } from '../wiki/page.ts';\nexport const studioPlugin = () => page;\n`);
    expect(inputHash('core', root)).toBe(before);
    put('tools/game.ts', `export const GAME = 'other';\n`);
    const game = inputHash('core', root);
    expect(game).not.toBe(before);
    put('vite.config.ts', `${readFileSync(join(root, 'vite.config.ts'), 'utf8')}// a change\n`);
    expect(inputHash('core', root)).not.toBe(game);
  });

  // 4.7.0's release pull request moved every entry's `revisit` from 4.7.0 to 4.8.0 (9ef34c7a): every set's hash moved,
  // the warm-up's cache served none, and the candidate measured all 20 shards again (#410 PR 4). The verdict reads an
  // entry by the mutant it names (`sameMutant`); the rest is checked by `checkKnown` on every run, a reuse included.
  const survivor = {
    file: 'src/engine/core/cond.ts',
    operator: 'boolean',
    from: 'true',
    to: 'false',
    context: 'export const ok = true;',
    why: 'the value is never read: a long enough reason',
    category: 'equivalent',
    proof: 'argument',
    owner: '@someone',
    revisit: '4.7.0',
  };
  const other = {
    ...survivor,
    from: 'false',
    to: 'true',
    context: 'export const no = false;',
  };

  it("stays when only what an entry says of its mutant moves: revisit, why, owner, proof, category (4.7.0's reread)", () => {
    const put = repo();
    put('docs/dev/mutants.json', JSON.stringify([survivor, other], null, 1));
    const before = inputHash('core', root);
    put(
      'docs/dev/mutants.json',
      JSON.stringify(
        [
          {
            ...survivor,
            revisit: '4.8.0',
            why: 'read again: the value is still never read',
            owner: '@another',
            proof: 'tests/core.test.ts',
            category: 'unreachable',
          },
          { ...other, revisit: '4.8.0' },
        ],
        null,
        2,
      ),
    );
    expect(inputHash('core', root)).toBe(before);
    put('docs/dev/mutants.json', JSON.stringify([other, survivor]));
    expect(inputHash('core', root)).toBe(before);
  });

  it('moves when an entry names another mutant, or one is added or removed', () => {
    const put = repo();
    put('docs/dev/mutants.json', JSON.stringify([survivor]));
    const seen = new Set([inputHash('core', root)]);
    for (const k of ['file', 'operator', 'from', 'to', 'context'] as const) {
      put('docs/dev/mutants.json', JSON.stringify([{ ...survivor, [k]: `${survivor[k]} (another)` }]));
      seen.add(inputHash('core', root));
    }
    const { context: _, ...anywhere } = survivor;
    put('docs/dev/mutants.json', JSON.stringify([anywhere]));
    seen.add(inputHash('core', root));
    put('docs/dev/mutants.json', JSON.stringify([survivor, other]));
    seen.add(inputHash('core', root));
    put('docs/dev/mutants.json', '[]');
    seen.add(inputHash('core', root));
    expect(seen.size).toBe(9);
  });

  it('stays when a coverage floor moves (4.6.0, #405): the floors are data vite.config.ts reads, not an input', () => {
    const put = repo();
    put('tests/coverage-floors.json', '{"total":{"lines":75},"groups":[]}\n');
    const before = inputHash('core', root);
    put('tests/coverage-floors.json', '{"total":{"lines":76},"groups":[]}\n');
    expect(inputHash('core', root)).toBe(before);
  });
});

describe('the input files of this repository', () => {
  it("leave the wiki tools and the Studio plugin out of core's inputs, and keep what core runs", () => {
    const files = inputFiles('core');
    expect(files).not.toContain('tools/wiki/page.ts');
    expect(files).not.toContain('tools/studio/plugin.ts');
    for (const f of ['src/engine/core/engine.ts', 'src/engine/core/cond.ts', 'tests/core.test.ts', 'vite.config.ts'])
      expect(files).toContain(f);
  });

  it('leave the coverage floors out of every set (4.6.0, #405): raising one re-runs no mutation set', () => {
    // `all` is every set's inputs together.
    const files = inputFiles('all');
    expect(files).not.toContain('tests/coverage-floors.json');
    expect(files).not.toContain('tools/coverage-floors.ts');
    expect(files).toContain('vite.config.ts');
    // Every set's import closure: over 5 s on a loaded CI runner (unit 4 on #407).
  }, 30_000);

  it("leave the shards' minutes out of every set (#410 PR 4): refreshing the matrix's order re-runs no set", () => {
    const files = inputFiles('all');
    expect(files).not.toContain('tools/mutation-minutes.json');
    expect(files).toContain('tools/mutation-sets.ts');
    expect(readFileSync(join(ROOT, 'tools/mutation-sets.ts'), 'utf8')).not.toMatch(/MINUTES/);
  }, 30_000);

  it('classify every module the two configurations import: followed for the tests, or skipped with a reason', () => {
    // A new import in vite.config.ts fails here until it is placed in one list or the other: a plugin that transforms
    // modules (a `transform`, a `resolveId`, a `load`) changes what the tests run, and belongs to CONFIG_FOLLOWS.
    const imported = new Set<string>();
    for (const c of CONFIGS)
      for (const f of importClosure([c], ROOT, (from) => from === c)) if (!CONFIGS.includes(f)) imported.add(f);
    expect([...imported].sort()).toEqual([...CONFIG_FOLLOWS, ...Object.keys(CONFIG_SKIPS)].sort());
  });
});
