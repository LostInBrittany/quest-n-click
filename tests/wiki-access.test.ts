// The documentation access contract (4.5.0 "Wiki", docs/dev/PLAN-4.5-WIKI.md §4.3, phase A4), on the fixture wiki
// (tests/fixtures/wiki/base: three ready pages, a draft, planned pages, a glossary) and on the repository's own:
//   - the loader: a repository preview holds the draft and ready pages, never a planned one; a bundle holds the ready
//     ones only, with its identity and no publication state; an unknown major format version is refused, plainly;
//   - search_docs: accents, case and plurals set aside, the glossary's other language followed, weights title and
//     question > alias and identifier > section heading > body, the explicit empty result, the filters, the version
//     filter (left out, or marked with includeArchived), pages of results with a cursor;
//   - read_doc by id: a section, a language, maxChars and a cursor for the rest; a cursor of another request or of
//     another revision refused as stale_cursor; the provenance in the text and in the structured content;
//   - read_doc's rule "exactly one of name and id", and name's answer as before: one text block, no truncation, the
//     provenance in the structured content only;
//   - the bundle: reproducible (two builds, the same bytes), its files hashed in its manifest, the eight legacy pages
//     exact copies of docs/en, written only where the repository tracks nothing.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { callTool, DOCS, jsonSchema, TOOLS, type ToolBackend } from '../tools/studio/tools';
import { bundleOutProblem } from '../tools/wiki';
import { bundleProblems, writeBundle } from '../tools/wiki/bundle';
import { type DocsSet, formatProblem, listDocs, readDocById, searchDocs, splitSections } from '../tools/wiki/docs';
import { bundleDocs, legacyDoc, repositoryDocs, resolveDocs } from '../tools/wiki/docs-load';
import { trackedFiles } from '../tools/wiki/check';
import { AUDIENCES, CONTEXTS, PAGE_TYPES } from '../tools/wiki/manifest';

const ROOT = resolve('.');
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
const preview = (wikiDir = BASE) => repositoryDocs(ROOT, { wikiDir });
const results = (set: DocsSet, query: string, extra: Record<string, unknown> = {}) => {
  const r = searchDocs(set, { query, ...extra });
  return 'note' in r ? [] : r.results;
};
const bundleOpts = (outDir: string, wikiDir = BASE) => ({
  root: ROOT,
  wikiDir,
  outDir,
  productVersion: '4.5.0',
  productCommit: 'a'.repeat(40),
  docRevision: 'a'.repeat(40),
  buildId: '123',
});
/** A package root as an install leaves it: its package.json, its bundle. */
function packageRoot(wikiDir = BASE): string {
  const root = tmp('docs-package-');
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'quest-n-click', version: '4.5.0' }));
  writeBundle(bundleOpts(join(root, 'docs-bundle'), wikiDir));
  return root;
}
const backendOf = (root: string): ToolBackend =>
  ({
    readDoc: async (name: string) => legacyDoc(root, name),
    docs: async () => resolveDocs(root),
  }) as unknown as ToolBackend;

