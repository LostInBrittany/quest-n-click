// What a candidate's files prove, one contract for `ship` and the Field Kit (4.1.19, plan §6.5): four functions that
// compose, of which only the last asks GitHub anything.
//   1. readCandidateManifest: a candidate manifest's text read strictly (tools/release/candidate.mjs writes it);
//   2. digestProblems: files against the manifest's SHA-256 (integrity: they are the files it names);
//   3. verifyAttestation: a file's provenance attestation (authenticity: a workflow of this repository made it, in
//      which run), by `gh attestation verify`; offline with a downloaded attestation bundle and a trusted root saved
//      once (`gh attestation trusted-root > trusted-root.jsonl`), online otherwise;
//   4. queryRun: what GitHub says of a run now (its workflow, conclusion, event, branch).
// Integrity is not authenticity: (2) says a file is the one a manifest names, only (3) or (4) say who wrote the
// manifest.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { atLeast } from './candidate.mjs';

export const REPO = process.env.WEB_SCUMM_REPO ?? 'wanoo/quest-n-click';
export const CANDIDATE_WORKFLOW = `${REPO}/.github/workflows/candidate.yml`;
/**
 * The repository's name before 4.2.5 (D47): a release or a candidate made before the rename is attested by a workflow
 * of wanoo/web-scumm, and its signing certificate keeps saying so. Verifying one of them asks for that identity.
 */
export const FORMER_REPO = 'wanoo/web-scumm';
/** The first release attested under the repository's new name. */
export const RENAMED = '4.2.5';
/** The repository whose workflow attested the files of a release of `version`: the former name up to 4.2.4. */
export const repoOfRelease = (version) =>
  process.env.WEB_SCUMM_REPO ?? (atLeast(String(version).replace(/^v/, ''), RENAMED) ? REPO : FORMER_REPO);

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** A candidate manifest, read strictly; throws saying why it is not one. */
export function readCandidateManifest(text) {
  let m;
  try {
    m = JSON.parse(text);
  } catch {
    throw new Error('the candidate manifest is not JSON');
  }
  if (
    m?.format !== 'web-scumm-candidate' ||
    m.schema !== 1 ||
    !/^[0-9a-f]{40}$/.test(m.sha ?? '') ||
    !/^\d+$/.test(m.candidateRunId ?? '') ||
    !Array.isArray(m.artifacts) ||
    !m.artifacts.every((a) => typeof a?.name === 'string' && /^[0-9a-f]{64}$/.test(a?.sha256 ?? ''))
  )
    throw new Error('not a candidate manifest of schema 1');
  return m;
}

/**
 * What is wrong with files against a manifest; [] when nothing is. `files`: name → bytes (or their SHA-256). Every file
 * given must be named, with its digest; `all` asks for every named file too.
 */
export function digestProblems(manifest, files, { all = false } = {}) {
  const want = new Map(manifest.artifacts.map((a) => [a.name, a.sha256]));
  const bad = [];
  for (const [name, bytes] of files) {
    const d = typeof bytes === 'string' ? bytes : sha256(bytes);
    if (!want.has(name)) bad.push(`${name}: not in the manifest`);
    else if (want.get(name) !== d) bad.push(`${name}: its SHA-256 differs from the manifest's`);
  }
  if (all) for (const name of want.keys()) if (!files.has(name)) bad.push(`${name}: missing`);
  return bad;
}

/** The run id a provenance statement names (its `invocationId`, …/actions/runs/<id>/attempts/<n>), or null. */
export const runOfStatement = (json) => /\/actions\/runs\/(\d+)(?:\/attempts\/\d+)?"/.exec(json)?.[1] ?? null;

/**
 * A file's provenance attestation, verified by the GitHub CLI: `bundle` and `trustedRoot` given, nothing is fetched
 * (offline); else the attestation is looked up on GitHub. `signerWorkflow` asks for the workflow that signed it,
 * `sourceRef` for the branch it ran on. `former`: a file whose version is not known (a field bundle's candidate) may
 * also be attested by the repository under its former name (FORMER_REPO, before 4.2.5), and nothing else.
 * Returns the run id the attestation names; throws when it does not verify.
 */
export function verifyAttestation(file, options = {}) {
  const { repo = REPO, signerWorkflow, former = false } = options;
  try {
    return verifyOnce(file, options);
  } catch (e) {
    if (!former || repo === FORMER_REPO) throw e;
    const old = (s) => s?.replace(`${repo}/`, `${FORMER_REPO}/`);
    return verifyOnce(file, { ...options, repo: FORMER_REPO, signerWorkflow: old(signerWorkflow) });
  }
}

function verifyOnce(file, { repo = REPO, bundle, trustedRoot, signerWorkflow, sourceRef, gh = 'gh', timeoutMs } = {}) {
  const args = ['attestation', 'verify', file, '--repo', repo, '--format', 'json'];
  if (bundle) args.push('--bundle', bundle);
  if (trustedRoot) args.push('--custom-trusted-root', trustedRoot);
  if (signerWorkflow) args.push('--signer-workflow', signerWorkflow);
  if (sourceRef) args.push('--source-ref', sourceRef);
  let out;
  try {
    out = execFileSync(gh, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 1 << 26,
      ...(timeoutMs ? { timeout: timeoutMs } : {}),
    });
  } catch (e) {
    const why = String(e.stderr || e.message)
      .trim()
      .split('\n')
      .slice(-2)
      .join(' ');
    throw new Error(`${file}: its attestation does not verify (${why})`);
  }
  return { runId: runOfStatement(out) };
}

/**
 * What GitHub says of a run now. Its `headSha` is not the SHA a candidate tested: a run started by hand on main has
 * main's tip there, and the SHA it tested is its `inputs.sha`, written into the manifest. The manifest's attestation (or
 * the manifest the run keeps) binds that SHA to the run; comparing `headSha` would refuse every candidate of an older
 * commit (second reading of 4.1.19 PR 2b, plan §6.5 said to compare it).
 */
export function queryRun(runId, { gh = 'gh', repo = REPO, timeoutMs } = {}) {
  if (!/^\d+$/.test(String(runId ?? ''))) throw new Error(`not a run id: ${runId}`);
  const out = execFileSync(
    gh,
    ['run', 'view', String(runId), '--repo', repo, '--json', 'workflowName,status,conclusion,event,headBranch,headSha'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...(timeoutMs ? { timeout: timeoutMs } : {}) },
  );
  return JSON.parse(out);
}

/** Why a run is not a candidate a tag (or a pass) may stand on; null when it is one. */
export function candidateRunProblem(r, runId) {
  if (r.workflowName !== 'candidate') return `run ${runId} is a ${r.workflowName} run, not a candidate run`;
  // A pull request's run (full-ci) or a run started from another branch judges that branch's copy of candidate.yml.
  if (r.event !== 'workflow_dispatch' || r.headBranch !== 'main')
    return `candidate run ${runId} is a ${r.event} run on ${r.headBranch}: a tag names one started by hand on main`;
  if (r.status !== 'completed' || r.conclusion !== 'success')
    return `candidate run ${runId}: ${r.status} ${r.conclusion ?? ''}; a tag stands on a green candidate`;
  return null;
}
