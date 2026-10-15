// The README says only what is true (4.1.19, docs/dev/PLAN-4.1.19-FIELD-CLOSURE.md §11.3): its quick start names this
// version's archive and the commands a created game has; its images exist and stay light; the French page has the
// same sections and images; its maturity table agrees with the GO / NO-GO; no figure is written by hand.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { withInstall } from '../tools/quality-baseline';
// @ts-expect-error: a plain .mjs module without declarations
import { archiveUrl, installTag, quickStart } from '../scripts/readme-quickstart.mjs';

const version = JSON.parse(readFileSync('package.json', 'utf8')).version as string;
const en = readFileSync('README.md', 'utf8');
const fr = readFileSync('README.fr.md', 'utf8');
const IMAGE_BUDGET = 250 * 1024;
const images = (s: string) => [...s.matchAll(/(?:src="|\]\()(docs\/img\/[^")]+)/g)].map((m) => m[1]!);
const sections = (s: string) => s.split('\n').filter((l) => l.startsWith('## '));
const go = readFileSync('docs/dev/GO-NO-GO-4.2.md', 'utf8');
const verdict = (surface: string) =>
  go
    .split('\n')
    .find((l) => l.startsWith(`| ${surface} |`))
    ?.split('|')
    .at(-2) ?? '';