describe('the loader', () => {
  it('reads the draft and ready pages of a repository wiki, never a planned or generated one', () => {
    const set = preview();
    expect(set.index.pages.map((p) => [p.id, p.state])).toEqual([
      ['create.rooms', 'ready'],
      ['create.exits', 'ready'],
      ['studio.notes', 'draft'],
      ['team.write-refused-423', 'ready'],
    ]);
    expect(set.provenance).toMatchObject({ source: 'repository', productVersion: expect.any(String) });
    expect(set.provenance.label).toMatch(/^repository preview/);
    expect(set.index.pages[0]!.langs.en!.sections.map((s) => s.id)).toEqual(['', 'walkable-zones', 'checking']);
    expect(Object.keys(set.pages).sort()).toContain('fr/studio.notes');
  });

  it('cuts a page at its anchors, never inside fenced code', () => {
    const s = splitSections('# T\n\nlead\n\n```md\n<a name="no"></a>\n```\n\n<a name="one"></a>\n\n## One\n\nbody\n');
    expect(s.map((x) => [x.id, x.title])).toEqual([
      ['', 'T'],
      ['one', 'One'],
    ]);
    expect(s[0]!.text).toContain('<a name="no"></a>');
  });

  it('reads a bundle: the ready pages only, its identity, no publication state', () => {
    const set = resolveDocs(packageRoot());
    expect(set.index.pages.map((p) => p.id)).toEqual(['create.rooms', 'create.exits', 'team.write-refused-423']);
    expect(set.provenance).toEqual({
      source: 'bundle',
      productVersion: '4.5.0',
      productCommit: 'a'.repeat(40),
      docRevision: 'a'.repeat(40),
      buildId: '123',
      label: expect.stringContaining('recorded outside it'),
    });
    expect(JSON.stringify(set.provenance)).not.toMatch(/"(published|candidate|preview)"/);
  });

  it('refuses an unknown major version of the index or of the bundle manifest, plainly', () => {
    expect(formatProblem({ format: 'quest-n-click-docs-index', version: 1 }, 'quest-n-click-docs-index', 'x')).toBe(
      undefined,
    );
    expect(formatProblem({ format: 'quest-n-click-docs-index', version: 2 }, 'quest-n-click-docs-index', 'x')).toMatch(
      /format version 2; this engine reads version 1 only/,
    );
    expect(formatProblem({ format: 'other', version: 1 }, 'quest-n-click-docs-index', 'x')).toMatch(/not a/);
    const root = packageRoot();
    const file = join(root, 'docs-bundle', 'index.json');
    writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, 'utf8')), version: 2 }));
    expect(() => bundleDocs(join(root, 'docs-bundle'))).toThrow(/index\.json is format version 2/);
  });
});

describe('search_docs', () => {
  const set = preview();

  it('finds by question, title, alias and identifier, accents and case aside, best first', () => {
    expect(results(set, 'POURQUOI mon enregistrement est refuse avec 423')[0]).toMatchObject({
      ref: 'team.write-refused-423#symptom',
      lang: 'fr',
      reason: 'question',
      status: 'current',
      type: 'troubleshooting',
    });
    expect(results(set, '423')[0]).toMatchObject({ id: 'team.write-refused-423', reason: 'title' });
    expect(results(set, 'scene')[0]).toMatchObject({ id: 'create.rooms', reason: 'alias' });
    expect(results(set, 'walkTo')[0]).toMatchObject({ id: 'create.rooms', reason: 'identifier' });
    // A plural meets its singular; a heading weighs more than a body.
    const zones = results(set, 'zone');
    expect(zones.map((r) => [r.ref, r.reason])).toEqual([
      ['create.rooms#walkable-zones', 'section'],
      ['create.exits#doors', 'body'],
    ]);
    expect(zones[0]!.score).toBeGreaterThan(zones[1]!.score);
    expect(zones[0]!.snippet).toContain('**zones**');
    expect(zones[0]!.snippet).not.toContain('](');
  });

  it('follows the glossary into the other language: « verrou » finds the 423 page, "lock" too', () => {
    expect(results(set, 'verrou')[0]).toMatchObject({ id: 'team.write-refused-423', reason: 'alias' });
    expect(results(set, 'lock', { lang: 'en' })[0]).toMatchObject({ id: 'team.write-refused-423', lang: 'en' });
  });

  it('answers an explicit empty result under the threshold, never weak results', () => {
    const r = searchDocs(set, { query: 'banana smoothie' });
    expect(r).toMatchObject({ results: [], note: 'no confident match', suggestions: [] });
  });

  it('filters by language, type, audience, context and state of the pages', () => {
    expect(results(set, 'zone', { lang: 'fr' }).every((r) => r.lang === 'fr')).toBe(true);
    expect(results(set, '423', { type: 'howto' })).toEqual([]);
    expect(listDocs(set, { state: 'draft' }).pages.map((p) => p.id)).toEqual(['studio.notes']);
    expect(listDocs(set, { lang: 'fr', type: 'troubleshooting' }).pages).toMatchObject([
      { id: 'team.write-refused-423', title: 'Écriture refusée : pan verrouillé (423)', langs: ['en', 'fr'] },
    ]);
  });

  it('leaves out a page that does not apply to a version, or marks it with includeArchived', () => {
    expect(results(set, '423', { version: '4.4.0' })).toEqual([]);
    expect(results(set, '423', { version: '4.5.0' })[0]).toMatchObject({ id: 'team.write-refused-423' });
    expect(results(set, '423', { version: '4.4.0', includeArchived: true })[0]).toMatchObject({
      id: 'team.write-refused-423',
      notApplicable: true,
    });
  });

  it('pages its results with a cursor bound to the request and the revision', () => {
    const first = searchDocs(set, { query: 'zone', limit: 1 });
    if ('note' in first) throw new Error('no result');
    expect(first.results.map((r) => r.ref)).toEqual(['create.rooms#walkable-zones']);
    expect(first.total).toBe(2);
    const second = searchDocs(set, { query: 'zone', limit: 1, cursor: first.cursor });
    if ('note' in second) throw new Error('no result');
    expect(second.results.map((r) => r.ref)).toEqual(['create.exits#doors']);
    expect(second.cursor).toBeUndefined();
    expect(() => searchDocs(set, { query: 'zones door', limit: 1, cursor: first.cursor })).toThrow(/^stale_cursor/);
    const changed = { ...set, provenance: { ...set.provenance, docRevision: 'b'.repeat(40) } };
    expect(() => searchDocs(changed, { query: 'zone', limit: 1, cursor: first.cursor })).toThrow(/^stale_cursor/);
  });

  it('is deterministic: the same request, the same answer', () => {
    expect(searchDocs(preview(), { query: 'zone note studio 423' })).toEqual(
      searchDocs(preview(), { query: 'zone note studio 423' }),
    );
  });
});

