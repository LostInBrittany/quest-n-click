#!/usr/bin/env node
// The Bridge's qualification image, built once (4.1.19, plan §6.2): from the candidate's own `web-scumm-bridge`
// archive and the image's versioned lock (scripts/locks/web-scumm-bridge-image.json, `npm ci`, nothing resolved), then
// saved as an archive that later jobs load instead of building again. An image has three identities, each written to
// web-scumm-bridge-image.json and checked after a load:
//   - the config digest (the image id `docker image inspect` gives: what runs);
//   - the OCI manifest digest (index.json of the saved layout, Docker 25+: what a registry would name);
//   - the SHA-256 of the archive carried between jobs and published (what was transported).
// Schema 2 (4.1.20 PR 3, plan §8.2) adds what the image is for and how it was made: its OS and architecture, the Docker
// engine and BuildKit that built it, the archive's compression (`docker save` writes a plain tar) and its size.
// Its SBOM (CycloneDX, the npm packages installed in /opt, read inside the image itself) is written beside it, with the
// base image named by its digest.
//
//   node scripts/bridge-image.mjs context --tarballs=<dir> --out=<dir>   the build context only (ops:qualify builds it)
//   node scripts/bridge-image.mjs build --tarballs=<dir> --out=<dir>     build, save, digests, SBOM
//   node scripts/bridge-image.mjs load --from=<dir>                      load, then check the config digest
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { imageManifest, lockFor, lockProblems } from './pack-manifests.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const PROFILE = join(ROOT, 'ops', 'qualify');
export const TAG = 'web-scumm-bridge:qualify';
export const ARCHIVE = 'web-scumm-bridge-image.tar';
export const IDENTITY = 'web-scumm-bridge-image.json';
export const SBOM = 'web-scumm-bridge-image.cdx.json';

const root = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

/**
 * A build context: the Dockerfile, the candidate's Bridge archive, and the image's manifest and lock, checked against
 * each other first (a lock that does not fit stops here, never inside `docker build`).
 */
export function buildContext(bridgeTgz, dir) {
  mkdirSync(dir, { recursive: true });
  copyFileSync(join(PROFILE, 'Dockerfile.bridge'), join(dir, 'Dockerfile.bridge'));
  copyFileSync(bridgeTgz, join(dir, 'web-scumm-bridge.tgz'));
  const manifest = imageManifest(root);
  const lock = JSON.parse(readFileSync(join(ROOT, 'scripts', 'locks', 'web-scumm-bridge-image.json'), 'utf8'));
  const bad = lockProblems(lock, manifest);
  if (bad.length) throw new Error(`the image's lock does not fit its manifest: ${bad.join('; ')} (npm run locks)`);
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(join(dir, 'package-lock.json'), `${JSON.stringify(lockFor(lock, manifest), null, 2)}\n`);
  return dir;
}

/** The base image the Dockerfile names (by digest, ops:qualify checks it). */
export const baseImage = () => /^FROM\s+(\S+)/m.exec(readFileSync(join(PROFILE, 'Dockerfile.bridge'), 'utf8'))?.[1];

const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const docker = (args, o = {}) => execFileSync('docker', args, { encoding: 'utf8', maxBuffer: 1 << 28, ...o });

/**
 * An image's identity (schema 2), from what `docker` says of it and its saved archive. `run(args)` is `docker`, so the
 * fields can be checked without a Docker engine.
 */
export function identityFor({ run, archive, tgz, version, base, digest = manifestDigest }) {
  const inspect = (f) => run(['image', 'inspect', '--format', f, TAG]).trim();
  const buildx = run(['buildx', 'version']).trim();
  return {
    format: 'web-scumm-bridge-image',
    schema: 2,
    version,
    tag: TAG,
    base,
    configDigest: inspect('{{.Id}}'),
    manifestDigest: digest(archive),
    os: inspect('{{.Os}}'),
    architecture: inspect('{{.Architecture}}'),
    archive: ARCHIVE,
    archiveSha256: sha256(archive),
    // `docker save` writes an uncompressed tar: the release publishes it as it was carried.
    compression: 'none',
    archiveBytes: statSync(archive).size,
    bridgeSha256: sha256(tgz),
    docker: run(['version', '--format', '{{.Server.Version}}']).trim(),
    // `github.com/docker/buildx v0.29.1 a1b2c3d` → `v0.29.1`.
    buildkit: buildx.split(/\s+/).find((w) => /^v\d/.test(w)) ?? buildx,
  };
}

