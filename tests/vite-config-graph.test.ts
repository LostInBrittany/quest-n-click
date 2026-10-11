// The Vite configuration's own import graph (4.1.19, plan §8.3): it holds the game's paths, the Vite plugins, the
// Studio's plugin and the hash of the game's trusted code, never the Studio, the solver or the engine behind them (the
// dev server loads the Studio itself, the demo snapshot runs in a process of its own). Every import in it names its
// file, as Vite's native configuration loader and Node's type stripping need; where Node strips types, that loader
// loads the configuration. The player's bundle is the same as before (checked when the change was made).
import { describe, expect, it } from 'vitest';
import { loadConfigFromFile } from 'vite';

const warnings: string[] = [];
const logger = {
  info: () => {},
  warn: (m: string) => void warnings.push(m),
  warnOnce: (m: string) => void warnings.push(m),
  error: (m: string) => void warnings.push(m),
  clearScreen: () => {},
  hasErrorLogged: () => false,
  hasWarned: false,
};

describe('the Vite configuration', () => {
  it('reads a small graph, every import with its extension', async () => {
    const r = await loadConfigFromFile(
      { command: 'build', mode: 'production' },
      undefined,
      process.cwd(),
      'warn',
      logger as never,
      'bundle',
    );
    const deps = (r?.dependencies ?? []).map((d) => d.replace(/\\/g, '/'));
    expect(warnings.filter((w) => /without a file extension/.test(w))).toEqual([]);
    expect(deps.length, deps.join('\n')).toBeLessThanOrEqual(16);
    for (const d of deps)
      expect(d, d).not.toMatch(/tools\/studio\/(core|assets|assistant|snapshot|backend)\.ts$|src\/engine\/tools\//);
  }, 60_000);

  it.runIf((process.features as { typescript?: unknown }).typescript)(
    'loads with the native loader where Node strips types',
    async () => {
      const r = await loadConfigFromFile(
        { command: 'build', mode: 'production' },
        undefined,
        process.cwd(),
        'warn',
        logger as never,
        'native',
      );
      expect(r?.config).toBeTruthy();
    },
    60_000,
  );
});
