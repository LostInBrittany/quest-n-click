// npm run quality:baseline [-- --check] [--release] [--dist=dist]: what the engine does, frozen before a refactoring
// (4.1.0 "Clarity", docs/dev/PLAN-4.1.1-CLARITY.md lot A). For the demo, the reference game, the heroes example
// (4.4.0) and the solver's fixture games: the witness (status, length, the digest after every input), the proof (status, states,
// softlocks); every golden save, loaded and played to its end (the last digest); the public API and MCP surface (its
// hash); the test declarations. Written to tests/quality-baseline.json; --check compares and names each difference,
// so a change meant to keep behaviour that moves a digest, a verdict or a name fails with what moved. --dist adds the
// first visit's JavaScript (verify:dist), in bytes: a warning against the release's figure (4.6.0, #405), the gate is
// the game's `assetBudgets.initialJsKB`.
//
// Two writes (4.6.0, #405). A pull request's (`npm run quality:baseline`) moves the behaviour only: the games, the
// golden saves, the API's hash, and the README figure that is behaviour (the reference proof's states). The figures
// every pull request moves (the test files and declarations, the first visit, the READMEs' test count and KB, their
// install line) are the release's (`--release`, run by `npm run release -- prepare`): written by a pull request, they
// were a conflict with every other open one at each merge.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { GameDef, Layout, SessionEntry } from '../src/engine/core/types';
import type { CustomCommands } from '../src/engine/core/custom';
import { parseSave } from '../src/engine/core/save';
import { solve } from '../src/engine/tools/solve';
import { replay } from '../src/engine/tools/replay';
import { ROOT } from './game';
import { flushExit } from './flush';
import { firstVisitSize, sinceRelease } from './first-visit';

const OUT = resolve(ROOT, 'tests/quality-baseline.json');
const args = process.argv.slice(2);
const check = args.includes('--check');
const mode: Mode = args.includes('--release') ? 'release' : 'pr';
const distArg =
  args.find((a) => a.startsWith('--dist'))?.split('=')[1] ?? (args.includes('--dist') ? 'dist' : undefined);
const hash = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16);

interface GameCase {
  id: string;
  load: () => Promise<{ game: GameDef; layouts: Record<string, Layout>; commands?: CustomCommands }>;
}
const fx = (id: string, file: string, make: string, lay: string, ...a: unknown[]): GameCase => ({
  id,
  load: async () => {
    const m = await import(`../tests/fixtures/${file}.ts`);
    return { game: m[make](...a), layouts: m[lay] };
  },
});
const GAMES: GameCase[] = [
  { id: 'demo', load: async () => import('../games/demo') },
  { id: 'reference', load: async () => import('../games/reference') },
  { id: 'heroes', load: async () => import('../games/heroes') },
  fx('classics.insults', 'classics', 'insults', 'insultsLayouts'),
  fx('classics.grog', 'classics', 'grog', 'grogLayouts'),
  fx('classics.dott', 'classics', 'dott', 'dottLayouts'),
  fx('classics.mansion', 'classics', 'mansion', 'mansionLayouts'),
  fx('classics.stan', 'classics', 'stan', 'stanLayouts'),
  fx('por.pickups-4', 'por', 'pickups', 'pickupsLayouts', 4),
  fx('por.trap-3', 'por', 'trap', 'pickupsLayouts', 3),
  fx('por.trials', 'por', 'trials', 'trialsLayouts'),
  fx('world', 'world', 'world', 'worldLayouts'),
  fx('cast', 'cast', 'cast', 'castLayouts'),
  fx('scale', 'scale', 'scale', 'scaleLayouts'),
  fx('picture', 'picture', 'picture', 'pictureLayouts'),
  fx('mini', 'mini', 'mini', 'miniLayouts'),
];

interface Baseline {
  games: Record<
    string,
    {
      witness: { status: string; finished: boolean; inputs: number; digests: string };
      proof: { status: string; states: number; softlocks: number };
    }
  >;
  saves: Record<string, { ended: boolean; inputs: number; last: string }>;
  surface: { api: string };
  tests: { files: number; declarations: number };
  /** The first visit's JavaScript, gzipped: in bytes since 4.6.0 (#405), and rounded to the KB for the READMEs. */
  bundle?: { initialJsKB: number; initialJsBytes?: number };
}
export type Mode = 'pr' | 'release';

