#!/usr/bin/env node
// node tools/release/baseline.mjs --dir=<artifacts> --sha=<sha> --run=<id> --out=<dir> [--jobs=<jobs.json>] (4.1.19,
// docs/dev/PLAN-4.1.19-FIELD-CLOSURE.md §12.2): the release's exact baseline, written by the candidate it measures. It
// reads only what the candidate's jobs left (their artifacts, the run's jobs as the API lists them) and the commit's
// own ratchet (`tests/quality-baseline.json`); it measures nothing again. Writes `baseline-<version>.json` and `.md`
// under --out, which `candidate-gate` puts in the manifest beside the files the release publishes, so the baseline is
// attested with them. A measure whose artifact is missing is written "not measured on this candidate", never guessed.
// The committed sheet (`docs/dev/baselines/<version>.md`) holds the thresholds and protocols, and no run number.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const NOT_MEASURED = 'not measured on this candidate';

const json = (f) => {
  try {
    return JSON.parse(readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
};
const files = (dir, re) =>
  existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => re.test(f))
        .sort()
    : [];
const sha256 = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');
const seconds = (a, b) => (a && b ? Math.round((Date.parse(b) - Date.parse(a)) / 1000) : null);

/** Every measure of one candidate, from its artifacts (`dir`) and its jobs (`jobs`: the API's `jobs` array). */
export function collect({ dir, sha, run, version, root = '.', jobs = null, env = process.env, now = new Date() }) {
  const q = json(join(root, 'tests/quality-baseline.json'));
  const heavy = [1, 2, 3].map((i) => {
    const r = json(join(dir, `heavy-${i}`, `heavy-${i}.json`));
    if (!r) return { attempt: i, measured: false };
    const tests = r.testResults.flatMap((x) => x.assertionResults);
    return {
      attempt: i,
      passed: r.numPassedTests,
      total: r.numTotalTests,
      seconds: Math.round(tests.reduce((s, x) => s + (x.duration || 0), 0) / 1000),
    };
  });
  const load = {};
  for (const store of ['sqlite', 'postgres']) {
    const b = json(join(dir, `bridge-load-${store}`, `bridge-load-${store}.json`));
    const r = json(join(dir, `bridge-load-${store}`, `runs-load-${store}.json`));
    load[store] = {
      proposals: b
        ? {
            count: b.proposals,
            perSecond: b.perSecond,
            p95Ms: b.latencyMs?.p95,
            gaps: b.gaps,
            commit: b.commit,
          }
        : NOT_MEASURED,
      leaderboard: r
        ? {
            runs: r.runs,
            p95Ms: r.latencyMs?.p95,
            boundMs: r.bounds?.p95Ms,
            rssMb: r.rssMb?.after,
          }
        : NOT_MEASURED,
    };
  }
  const mutation = {};
  for (const d of files(dir, /^mutation-/)) {
    for (const f of files(join(dir, d, '.cache/mutation'), /^report-.*\.json$/)) {
      const r = json(join(dir, d, '.cache/mutation', f));
      if (r)
        mutation[r.set] = {
          status: r.status,
          killed: r.killed,
          total: r.total,
          inputHash: r.inputHash,
        };
    }
  }
  const qualify = json(join(dir, 'deployment-smoke', 'ops-qualify.json'));
  const archives = files(join(dir, 'candidate-pack'), /\.tgz$/).map((f) => {
    const p = join(dir, 'candidate-pack', f);
    return { name: f, bytes: statSync(p).size, sha256: sha256(p) };
  });
  const sboms = files(join(dir, 'candidate-sbom'), /\.cdx\.json$/)
    .concat(files(join(dir, 'candidate-image'), /\.cdx\.json$/).map((f) => `image/${f}`))
    .map((f) => {
      const p = f.startsWith('image/') ? join(dir, 'candidate-image', f.slice(6)) : join(dir, 'candidate-sbom', f);
      return {
        name: basename(f),
        components: json(p)?.components?.length ?? null,
        sha256: sha256(p),
      };
    });
  const idFile = files(join(dir, 'candidate-image'), /\.json$/).find((f) => !f.endsWith('.cdx.json'));
  const image = idFile ? json(join(dir, 'candidate-image', idFile)) : null;
  const done = (jobs ?? []).filter((j) => j.started_at && j.completed_at);
  const timed = done.map((j) => ({
    name: j.name,
    conclusion: j.conclusion,
    seconds: seconds(j.started_at, j.completed_at),
  }));
  const first = done.map((j) => j.started_at).sort()[0];
  const last = done
    .map((j) => j.completed_at)
    .sort()
    .at(-1);
  const jobOf = (re) => timed.filter((j) => re.test(j.name));
  return {
    format: 'web-scumm-baseline',
    schema: 1,
    version,
    sha,
    run: String(run),
    at: now.toISOString(),
    runner: {
      os: env.RUNNER_OS ?? process.platform,
      image: env.ImageOS ?? null,
      node: process.version,
    },
    cache: 'warm: npm and the mutation reports of identical inputs come from the Actions cache',
    tests: q ? { declarations: q.tests?.declarations, files: q.tests?.files } : NOT_MEASURED,
    proofs: q
      ? Object.fromEntries(['demo', 'reference'].map((g) => [g, q.games?.[g]?.proof ?? NOT_MEASURED]))
      : NOT_MEASURED,
    playerFirstVisitKB: q?.bundle?.initialJsKB ?? NOT_MEASURED,
    heavy,
    load,
    mutation: Object.keys(mutation).length ? mutation : NOT_MEASURED,
    qualification: qualify
      ? {
          steps: qualify.steps.length,
          passed: qualify.steps.filter((s) => s.ok).length,
          names: qualify.steps.map((s) => s.name),
        }
      : NOT_MEASURED,
    externalConsumer: jobOf(/^external-consumer/).length ? jobOf(/^external-consumer/) : NOT_MEASURED,
    connectorArchiveE2e: jobOf(/^connector-archive-e2e/).length ? jobOf(/^connector-archive-e2e/) : NOT_MEASURED,
    archives: archives.length ? archives : NOT_MEASURED,
    sboms: sboms.length ? sboms : NOT_MEASURED,
    image: image ?? NOT_MEASURED,
    // Not-run by construction (D33): the people's passes start on this very candidate, after its gate.
    field: 'every pass not-run at the gate (D33): the passes start on this candidate',
    duration: done.length
      ? {
          wallSeconds: seconds(first, last),
          // The longest job bounds the run from below: the gate waits for every job.
          longestJob: [...timed].sort((a, b) => b.seconds - a.seconds)[0],
          jobs: timed,
        }
      : NOT_MEASURED,
  };
}

const cell = (v) => (v === NOT_MEASURED ? `*${NOT_MEASURED}*` : v === undefined || v === null ? '—' : String(v));

/** The same measures, for a person. */
export function toMarkdown(b) {
  const L = [];
  L.push(`# Baseline ${b.version} — candidate ${b.run}`, '');
  L.push(
    `Measured by the candidate run ${b.run} on \`${b.sha}\` (${b.at}; ${b.runner.os} ${b.runner.image ?? ''}, Node ${b.runner.node}; ${b.cache}).`,
  );
  L.push('The thresholds and protocols are in `docs/dev/baselines/' + b.version + '.md`.', '');
  L.push('## Tests and proofs', '');
  L.push('| Measure | Value |', '|---|---|');
  L.push(`| Test declarations | ${cell(b.tests === NOT_MEASURED ? b.tests : b.tests.declarations)} |`);
  for (const g of ['demo', 'reference']) {
    const p = b.proofs === NOT_MEASURED ? NOT_MEASURED : b.proofs[g];
    L.push(
      `| Proof, ${g} | ${p === NOT_MEASURED ? cell(p) : `${p.status}, ${p.states} states, ${p.softlocks} softlocks`} |`,
    );
  }
  L.push(`| Player's first visit (KB of JS, gzipped) | ${cell(b.playerFirstVisitKB)} |`);
  for (const h of b.heavy)
    L.push(
      `| Heavy suite, attempt ${h.attempt} | ${h.passed === undefined ? cell(NOT_MEASURED) : `${h.passed}/${h.total} passed, ${h.seconds} s of tests`} |`,
    );
  L.push('', '## The Bridge', '', '| Store | Proposals | Leaderboard |', '|---|---|---|');
  for (const [s, v] of Object.entries(b.load)) {
    const p =
      v.proposals === NOT_MEASURED
        ? cell(NOT_MEASURED)
        : `${v.proposals.count}, ${v.proposals.perSecond}/s, p95 ${v.proposals.p95Ms} ms, gaps ${v.proposals.gaps}`;
    const r =
      v.leaderboard === NOT_MEASURED
        ? cell(NOT_MEASURED)
        : `${v.leaderboard.runs} runs, p95 ${v.leaderboard.p95Ms} ms (bound ${v.leaderboard.boundMs}), ${v.leaderboard.rssMb} MB`;
    L.push(`| ${s} | ${p} | ${r} |`);
  }
  L.push(
    '',
    `Qualification profile: ${b.qualification === NOT_MEASURED ? cell(NOT_MEASURED) : `${b.qualification.passed}/${b.qualification.steps} steps`}.`,
  );
  L.push('', '## Mutation', '');
  if (b.mutation === NOT_MEASURED) L.push(cell(NOT_MEASURED));
  else {
    L.push('| Set | Status | Killed or named |', '|---|---|---|');
    for (const [s, m] of Object.entries(b.mutation)) L.push(`| ${s} | ${m.status} | ${m.killed}/${m.total} |`);
  }
  L.push('', '## Installs and connectors', '');
  for (const [k, v] of [
    ['external-consumer', b.externalConsumer],
    ['connector-archive-e2e', b.connectorArchiveE2e],
  ])
    L.push(
      `- ${k}: ${v === NOT_MEASURED ? cell(v) : v.map((j) => `${j.name} ${j.conclusion} (${j.seconds} s)`).join('; ')}`,
    );
  L.push('', '## Files', '');
  if (b.archives === NOT_MEASURED) L.push(`- archives: ${cell(NOT_MEASURED)}`);
  else for (const a of b.archives) L.push(`- ${a.name}: ${a.bytes} bytes, \`${a.sha256}\``);
  if (b.sboms === NOT_MEASURED) L.push(`- SBOMs: ${cell(NOT_MEASURED)}`);
  else for (const s of b.sboms) L.push(`- ${s.name}: ${s.components ?? '?'} components, \`${s.sha256}\``);
  L.push(`- image: ${b.image === NOT_MEASURED ? cell(NOT_MEASURED) : '`' + JSON.stringify(b.image) + '`'}`);
  L.push('', "## People's passes", '', b.field, '', '## Duration', '');
  if (b.duration === NOT_MEASURED) L.push(cell(NOT_MEASURED));
  else {
    L.push(
      `${b.duration.wallSeconds} s from the first job's start to the last job's end; the longest job: ${b.duration.longestJob?.name} (${b.duration.longestJob?.seconds} s).`,
      '',
    );
    L.push('| Job | Conclusion | Seconds |', '|---|---|---|');
    for (const j of b.duration.jobs) L.push(`| ${j.name} | ${j.conclusion} | ${j.seconds} |`);
  }
  return `${L.join('\n')}\n`;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
  const [dir, sha, run, out] = ['dir', 'sha', 'run', 'out'].map(arg);
  if (!dir || !sha || !run || !out) {
    console.error('usage: baseline.mjs --dir=<artifacts> --sha=<sha> --run=<id> --out=<dir> [--jobs=<jobs.json>]');
    process.exit(2);
  }
  const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
  const jobs = arg('jobs') ? (json(arg('jobs'))?.jobs ?? null) : null;
  const b = collect({ dir, sha, run, version, jobs });
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, `baseline-${version}.json`), `${JSON.stringify(b, null, 1)}\n`);
  writeFileSync(join(out, `baseline-${version}.md`), toMarkdown(b));
  console.log(`baseline-${version}: written under ${out}`);
}
