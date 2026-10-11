// The named survivors (4.1.8): docs/dev/mutants.json is what the mutation gate reads; MUTANTS.md shows the same
// list, written by `npm run test:mutation:core -- --doc` between its markers; and an entry that names the source
// line it sits on (`context`) must still find that line in its file, or the code moved and the entry is stale.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { type KnownSurvivor, withSurvivorsTable } from '../tools/mutate';
import { GATED, MEASURED, SETS, setNamed } from '../tools/mutation-sets';

const known = JSON.parse(readFileSync('docs/dev/mutants.json', 'utf8')) as KnownSurvivor[];

describe('the named survivors', () => {
  it('MUTANTS.md carries the table of mutants.json (npm run test:mutation:core -- --doc)', () => {
    const doc = readFileSync('docs/dev/MUTANTS.md', 'utf8');
    expect(withSurvivorsTable(doc, known)).toBe(doc);
  });

  it('every entry names a file of a set, and its context line is still in that file', () => {
    const files = new Set(Object.values(SETS).flat());
    for (const k of known) {
      expect(files, `${k.file} is not in a mutation set`).toContain(k.file);
      expect(k.why.length, `${k.file} ${k.from} → ${k.to}: a why`).toBeGreaterThan(20);
      if (k.context !== undefined) {
        const lines = readFileSync(k.file, 'utf8')
          .split('\n')
          .map((l) => l.trim());
        expect(lines, `${k.file}: the line "${k.context}" moved or changed`).toContain(k.context);
      }
    }
  });

  it('MUTANTS.md names every set, gated or measured, and no set is both (4.1.19, plan §8.1)', () => {
    const doc = readFileSync('docs/dev/MUTANTS.md', 'utf8');
    for (const s of Object.keys(SETS)) expect(doc, s).toContain(`| \`${s}\``);
    for (const s of GATED) expect(MEASURED, s).not.toContain(s);
    expect([...GATED, ...MEASURED].sort()).toEqual(Object.keys(SETS).sort());
  });

  it('`connectors` still names `connectors-pure` until 4.2; a name that is no set is refused', () => {
    expect(setNamed('connectors')).toBe('connectors-pure');
    expect(setNamed('connectors-pure')).toBe('connectors-pure');
    expect(setNamed('all')).toBe('all');
    expect(() => setNamed('connector')).toThrow(/no mutation set "connector"/);
  });
});
