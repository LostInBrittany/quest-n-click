// A mutation set cut into shards (4.1.20 PR 2a, plan §7.3): `connectors-edge` alone ran 2 h 02 on a runner, more than
// a candidate's whole budget. Each shard mutates whole files; the shards of a set are merged into the set's report by a
// tested step that refuses a shard missing, doubled, cancelled, of other inputs or of other files, so a gate never
// passes on a part of its set. One generated matrix drives ci, candidate, nightly and release.
import { describe, expect, it } from 'vitest';
import type { MutationReport } from '../tools/mutate';
import { mergeReports, mutationMatrix, type ShardReport, shardFiles } from '../tools/mutation-shards';
import { MEASURED } from '../tools/mutation-sets';

const COUNTS: Record<string, number> = { 'a.ts': 358, 'b.ts': 201, 'c.ts': 99, 'd.ts': 97, 'e.ts': 83, 'f.ts': 4 };
const FILES = Object.keys(COUNTS);

describe('the files of a shard', () => {
  it('cut a set into disjoint shards that cover it, the same cut every time', () => {
    const cut = shardFiles(FILES, 3, (f) => COUNTS[f]!);
    expect(cut).toHaveLength(3);
    expect(cut.flat().sort()).toEqual([...FILES].sort());
    expect(new Set(cut.flat()).size).toBe(FILES.length);
    expect(shardFiles([...FILES].reverse(), 3, (f) => COUNTS[f]!)).toEqual(cut);
  });

  it('balance the mutants: the largest shard holds no more than the largest file or an even share plus a file', () => {
    const cut = shardFiles(FILES, 3, (f) => COUNTS[f]!);
    const load = cut.map((fs) => fs.reduce((n, f) => n + COUNTS[f]!, 0));
    const total = load.reduce((a, b) => a + b, 0);
    expect(Math.max(...load)).toBeLessThanOrEqual(Math.max(358, Math.ceil(total / 3) + 99));
  });

  it('one shard is the whole set; more shards than files is refused', () => {
    expect(shardFiles(FILES, 1, (f) => COUNTS[f]!)).toEqual([[...FILES].sort()]);
    expect(() => shardFiles(['a.ts'], 2, () => 1)).toThrow(/2 shards for 1 file/);
    expect(() => shardFiles(FILES, 0, () => 1)).toThrow(/at least one shard/);
  });
});

const report = (index: number, total: number, files: string[], o: Partial<ShardReport> = {}): ShardReport => ({
  v: 1,
  set: 'connectors-edge',
  inputHash: 'global0000000000',
  commitSha: 'c'.repeat(40),
  at: '2026-10-12T00:00:00.000Z',
  status: 'passed',
  killed: files.length,
  total: files.length,
  results: files.map((file) => ({
    file,
    line: 1,
    context: 'x',
    operator: 'boolean',
    from: 'true',
    to: 'false',
    status: 'killed',
  })),
  shard: { index, total, files, inputHash: `shard${index}`.padEnd(16, '0') },
  ...o,
});

