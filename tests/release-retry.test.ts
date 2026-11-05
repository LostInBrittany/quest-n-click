// Git's network steps in the release tools, tried again (#410): during 4.6.0's release GitHub's Git operations were
// degraded (SSH refusing one time out of two), and one failed `git fetch --tags upstream main` stopped the release
// command ("main is not the organisation's"), one failed tag push stopped `ship tag`. Both are reads or idempotent
// writes (a tag pushed again at the same object is "up to date"): tried a few times, a short wait between, then stopped.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error: a plain .mjs module without declarations
import { retried } from '../tools/release/lib.mjs';

const failing = (n: number) => {
  let calls = 0;
  return {
    step: () => {
      calls++;
      if (calls <= n)
        throw new Error(`git fetch upstream main → 128\nssh: connect to host github.com: refused (${calls})`);
      return 'ok';
    },
    calls: () => calls,
  };
};

describe('a git network step, tried again (#410)', () => {
  it('returns what the step returns once it succeeds, saying each failed try and the wait', () => {
    const waits: number[] = [];
    const said: string[] = [];
    const s = failing(2);
    const out = retried(s.step, {
      what: 'git fetch upstream main',
      wait: (ms: number) => waits.push(ms),
      tell: (l: string) => said.push(l),
    });
    expect(out).toBe('ok');
    expect(s.calls()).toBe(3);
    expect(waits).toEqual([15_000, 15_000]);
    expect(said).toEqual([
      'git fetch upstream main failed (ssh: connect to host github.com: refused (1)), try 1/4: again in 15 s',
      'git fetch upstream main failed (ssh: connect to host github.com: refused (2)), try 2/4: again in 15 s',
    ]);
  });
  it('stops after four tries with the last error, never waiting after the last', () => {
    const waits: number[] = [];
    const s = failing(10);
    expect(() => retried(s.step, { wait: (ms: number) => waits.push(ms), tell: () => {} })).toThrow(/refused \(4\)/);
    expect(s.calls()).toBe(4);
    expect(waits).toHaveLength(3);
  });
  it('throws at once an error `again` says is not worth another try (a push the wiki refused)', () => {
    const waits: number[] = [];
    const s = failing(10);
    const again = (e: unknown) => !String((e as Error).message).includes('refused (1)');
    expect(() => retried(s.step, { again, wait: (ms: number) => waits.push(ms), tell: () => {} })).toThrow(
      /refused \(1\)/,
    );
    expect(s.calls()).toBe(1);
    expect(waits).toEqual([]);
  });
  it('waits nothing and says nothing when the first try succeeds', () => {
    const waits: number[] = [];
    expect(retried(() => 1, { wait: (ms: number) => waits.push(ms), tell: () => {} })).toBe(1);
    expect(waits).toEqual([]);
  });
});

describe('the release tools take their network steps through it (#410)', () => {
  const src = (f: string) => readFileSync(f, 'utf8');
  it('the release command and prepare fetch the organisation’s main through gitRetried', () => {
    expect(src('tools/release/release-run.ts')).toMatch(/gitRetried\(\['fetch', '--quiet', '--tags', remote, 'main'\]/);
    expect(src('tools/release/prepare.ts')).toMatch(/gitRetried\(\['fetch', '--quiet', remote, 'main'\]/);
  });
  it('ship tag fetches and pushes the tag through it', () => {
    const ship = src('tools/release/ship.mjs');
    const tag = ship.slice(ship.indexOf('async function tag('), ship.indexOf('async function watch('));
    expect(tag).toMatch(/gitRetried\(\['push', remote, `refs\/tags\/\$\{name\}`\]\)/);
    expect(tag).not.toMatch(/[^d]git\(\['(fetch|push)'/);
  });
});
