// Pages' `/docs/` (4.5.0 "Wiki", docs/dev/PLAN-4.5-WIKI.md §4.5.4 and §4.5.5, phase A5b), assembled from fixture
// releases the way ci.yml does from the real ones: each revision's `html/` copied byte for byte to `/docs/<v>/r<n>/`,
// the aliases `/docs/<v>/` and `/docs/latest/` to what `publication.json` approves (and say they are aliases), an rc
// at `/docs/<v-rc>/` without moving latest, `/docs/preview/` only in the bootstrap, a placeholder pointing to 4.4.0
// when nothing is released; an archive that is not its release's (sums, candidate manifest, identity) or a record that
// names another archive is refused. The §4.5.5 test: the tree is the same bytes whatever the branch's `wiki/` holds,
// an unreleased change included, because it is assembled from the archives alone.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { main } from '../tools/wiki';
import { type ArchiveOptions, buildArchive, readArchive } from '../tools/wiki/archive';
import { readManifest } from '../tools/wiki/manifest';
import { assemblePages, docsTag } from '../tools/wiki/pages';
import { decide, emptyPublication, type Promotion, type Publication } from '../tools/wiki/publication';

const BASE = resolve('tests/fixtures/wiki/base');
const temps: string[] = [];
afterAll(() => {
  for (const t of temps) rmSync(t, { recursive: true, force: true });
});
const tmp = (prefix: string) => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
};
const sum = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const archive = (o: Partial<ArchiveOptions> = {}) =>
  buildArchive({
    root: resolve('.'),
    wikiDir: BASE,
    manifest: readManifest(o.wikiDir ?? BASE).manifest!,
    productVersion: '4.5.0',
    productCommit: 'c'.repeat(40),
    docRevision: 'd'.repeat(40),
    revision: 'r1',
    buildId: '1',
    identifiers: [],
    ...o,
  });

/** A release's folder as `downloadReleases` fills it: the archive, the sums, and a product release's candidate manifest. */
function release(dir: string, tag: string, bytes: Buffer, name: string, o: { sums?: string; candidate?: string } = {}) {
  const at = join(dir, tag);
  mkdirSync(at, { recursive: true });
  writeFileSync(join(at, name), bytes);
  const sumsName = tag.startsWith('v')
    ? `quest-n-click-${tag}-SHA256SUMS`
    : `${name.replace(/\.tar\.gz$/, '')}-SHA256SUMS`;
  writeFileSync(join(at, sumsName), `${o.sums ?? sum(bytes)}  ${name}\n`);
  if (tag.startsWith('v')) {
    const pkg = tag.slice(1).replace(/-.*$/, '');
    writeFileSync(
      join(at, `quest-n-click-${tag}-candidate.json`),
      JSON.stringify({
        artifacts: [{ name: `docs/quest-n-click-docs-${pkg}.tar.gz`, sha256: o.candidate ?? sum(bytes) }],
      }),
    );
  }
}
const record = (...steps: Promotion[]): Publication =>
  steps.reduce((r, p) => {
    const d = decide(r, p);
    if (!d.ok) throw new Error(d.problem);
    return d.record;
  }, emptyPublication());
const promo = (version: string, revision: string, bytes: Buffer, o: Partial<Promotion> = {}): Promotion => ({
  version,
  revision,
  sha256: sum(bytes),
  tag: revision === 'r1' ? `v${version}` : `docs-v${version}-${revision}`,
  date: '2026-11-01',
  ...o,
});

/** Three releases: 4.5.0 (r1 and its fix r2), and 4.6.0-rc.1; 4.5.0 r2 approved and latest. */
function fixture(wikiDir = BASE) {
  const dir = tmp('pages-releases-');
  const r1 = archive({ wikiDir });
  const r2 = archive({ wikiDir, revision: 'r2', docRevision: 'e'.repeat(40) });
  const rc = archive({ wikiDir, productVersion: '4.6.0', productCommit: 'f'.repeat(40), docRevision: 'f'.repeat(40) });
  release(dir, 'v4.5.0', r1.bytes, 'quest-n-click-docs-4.5.0.tar.gz');
  release(dir, 'docs-v4.5.0-r2', r2.bytes, 'quest-n-click-docs-4.5.0-r2.tar.gz');
  release(dir, 'v4.6.0-rc.1', rc.bytes, 'quest-n-click-docs-4.6.0-rc.1.tar.gz');
  const pub = record(promo('4.5.0', 'r1', r1.bytes), promo('4.5.0', 'r2', r2.bytes));
  return { dir, r1, r2, rc, pub };
}
const html = (files: Map<string, Buffer>, path: string) => files.get(path)?.toString('utf8') ?? '';

