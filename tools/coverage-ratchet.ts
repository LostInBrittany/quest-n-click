// npx tsx tools/coverage-ratchet.ts [--strict] [--write] [--summary=.cache/coverage/coverage-summary.json] (4.1.3):
// the coverage floors of tests/coverage-floors.json (vite.config.ts until 4.6.0, #405) against what
// `npm run test:coverage` measured. Vitest already fails a floor that is not met; this says the other direction, so a
// floor never silently stays far below what the tests reach: a global measure or a listed file three points or more
// above its floor is a ratchet to make, printed as a warning (`--strict` fails on it). On GitHub Actions each one is
// also an annotation (4.1.9): `::error::` under `--strict`, `::warning::` otherwise.
// Where it is strict (4.7.0, #410 PR 2): main and every pull request (ci.yml `coverage`), so the pull request that lifts
// the coverage raises its floors, and main can no longer turn red after a merge on a ratchet it never saw; the
// candidate only warns (`release-check:ci`), a floor too low being no defect of a release. `--write` raises each floor
// it names to two points under the measure, rounded down, in tests/coverage-floors.json: the fix is one command.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT } from './game';
import { flushExit } from './flush';
import { FLOORS, floorsText, MARGIN, raiseFloors, ratchetSlack, readFloors } from './coverage-floors';

const args = process.argv.slice(2);
const file = resolve(
  ROOT,
  args.find((a) => a.startsWith('--summary='))?.slice(10) ?? '.cache/coverage/coverage-summary.json',
);
const strict = args.includes('--strict');
const write = args.includes('--write');

if (!existsSync(file)) {
  console.error(`✖  ${file}: no coverage summary (npm run test:coverage first)`);
  await flushExit(2);
}
const floors = readFloors(resolve(ROOT, FLOORS));
const slack = ratchetSlack(floors, JSON.parse(readFileSync(file, 'utf8')));
const lines = slack.map((s) => `${s.where} ${s.metric}: floor ${s.floor}, measured ${s.got.toFixed(2)}`);
for (const line of lines) console.log(`  ⚠ ${line}`);

if (write && slack.length) {
  const raised = raiseFloors(floors, slack);
  writeFileSync(resolve(ROOT, FLOORS), floorsText(raised));
  console.log(`✔  ${slack.length} floor(s) raised to two points under the measure in ${FLOORS}: commit it`);
  await flushExit(0);
}
const fix = `npx tsx tools/coverage-ratchet.ts --write (after npm run test:coverage), then commit ${FLOORS}`;
if (process.env.GITHUB_ACTIONS === 'true')
  for (const line of lines) console.log(`::${strict ? 'error' : 'warning'} title=coverage ratchet::${line}: ${fix}`);
console.log(
  slack.length
    ? `${strict ? '✖' : '⚠'}  ${slack.length} floor(s) at least ${MARGIN} points below what the tests reach: ${fix}`
    : '✔  every coverage floor is within three points of what the tests reach',
);
await flushExit(strict && slack.length ? 1 : 0);