describe('read_doc by id', () => {
  const set = preview();

  it('reads a section in a language, the provenance in the text and in the structured content', () => {
    const r = readDocById(set, { id: 'team.write-refused-423', section: 'symptom', lang: 'fr' });
    expect(r.text.split('\n')[0]).toMatch(
      /^> quest'n'click documentation · team\.write-refused-423#symptom \(fr, ready\)/,
    );
    expect(r.text).toContain("L'enregistrement est refusé avec 423.");
    expect(r.structured).toMatchObject({ ref: 'team.write-refused-423#symptom', lang: 'fr', state: 'ready' });
    expect(r.structured.provenance).toEqual(set.provenance);
    expect(readDocById(set, { id: 'studio.notes' }).text).toMatch(/\(en, draft: not reviewed yet\)/);
  });

  it('gives maxChars at a time and a cursor for the rest; a cursor of another request is stale', () => {
    const whole = readDocById(set, { id: 'create.rooms' }).structured.range.total;
    let cursor: string | undefined;
    let read = '';
    let rounds = 0;
    do {
      const r = readDocById(set, { id: 'create.rooms', maxChars: 120, cursor });
      read += r.text
        .split('\n')
        .slice(2)
        .join('\n')
        .replace(/\n\n> characters [\s\S]*$/, '');
      cursor = r.structured.cursor;
      rounds++;
    } while (cursor && rounds < 50);
    expect(rounds).toBeGreaterThan(2);
    expect(read).toBe(readFileSync(join(BASE, 'en', 'create.rooms.md'), 'utf8'));
    expect(read.length).toBe(whole);
    const c = readDocById(set, { id: 'create.rooms', maxChars: 120 }).structured.cursor!;
    expect(() => readDocById(set, { id: 'create.rooms', maxChars: 120, lang: 'fr', cursor: c })).toThrow(
      /^stale_cursor/,
    );
    expect(() => readDocById(set, { id: 'create.rooms', section: 'checking', maxChars: 120, cursor: c })).toThrow(
      /^stale_cursor/,
    );
    expect(() => readDocById(set, { id: 'create.rooms', cursor: 'nonsense' })).toThrow(/^stale_cursor/);
  });

  it('names what is there when a page, a language or a section is not', () => {
    expect(() => readDocById(set, { id: 'create.dsl' })).toThrow(/no page "create\.dsl".*planned page has no text/);
    expect(() => readDocById(set, { id: 'create.rooms', section: 'nope' })).toThrow(/walkable-zones, checking/);
  });
});

