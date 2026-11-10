// The release command's gate report (#471): every gate that could stop `npm run release -- <x.y.z>` judged before
// anything is done, said together, refused naming every red one, with the next command in full. 4.7.2 met its gates one
// at a time, each after a command had started: the docs' human gates on --commit=cfdc766, then the release merge's
// candidate cancelled by a later one ("--commit=<its sha>", the SHA not said, though run 42638395971 on 39dbd360 was
// green). Pure parts here; the command end to end against fakes in tests/release-command.test.ts.
import { describe, expect, it } from 'vitest';
import {
  candidateGate,
  docsGate,
  type Gate,
  gateReport,
  laterWay,
  immutableFrom,
  mainCiGate,
  pickLater,
  preflightGates,
  tagGates,
} from '../tools/release/release-run';

const V = '4.7.2';
const MERGE = '25929cd' + '0'.repeat(33);
const CFD = 'cfdc766' + '1'.repeat(33);
const TIP = '39dbd360' + '2'.repeat(32);
const job = (name: string, status = 'completed', conclusion = 'success') => ({ name, status, conclusion });
const ci = (o: Record<string, unknown> = {}) => ({
  databaseId: 42633058102,
  event: 'push',
  headBranch: 'main',
  headSha: TIP,
  status: 'completed',
  conclusion: 'success',
  createdAt: '2026-11-09T14:11:00Z',
  attempt: 1,
  ...o,
});
const green = { status: 'completed', conclusion: 'success', attempt: 1, jobs: [job('target'), job('candidate-gate')] };
const report = (gates: Gate[], o: Partial<Parameters<typeof gateReport>[1]> = {}) =>
  gateReport(gates, { version: V, sha: TIP, found: MERGE, dryRun: false, again: `npm run release -- ${V}`, ...o });

describe('the preflight, as gates', () => {
  it('one line when it holds, naming the npm user', () => {
    const [g, ...rest] = preflightGates([], { version: V, npmUser: 'lostinbrittany' });
    expect(rest).toEqual([]);
    expect(g).toMatchObject({ state: 'ok' });
    expect(g!.line).toContain('main at 4.7.2');
    expect(g!.line).toContain('(lostinbrittany)');
  });
  it('one red line per refusal, each with what to do', () => {
    const gates = preflightGates(['gh is not signed in: gh auth login', 'the checkout has uncommitted changes'], {
      version: V,
    });
    expect(gates.map((g) => g.state)).toEqual(['red', 'red']);
    expect(gates[0]!.line).toBe('preflight: gh is not signed in: gh auth login');
  });
});