async function measure(): Promise<Baseline> {
  const b: Baseline = { games: {}, saves: {}, surface: { api: '' }, tests: { files: 0, declarations: 0 } };
  for (const c of GAMES) {
    const { game, layouts, commands } = await c.load();
    const w = await solve(game, layouts, { mode: 'witness', ...(commands ? { commands } : {}) });
    const r = await replay(game, layouts, { start: { kind: 'new' }, log: w.steps }, commands ? { commands } : {});
    const digests = r.session.log.map((e: SessionEntry) => e.digest ?? '').join(',');
    const p = await solve(game, layouts, { mode: 'prove', ...(commands ? { commands } : {}) });
    b.games[c.id] = {
      witness: { status: w.status, finished: w.finished, inputs: w.steps.length, digests: hash(digests) },
      proof: { status: p.status, states: p.states, softlocks: p.softlockCount },
    };
    console.error(
      `  ${c.id}: witness ${w.status} (${w.steps.length}), proof ${p.status} (${p.states} states, ${p.softlockCount} softlocks)`,
    );
  }
  const { game: demo, layouts: demoLayouts, commands } = await import('../games/demo');
  for (const f of readdirSync(resolve(ROOT, 'tests/fixtures/saves'))
    .filter((n) => n.startsWith('demo-') && n.endsWith('.json'))
    .sort()) {
    const golden = JSON.parse(readFileSync(resolve(ROOT, 'tests/fixtures/saves', f), 'utf8'));
    const state = parseSave(demo, golden.envelope);
    const r = await replay(
      demo,
      demoLayouts,
      { start: { kind: 'load' }, base: state, log: golden.remaining },
      { commands },
    );
    b.saves[f] = { ended: r.ended, inputs: golden.remaining.length, last: r.session.log.at(-1)?.digest ?? '' };
  }
  b.surface.api = hash(readFileSync(resolve(ROOT, 'tests/api-surface.json'), 'utf8'));
  const testFiles: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = resolve(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.test.ts')) testFiles.push(p);
    }
  };
  walk(resolve(ROOT, 'tests'));
  b.tests = {
    files: testFiles.length,
    declarations: testFiles.reduce(
      // A test skipped or run on a condition (`it.skipIf(…)(`, `it.runIf(…)(`, 4.1.18) is a declaration too.
      (n, f) =>
        n + (readFileSync(f, 'utf8').match(/^\s*(it|test)(\.each\([^)]*\)|\.(skipIf|runIf)\(.*\))?\(/gm)?.length ?? 0),
      0,
    ),
  };
  if (distArg) {
    const out = execFileSync('npx', ['tsx', 'tools/dist.ts', `--dir=${distArg}`, '--json'], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    const d = JSON.parse(out) as { initialJsKB: number; initialJsBytes: number };
    b.bundle = { initialJsKB: d.initialJsKB, initialJsBytes: d.initialJsBytes };
  }
  return b;
}

/**
 * The READMEs' figures (`<!-- metric:tests -->…<!-- /metric -->`, `metric:initialJsKB`, `metric:referenceStates`),
 * written by the baseline with the JSON (4.1.8): they move with the code, and `--check` fails when they lag.
 */
const READMES = ['README.md', 'README.fr.md'];
const METRIC = /(<!-- metric:(\w+) -->)([^<]*)(<!-- \/metric -->)/g;
export function metricsOf(b: Baseline): Record<string, string> {
  const reference = b.games.reference?.proof.states;
  return {
    tests: String(b.tests.declarations),
    ...(b.bundle ? { initialJsKB: String(b.bundle.initialJsKB) } : {}),
    ...(reference !== undefined ? { referenceStates: String(reference) } : {}),
  };
}
export function withMetrics(page: string, m: Record<string, string>): string {
  return page.replace(METRIC, (all, open: string, name: string, _v: string, close: string) =>
    name in m ? `${open}${m[name]}${close}` : all,
  );
}

/**
 * The README's install section (4.1.20 PR 4, plan §9.2): between `<!-- install:begin -->` and `<!-- install:end -->`,
 * in both languages, the archive URL of this version, written here with the figures. Its text is the
 * `archive-human-install` pass's surface (`readme:install`, docs/dev/surfaces.json): only a release changes it.
 */