describe('read_doc, the tool', () => {
  it("offers the manifest's own audiences, contexts and types as filters (the Studio page cannot import it)", () => {
    for (const name of ['search_docs', 'list_docs']) {
      const p = (jsonSchema(TOOLS.find((t) => t.name === name)!) as { properties: Record<string, { enum?: string[] }> })
        .properties;
      expect(p.audience!.enum, name).toEqual([...AUDIENCES]);
      expect(p.context!.enum, name).toEqual([...CONTEXTS]);
      expect(p.type!.enum, name).toEqual([...PAGE_TYPES]);
    }
  });

  it('takes exactly one of name and id', async () => {
    const b = backendOf(packageRoot());
    for (const args of [{}, { name: 'CONTENT_GUIDE', id: 'create.rooms' }]) {
      const r = await callTool('read_doc', args, b);
      expect(r.isError).toBe(true);
      expect(r.content[0]!.text).toBe('Error: give either name (one of the 8 legacy pages) or id, not both');
    }
    const extra = await callTool('read_doc', { name: 'CONTENT_GUIDE', maxChars: 10 }, b);
    expect(extra.isError).toBe(true);
    expect(extra.content[0]!.text).toMatch(/maxChars go with id/);
  });

  it('name: one text block, the whole page (the bundle copy in a package), provenance beside it only', async () => {
    const root = packageRoot();
    for (const name of DOCS) {
      const r = await callTool('read_doc', { name }, backendOf(root));
      expect(r.isError).toBeFalsy();
      expect(r.content).toHaveLength(1);
      expect(r.content[0]!.type).toBe('text');
      expect(r.content[0]!.text).toBe(readFileSync(join(ROOT, 'docs', 'en', `${name}.md`), 'utf8'));
      expect(r.structuredContent).toMatchObject({ name, provenance: { source: 'bundle', productVersion: '4.5.0' } });
    }
  });

  it('id: read through the loader; a stale cursor is a tool error naming stale_cursor', async () => {
    const b = backendOf(packageRoot());
    const r = await callTool('read_doc', { id: 'create.rooms', section: 'walkable-zones', maxChars: 50 }, b);
    expect(r.content[0]!.text).toMatch(/^> quest'n'click documentation · create\.rooms#walkable-zones \(en, ready\)/);
    expect(r.content[0]!.text).toContain(
      "quest'n'click 4.5.0 (commit aaaaaaaaaaaa, doc revision aaaaaaaaaaaa, build 123)",
    );
    const cursor = (r.structuredContent as { cursor: string }).cursor;
    const stale = await callTool('read_doc', { id: 'create.exits', maxChars: 50, cursor }, b);
    expect(stale).toMatchObject({ isError: true, structuredContent: { error: 'stale_cursor' } });
    const search = await callTool('search_docs', { query: 'door', limit: 1 }, b);
    expect(search.structuredContent).toMatchObject({ results: [{ id: 'create.exits' }] });
    const list = await callTool('list_docs', {}, b);
    expect((list.structuredContent as { total: number }).total).toBe(3);
  });

  it('in the repository, name still reads docs/en/<NAME>.md, unchanged', () => {
    for (const name of DOCS)
      expect(legacyDoc(ROOT, name)).toBe(readFileSync(join(ROOT, 'docs', 'en', `${name}.md`), 'utf8'));
  });
});

describe('the bundle', () => {
  it('is reproducible: two builds, the same bytes', () => {
    const a = tmp('bundle-a-');
    const b = tmp('bundle-b-');
    const ma = writeBundle(bundleOpts(a));
    writeBundle(bundleOpts(b));
    for (const f of ma.files) expect(readFileSync(join(b, f.path)).equals(readFileSync(join(a, f.path)))).toBe(true);
    expect(readFileSync(join(a, 'bundle-manifest.json'), 'utf8')).toBe(
      readFileSync(join(b, 'bundle-manifest.json'), 'utf8'),
    );
  });

  it('holds the index, the ready pages in md/<lang>/, the legacy copies, the images, each hashed', () => {
    const out = tmp('bundle-');
    const m = writeBundle(bundleOpts(out));
    expect(m.files.map((f) => f.path)).toEqual([
      'assets/room.png',
      'index.json',
      ...DOCS.map((n) => `legacy/${n}.md`).sort(),
      'md/en/create.exits.md',
      'md/en/create.rooms.md',
      'md/en/team.write-refused-423.md',
      'md/fr/create.exits.md',
      'md/fr/create.rooms.md',
      'md/fr/team.write-refused-423.md',
    ]);
    expect(JSON.stringify(m)).not.toMatch(/published|preview|\d{4}-\d\d-\d\dT/);
    expect(bundleProblems(out)).toEqual([]);
    for (const n of DOCS)
      expect(
        readFileSync(join(out, 'legacy', `${n}.md`)).equals(readFileSync(join(ROOT, 'docs', 'en', `${n}.md`))),
      ).toBe(true);
    // Links rewritten for a local reading: pages beside it, the code at its commit, an unbundled page as text.
    const rooms = readFileSync(join(out, 'md', 'en', 'create.rooms.md'), 'utf8');
    expect(rooms).toContain('[a door](../en/create.exits.md#doors)');
    expect(rooms).toContain(
      `(https://github.com/wanoo/quest-n-click/blob/${'a'.repeat(40)}/src/engine/core/save.ts#L1)`,
    );
    expect(rooms).toContain('the DSL (coming)');
    expect(rooms).toContain('![A room](../../assets/room.png "The hall")');
    writeFileSync(join(out, 'md', 'en', 'create.rooms.md'), 'changed');
    expect(bundleProblems(out)).toEqual(["md/en/create.rooms.md: its sha256 is not the manifest's"]);
  });

  it('never carries a draft, and refuses to empty a folder that holds something else', () => {
    const out = tmp('bundle-');
    writeBundle(bundleOpts(out));
    expect(readFileSync(join(out, 'index.json'), 'utf8')).not.toContain('studio.notes');
    const other = tmp('bundle-other-');
    writeFileSync(join(other, 'keep.txt'), 'mine');
    expect(() => writeBundle(bundleOpts(other))).toThrow(/holds no previous bundle/);
  });

  it('is written only where the repository tracks nothing', () => {
    const tracked = trackedFiles();
    expect(bundleOutProblem('.cache/pack/quest-n-click/docs-bundle', tracked)).toBeUndefined();
    expect(bundleOutProblem('pack/quest-n-click/docs-bundle', tracked)).toBeUndefined();
    expect(bundleOutProblem(join(tmpdir(), 'x'), tracked)).toBeUndefined();
    expect(bundleOutProblem('src/docs-bundle', tracked)).toMatch(/tracks/);
    expect(bundleOutProblem('wiki', tracked)).toMatch(/tracks/);
    expect(bundleOutProblem('.', tracked)).toMatch(/repository itself/);
  });

  it("of the repository's own wiki: the legacy copies, its index, no page while none is ready", () => {
    const out = tmp('bundle-repo-');
    const m = writeBundle({ ...bundleOpts(out, join(ROOT, 'wiki')), docRevision: 'HEAD' });
    expect(m.wikiTree).toMatch(/^[0-9a-f]{40}$/);
    const set = bundleDocs(out);
    expect(set.index.pages.every((p) => p.state === 'ready')).toBe(true);
    expect(Object.keys(set.index.legacy).sort()).toEqual([...DOCS].sort());
  });
});

describe('a wiki copy with a page past its version', () => {
  it('marks appliesUntil inclusive', () => {
    const dir = tmp('wiki-versions-');
    cpSync(BASE, dir, { recursive: true });
    const file = join(dir, 'manifest.json');
    const m = JSON.parse(readFileSync(file, 'utf8')) as { pages: { id: string; versions?: object }[] };
    m.pages.find((p) => p.id === 'team.write-refused-423')!.versions = {
      appliesFrom: '4.5.0',
      appliesUntil: '4.6.0',
    };
    writeFileSync(file, JSON.stringify(m));
    mkdirSync(join(dir, 'images'), { recursive: true });
    const set = preview(dir);
    expect(results(set, '423', { version: '4.6.0' })).toHaveLength(1);
    expect(results(set, '423', { version: '4.6.1' })).toEqual([]);
    expect(results(set, '423', { version: '4.6.0-rc.1' })).toHaveLength(1);
  });
});
