// The qualification split into modules (4.1.20 PR 3, plan §8.0): scripts/ops-qualify.mjs runs setup, topology,
// signals, runs and backup from scripts/ops-qualify/, in that order. Its steps, read from the sources in the order
// they run, are the 4.1.19 script's: the same names, in the same order (the runner's report, before and after, is
// compared in the LOG). Every module is in the `qualify` workflow's path filter and in ci-plan's rule for the profile.
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { classify } from '../tools/ci-plan';
// @ts-expect-error: a plain .mjs module without declarations
import { CATALOGUE } from '../scripts/ops-qualify/steps.mjs';

const DIR = 'scripts/ops-qualify';
const read = (f: string) => readFileSync(f, 'utf8');
const names = (s: string) => [...s.matchAll(/\bstep\(\s*(['"`])((?:(?!\1).)*)\1/gs)].map((m) => m[2]!);

/** The 4.1.19 script's steps, in the order a full run judges them (the neutral split's characterization). */
const STEPS_4119 = [
  'images-pinned',
  'bridge-image',
  'topology-up',
  'players-paired',
  'instance-restarted',
  'in-flight-once',
  'applied-once',
  'sequences-contiguous',
  'stream-in-order',
  'tenants-apart',
  'daily-once',
  'mystery-revealed',
  'run-verified',
  'run-duplicate',
  'moderation',
  'worker-takeover',
  'quota-shared',
  'board-volume',
  'restore-signals',
  'restore-board',
  'restore-duplicate',
  'restore-continues',
  'store-4117',
  'ran-to-end',
];
/** What 4.1.20 adds (plan §8.1): both restore modes, under the maintenance lease. */
const ADDED_4120 = ['restore-refused-serving', 'replace-store'];
const idOf = (name: string) => {
  const e = (CATALOGUE as { id: string; name: RegExp }[]).find((c) => c.name.test(name.replace('${VOLUME}', '20000')));
  if (!e) throw new Error(`no id for ${name}`);
  return e.id;
};

describe('the qualification, split', () => {
  it('judges the 4.1.19 steps, then those of 4.1.20, in the catalogue’s order', () => {
    // The entry: the topology up, then the end said on success, and on a failure (its catch).
    const entry = names(read('scripts/ops-qualify.mjs'));
    expect(entry.map(idOf)).toEqual(['topology-up', 'ran-to-end', 'ran-to-end']);
    const ran = [
      ...names(read(`${DIR}/setup.mjs`)),
      entry[0]!,
      ...names(read(`${DIR}/signals.mjs`)),
      ...names(read(`${DIR}/runs.mjs`)),
      ...names(read(`${DIR}/backup.mjs`)),
      entry[1]!,
    ];
    const ids = ran.map(idOf);
    expect(ids).toEqual((CATALOGUE as { id: string }[]).map((c) => c.id));
    expect(ids.filter((id) => !ADDED_4120.includes(id))).toEqual(STEPS_4119);
    // No step hidden in another module.
    for (const f of ['steps.mjs', 'topology.mjs', 'report.mjs']) expect(names(read(`${DIR}/${f}`))).toEqual([]);
  });

  it('runs every module it has, and the qualify workflow and ci-plan follow the folder', () => {
    const entry = read('scripts/ops-qualify.mjs');
    for (const f of readdirSync(DIR)) expect(entry).toContain(`./ops-qualify/${f}`);
    const wf = read('.github/workflows/qualify.yml');
    expect(wf.match(/- 'scripts\/ops-qualify\/\*\*'/g)).toHaveLength(2);
    for (const f of readdirSync(DIR)) expect(classify(`${DIR}/${f}`).why).toBe('the qualification profile');
  });
});