describe('the tags Pages reads', () => {
  it('releases from 4.5.0 (rcs included), doc revisions from r2, previews; nothing older', () => {
    expect(docsTag('v4.5.0')).toEqual({ kind: 'release', version: '4.5.0', revision: 'r1', prerelease: false });
    expect(docsTag('v4.5.0-rc.2')).toMatchObject({ kind: 'release', prerelease: true });
    expect(docsTag('v4.4.0')).toBeUndefined();
    expect(docsTag('v4.4.9-rc.1')).toBeUndefined();
    expect(docsTag('docs-v4.5.0-r2')).toEqual({ kind: 'revision', version: '4.5.0', revision: 'r2' });
    expect(docsTag('docs-v4.5.0-r1')).toBeUndefined();
    expect(docsTag('docs-v4.5.0-rc.1-r2')).toBeUndefined();
    expect(docsTag('docs-v4.5.0-preview-0123456789ab')).toEqual({ kind: 'preview', version: '4.5.0' });
  });
});

describe('/docs/, from the released archives only', () => {
  const f = fixture();
  const files = assemblePages({ releasesDir: f.dir, publication: f.pub });

  it("copies each revision's html/ as it is, byte for byte, under its permalink", () => {
    for (const [at, a] of [
      ['4.5.0/r1', f.r1],
      ['4.5.0/r2', f.r2],
      ['4.6.0-rc.1/r1', f.rc],
    ] as const) {
      const site = [...readArchive(a.bytes).files].filter(([k]) => k.startsWith('html/'));
      expect(site.length).toBeGreaterThan(10);
      for (const [k, v] of site) expect(files.get(`${at}/${k.slice(5)}`)?.equals(v), `${at}/${k}`).toBe(true);
    }
  });

  it('makes /docs/<v>/ and /docs/latest/ aliases of the approved revision, said as aliases, the #section kept', () => {
    const alias = html(files, '4.5.0/en/create.rooms.html');
    expect(alias).toContain('This address is an alias of <a href="../r2/en/create.rooms.html">');
    expect(alias).toContain('location.replace("../r2/en/create.rooms.html" + location.hash)');
    expect(html(files, '4.5.0/index.html')).toContain('href="r2/index.html"');
    expect(html(files, 'latest/fr/create.exits.html')).toContain('href="../../4.5.0/r2/fr/create.exits.html"');
    expect(html(files, 'latest/index.html')).toContain('the latest');
    // An rc: its own alias to r1, never latest.
    expect(html(files, '4.6.0-rc.1/en/create.rooms.html')).toContain('href="../r1/en/create.rooms.html"');
    expect(html(files, 'latest/en/create.rooms.html')).not.toContain('4.6.0');
    expect(JSON.parse(html(files, 'publication.json'))).toEqual(f.pub);
    expect(html(files, 'index.html')).toContain('alias <a href="4.5.0/index.html">4.5.0/</a> → r2 (approved)');
    // No preview once a release is out.
    expect([...files.keys()].some((k) => k.startsWith('preview/'))).toBe(false);
  });

  it('is byte-identical whatever the branch holds in wiki/: an unreleased change never reaches /docs/ (§4.5.5)', () => {
    // A branch whose wiki gained a page change and an unreleased feature: what CI would build from it.
    const branch = tmp('pages-branch-wiki-');
    cpSync(BASE, branch, { recursive: true });
    const page = join(branch, 'en', 'create.rooms.md');
    writeFileSync(page, `${readFileSync(page, 'utf8')}\nThe UNRELEASED-TELEPORTER feature, on main only.\n`);
    const fromBranch = archive({ wikiDir: branch });
    expect(fromBranch.bytes.equals(f.r1.bytes)).toBe(false);
    // Pages assembles from the releases: the same tree, to the byte, with nothing of the branch in it.
    const again = assemblePages({ releasesDir: f.dir, publication: f.pub });
    expect([...again.keys()]).toEqual([...files.keys()]);
    for (const [k, v] of files) expect(again.get(k)!.equals(v), k).toBe(true);
    expect([...again.values()].some((v) => v.includes('UNRELEASED-TELEPORTER'))).toBe(false);
  });

  it('`wiki -- pages --releases` writes the same tree, and refuses a folder that is not empty', () => {
    const out = join(tmp('pages-out-'), 'site');
    const pub = join(tmp('pages-pub-'), 'publication.json');
    writeFileSync(pub, JSON.stringify(f.pub));
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(main(['pages', '--releases', f.dir, '--publication', pub, '--out', out])).toBe(0);
      for (const [k, v] of files) expect(readFileSync(join(out, k)).equals(v), k).toBe(true);
      expect(main(['pages', '--releases', f.dir, '--publication', pub, '--out', out])).toBe(1);
      expect(err.mock.calls.flat().join('\n')).toMatch(/not empty/);
    } finally {
      log.mockRestore();
      err.mockRestore();
    }
  });
});

