// The status registry (4.5.0 "Wiki", docs/dev/PLAN-4.5-WIKI.md §4.4.2, phase A5): docs/dev/contracts.json says, per
// surface, its contract status, the environments CI verifies, its automated checks and the people's passes it waits
// for. Here: the registry is sound against the repository (each job defined, each test file tracked, each pass bound by
// docs/dev/surfaces.json and tracked by an issue, every pass waited for); it agrees with docs/en|fr/SUPPORT.md (each
// quote is there, and says the status: an experimental surface's quote says experimental, a stable one's never does);
// the passes' states are read from the version's sheet, never typed; and the five statuses stay apart.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { PASS_IDS } from '../tools/field/schema';
import { ROOT } from '../tools/game';
import { trackedFiles } from '../tools/wiki/check';
import { checkContracts, passSheet, passStates, readContracts, surfaceStatuses } from '../tools/wiki/contracts';

const TRACKED = trackedFiles();
const { contracts, errors } = readContracts(ROOT);
const flat = (s: string) => s.replace(/\s+/g, ' ');
const SUPPORT = {
  en: flat(readFileSync('docs/en/SUPPORT.md', 'utf8')),
  fr: flat(readFileSync('docs/fr/SUPPORT.md', 'utf8')),
};
const temps: string[] = [];
afterAll(() => {
  for (const t of temps) rmSync(t, { recursive: true, force: true });
});

describe('the status registry, docs/dev/contracts.json', () => {
  it('reads, and names only jobs, tests and passes that exist', () => {
    expect(errors).toEqual([]);
    expect(checkContracts(ROOT, TRACKED, contracts!)).toEqual([]);
  });

  it('waits for every pass of the Field Kit somewhere, and tracks each by its issue', () => {
    const waited = new Set(Object.values(contracts!.contracts).flatMap((c) => c.passes));
    expect(PASS_IDS.filter((p) => !waited.has(p))).toEqual([]);
    expect(PASS_IDS.filter((p) => !contracts!.passIssues[p])).toEqual([]);
  });

  it('agrees with SUPPORT.md in both languages: each quote is there and says the status', () => {
    const word = {
      en: { experimental: /experimental/i, deprecated: /deprecated/i },
      fr: { experimental: /exp[ée]rimental/i, deprecated: /d[ée]pr[ée]ci[ée]|obsol[eè]te/i },
    } as const;
    for (const [id, c] of Object.entries(contracts!.contracts))
      for (const lang of ['en', 'fr'] as const) {
        const quote = flat(c.support[lang]);
        expect(SUPPORT[lang].includes(quote), `${id} (${lang}): "${quote}" is not in SUPPORT.md`).toBe(true);
        if (c.status === 'experimental') expect(quote, `${id} (${lang})`).toMatch(word[lang].experimental);
        else expect(quote, `${id} (${lang})`).not.toMatch(word[lang].experimental);
        if (c.status === 'deprecated') expect(quote, `${id} (${lang})`).toMatch(word[lang].deprecated);
      }
  });

  it('keeps the surfaces support-truth guards experimental, experimental here too', () => {
    // tests/support-truth.test.ts keeps them experimental until their pass; the registry cannot say otherwise.
    expect(contracts!.contracts['bridge-distributed']?.status).toBe('experimental');
    expect(contracts!.contracts.connectors?.status).toBe('experimental');
    expect(contracts!.contracts['studio-server']?.status).toBe('experimental');
  });

  it('refuses a job no workflow defines, a test glob that matches nothing, a pass surfaces.json does not bind', () => {
    const broken = structuredClone(contracts!);
    broken.contracts.connectors!.checks.jobs.push('no-such-job');
    broken.contracts.connectors!.checks.tests.push('tests/no-such.test.ts');
    expect(checkContracts(ROOT, TRACKED, broken)).toEqual([
      'docs/dev/contracts.json: connectors names the job no-such-job, which no workflow defines',
      'docs/dev/contracts.json: connectors names the tests "tests/no-such.test.ts", which match no tracked file',
    ]);
    const unwaited = structuredClone(contracts!);
    unwaited.contracts.connectors!.passes = [];
    expect(checkContracts(ROOT, TRACKED, unwaited)).toEqual([
      'docs/dev/contracts.json: no contract waits for the pass connectors-real-security',
    ]);
  });
});

describe('the five statuses, derived', () => {
  it("reads the passes' states from the version's sheet, with their issues; a pass not asked yet says so", () => {
    expect(passSheet(ROOT, '4.4.0')).toBe('4.4.0');
    expect(passSheet(ROOT, '4.5.0-rc.1')).toBe('4.4.0');
    expect(passSheet(ROOT, '4.2.4')).toBe('4.2.4');
    const s = surfaceStatuses(ROOT, contracts!, '4.4.0').get('studio-server')!;
    expect(s.contract).toBe('experimental');
    expect(s.passes.find((p) => p.id === 'studio-hosted')).toEqual({
      id: 'studio-hosted',
      state: 'not-run',
      issue: 149,
      sheet: 'docs/dev/passes/4.4.0.md',
    });
    expect(s.checks.jobs).toContain('studio-hosted');
    expect(s.environments.length).toBeGreaterThan(0);
    // 4.2.0 asked none of the Studio Server's passes yet (PASS_SINCE).
    const old = surfaceStatuses(ROOT, contracts!, '4.2.0').get('studio-server')!;
    expect(old.passes.every((p) => p.state === 'not-asked')).toBe(true);
  });

  it('takes a passed pass from the sheet, never from the registry', () => {
    const root = mkdtempSync(join(tmpdir(), 'contracts-'));
    temps.push(root);
    mkdirSync(join(root, 'docs/dev/passes'), { recursive: true });
    writeFileSync(
      join(root, 'docs/dev/passes/4.4.0.md'),
      [
        '| Pass | Status | Who, when | Device | What failed |',
        '|---|---|---|---|---|',
        '| Real connectors (`connectors-real-security`) | passed | a tester, 2026-10-24 | | |',
        '| The voices listened to (`voices-listening`) | failed | | | the French clip |',
      ].join('\n'),
    );
    expect([...passStates(root, '4.4.0')]).toEqual([
      ['connectors-real-security', 'passed'],
      ['voices-listening', 'failed'],
    ]);
    const s = surfaceStatuses(root, contracts!, '4.4.0');
    expect(s.get('connectors')!.passes[0]).toMatchObject({
      id: 'connectors-real-security',
      state: 'passed',
      issue: 79,
    });
    // The contract stays what the registry says: a passed pass does not promote a surface by itself (D18).
    expect(s.get('connectors')!.contract).toBe('experimental');
    expect(s.get('voices-music')!.passes[0]!.state).toBe('failed');
    expect(s.get('pwa')!.passes.map((p) => p.state)).toEqual(['not-run', 'not-run']);
  });
});
