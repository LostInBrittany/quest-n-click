// An `npm install` without a lockfile tried again on a registry hiccup (#471): run 42633058102's fresh-install,
// upgrade and external-consumer failed on `404 Not Found - GET …/rollup-4.68.2.tgz`, a tarball the registry's index
// listed a minute after its publication while its CDN did not serve it yet. A transient error is tried again, said on
// stderr; a failure of this tree's own (a name that does not exist, a peer conflict, a build script) comes back at once.
import { describe, expect, it } from 'vitest';
import { NPM_WAITS, retryNpm, transientNpm } from '../scripts/lib/archive-harness.mjs';

const ROLLUP = [
  'npm error code E404',
  'npm error 404 Not Found - GET https://registry.npmjs.org/rollup/-/rollup-4.68.2.tgz - Not found',
  'npm error 404',
  "npm error 404  'rollup@https://registry.npmjs.org/rollup/-/rollup-4.68.2.tgz' is not in this registry.",
].join('\n');

describe('transientNpm', () => {
  it('names the errors a later try can pass', () => {
    expect(transientNpm(ROLLUP)).toBe(
      "E404 on a tarball the registry's index already lists (https://registry.npmjs.org/rollup/-/rollup-4.68.2.tgz)",
    );
    // npm before 10 wrote `npm ERR!`; a scoped tarball has the same `/-/` path.
    expect(
      transientNpm(
        'npm ERR! 404 Not Found - GET https://registry.npmjs.org/@rollup/rollup-linux-x64-gnu/-/x-4.68.2.tgz',
      ),
    ).toMatch(/^E404 on a tarball/);
    for (const code of ['ETARGET', 'ECONNRESET', 'ETIMEDOUT', 'ESOCKETTIMEDOUT', 'EAI_AGAIN', 'E429', 'E500', 'E503'])
      expect(transientNpm(`npm warn deprecated x\nnpm error code ${code}\nnpm error something`), code).toBe(code);
  });

  it("gives null for this tree's own failures", () => {
    // A package that does not exist: a 404 on its index, not on a tarball.
    expect(
      transientNpm(
        'npm error code E404\nnpm error 404 Not Found - GET https://registry.npmjs.org/no-such-package-471 - Not found',
      ),
    ).toBeNull();
    expect(transientNpm('npm error code ERESOLVE\nnpm error ERESOLVE unable to resolve dependency tree')).toBeNull();
    expect(transientNpm('npm error code 1\nnpm error path /x/node_modules/sharp\nnpm error command failed')).toBeNull();
    expect(transientNpm('npm error code EINTEGRITY')).toBeNull();
    // A build script's own output that mentions a network code is not npm's error code.
    expect(transientNpm('Error: connect ETIMEDOUT 10.0.0.1:443\nnpm error code 1')).toBeNull();
    expect(transientNpm('')).toBeNull();
  });
});

describe('retryNpm', () => {
  /** A fake npm answering each try with the next result; the pauses and the lines said, recorded. */
  function fake(results: { status: number; stderr?: string }[]) {
    const tries: number[] = [];
    const waited: number[] = [];
    const said: string[] = [];
    const r = retryNpm(
      (i: number) => {
        tries.push(i);
        return results[Math.min(i, results.length - 1)]!;
      },
      { wait: (ms: number) => waited.push(ms), tell: (l: string) => said.push(l) },
    );
    return { r, tries, waited, said };
  }

  it('waits 30, 60 then 120 s between tries, four in all', () => {
    expect(NPM_WAITS).toEqual([30_000, 60_000, 120_000]);
  });

  it('tries again on a transient error, saying why, until a try passes', () => {
    const { r, tries, waited, said } = fake([
      { status: 1, stderr: ROLLUP },
      { status: 1, stderr: ROLLUP },
      { status: 0 },
    ]);
    expect(r.status).toBe(0);
    expect(tries).toEqual([0, 1, 2]);
    expect(waited).toEqual([30_000, 60_000]);
    expect(said[0]).toMatch(
      /^npm install failed on E404 on a tarball .*rollup-4\.68\.2\.tgz.*, try 1\/4: again in 30 s$/,
    );
    expect(said[1]).toMatch(/try 2\/4: again in 60 s$/);
  });

  it('gives back the last failure once the tries are spent', () => {
    const { r, tries, waited } = fake([{ status: 1, stderr: 'npm error code ETARGET' }]);
    expect(r).toEqual({ status: 1, stderr: 'npm error code ETARGET' });
    expect(tries).toEqual([0, 1, 2, 3]);
    expect(waited).toEqual(NPM_WAITS);
  });

  it('gives back a failure of its own at once, and a success without a word', () => {
    const conflict = fake([{ status: 1, stderr: 'npm error code ERESOLVE' }, { status: 0 }]);
    expect(conflict.r.status).toBe(1);
    expect(conflict.tries).toEqual([0]);
    expect(conflict.said).toEqual([]);
    const ok = fake([{ status: 0, stderr: 'npm error code ETARGET' }]);
    expect(ok.tries).toEqual([0]);
    expect(ok.waited).toEqual([]);
  });
});
