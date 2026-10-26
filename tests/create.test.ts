// `quest-n-click create` (cli/create.mjs) writes a project with a starting test (4.5.6, #384): the template's own
// tests/game.test.ts as game/tests/game.test.ts, a vitest.config.ts with no alias, and `npm test` with vitest as a
// development dependency, at the engine's own version.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..');
const base = mkdtempSync(join(tmpdir(), 'qnc-create-'));
afterAll(() => rmSync(base, { recursive: true, force: true }));

describe('quest-n-click create', () => {
  const dir = join(base, 'lantern');
  execFileSync(process.execPath, [join(ROOT, 'cli', 'create.mjs'), dir, 'The Lantern'], { stdio: 'pipe' });
  const read = (f: string) => readFileSync(join(dir, f), 'utf8');

  it('copies the template test, which names no room, into game/tests', () => {
    expect(read('game/tests/game.test.ts')).toBe(
      readFileSync(join(ROOT, 'games/_template/tests/game.test.ts'), 'utf8'),
    );
    expect(read('game/tests/game.test.ts')).toContain("import { game, layouts } from '..';");
    expect(read('game/tests/game.test.ts')).not.toMatch(/layout\/\w+\.json/);
  });

  it('writes a vitest.config.ts with no alias', () => {
    const config = read('vitest.config.ts');
    expect(config).toContain("include: ['game/tests/**/*.test.ts']");
    expect(config).not.toMatch(/alias|node_modules/);
  });

  it('gives the project npm test and the engine’s vitest', () => {
    const pkg = JSON.parse(read('package.json'));
    const engine = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    expect(pkg.scripts.test).toBe('vitest run');
    expect(pkg.devDependencies).toEqual({ vitest: engine.devDependencies.vitest });
    expect(read('README.md')).toContain('npm test');
    expect(existsSync(join(dir, 'game', 'index.ts'))).toBe(true);
  });
});
