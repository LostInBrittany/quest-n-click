// The project's former name (4.2.5, D47): web-scumm is now quest-n-click. Through 4.2.x the old command answers after a
// one-line notice, a game still imports `web-scumm/…`, `create` writes the engine's own name, and each package is also
// packed under its former name, the same files.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error: a plain .mjs module without declarations
import { aliasManifest, bridgeManifest, lockFor, studioServerManifest } from '../scripts/pack-manifests.mjs';

const root = JSON.parse(readFileSync('package.json', 'utf8'));

describe('the former name, web-scumm', () => {
  it('runs the same command after its notice on stderr, the output unchanged', () => {
    const now = spawnSync(process.execPath, ['cli/quest-n-click.mjs', 'help'], { encoding: 'utf8' });
    const old = spawnSync(process.execPath, ['cli/web-scumm.mjs', 'help'], { encoding: 'utf8' });
    expect(now.status).toBe(0);
    expect(old.status).toBe(0);
    expect(now.stdout).toContain('Usage: quest-n-click <command>');
    expect(old.stdout).toBe(now.stdout);
    expect(old.stderr.trim()).toBe('web-scumm is now quest-n-click; the old name works until 4.3');
    expect(now.stderr).toBe('');
  });

  it('resolves `web-scumm/…` imports as `quest-n-click/…` in the repository, its build and its tools', () => {
    const paths = JSON.parse(readFileSync('tsconfig.json', 'utf8')).compilerOptions.paths;
    expect(paths['quest-n-click/*']).toEqual(paths['web-scumm/*']);
    for (const f of ['vite.config.ts', 'studio-server/src/worker/preview-build.ts'])
      expect(readFileSync(f, 'utf8'), f).toContain(
        '/^(?:quest-n-click|web-scumm)\\/(content|player|minigames|testing)$/',
      );
  });

  it('creates a project under the engine package’s own name', () => {
    const create = readFileSync('cli/create.mjs', 'utf8');
    expect(create).toContain(
      "const { name: NAME, version } = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8'));",
    );
    expect(create).toContain('dependencies: { [NAME]: engine }');
    expect(create).toContain('[`${NAME}/*`]: [`./node_modules/${NAME}/src/engine/api/*`]');
    for (const f of ['game.ts', 'index.ts', 'items.ts', 'rules.ts', 'cast.ts', 'rooms/start.ts'])
      expect(readFileSync(`games/_template/${f}`, 'utf8'), f).not.toMatch(/from 'web-scumm\//);
  });

  it('packs each package again under its former name: the same manifest, the old name, the old engine peer', () => {
    const bridge = bridgeManifest(root);
    expect(bridge.name).toBe('quest-n-click-bridge');
    expect(bridge.bin).toEqual({ 'quest-n-click-bridge': 'bin.mjs', 'web-scumm-bridge': 'bin-web-scumm.mjs' });
    const old = aliasManifest(bridge);
    expect(old.name).toBe('web-scumm-bridge');
    expect({ ...old, name: bridge.name, description: bridge.description }).toEqual(bridge);
    const studio = aliasManifest(studioServerManifest(root));
    expect(studio.name).toBe('web-scumm-studio-server');
    expect(Object.keys(studio.peerDependencies)).toEqual(['web-scumm']);
    expect(aliasManifest({ name: 'create-quest-n-click', description: 'x' }).name).toBe('create-web-scumm');
    // Its lock: the alias's name, commands and peers, nothing resolved again.
    const lock = JSON.parse(readFileSync('scripts/locks/quest-n-click-studio-server.json', 'utf8'));
    const aliased = lockFor(lock, studio);
    expect(aliased.name).toBe('web-scumm-studio-server');
    expect(aliased.packages[''].peerDependencies).toEqual(studio.peerDependencies);
    expect(Object.keys(aliased.packages).sort()).toEqual(Object.keys(lock.packages).sort());
  });
});