describe('what /docs/ refuses', () => {
  it('an archive that is not the one its release sums, or not the candidate’s, or of another identity', () => {
    const a = archive();
    const sums = tmp('pages-bad-sums-');
    release(sums, 'v4.5.0', a.bytes, 'quest-n-click-docs-4.5.0.tar.gz', { sums: '0'.repeat(64) });
    expect(() => assemblePages({ releasesDir: sums, publication: null })).toThrow(/does not match its SHA256SUMS/);
    const cand = tmp('pages-bad-candidate-');
    release(cand, 'v4.5.0', a.bytes, 'quest-n-click-docs-4.5.0.tar.gz', { candidate: '1'.repeat(64) });
    expect(() => assemblePages({ releasesDir: cand, publication: null })).toThrow(/not the archive the candidate/);
    const other = tmp('pages-bad-identity-');
    release(other, 'v4.5.1', a.bytes, 'quest-n-click-docs-4.5.1.tar.gz');
    expect(() => assemblePages({ releasesDir: other, publication: null })).toThrow(/built for 4\.5\.0, not 4\.5\.1/);
    const rev = tmp('pages-bad-revision-');
    release(rev, 'docs-v4.5.0-r3', a.bytes, 'quest-n-click-docs-4.5.0-r3.tar.gz');
    expect(() => assemblePages({ releasesDir: rev, publication: null })).toThrow(/revision r1, not r3/);
  });

  it('a record naming a revision no release carries, or another archive', () => {
    const f = fixture();
    const missing = record(promo('4.5.0', 'r1', f.r1.bytes), promo('4.7.0', 'r1', f.r1.bytes));
    expect(() => assemblePages({ releasesDir: f.dir, publication: missing })).toThrow(/4\.7\.0 r1, which no release/);
    const wrong = record(promo('4.5.0', 'r1', f.r2.bytes));
    expect(() => assemblePages({ releasesDir: f.dir, publication: wrong })).toThrow(/records 4\.5\.0 r1 as/);
  });
});

describe('beside the game', () => {
  it("the game's service worker never answers a /docs/ page with the game (its navigation fallback skips /docs/)", () => {
    const vite = readFileSync('vite.config.ts', 'utf8');
    expect(vite).toMatch(/navigateFallback: 'index\.html',[\s\S]{0,300}navigateFallbackDenylist: \[\/\\\/docs\\\/\/\]/);
  });
});

describe('the bootstrap', () => {
  it('nothing released: a placeholder pointing to the 4.4.0 documentation, and nothing else', () => {
    const files = assemblePages({ releasesDir: join(tmp('pages-none-'), 'absent'), publication: null });
    expect([...files.keys()]).toEqual(['index.html', 'style.css']);
    expect(html(files, 'index.html')).toContain('https://github.com/wanoo/quest-n-click/blob/v4.4.0/docs/');
  });

  it('a preview is served under /docs/preview/ while no release ≥ 4.5.0 exists, and only then', () => {
    const dir = tmp('pages-preview-');
    const p = archive({ preview: true });
    const tag = 'docs-v4.5.0-preview-0123456789ab';
    release(dir, tag, p.bytes, 'quest-n-click-docs-4.5.0-preview.tar.gz');
    const rc = archive();
    release(dir, 'v4.5.0-rc.1', rc.bytes, 'quest-n-click-docs-4.5.0-rc.1.tar.gz');
    const pub = record(promo('4.5.0', 'r1', p.bytes, { preview: true, tag }));
    const during = assemblePages({ releasesDir: dir, publication: pub });
    expect(during.get('preview/en/studio.notes.html')).toBeDefined();
    expect(html(during, 'index.html')).toContain('preview/index.html');
    expect(during.get('4.5.0-rc.1/r1/index.html')).toBeDefined();
    expect(during.has('latest/index.html')).toBe(false);
    // 4.5.0 is released and recorded: the preview goes.
    release(dir, 'v4.5.0', rc.bytes, 'quest-n-click-docs-4.5.0.tar.gz');
    const released = decide(pub, promo('4.5.0', 'r1', rc.bytes));
    if (!released.ok) throw new Error(released.problem);
    const after = assemblePages({ releasesDir: dir, publication: released.record });
    expect([...after.keys()].some((k) => k.startsWith('preview/'))).toBe(false);
    expect(after.has('latest/index.html')).toBe(true);
  });
});