describe('the README', () => {
  it('starts from this version archive, with the commands a created game has', () => {
    for (const r of [en, fr]) {
      const { lines, url } = quickStart(r.replace('\n## Commencer', '\n## Start'));
      // This version's archive, under its release or a release candidate's (the 4.2.0-rc campaign).
      expect(installTag(url, version), url).not.toBeNull();
      // `create` writes these scripts (cli/create.mjs); `npm run <x>` of anything else would fail in a new game.
      const created = readFileSync('cli/create.mjs', 'utf8');
      for (const [, cmd] of lines.join('\n').matchAll(/npm run ([\w:-]+)/g))
        expect(created).toContain(`${cmd}: 'web-scumm`);
    }
    // Outside the block, a created game's tools are `npx web-scumm <command>`: each one the CLI knows.
    const cli = readFileSync('cli/web-scumm.mjs', 'utf8');
    for (const r of [en, fr])
      for (const [, cmd] of r.matchAll(/npx web-scumm ([\w-]+)/g))
        expect(cli).toMatch(new RegExp(`^\\s+'?${cmd}'?: \\[`, 'm'));
  });

  it('keeps its install section between generated markers, once per language, naming this version (4.1.20 PR 4)', () => {
    for (const r of [en, fr]) {
      expect(r.split('<!-- install:begin -->')).toHaveLength(2);
      expect(r.split('<!-- install:end -->')).toHaveLength(2);
      const section = r.slice(r.indexOf('<!-- install:begin -->'), r.indexOf('<!-- install:end -->'));
      // The whole quick start is inside: the archive-human-install pass reads exactly this (docs/dev/surfaces.json).
      const tag = installTag(quickStart(r.replace('\n## Commencer', '\n## Start')).url, version);
      expect(section).toContain(archiveUrl(version, tag));
      expect(section).toContain('npm run assets && npm run dev');
      expect(withInstall(r, version)).toBe(r);
    }
    // The writer moves only the URL, and only between the markers.
    const page = `T=x/v1.0.0/web-scumm-1.0.0.tgz\n<!-- install:begin -->\nT=https://github.com/wanoo/web-scumm/releases/download/v1.0.0/web-scumm-1.0.0.tgz\n<!-- install:end -->`;
    expect(withInstall(page, '4.2.0')).toBe(
      page.replace('download/v1.0.0/web-scumm-1.0.0.tgz', 'download/v4.2.0/web-scumm-4.2.0.tgz'),
    );
    // A release candidate of this version keeps its tag; another version's candidate does not.
    const rc = page.replace('download/v1.0.0/web-scumm-1.0.0.tgz', 'download/v4.2.0-rc.1/web-scumm-4.2.0.tgz');
    expect(withInstall(rc, '4.2.0')).toBe(rc);
    const zero = page.replace('download/v1.0.0/web-scumm-1.0.0.tgz', 'download/v4.2.0-rc.01/web-scumm-4.2.0.tgz');
    expect(withInstall(zero, '4.2.0')).toBe(
      page.replace('download/v1.0.0/web-scumm-1.0.0.tgz', 'download/v4.2.0/web-scumm-4.2.0.tgz'),
    );
    expect(withInstall(rc, '4.2.1')).toBe(
      page.replace('download/v1.0.0/web-scumm-1.0.0.tgz', 'download/v4.2.1/web-scumm-4.2.1.tgz'),
    );
  });

  it('shows images that exist, under budget, the same in both languages', () => {
    expect(images(en)).toEqual(images(fr));
    for (const f of images(en)) {
      expect(existsSync(f), f).toBe(true);
      expect(statSync(f).size, f).toBeLessThan(IMAGE_BUDGET);
    }
    // The captures of this release's README (plan §11.2): the earlier ones stay in docs/img, unused here.
    expect(images(en).filter((f) => f.includes('/v36-'))).toEqual([]);
  });

  it('has the same sections and the same quick start in English and French', () => {
    expect(sections(en).length).toBe(sections(fr).length);
    // The French block is the English one with the game's folder and title translated.
    const block = (s: string) =>
      quickStart(s.replace('\n## Commencer', '\n## Start'))
        .lines.map((l: string) => l.replace(/\s+#.*$/, ''))
        .join('\n');
    expect(block(fr).replaceAll('mon-jeu', 'my-game').replace('"Mon jeu"', '"My Game"')).toBe(block(en));
  });

  it('promotes nothing the GO / NO-GO does not', () => {
    const table = (s: string) => {
      const rows = s.split('\n').filter((l) => l.startsWith('|'));
      const i = rows.findIndex((l) => /^\| (Stable|Stable) \| (Limited|Limité) \|/.test(l));
      return rows[i + 2]!.split('|').slice(1, -1);
    };
    const [stable, limited, experimental] = table(en);
    expect(stable).toMatch(/content format/);
    // What GO / NO-GO calls limited is never in the stable column (its people's passes not made).
    for (const [word, surface] of [
      ['Safari', 'PWA, Safari'],
      ['Firefox', 'Firefox'],
      ['speedrun', 'Speedrun and Remix'],
      ['archives', 'Archives and install'],
      ['phones', 'Player, DOM'],
    ] as const) {
      expect(stable).not.toContain(word);
      expect(limited).toContain(word);
      expect(verdict(surface)).not.toMatch(/^\s*\*\*stable\*\*/);
    }
    expect(stable).toMatch(/desktop Chromium PWA/);
    expect(verdict('PWA, Chromium')).toMatch(/\*\*stable\*\*/);
    expect(stable).toMatch(/SQLite/);
    expect(verdict('Bridge, SQLite (`local`)')).toMatch(/\*\*stable\*\*/);
    for (const [word, surface] of [
      ['Canvas', 'Player, Canvas'],
      ['Postgres', 'Bridge, Postgres (`distributed`)'],
      ['connectors', 'Email connector'],
    ] as const) {
      expect(stable).not.toContain(word);
      expect(experimental).toContain(word);
      expect(verdict(surface)).not.toMatch(/\*\*stable\*\*/);
    }
    const [stableFr, , experimentalFr] = table(fr);
    for (const word of ['Canvas', 'Postgres', 'connecteurs']) {
      expect(stableFr).not.toContain(word);
      expect(experimentalFr).toContain(word);
    }
  });

  it('writes no figure by hand and names no older release as current', () => {
    for (const r of [en, fr]) {
      const outside = r.replace(/<!-- metric:\w+ -->[^<]*<!-- \/metric -->/g, '');
      expect(outside).not.toMatch(/\b\d[\d  ,]*\s+(unit )?(tests?|test declarations|déclarations de tests?)\b/);
      expect(outside).not.toMatch(/\d+ (states|états)\b/);
      // This version only; while its install names a release candidate of it, the current release may still be the
      // last published one, older (the 4.2.0-rc campaign; docs:truth's same rule).
      const tag = installTag(quickStart(r.replace('\n## Commencer', '\n## Start')).url, version);
      const current = /(?:Current release|Release actuelle) ?: \[v(\d+\.\d+\.\d+)/.exec(r)?.[1];
      const allowed = new Set([version, ...(tag?.includes('-rc.') && current ? [current] : [])]);
      for (const [, v] of r.matchAll(/v(\d+\.\d+\.\d+)\b/g)) expect(allowed.has(v!), v).toBe(true);
    }
  });
});
