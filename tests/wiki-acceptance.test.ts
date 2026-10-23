// Acceptance by real questions (4.5.0 "Wiki", docs/dev/PLAN-4.5-WIKI.md §4.6, L6, phase A6).
//   - Level 1 on the fixture wiki (tests/fixtures/wiki/acceptance: ten written pages, one planned, a glossary, eleven
//     questions): D3's cases (a 423 first in both languages, « conflit de verrou » through the glossary, a 409 or a 503
//     with a context put the right service's page first, and without it both, each excerpt naming its service), an
//     absent feature (the "not supported" page, or the explicit empty result), similar commands told apart by their
//     context, an old procedure never current for 4.5.0; the three measures; a pending question counted apart from a
//     miss; a counter-example whose neighbour comes first fails; `--strict` fails where the plain run reports.
//   - Level 2's prompts hold the question and never its destinations nor its facts.
//   - The repository's questions (wiki/acceptance/questions.json): valid, about sixty, both languages each, every
//     destination a manifest page (and a section the page or the coverage matrix knows), the maintainer's eight, every
//     audience of §4.6, each row of the counter-example table, ten beginner questions; and level 1 runs over the
//     repository's wiki, pending where pages are not written yet.
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { main } from '../tools/wiki';
import {
  acceptanceLines,
  checkQuestions,
  exportPrompts,
  type Questions,
  readQuestions,
  ROWS,
  runAcceptance,
} from '../tools/wiki/acceptance';
import { repositoryDocs } from '../tools/wiki/docs-load';
import { readManifest } from '../tools/wiki/manifest';

const ROOT = resolve('.');
const FIX = resolve('tests/fixtures/wiki/acceptance');
const WIKI = resolve('wiki');
const temps: string[] = [];
afterAll(() => {
  for (const t of temps) rmSync(t, { recursive: true, force: true });
});
const fixture = () => readQuestions(FIX).questions!;
const set = () => repositoryDocs(ROOT, { wikiDir: FIX });
/** A run's status, by `<id>/<lang>`. */
const statuses = (q: Questions) =>
  Object.fromEntries(runAcceptance(set(), q).outcomes.map((o) => [`${o.id}/${o.lang}`, o.status]));
/** `main` with its console captured. */
function run(args: string[]) {
  const out: string[] = [];
  const spies = (['log', 'warn', 'error'] as const).map((k) =>
    vi.spyOn(console, k).mockImplementation((...a: unknown[]) => void out.push(a.join(' '))),
  );
  try {
    return { code: main(args), out: out.join('\n') };
  } finally {
    for (const s of spies) s.mockRestore();
  }
}