describe("main's ci on the SHA: what ship tag waits for", () => {
  it('green holds, whatever else ran on it', () => {
    const g = mainCiGate({ sha: TIP, tagged: false, runs: [ci({ conclusion: 'failure' }), ci({ databaseId: 2 })] });
    expect(g).toMatchObject({ state: 'ok', line: "main's ci on 39dbd36: green (run 2)" });
  });
  it('running is waited for, its run said', () => {
    const g = mainCiGate({ sha: TIP, tagged: false, runs: [ci({ status: 'in_progress', conclusion: '' })] });
    expect(g.state).toBe('wait');
    expect(g.line).toContain('ship tag waits for it');
    expect(g.line).toContain('https://github.com/Quest-n-Click/quest-n-click/actions/runs/42633058102');
  });
  it('red on its first attempt (a flake, a newer push cancelling it) is re-run once by ship tag: a wait, the re-run said', () => {
    for (const conclusion of ['failure', 'cancelled', 'timed_out']) {
      const g = mainCiGate({ sha: TIP, tagged: false, runs: [ci({ conclusion })] });
      expect(g.state).toBe('wait');
      expect(g.line).toContain(`${conclusion} (https://`);
      expect(g.line).toContain('gh run rerun 42633058102 --repo Quest-n-Click/quest-n-click --failed');
    }
  });
  it('only failure, cancelled and timed_out are re-run by ship tag: any other end of a first attempt refuses', () => {
    for (const conclusion of ['skipped', 'startup_failure', 'action_required', 'neutral', 'stale']) {
      const g = mainCiGate({ sha: TIP, tagged: false, runs: [ci({ conclusion })] });
      expect(g.state, conclusion).toBe('red');
      expect(g.line).toContain(conclusion);
    }
  });
  it('red again after its re-run refuses', () => {
    const g = mainCiGate({ sha: TIP, tagged: false, runs: [ci({ conclusion: 'failure', attempt: 2 })] });
    expect(g.state).toBe('red');
    expect(g.line).toMatch(/failure again \(attempt 2/);
  });
  it('no run of a push of main at the SHA refuses; a pull request or another branch is none', () => {
    const g = mainCiGate({
      sha: TIP,
      tagged: false,
      runs: [ci({ event: 'pull_request' }), ci({ headBranch: 'release/4.7.2' }), ci({ headSha: CFD })],
    });
    expect(g.state).toBe('red');
    expect(g.line).toContain('no run of a push of main at this SHA');
  });
  it('gh unreadable refuses, never reads as a pass; a pushed tag is not checked again', () => {
    expect(mainCiGate({ sha: TIP, tagged: false, error: 'HTTP 502' })).toMatchObject({ state: 'red' });
    expect(mainCiGate({ sha: TIP, tagged: true, runs: [] }).state).toBe('skip');
  });
});

describe("the docs' human gates, as a gate", () => {
  const pending = {
    ok: false,
    detail:
      "✖  create.rooms: the claim bridge-email-unseen-when-away's review is stale (its test file changed): npm run wiki -- review-claim bridge-email-unseen-when-away --by <name> --kind human --relation independent",
  };
  it('they hold, or the tag is out (not checked)', () => {
    expect(
      docsGate({ version: V, sha: CFD, tagged: false, gates: { ok: true, detail: '' }, docsRevision: false }).state,
    ).toBe('ok');
    expect(docsGate({ version: V, sha: CFD, tagged: true, docsRevision: false }).state).toBe('skip');
  });
  it("pending refuses: the wiki's items, --docs-revision, and the reviews merged then released with --commit (4.7.2)", () => {
    const g = docsGate({ version: V, sha: CFD, tagged: false, gates: pending, docsRevision: false, commit: CFD });
    expect(g.state).toBe('red');
    expect(g.line).toMatch(/^the docs' human gates on cfdc766: pending \(merged after/);
    expect(g.detail).toContain('npm run wiki -- review-claim bridge-email-unseen-when-away');
    expect(g.detail).toContain(`npm run release -- ${V} --commit=${CFD} --docs-revision`);
    expect(g.detail).toContain(`npm run release -- ${V} --commit=<its merge sha> --start-candidate`);
  });
  it('--docs-revision goes on with a warning, the items still said', () => {
    const g = docsGate({ version: V, sha: CFD, tagged: false, gates: pending, docsRevision: true });
    expect(g.state).toBe('warn');
    expect(g.detail).toContain('review-claim');
  });
});

describe('the later commit to name (pickLater)', () => {
  const runs: Record<string, { id: number; status: string; conclusion: string }[]> = {
    [TIP]: [{ id: 42638395971, status: 'completed', conclusion: 'success' }],
    [CFD]: [{ id: 7, status: 'in_progress', conclusion: '' }],
  };
  it('a green candidate first, the newest commit that has one', () => {
    expect(pickLater([TIP, CFD], (s) => runs[s] ?? [])).toEqual({ sha: TIP, run: { id: 42638395971, state: 'green' } });
  });
  it('judges each commit by its newest candidate only, as the wait would (an older green under a newer red is not it)', () => {
    const newestRed = [
      { id: 9, status: 'completed', conclusion: 'failure' },
      { id: 8, status: 'completed', conclusion: 'success' },
    ];
    expect(pickLater([TIP], () => newestRed)).toEqual({ sha: TIP });
  });
  it('else a running one, else the newest commit to start one on, else nothing', () => {
    expect(pickLater([TIP, CFD], (s) => (s === CFD ? runs[CFD]! : []))).toEqual({
      sha: CFD,
      run: { id: 7, state: 'running' },
    });
    const red = [{ id: 8, status: 'completed', conclusion: 'failure' }];
    expect(pickLater([TIP, CFD], () => red)).toEqual({ sha: TIP });
    expect(pickLater([], () => red)).toBeUndefined();
  });
  it('says the command with the SHA in full; --start-candidate only when no candidate is there', () => {
    expect(laterWay(V, { sha: TIP, run: { id: 42638395971, state: 'green' } })).toContain(
      `npm run release -- ${V} --commit=${TIP}`,
    );
    expect(laterWay(V, { sha: TIP, run: { id: 42638395971, state: 'green' } })).not.toContain('--start-candidate');
    expect(laterWay(V, { sha: TIP, run: { id: 1, state: 'running' } })).toContain('it waits for that run');
    expect(laterWay(V, { sha: TIP })).toContain(`--commit=${TIP} --start-candidate`);
  });
});

describe('the candidate of the SHA, judged as the wait would on its first look', () => {
  const at = { version: V, sha: MERGE, startCandidate: false };
  const superseded = {
    status: 'completed',
    conclusion: 'cancelled',
    attempt: 1,
    jobs: [
      job('target'),
      job('connector-archive-e2e', 'completed', 'failure'),
      job('mutation / mutation (core-1of1)', 'completed', 'cancelled'),
    ],
  };
  it('green holds; running is waited for; a first red attempt is re-run then waited for', () => {
    expect(candidateGate({ ...at, run: { id: 1, view: green } }).state).toBe('ok');
    const running = { status: 'in_progress', conclusion: '', jobs: [job('target'), job('heavy', 'in_progress', '')] };
    const r = candidateGate({ ...at, run: { id: 1, view: running } });
    expect(r.state).toBe('wait');
    expect(r.line).toContain('1/2 jobs done');
    const failed = { ...green, conclusion: 'failure', jobs: [job('target'), job('heavy', 'completed', 'failure')] };
    const f = candidateGate({ ...at, run: { id: 1, view: failed } });
    expect(f.state).toBe('wait');
    expect(f.line).toContain('re-running its failed jobs once, then waits');
  });
  it('none: started with --start-candidate, refused without it', () => {
    expect(candidateGate({ ...at, startCandidate: true }).state).toBe('wait');
    expect(candidateGate(at).state).toBe('red');
  });
  it("superseded (4.7.2's 42522822642): refused, the later green candidate's run and SHA said in the command", () => {
    const later = { sha: TIP, run: { id: 42638395971, state: 'green' as const } };
    const g = candidateGate({ ...at, run: { id: 42522822642, view: superseded }, later });
    expect(g.state).toBe('red');
    expect(g.line).toContain('was cancelled after connector-archive-e2e failed');
    expect(g.line).toContain('run 42638395971');
    expect(g.line).toContain(`npm run release -- ${V} --commit=${TIP}`);
    expect(g.line).not.toContain('<its sha>');
  });
  it('superseded with no later commit known keeps the general way on', () => {
    const g = candidateGate({ ...at, run: { id: 42522822642, view: superseded } });
    expect(g.line).toContain('--commit=<its sha> --start-candidate');
  });
  it('red after its re-run: the later commit said beside the general way on', () => {
    const twice = {
      ...green,
      conclusion: 'failure',
      attempt: 2,
      jobs: [job('mutation / mutation (runs-1of1)', 'completed', 'failure')],
    };
    const g = candidateGate({ ...at, run: { id: 42527046788, view: twice }, later: { sha: TIP } });
    expect(g.state).toBe('red');
    expect(g.line).toContain(`--commit=${TIP} --start-candidate`);
  });
  it('none, refused, names the later commit too', () => {
    const g = candidateGate({ ...at, later: { sha: TIP, run: { id: 42638395971, state: 'green' } } });
    expect(g.detail).toContain(`--commit=${TIP}`);
  });
  it('gh unreadable refuses', () => {
    expect(candidateGate({ ...at, error: 'gh run list keeps failing' }).state).toBe('red');
  });
});

describe("ship tag's own checks, up front", () => {
  const base = {
    version: V,
    sha: TIP,
    tagged: false,
    section: true,
    ancestry: { ok: true, reason: 'v4.7.1 is an ancestor' },
  };
  it('one line when they hold', () => {
    const [g, ...rest] = tagGates({ ...base, immutable: true });
    expect(rest).toEqual([]);
    expect(g!.line).toBe('tag: CHANGELOG section at 39dbd36, v4.7.1 is an ancestor, immutable releases on');
  });
  it('each that fails, its own red line', () => {
    const gates = tagGates({
      ...base,
      section: false,
      ancestry: { ok: false, reason: 'v4.7.1 is not an ancestor of 39dbd3602222' },
      immutable: false,
    });
    expect(gates.map((g) => g.state)).toEqual(['red', 'red', 'red']);
    expect(tagGates({ ...base, immutable: 'unreadable' })[0]!.state).toBe('red');
  });
  it('a pushed tag is followed', () => {
    expect(tagGates({ ...base, tagged: true })[0]!.line).toContain('is pushed on 39dbd36');
  });
});

describe('the report', () => {
  const ok = (name: string, line = `${name}: ok`): Gate => ({ name, state: 'ok', line });
  it('every gate holds: a line each, then the verdict; the dry run says the command would go through', () => {
    const r = report([ok('preflight'), ok("main's ci"), ok('candidate')], { dryRun: true });
    expect(r.refused).toBe(false);
    expect(r.lines[0]).toBe(
      `the gates of ${V}, release commit 39dbd36 (--commit: a later commit of main, not the release merge 25929cd), before anything is done:`,
    );
    expect(r.lines.slice(1, 4)).toEqual(['  ✔  preflight: ok', "  ✔  main's ci: ok", '  ✔  candidate: ok']);
    expect(r.lines.at(-1)).toBe(`✔  no gate refuses: npm run release -- ${V} would go through`);
  });
  it('a wait is no refusal, and is named', () => {
    const r = report([ok('preflight'), { name: 'candidate', state: 'wait', line: 'candidate: running' }]);
    expect(r.refused).toBe(false);
    expect(r.lines).toContain('  …  candidate: running');
    expect(r.lines.at(-1)).toBe('✔  no gate refuses; the command waits for: candidate');
  });
  it('refuses naming every red gate, not the first one, details indented, nothing done', () => {
    const r = report([
      { name: 'preflight', state: 'red', line: 'preflight: gh is not signed in' },
      ok("main's ci"),
      { name: "the docs' human gates", state: 'red', line: 'docs: pending', detail: '✖  a claim\n  a way on' },
      { name: 'candidate', state: 'red', line: 'candidate: none' },
      { name: 'tag', state: 'skip', line: 'tag: not checked' },
    ]);
    expect(r.refused).toBe(true);
    expect(r.lines).toContain('     ✖  a claim');
    expect(r.lines).toContain('       a way on');
    expect(r.lines).toContain('  –  tag: not checked');
    expect(r.lines.at(-2)).toBe("✖  3 gates refuse (preflight, the docs' human gates, candidate): nothing was done");
    expect(r.lines.at(-1)).toMatch(/^ {3}next: fix each ✖ above, then npm run release -- 4\.7\.2 \(--dry-run first/);
  });
  it('the next step a gate knows is said in full', () => {
    const r = report([{ name: 'candidate', state: 'red', line: 'x' }], {
      next: `npm run release -- ${V} --commit=${TIP}`,
    });
    expect(r.lines.at(-2)).toBe('✖  1 gate refuses (candidate): nothing was done');
    expect(r.lines.at(-1)).toBe(`   next: npm run release -- ${V} --commit=${TIP}`);
  });
  it('with no release commit, says so in its heading', () => {
    expect(report([ok('preflight')], { sha: undefined }).lines[0]).toContain(', no release commit,');
  });
});

describe('immutable releases, as ship tag reads them', () => {
  it('on, off (a 404 is JSON with gh exit 1), or unreadable: no JSON, an empty reply, any other exit', () => {
    expect(immutableFrom({ code: 0, out: '{"enabled":true,"enforced_by_owner":false}' })).toBe(true);
    expect(immutableFrom({ code: 0, out: '{"enabled":false}' })).toBe(false);
    expect(immutableFrom({ code: 1, out: '{"message":"Not Found","status":"404"}' })).toBe(false);
    expect(immutableFrom({ code: 1, out: '' })).toBe('unreadable');
    expect(immutableFrom({ code: 0, out: '' })).toBe('unreadable');
    expect(immutableFrom({ code: 1, out: 'connection reset' })).toBe('unreadable');
    expect(immutableFrom({ code: 4, out: '{"message":"auth"}' })).toBe('unreadable');
  });
});