const INSTALL = /(<!-- install:begin -->)([\s\S]*?)(<!-- install:end -->)/;
/** The name the engine's archive of a version starts with: quest-n-click from 4.2.5 (D47), web-scumm before. */
const engineArchive = (v: string) => {
  const [a = 0, b = 0, c = 0] = v.split(/[.-]/).map(Number);
  return a * 1e6 + b * 1e3 + c >= 4_002_005 ? 'quest-n-click' : 'web-scumm';
};
export function withInstall(page: string, version: string): string {
  return page.replace(
    INSTALL,
    (_all, open: string, body: string, close: string) =>
      `${open}${body.replace(
        /https:\/\/github\.com\/(?:Quest-n-Click\/quest-n-click|wanoo\/(?:quest-n-click|web-scumm))\/releases\/download\/(v[^/\s]+)\/(?:quest-n-click|web-scumm)-[^\s/]+?\.tgz/g,
        // A release candidate of this version keeps its tag (4.2.0-rc, the passes' campaign): the archive is the
        // version's, published under the rc's release until the stable one exists. Any other tag becomes this version's.
        // The repository's name since 4.2.5 (D47), the engine's archive named as that version's release names it.
        (_url, tag: string) =>
          `https://github.com/Quest-n-Click/quest-n-click/releases/download/${tag.startsWith(`v${version}-rc.`) && /^v[\d.]+-rc\.[1-9]\d*$/.test(tag) ? tag : `v${version}`}/${engineArchive(version)}-${version}.tgz`,
      )}${close}`,
  );
}
const VERSION = (JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as { version: string }).version;

/**
 * What a write puts in tests/quality-baseline.json (4.6.0, #405). A pull request's keeps the committed counts and first
 * visit, so it rewrites the file only when the behaviour moved; the release's writes everything it measured (the first
 * visit kept when it was not measured, without --dist). With no baseline yet, everything.
 */
export function toWrite(prev: Baseline | undefined, got: Baseline, mode: Mode): Baseline {
  if (!prev) return got;
  if (mode === 'release') return got.bundle || !prev.bundle ? got : { ...got, bundle: prev.bundle };
  const next: Baseline = { games: got.games, saves: got.saves, surface: got.surface, tests: prev.tests };
  if (prev.bundle) next.bundle = prev.bundle;
  return next;
}

/**
 * A README as a write leaves it (4.6.0, #405): the release writes every figure and the install line; a pull request
 * only the figure that is behaviour (the reference proof's states), so it keeps the README as the baseline it writes.
 */
export function readmeFor(page: string, b: Baseline, mode: Mode, version: string): string {
  if (mode === 'release') return withInstall(withMetrics(page, metricsOf(b)), version);
  const { referenceStates } = metricsOf(b);
  return referenceStates === undefined ? page : withMetrics(page, { referenceStates });
}

/**
 * What a README says that the committed baseline does not (4.5.4): its figures are the baseline's, its install line the
 * version's. Checked against the committed baseline, not against what this checkout measures, so a pull request that
 * adds tests passes without rewriting the READMEs and the baseline, which every other open pull request rewrites too
 * (a conflict at each merge). The figures move at each release (`--release`, 4.6.0).
 */
export function readmeDrift(page: string, file: string, want: Baseline, version: string): string[] {
  const out: string[] = [];
  if (withMetrics(page, metricsOf(want)) !== page)
    out.push(`${file}: a figure is not the baseline's (npm run quality:baseline -- --release writes it)`);
  if (withInstall(page, version) !== page)
    out.push(`${file}: the install section names another version (npm run quality:baseline -- --release writes it)`);
  return out;
}

/**
 * What moved from the release's figures without failing (4.1.3; 4.6.0, #405): more tests, and the first visit in bytes,
 * either way. Said, so the release ratchets them on purpose.
 */
export function improvements(want: Baseline, got: Baseline): string[] {
  const out: string[] = [];
  if (got.tests.declarations > want.tests.declarations)
    out.push(`tests: ${want.tests.declarations} → ${got.tests.declarations} declarations (the release ratchets it)`);
  const since =
    want.bundle?.initialJsBytes !== undefined && got.bundle?.initialJsBytes !== undefined
      ? sinceRelease(want.bundle.initialJsBytes, got.bundle.initialJsBytes)
      : undefined;
  if (since) out.push(since);
  return out;
}

/**
 * What moved between two baselines, one line each. Tests may only grow. The first visit is not here since 4.6.0
 * (#405): the game's budget holds it (verify:dist), `improvements` says how far it moved.
 */