describe('level 1 on the fixture wiki', () => {
  it('reads valid questions naming pages and sections that exist', () => {
    expect(readQuestions(FIX).errors).toEqual([]);
    expect(checkQuestions(FIX, readManifest(FIX).manifest!, fixture())).toEqual([]);
  });

  it("finds D3's 423 first in both languages, and « conflit de verrou » through the glossary", () => {
    const r = runAcceptance(set(), fixture());
    const of = (id: string) => r.outcomes.filter((o) => o.id === id);
    expect(of('error-423').map((o) => [o.lang, o.status, o.first])).toEqual([
      ['en', 'hit', 'team.write-refused-423'],
      ['fr', 'hit', 'team.write-refused-423'],
    ]);
    expect(of('lock-conflict').map((o) => [o.status, o.first, o.sectionHit])).toEqual([
      ['hit', 'team.write-refused-423#symptom', true],
      ['hit', 'team.write-refused-423#symptom', true],
    ]);
  });

  it('passes each row of the counter-example table, in both languages', () => {
    const s = statuses(fixture());
    for (const id of ['multiplayer', 'vr-headset', 'npm-run-studio', 'v2-ids', 'error-409', 'error-503'])
      for (const lang of ['en', 'fr']) expect(s[`${id}/${lang}`], `${id}/${lang}`).toBe('pass');
    const r = runAcceptance(set(), fixture());
    // An absent feature: the "not supported" page first, or nothing at all.
    expect(r.outcomes.find((o) => o.id === 'multiplayer')!.first).toBe('index.not-supported#multiplayer');
    expect(r.outcomes.find((o) => o.id === 'vr-headset')!.empty).toBe(true);
  });

  it('counts a question whose page is not written as pending, apart from a miss', () => {
    const r = runAcceptance(set(), fixture());
    const minigame = r.outcomes.filter((o) => o.id === 'custom-minigame');
    expect(minigame.map((o) => o.status)).toEqual(['pending', 'pending']);
    expect(minigame[0]!.why).toEqual(['not written in en yet: create.custom-minigame']);
    // Its page is written, but a neighbour comes first: a miss, with what came instead.
    const sound = r.outcomes.filter((o) => o.id === 'no-sound');
    expect(sound.map((o) => o.status)).toEqual(['miss', 'miss']);
    expect(sound[0]!.why[0]).toMatch(/^top 3: create\.working-loop#studio/);
  });

  it('measures the top 3, the counter-examples and the justified empty results', () => {
    const r = runAcceptance(set(), fixture());
    expect(r.questions).toEqual({
      runs: 10,
      pending: 2,
      evaluated: 8,
      hits: 6,
      sectionHits: 6,
      top3: 0.75,
    });
    expect(r.counterExamples).toEqual({
      runs: 12,
      pending: 0,
      evaluated: 12,
      passes: 12,
      rate: 1,
    });
    // vr-headset's empty answer and v2-ids' (the version filter leaves the old procedure out) are both justified.
    expect(r.empties).toEqual({ evaluated: 4, justified: 4, rate: 1 });
    expect(runAcceptance(set(), fixture(), ['fr']).outcomes.every((o) => o.lang === 'fr')).toBe(true);
    const lines = acceptanceLines(r);
    expect(lines.at(-3)).toMatch(/^questions +10 runs: 6 in the top 3, 2 missed, 2 pending .* top 3: 75 %/);
    expect(lines.at(-2)).toMatch(
      /^counter-examples 12 runs: 12 with no inapplicable answer first, 0 failed, 0 pending/,
    );
    expect(lines.at(-1)).toMatch(/^empty results +4 among the runs evaluated, 4 justified · 100 %/);
  });

  it('fails a counter-example whose neighbour or inapplicable answer comes first', () => {
    const q = structuredClone(fixture());
    const at = (id: string) => q.questions.find((x) => x.id === id)!;
    // With the Studio's context, the Bridge's page is now the one "expected": the Studio's 409 comes first instead.
    at('error-409').withContext![0]!.expect = ['bridge.troubleshooting'];
    // The excerpt must name a service it does not name.
    at('error-503').withoutContext!.names = {
      'bridge.troubleshooting': ['Keycloak'],
    };
    // A neighbour first is no answer to an absent feature.
    at('multiplayer').expect = ['create.working-loop'];
    // The old procedure must show archived, and it is only notApplicable.
    at('v2-ids').expectStatus = ['archived'];
    const r = runAcceptance(set(), q, ['en']);
    const why = (id: string) => r.outcomes.find((o) => o.id === id)!;
    expect(why('error-409')).toMatchObject({ status: 'fail' });
    expect(why('error-409').why).toContain(
      'with context studio-hosted: team.write-refused-409 comes first, not bridge.troubleshooting',
    );
    expect(why('error-503').why).toEqual([
      'without context: the excerpt of bridge.troubleshooting#unavailable-503 names none of Keycloak',
    ]);
    expect(why('multiplayer').why[0]).toMatch(/^a neighbour comes first \(index\.not-supported#multiplayer\)/);
    expect(why('v2-ids').why).toEqual([
      'with includeArchived, install.upgrade-notes-v2-to-v3#migrate-ids is not marked archived',
    ]);
  });

  it('reports with exit 0, and fails with --strict on a miss or a pending question', () => {
    const plain = run(['acceptance', `--wiki=${FIX}`]);
    expect(plain.code).toBe(0);
    expect(plain.out).toMatch(/no-sound +en +player +miss/);
    expect(run(['acceptance', `--wiki=${FIX}`, '--strict']).code).toBe(1);
    const json = run(['acceptance', `--wiki=${FIX}`, '--json', '--lang', 'en']);
    expect(JSON.parse(json.out).questions).toMatchObject({
      runs: 5,
      hits: 3,
      pending: 1,
    });
    expect(run(['acceptance', `--wiki=${FIX}`, '--lang', 'de']).code).toBe(2);
  });

  it('refuses a file whose destination is no page, or no section, of the wiki', () => {
    const q = structuredClone(fixture());
    q.questions[0]!.expect = ['team.no-such-page', 'team.write-refused-423#no-such-section'];
    q.questions = q.questions.filter((x) => x.row !== 'old-version');
    q.beginner = ['multiplayer'];
    expect(checkQuestions(FIX, readManifest(FIX).manifest!, q)).toEqual([
      'acceptance/questions.json: error-423 expects team.no-such-page, a page the manifest does not hold',
      'acceptance/questions.json: error-423 expects team.write-refused-423#no-such-section, a section neither the page nor the coverage matrix has',
      "acceptance/questions.json: no counter-example for the row old-version of §4.6's table",
      'acceptance/questions.json: the beginner set names multiplayer, a counter-example',
    ]);
  });
});

describe("level 2's prompts", () => {
  it('hold the question and its situation, never its destinations nor its facts', () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'acceptance-prompts-')), 'out');
    temps.push(dir);
    const q = fixture();
    const files = exportPrompts(q, dir, { channel: 'mcp' });
    expect(files).toHaveLength(q.questions.length * 2 + 1);
    expect(readdirSync(dir)).toContain('error-423.fr.md');
    const all = files.map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
    expect(readFileSync(join(dir, 'error-423.fr.md'), 'utf8')).toContain("> J'ai une erreur 423 dans le Studio");
    expect(readFileSync(join(dir, 'v2-ids.en.md'), 'utf8')).toContain("Their quest'n'click version is 4.5.0.");
    expect(all).toContain('`search_docs`, `list_docs` and `read_doc`');
    for (const x of q.questions) {
      for (const f of x.facts) expect(all, f).not.toContain(f);
      for (const d of x.expect) expect(all, d).not.toContain(d);
    }
    // A second export replaces the first; a folder holding something else is refused.
    expect(
      exportPrompts(q, dir, {
        channel: 'web',
        url: 'https://example.org/docs/',
      }),
    ).toHaveLength(files.length);
    expect(readFileSync(join(dir, 'error-423.en.md'), 'utf8')).toContain('https://example.org/docs/');
    expect(() => exportPrompts(q, join(ROOT, 'tests', 'fixtures', 'wiki'))).toThrow(/not empty/);
  });
});

