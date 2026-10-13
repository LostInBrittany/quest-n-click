// The qualification split into modules (4.1.20 PR 3, plan §8.0): scripts/ops-qualify.mjs runs setup, topology,
// signals, runs and backup from scripts/ops-qualify/, in that order. Its steps, read from the sources in the order
// they run, are the 4.1.19 script's: the same names, in the same order (the runner's report, before and after, is
// compared in the LOG). Every module is in the `qualify` workflow's path filter and in ci-plan's rule for the profile.
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { classify } from '../tools/ci-plan';

const DIR = 'scripts/ops-qualify';
const read = (f: string) => readFileSync(f, 'utf8');
const names = (s: string) => [...s.matchAll(/\bstep\(\s*(['"`])((?:(?!\1).)*)\1/gs)].map((m) => m[2]!);

/** The 4.1.19 script's steps, in the order a full run judges them. */
const CATALOGUE = [
  'every image pinned by digest',
  'the Bridge image',
  'three Bridges and Postgres up behind HTTPS',
  'six players paired over HTTPS, three per tenant',
  'bridge-2 serves again after its restart',
  'proposals in flight on a killed instance, sent again: each applied once',
  'every proposal applied once across a killed instance',
  'every player sequence contiguous, 1 to N, nothing doubled',
  'a stream held on bridge-1 received what the other instances accepted, in order, once',
  "a tenant's capability and connector token refused by the other tenant",
  'the daily token is the same on the three instances, written once in the store',
  'a Mystery committed on one instance is revealed alike on the others',
  'a run submitted on one instance is verified by a worker and read on another',
  'the same run on another instance is a duplicate',
  "a moderator's bearer ranks the run; another bearer is refused",
  'a run whose instance was killed while it verified it is verified once, by another instance, after its lease',
  'the submission quota is one for the three instances',
  // biome-ignore lint/suspicious/noTemplateCurlyInString: the step's name as its source writes it
  'the leaderboard after ${VOLUME} runs answers through the proxy',
  "backup, the topology and its database destroyed, restore: every player's signed signals as before",
  'backup schema 3 and restore: the leaderboard, the daily record and the runs as before',
  'after the restore a proposal sent before is still a duplicate',
  'after the restore a new proposal continues the sequence',
  'a store written by the 4.1.17 Bridge read by this one (its tenant, signals and run; schema 4, nothing to migrate)',
  'the qualification ran to its end',
];

describe('the qualification, split', () => {
  it('judges the 4.1.19 steps, by name, in the order they run', () => {
    const entry = names(read('scripts/ops-qualify.mjs'));
    expect(entry).toHaveLength(2);
    const ran = [
      ...names(read(`${DIR}/setup.mjs`)),
      entry[0]!,
      ...names(read(`${DIR}/signals.mjs`)),
      ...names(read(`${DIR}/runs.mjs`)),
      ...names(read(`${DIR}/backup.mjs`)),
      entry[1]!,
    ];
    expect(ran).toEqual(CATALOGUE);
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