export function differences(want: Baseline, got: Baseline): string[] {
  const out: string[] = [];
  for (const [id, g] of Object.entries(want.games)) {
    const h = got.games[id];
    if (!h) {
      out.push(`${id}: no longer measured`);
      continue;
    }
    for (const part of ['witness', 'proof'] as const)
      for (const [k, v] of Object.entries(g[part])) {
        const now = (h[part] as Record<string, unknown>)[k];
        if (now !== v)
          out.push(
            `${id} ${part}.${k}: ${v} → ${now}${k === 'digests' ? ' (a state after some input differs: npm run replay on the witness names the entry)' : ''}`,
          );
      }
  }
  for (const id of Object.keys(got.games))
    if (!want.games[id]) out.push(`${id}: new game, not in the baseline (npm run quality:baseline)`);
  for (const [f, s] of Object.entries(want.saves)) {
    const h = got.saves[f];
    if (!h) out.push(`golden save ${f}: missing`);
    else
      for (const [k, v] of Object.entries(s))
        if ((h as Record<string, unknown>)[k] !== v)
          out.push(`golden save ${f} ${k}: ${v} → ${(h as Record<string, unknown>)[k]}`);
  }
  if (want.surface.api !== got.surface.api) out.push('tests/api-surface.json: the public API or the MCP tools changed');
  if (got.tests.declarations < want.tests.declarations)
    out.push(`tests: ${want.tests.declarations} declarations → ${got.tests.declarations} (a test was removed)`);
  return out;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('quality-baseline.ts')) {
  console.error('quality baseline: solving and replaying…');
  const got = await measure();
  if (!check) {
    const prev = existsSync(OUT) ? (JSON.parse(readFileSync(OUT, 'utf8')) as Baseline) : undefined;
    const next = toWrite(prev, got, mode);
    // A rewrite says what it moves (4.1.3): a digest or a verdict that changes here is a behaviour change to own in
    // the CHANGELOG, never a side effect of "refreshing the baseline".
    if (prev) {
      const moved = differences(prev, got).filter((d) => !d.startsWith('tests:'));
      for (const d of moved) console.log('  ⚠ behaviour moved: ' + d);
      for (const d of improvements(prev, got))
        console.log(mode === 'release' ? '  ✔ ratcheted: ' + d : '  ⚠ kept for the release: ' + d);
    }
    const text = JSON.stringify(next, null, 1) + '\n';
    const same = existsSync(OUT) && readFileSync(OUT, 'utf8') === text;
    if (!same) writeFileSync(OUT, text);
    // The READMEs say the baseline's figures (4.1.8, docs/418-truth); a pull request's write moves only the one that is
    // behaviour (4.6.0, #405).
    for (const r of READMES) {
      const file = resolve(ROOT, r);
      const page = readFileSync(file, 'utf8');
      const after = readmeFor(page, next, mode, VERSION);
      if (after !== page) {
        writeFileSync(file, after);
        console.log(`  ✔ ${r}: the figures written`);
      }
    }
    console.log(
      `✔  tests/quality-baseline.json ${same ? 'unchanged' : 'written'} (${mode === 'release' ? "the release's figures" : "the behaviour; the counts and the first visit are the release's"}): ${Object.keys(next.games).length} games, ${Object.keys(next.saves).length} golden saves, ${next.tests.declarations} test declarations`,
    );
    await flushExit(0);
  } else {
    const want = JSON.parse(readFileSync(OUT, 'utf8')) as Baseline;
    const diff = differences(want, got);
    for (const r of READMES) diff.push(...readmeDrift(readFileSync(resolve(ROOT, r), 'utf8'), r, want, VERSION));
    for (const d of diff) console.log('  ✖ ' + d);
    for (const d of improvements(want, got)) console.log(`  ⚠ ${d}`);
    console.log(
      diff.length
        ? `✖  behaviour moved from tests/quality-baseline.json (${diff.length})`
        : `✔  same behaviour as tests/quality-baseline.json: ${Object.keys(got.games).length} games, ${Object.keys(got.saves).length} golden saves, ${got.tests.declarations} test declarations${got.bundle?.initialJsBytes !== undefined ? `, first visit ${firstVisitSize(got.bundle.initialJsBytes)}` : ''}`,
    );
    await flushExit(diff.length ? 1 : 0);
  }
}