describe('the shards merged into the set', () => {
  const cut = [
    ['a.ts', 'f.ts'],
    ['b.ts', 'e.ts'],
    ['c.ts', 'd.ts'],
  ];
  const expected = { set: 'connectors-edge' as const, inputHash: 'global0000000000', shards: cut, known: [] };
  const all = () => cut.map((fs, i) => report(i + 1, 3, fs));

  it('give one report of the whole set, passed when every shard passed', () => {
    const m = mergeReports(all(), expected);
    expect(m).toMatchObject({
      v: 1,
      set: 'connectors-edge',
      inputHash: 'global0000000000',
      status: 'passed',
      total: 6,
      killed: 6,
    });
    expect(m.results.map((r) => r.file).sort()).toEqual([...FILES].sort());
    expect((m as MutationReport & { shards?: unknown }).shards).toEqual(
      [1, 2, 3].map((i) => `shard${i}`.padEnd(16, '0')),
    );
  });

  it('refuse a shard missing (a job cancelled, never uploaded) or given twice', () => {
    expect(() => mergeReports(all().slice(0, 2), expected)).toThrow(/shard 3\/3 is missing/);
    expect(() => mergeReports([...all(), report(2, 3, cut[1]!)], expected)).toThrow(/shard 2\/3 is given twice/);
  });

  it('refuse a shard of other inputs, of another cut or of another set; the same inputs on two commits are one measure', () => {
    const r = all();
    expect(() => mergeReports([r[0]!, { ...r[1]!, inputHash: 'stale00000000000' }, r[2]!], expected)).toThrow(
      /shard 2\/3 measured other inputs/,
    );
    expect(() => mergeReports([r[0]!, report(2, 3, ['b.ts']), r[2]!], expected)).toThrow(
      /shard 2\/3 holds other files/,
    );
    expect(() => mergeReports([r[0]!, report(2, 4, cut[1]!), r[2]!], expected)).toThrow(/shard 2 is one of 4, not 3/);
    expect(() => mergeReports([r[0]!, { ...r[1]!, set: 'reality' }, r[2]!], expected)).toThrow(/set reality/);
    // A shard's report reused from the cache (same inputs, another commit): merged, both commits said.
    const mixed = mergeReports([r[0]!, { ...r[1]!, commitSha: 'd'.repeat(40) }, r[2]!], expected);
    expect(mixed.status).toBe('passed');
    expect(mixed.commitSha).toBe(`${'c'.repeat(40)},${'d'.repeat(40)}`);
  });

  it('fail the set when a shard failed, or when a survivor is named by no entry of docs/dev/mutants.json', () => {
    const r = all();
    expect(mergeReports([r[0]!, { ...r[1]!, status: 'failed' }, r[2]!], expected).status).toBe('failed');
    const survivor = {
      file: 'c.ts',
      line: 3,
      context: 'if (x) y();',
      operator: 'condition true',
      from: 'x',
      to: 'true',
      status: 'survived',
    };
    const withSurvivor = [r[0]!, r[1]!, { ...r[2]!, results: [...r[2]!.results, survivor] }];
    expect(mergeReports(withSurvivor, expected).status).toBe('failed');
    expect(
      mergeReports(withSurvivor, {
        ...expected,
        known: [
          {
            file: 'c.ts',
            operator: 'condition true',
            from: 'x',
            to: 'true',
            context: 'if (x) y();',
            why: 'equivalent',
            category: 'equivalent',
            proof: 'argument',
            owner: '@wanoo',
            revisit: '4.3.0',
          },
        ],
      }).status,
    ).toBe('passed');
  });
});

describe('the matrix of the workflows', () => {
  it('one entry per shard of every gated set; the nightly adds the measured ones, never gating', () => {
    const gated = mutationMatrix('gated');
    const sets = [...new Set(gated.include.map((e) => e.set))];
    for (const e of gated.include) expect(e.gated).toBe(true);
    expect(gated.include.filter((e) => e.set === sets[0]).map((e) => e.shard)).toEqual(
      Array.from({ length: gated.include.filter((e) => e.set === sets[0]).length }, (_, i) => i + 1),
    );
    const nightly = mutationMatrix('nightly');
    expect(nightly.include.length).toBeGreaterThanOrEqual(gated.include.length);
    for (const e of nightly.include.filter((x) => !x.gated)) expect(sets).not.toContain(e.set);
    // Nothing measured only (4.1.20: every set gated): the nightly runs the gated matrix, no more.
    if (MEASURED.length === 0) expect(nightly).toEqual(gated);
    else expect(nightly.include.some((x) => !x.gated)).toBe(true);
  });

  it('gives Postgres to the set that needs it only, and names each job and artifact uniquely', () => {
    for (const e of mutationMatrix('nightly').include) expect(e.pg, e.set).toBe(e.set === 'reality-store-postgres');
    const names = mutationMatrix('nightly').include.map((e) => e.name);
    expect(new Set(names).size).toBe(names.length);
    for (const e of mutationMatrix('nightly').include) expect(e.name).toBe(`${e.set}-${e.shard}of${e.shards}`);
  });
});