/** The OCI manifest digest of a saved image: index.json of the layout `docker save` writes (Docker 25+). */
function manifestDigest(archive) {
  const dir = mkdtempSync(join(tmpdir(), 'bridge-image-'));
  try {
    execFileSync('tar', ['-xf', archive, '-C', dir, 'index.json']);
    const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'));
    const d = index.manifests?.[0]?.digest;
    if (!/^sha256:[0-9a-f]{64}$/.test(d ?? ''))
      throw new Error('the saved image has no OCI manifest digest (Docker 25+)');
    return d;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The npm packages installed in the image, read inside it, the Bridge and the base image named as components. */
function imageSbom(identity) {
  const version = identity.version;
  const sbom = JSON.parse(
    docker([
      'run',
      '--rm',
      '--network=none',
      '--workdir=/opt',
      '--entrypoint=npm',
      TAG,
      'sbom',
      '--sbom-format',
      'cyclonedx',
      '--omit',
      'dev',
    ]),
  );
  const base = baseImage();
  const root = sbom.metadata?.component ?? {};
  // The Bridge itself (unpacked in /opt/bridge, outside the tree `npm sbom` reads in /opt), by its archive's SHA-256.
  const bridge = {
    type: 'library',
    'bom-ref': `web-scumm-bridge@${version}`,
    name: 'web-scumm-bridge',
    version,
    purl: `pkg:npm/web-scumm-bridge@${version}`,
    hashes: [{ alg: 'SHA-256', content: identity.bridgeSha256 }],
  };
  sbom.components = [
    ...(sbom.components ?? []),
    bridge,
    {
      type: 'container',
      name: base.split('@')[0],
      version: base.split('@')[1],
      description: 'The base image (its operating system packages are not listed here)',
    },
  ];
  // The root keeps the `bom-ref` npm gave it: `dependencies[0].ref` names it (second reading of 4.1.19 PR 2).
  sbom.dependencies = (sbom.dependencies ?? []).map((d) =>
    d.ref === root['bom-ref'] ? { ...d, dependsOn: [...new Set([...(d.dependsOn ?? []), bridge['bom-ref']])] } : d,
  );
  sbom.metadata = {
    ...sbom.metadata,
    component: {
      ...root,
      type: 'container',
      name: 'web-scumm-bridge-image',
      version,
      hashes: [{ alg: 'SHA-256', content: identity.archiveSha256 }],
      properties: [
        { name: 'web-scumm:configDigest', value: identity.configDigest },
        { name: 'web-scumm:manifestDigest', value: identity.manifestDigest },
      ],
    },
  };
  return sbom;
}

const flag = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const cmd = process.argv[2];
  if (cmd === 'context' || cmd === 'build') {
    const tarballs = resolve(flag('tarballs') ?? '');
    const out = resolve(flag('out') ?? '');
    const tgz = join(tarballs, `web-scumm-bridge-${root.version}.tgz`);
    if (cmd === 'context') {
      buildContext(tgz, out);
      console.log(`✔  build context in ${out}`);
    } else {
      const ctx = buildContext(tgz, mkdtempSync(join(tmpdir(), 'bridge-image-ctx-')));
      docker(['build', '--file', join(ctx, 'Dockerfile.bridge'), '--tag', TAG, ctx], { stdio: 'inherit' });
      mkdirSync(out, { recursive: true });
      const archive = join(out, ARCHIVE);
      docker(['save', '--output', archive, TAG]);
      const identity = identityFor({ run: docker, archive, tgz, version: root.version, base: baseImage() });
      writeFileSync(join(out, IDENTITY), `${JSON.stringify(identity, null, 2)}\n`);
      writeFileSync(join(out, SBOM), `${JSON.stringify(imageSbom(identity), null, 2)}\n`);
      console.log(
        `✔  ${TAG}: config ${identity.configDigest}, manifest ${identity.manifestDigest}, archive sha256:${identity.archiveSha256}`,
      );
    }
  } else if (cmd === 'load') {
    const from = resolve(flag('from') ?? '');
    const identity = JSON.parse(readFileSync(join(from, IDENTITY), 'utf8'));
    const archive = join(from, identity.archive);
    if (sha256(archive) !== identity.archiveSha256) throw new Error(`${archive}: not the archive its identity names`);
    if (manifestDigest(archive) !== identity.manifestDigest) throw new Error(`${archive}: another OCI manifest`);
    docker(['load', '--input', archive], { stdio: ['ignore', 'inherit', 'inherit'] });
    const loaded = docker(['image', 'inspect', '--format', '{{.Id}}', identity.tag]).trim();
    if (loaded !== identity.configDigest)
      throw new Error(`${identity.tag} loaded as ${loaded}, not ${identity.configDigest}`);
    console.log(`✔  ${identity.tag} loaded: config ${loaded}, the image the candidate built`);
  } else {
    console.error('usage: node scripts/bridge-image.mjs <context|build|load> … (see its header)');
    process.exit(2);
  }
}
