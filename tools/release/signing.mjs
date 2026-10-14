#!/usr/bin/env node
// Tags signed with an SSH key (4.1.20 PR 3b, docs/dev/PLAN-4.1.20-LAST-MILE.md §11.1). 4.2 will sign its tags locally
// with the maintainer's key (`ship tag --sign`: `git tag -s`, `gpg.format=ssh`); 4.1.20's tag stays annotated (D30).
// The candidate rehearses the path with no secret at all: an ephemeral key made in the job, a signed tag of the
// candidate's commit that is never pushed, `git verify-tag` against a temporary allowed_signers, then the key and the tag
// destroyed and a report written for the manifest.
//
//   node tools/release/signing.mjs rehearse --out=<file>   in a checkout: the rehearsal on HEAD
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Whether a tag object (`git cat-file tag <name>`) carries an SSH signature. */
export const isSignedTag = (object) => /^-----BEGIN SSH SIGNATURE-----$/m.test(object);

/** `git` arguments that tag `sha` as `name`: annotated, or signed with an SSH key (`sign`, `key` its file). */
export function tagArgs({ name, sha, message, sign = false, key }) {
  if (!sign) return ['tag', '-a', name, sha, '-m', message];
  return [
    '-c',
    'gpg.format=ssh',
    ...(key ? ['-c', `user.signingkey=${key}`] : []),
    'tag',
    '-s',
    name,
    sha,
    '-m',
    message,
  ];
}

const sh = (cmd, args, o = {}) => spawnSync(cmd, args, { encoding: 'utf8', ...o });

/**
 * The rehearsal, in the git repository `cwd` on its HEAD: what it did and saw. `ok` when the tag was signed, verified
 * against the ephemeral key's principal, and the key and the tag are gone.
 */
export function rehearse({ cwd = '.', now = new Date() } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'signing-rehearsal-'));
  const key = join(dir, 'key');
  const principal = 'rehearsal@web-scumm.invalid';
  const name = `rehearsal-${process.pid}-${now.getTime()}`;
  const report = {
    format: 'web-scumm-signing-rehearsal',
    schema: 1,
    at: now.toISOString(),
    commit: sh('git', ['rev-parse', 'HEAD'], { cwd }).stdout.trim(),
    keyType: 'ed25519',
    git: sh('git', ['--version']).stdout.trim(),
    ssh: sh('ssh', ['-V']).stderr.trim(),
    signed: false,
    verified: false,
    principal: null,
    keyDestroyed: false,
    tagDeleted: false,
    pushed: false,
  };
  try {
    const k = sh('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-C', principal, '-f', key]);
    if (k.status !== 0) throw new Error(`ssh-keygen: ${k.stderr}`);
    const pub = readFileSync(`${key}.pub`, 'utf8').trim().split(' ').slice(0, 2).join(' ');
    writeFileSync(join(dir, 'allowed_signers'), `${principal} namespaces="git" ${pub}\n`);
    const id = ['-c', 'user.name=rehearsal', '-c', `user.email=${principal}`];
    const t = sh(
      'git',
      [...id, ...tagArgs({ name, sha: 'HEAD', message: 'rehearsal: never pushed', sign: true, key })],
      {
        cwd,
      },
    );
    report.signed = t.status === 0;
    if (!report.signed) throw new Error(`git tag -s: ${t.stderr}`);
    const v = sh('git', ['-c', `gpg.ssh.allowedSignersFile=${join(dir, 'allowed_signers')}`, 'verify-tag', name], {
      cwd,
    });
    const good = /Good "git" signature for (\S+) with/.exec(`${v.stdout}\n${v.stderr}`);
    report.verified = v.status === 0 && good?.[1] === principal;
    report.principal = good?.[1] ?? null;
  } finally {
    report.tagDeleted = sh('git', ['tag', '-d', name], { cwd }).status === 0 || !report.signed;
    rmSync(dir, { recursive: true, force: true });
    report.keyDestroyed = !existsSync(key);
  }
  return { ok: report.signed && report.verified && report.keyDestroyed && report.tagDeleted, report };
}

const flag = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  if (process.argv[2] !== 'rehearse' || !flag('out')) {
    console.error('usage: node tools/release/signing.mjs rehearse --out=<file>');
    process.exit(2);
  }
  const { ok, report } = rehearse();
  writeFileSync(flag('out'), `${JSON.stringify(report, null, 1)}\n`);
  console.log(
    `${ok ? '✔' : '✖'}  signing rehearsal on ${report.commit.slice(0, 12)}: signed ${report.signed}, verified ${report.verified} (${report.principal}), key destroyed ${report.keyDestroyed}, tag deleted ${report.tagDeleted}, never pushed`,
  );
  process.exit(ok ? 0 : 1);
}
