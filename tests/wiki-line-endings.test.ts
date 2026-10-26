// A wiki page with CRLF line ends reads as the same page with LF (4.5.6, #367). The repository's .gitattributes keeps
// its own checkout LF, but a Windows editor, or a copy of the wiki without the attributes (a temporary test repository
// on a Windows runner, `core.autocrlf=true`), gives the checker CRLF text. Its line rules ended at `\r`: a code fence
// written ` ````md\r` never opened, and every link inside it was checked as a real one (three false errors on the
// fixture's create.rooms.md, release PR #366's windows job).
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { checkWiki, trackedFiles } from '../tools/wiki/check';
import { mapLines, parsePage } from '../tools/wiki/page';

const BASE = resolve('tests/fixtures/wiki/base');
const TRACKED = trackedFiles();
const temps: string[] = [];
afterAll(() => {
  for (const t of temps) rmSync(t, { recursive: true, force: true });
});
const crlf = (text: string) => text.replace(/\r?\n/g, '\r\n');
const pages = (lang: string) => readdirSync(join(BASE, lang)).filter((f) => f.endsWith('.md'));

describe('a page with CRLF line ends reads as the same page with LF (#367)', () => {
  it('finds the same code fences', () => {
    const fences = (text: string) => {
      const out: { lang: string; line: number; endLine: number }[] = [];
      mapLines(
        text,
        (l) => l,
        (f) => out.push({ lang: f.lang, line: f.line, endLine: f.endLine }),
      );
      return out;
    };
    const page = readFileSync(join(BASE, 'en', 'create.rooms.md'), 'utf8');
    expect(fences(page).length).toBeGreaterThan(0);
    expect(fences(crlf(page))).toEqual(fences(page));
  });

  it('parses every fixture page to the same sections, links, blocks, fences and problems', () => {
    for (const lang of ['en', 'fr'])
      for (const f of pages(lang)) {
        const text = readFileSync(join(BASE, lang, f), 'utf8');
        expect(parsePage(crlf(text), lang), `${lang}/${f}`).toEqual(parsePage(text, lang));
      }
  });

  it('gives the same wiki -- check report on a CRLF copy of the wiki', () => {
    const copy = (convert: boolean) => {
      const dir = mkdtempSync(join(tmpdir(), 'wiki-crlf-'));
      temps.push(dir);
      cpSync(BASE, dir, { recursive: true });
      if (convert)
        for (const lang of ['en', 'fr'])
          for (const f of pages(lang)) {
            const file = join(dir, lang, f);
            writeFileSync(file, crlf(readFileSync(file, 'utf8')));
          }
      const r = checkWiki({ wikiDir: dir, tracked: TRACKED });
      return { errors: r.errors, warnings: r.warnings };
    };
    expect(copy(true)).toEqual(copy(false));
  });
});