describe("the repository's questions, wiki/acceptance/questions.json", () => {
  const { questions: q, errors } = readQuestions(WIKI);

  it('are valid, and name pages and sections the wiki has or plans', () => {
    expect(errors).toEqual([]);
    expect(checkQuestions(WIKI, readManifest(WIKI).manifest!, q!)).toEqual([]);
  });

  it("are about sixty, each in both languages, with the maintainer's eight and every audience", () => {
    const all = q!.questions;
    expect(all.length).toBeGreaterThanOrEqual(55);
    expect(all.length).toBeLessThanOrEqual(70);
    for (const x of all) {
      expect(x.text.en, x.id).not.toBe(x.text.fr);
      expect(x.facts.length, x.id).toBeGreaterThan(0);
    }
    expect(all.filter((x) => x.maintainer)).toHaveLength(8);
    const by = (a: string) => all.filter((x) => x.audience === a && x.kind === 'question').length;
    expect(by('player')).toBeGreaterThanOrEqual(3);
    expect(by('author')).toBeGreaterThanOrEqual(5);
    expect(by('admin')).toBeGreaterThanOrEqual(6);
    expect(by('contributor')).toBeGreaterThanOrEqual(4);
    // §4.6's Bridge questions: an event received twice, a connector down.
    expect(
      all.filter((x) => x.kind === 'question' && x.expect.some((d) => d.startsWith('bridge.'))).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("holds each row of the counter-example table, with the plan's cases", () => {
    const ce = q!.questions.filter((x) => x.kind === 'counter-example');
    for (const row of ROWS)
      expect(
        ce.some((x) => x.row === row),
        row,
      ).toBe(true);
    const shared = ce.filter((x) => x.row === 'shared-code').map((x) => x.withContext!.map((c) => c.context).sort());
    // 409: the hosted Studio and the Bridge; 503: Clever (the hosted Studio) and the Bridge.
    expect(shared.filter((c) => c.join() === 'bridge,studio-hosted').length).toBeGreaterThanOrEqual(2);
    expect(ce.find((x) => x.row === 'old-version')!.version).toBe('4.5.0');
    expect(ce.filter((x) => x.row === 'absent-feature').every((x) => x.expect.includes('index.not-supported'))).toBe(
      true,
    );
  });

  it('gives the beginner reader ten questions, the ones its protocol lists', () => {
    expect(q!.beginner).toHaveLength(10);
    const protocol = readFileSync('docs/dev/acceptance/BEGINNER-READER.md', 'utf8');
    const listed = [...protocol.matchAll(/^\| `([a-z0-9-]+)` \|/gm)].map((m) => m[1]);
    expect(listed).toEqual(q!.beginner);
  });

  it("runs over the repository's wiki: a page not written yet is pending, never a miss", () => {
    const docs = repositoryDocs(ROOT);
    const r = runAcceptance(docs, q!);
    expect(r.outcomes).toHaveLength(q!.questions.length * 2);
    const written = new Set(docs.index.pages.map((p) => p.id));
    for (const o of r.outcomes.filter((x) => x.status === 'pending'))
      expect(o.why[0], `${o.id}/${o.lang}`).toMatch(/^not written in (en|fr) yet: /);
    // While nothing is written, everything is pending: said, not counted as failures.
    if (!written.size) expect(r.outcomes.every((o) => o.status === 'pending')).toBe(true);
  });
});
