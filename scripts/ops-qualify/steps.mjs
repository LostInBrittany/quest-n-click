// The qualification's steps and its shell (4.1.20 PR 3, plan §8.0, split from scripts/ops-qualify.mjs): each step
// said as it is judged and kept for the report, every command run with its output kept and its failure thrown.
import { spawnSync } from 'node:child_process';

/** The steps of one run, and `step`, which judges one, says it and keeps it. */
export function createSteps() {
  const steps = [];
  const step = (name, ok, detail = {}) => {
    steps.push({ name, ok, ...detail });
    console.log(`${ok ? '✔' : '✖'}  ${name}${Object.keys(detail).length ? ` ${JSON.stringify(detail)}` : ''}`);
    return ok;
  };
  return { steps, step };
}

export const sh = (cmd, a, o = {}) => {
  const r = spawnSync(cmd, a, {
    encoding: 'utf8',
    // A backup of 20 000 runs is megabytes on stdout: the default buffer (1 MiB) would kill the command.
    maxBuffer: 1 << 28,
    stdio: o.input !== undefined ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
    ...o,
  });
  if (r.status !== 0 && !o.allowFail) throw new Error(`${cmd} ${a.join(' ')}: exit ${r.status}\n${r.stderr}`);
  return r;
};

export const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
