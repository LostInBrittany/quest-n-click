// Code the engine carries instead of a package (next): navmesh, whose package declares a git dependency npm 12 refuses
// (src/engine/core/nav/navmesh/README.md). Its record, vendored.json, is read here for the two outputs that name
// third-party code: a build's licenses/THIRD_PARTY_NOTICES.txt (tools/dist.ts) and the engine's SBOM
// (scripts/sbom.mjs). The record missing is an error in both: navmesh would leave them without a word.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The record, from the engine's folder (the repository, an installed engine, an unpacked engine archive). */
export const VENDORED = 'src/engine/core/nav/navmesh/vendored.json';

/** The vendored entries under `root`; throws, naming the file, when it is missing, unreadable or empty. */
export function readVendored(root) {
  const file = join(root, VENDORED);
  let list;
  try {
    list = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(
      `${file}: missing or unreadable (${e instanceof Error ? e.message : e}); it names the code the engine carries (navmesh) for the notices and the SBOM`,
    );
  }
  if (!Array.isArray(list) || !list.length)
    throw new Error(`${file}: no entry; it names navmesh, which the engine carries`);
  return list;
}

/** What an entry's build contains, in words: `javascript-astar 0.4.2 (github:…#…, MIT)`. */
export const bundlesText = (v) =>
  (v.bundled ?? []).map((b) => `${b.name} ${b.version} (${b.source}, ${b.licence})`).join(', ');

/** An entry's heading in THIRD_PARTY_NOTICES.txt. */
export function noticeHeading(v) {
  const bundles = bundlesText(v);
  return `${v.name} ${v.version} (${v.licence}, carried in the engine${bundles ? `; bundles ${bundles}` : ''})`;
}

/** The THIRD_PARTY_NOTICES.txt blocks of the vendored code: a heading per entry, then its licence file. */
export function vendoredNotices(root, list = readVendored(root)) {
  return list.flatMap((v) => [
    '='.repeat(72),
    noticeHeading(v),
    '='.repeat(72),
    readFileSync(join(root, v.notice), 'utf8').trim(),
    '',
  ]);
}

/** verify:dist's problems with a build's notices `text`: each vendored entry they do not name, or the record missing. */
export function unnamedVendored(root, text) {
  try {
    return readVendored(root)
      .filter((v) => !text.includes(noticeHeading(v)))
      .map((v) => `licenses/THIRD_PARTY_NOTICES.txt: does not name ${v.name} ${v.version}, which the engine carries`);
  } catch (e) {
    return [e instanceof Error ? e.message : String(e)];
  }
}

const ref = (c) => `${c.name}@${c.version}`;

/**
 * `sbom` (what `npm sbom --sbom-format cyclonedx` writes, specVersion 1.5) with the vendored code of the unpacked
 * engine archive `dir`: each entry a component, hashed by the file carried, what its build contains as its nested
 * `components` (CycloneDX's assembly: the code is inside that file, not installed beside it), and the dependency graph
 * extended (the engine depends on navmesh, navmesh on javascript-astar). Throws when `dir` has no record.
 */
export function withVendored(sbom, dir) {
  const root = sbom.metadata?.component?.['bom-ref'];
  const deps = (sbom.dependencies ??= []);
  for (const v of readVendored(dir)) {
    const bundled = (v.bundled ?? []).map((b) => ({
      'bom-ref': ref(b),
      type: 'library',
      name: b.name,
      version: b.version,
      purl: b.purl,
      licenses: [{ license: { id: b.licence } }],
      description: `Contained in ${v.file} (${v.name} ${v.version}'s build), from ${b.source}`,
    }));
    (sbom.components ??= []).push({
      'bom-ref': ref(v),
      type: 'library',
      name: v.name,
      version: v.version,
      purl: v.purl,
      licenses: [{ license: { id: v.licence } }],
      hashes: [
        {
          alg: 'SHA-256',
          content: createHash('sha256')
            .update(readFileSync(join(dir, v.file)))
            .digest('hex'),
        },
      ],
      description: `Carried in the engine at ${v.file}, from ${v.source}`,
      ...(bundled.length ? { components: bundled } : {}),
    });
    const top = deps.find((d) => d.ref === root);
    if (top) top.dependsOn = [...(top.dependsOn ?? []), ref(v)];
    deps.push({ ref: ref(v), dependsOn: bundled.map((b) => b['bom-ref']) });
    for (const b of bundled) deps.push({ ref: b['bom-ref'], dependsOn: [] });
  }
  return sbom;
}
