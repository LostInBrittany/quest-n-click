import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  differences,
  improvements,
  metricsOf,
  readmeDrift,
  readmeFor,
  toWrite,
  withMetrics,
} from '../tools/quality-baseline';

// The baseline of 4.1.0 "Clarity" (tools/quality-baseline.ts): what a behaviour-preserving change must not move.
const base = () => JSON.parse(readFileSync('tests/quality-baseline.json', 'utf8'));

describe('quality baseline', () => {
  it("writes the READMEs' figures between their markers, and both READMEs carry them", () => {
    const b = {
      ...base(),
      tests: { files: 1, declarations: 1234 },
      bundle: { initialJsKB: 99, initialJsBytes: 99 * 1024 },
    };
    expect(
      withMetrics(
        'a <!-- metric:tests -->1<!-- /metric --> b <!-- metric:initialJsKB -->2<!-- /metric -->',
        metricsOf(b),
      ),
    ).toBe('a <!-- metric:tests -->1234<!-- /metric --> b <!-- metric:initialJsKB -->99<!-- /metric -->');
    expect(withMetrics('<!-- metric:other -->x<!-- /metric -->', metricsOf(b))).toBe(
      '<!-- metric:other -->x<!-- /metric -->',
    );
    for (const r of ['README.md', 'README.fr.md']) {
      const page = readFileSync(r, 'utf8');
      expect(page).toContain('<!-- metric:tests -->');
      expect(page).toContain('<!-- metric:initialJsKB -->');
      expect(page).toContain('<!-- metric:referenceStates -->');
      expect(withMetrics(page, metricsOf(base()))).toBe(page); // the figures are the baseline's
    }
  });
  it('checks the READMEs against the committed baseline, not the tests a pull request adds (4.5.4)', () => {
    const want = base();
    const version = JSON.parse(readFileSync('package.json', 'utf8')).version as string;
    for (const r of ['README.md', 'README.fr.md']) {
      const page = readFileSync(r, 'utf8');
      // The committed pair agrees: nothing to rewrite in a pull request that only adds tests.
      expect(readmeDrift(page, r, want, version)).toEqual([]);
      const behind = withMetrics(page, metricsOf({ ...want, tests: { ...want.tests, declarations: 1 } }));
      expect(readmeDrift(behind, r, want, version)).toEqual([
        `${r}: a figure is not the baseline's (npm run quality:baseline -- --release writes it)`,
      ]);
    }
  });
  it('names nothing when nothing moved', () => {
    expect(differences(base(), base())).toEqual([]);
  });

  it('names the game and the part that moved: a digest, a verdict, a proof size', () => {
    const got = base();
    got.games.demo.witness.digests = 'x';
    got.games['por.trap-3'].proof.softlocks += 1;
    got.games.reference.proof.status = 'truncated';
    const d = differences(base(), got);
    expect(d.some((l) => l.startsWith('demo witness.digests'))).toBe(true);
    expect(d.some((l) => l.startsWith('por.trap-3 proof.softlocks'))).toBe(true);
    expect(d).toContain('reference proof.status: solved → truncated');
  });

  it("holds the golden saves, the public surface and the number of tests; the first visit is the budget's", () => {
    const got = base();
    got.saves['demo-4.0.0.json'].ended = false;
    got.surface.api = 'changed';
    got.tests.declarations -= 1;
    got.bundle = { initialJsKB: 999, initialJsBytes: 999 * 1024 };
    const d = differences(base(), got);
    // A bigger first visit is not a difference (4.6.0, #405): the game's `initialJsKB` budget is the gate.
    expect(d).toHaveLength(3);
    // More tests and a smaller first visit are not differences.
    const better = base();
    better.tests.declarations += 5;
    better.bundle = { initialJsKB: 1, initialJsBytes: 1024 };
    expect(differences(base(), better)).toEqual([]);
  });

  it('warns, never fails, on more tests and on the first visit since the release, in bytes (4.6.0, #405)', () => {
    const want = { ...base(), bundle: { initialJsKB: 138, initialJsBytes: 141252 } };
    const got = { ...want, tests: { ...want.tests, declarations: want.tests.declarations + 2 } };
    got.bundle = { initialJsKB: 138, initialJsBytes: 141452 };
    expect(improvements(want, got)).toEqual([
      `tests: ${want.tests.declarations} → ${want.tests.declarations + 2} declarations (the release ratchets it)`,
      "first visit's JavaScript: +200 bytes since the release (137.9 KB → 138.1 KB gzipped)",
    ]);
    expect(differences(want, got)).toEqual([]);
  });

  it("a pull request's write moves the behaviour only: no count, no bundle, no README figure but the proof's", () => {
    // The committed baseline's first visit, which the READMEs carry: a figure typed here broke at the first release
    // that moved it (4.7.0: 138 → 140 KB).
    const bundle = base().bundle ?? { initialJsKB: 138, initialJsBytes: 141252 };
    const prev = { ...base(), bundle };
    const got = structuredClone(prev);
    got.games.demo.witness.digests = 'moved';
    got.games.reference.proof.states += 1;
    got.saves['demo-4.0.0.json'].last = 'moved';
    got.surface.api = 'moved';
    got.tests = { files: prev.tests.files + 3, declarations: prev.tests.declarations + 9 };
    got.bundle = { initialJsKB: bundle.initialJsKB + 1, initialJsBytes: bundle.initialJsBytes + 1048 };
    const pr = toWrite(prev, got, 'pr');
    expect(pr.games).toEqual(got.games);
    expect(pr.saves).toEqual(got.saves);
    expect(pr.surface).toEqual(got.surface);
    expect(pr.tests).toEqual(prev.tests);
    expect(pr.bundle).toEqual(prev.bundle);
    // The release writes every figure.
    expect(toWrite(prev, got, 'release')).toEqual(got);
    // Without --dist the release keeps the bundle it had.
    expect(toWrite(prev, { ...got, bundle: undefined }, 'release').bundle).toEqual(prev.bundle);
    // A first write (no baseline yet) writes everything.
    expect(toWrite(undefined, got, 'pr')).toEqual(got);

    const version = JSON.parse(readFileSync('package.json', 'utf8')).version as string;
    for (const r of ['README.md', 'README.fr.md']) {
      const page = readFileSync(r, 'utf8');
      const next = readmeFor(page, pr, 'pr', version);
      // The proof's size is behaviour: it moves with it. The test count and the first visit stay.
      expect(next).toBe(withMetrics(page, { referenceStates: String(got.games.reference.proof.states) }));
      expect(readmeDrift(next, r, pr, version)).toEqual([]);
      // The release writes the counts and the first visit too.
      const release = toWrite(prev, got, 'release');
      expect(readmeFor(page, release, 'release', version)).toBe(withMetrics(page, metricsOf(release)));
      expect(withMetrics(page, metricsOf(release))).toContain(`<!-- metric:tests -->${got.tests.declarations}<`);
    }
    // Nothing moved: a pull request's write leaves both READMEs as they are.
    for (const r of ['README.md', 'README.fr.md']) {
      const page = readFileSync(r, 'utf8');
      expect(readmeFor(page, toWrite(base(), base(), 'pr'), 'pr', version)).toBe(page);
    }
  });

  it('measures a softlock: the trap fixture is proved with its losing step', () => {
    expect(base().games['por.trap-3'].proof.softlocks).toBeGreaterThan(0);
  });
});
