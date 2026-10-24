// tools/rename-org.mjs (4.5.2 "Org", D51): the repository moved to the Quest-n-Click organization and its site to
// quest-n-click.github.io. The addresses before the transfer remain only where the exception list keeps history true.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error: a plain .mjs module without declarations
import { EXCLUDED, KEEP, OLD, pending, renameText } from '../tools/rename-org.mjs';

describe('the addresses after the transfer to the organization', () => {
  it('renames the repository, the documentation, the Studio demo and the game, each once', () => {
    const cases: [string, string][] = [
      [
        'https://github.com/wanoo/quest-n-click/wiki/EN-Create-Rooms',
        'https://github.com/Quest-n-Click/quest-n-click/wiki/EN-Create-Rooms',
      ],
      ['gh release list -R wanoo/quest-n-click', 'gh release list -R Quest-n-Click/quest-n-click'],
      ["'git+https://github.com/wanoo/quest-n-click.git'", "'git+https://github.com/Quest-n-Click/quest-n-click.git'"],
      [
        'https://raw.githubusercontent.com/wanoo/quest-n-click/c0ffee/x',
        'https://raw.githubusercontent.com/Quest-n-Click/quest-n-click/c0ffee/x',
      ],
      [
        'https://wanoo.github.io/quest-n-click/docs/4.5.1/r1/en/a.html',
        'https://quest-n-click.github.io/docs/4.5.1/r1/en/a.html',
      ],
      ["'https://wanoo.github.io/quest-n-click/docs'", "'https://quest-n-click.github.io/docs'"],
      ['https://wanoo.github.io/quest-n-click/studio.html', 'https://quest-n-click.github.io/play/studio.html'],
      ['(https://wanoo.github.io/quest-n-click/)', '(https://quest-n-click.github.io/play/)'],
      ['(https://wanoo.github.io/quest-n-click)', '(https://quest-n-click.github.io/play/)'],
      ['https://wanoo.github.io/quest-n-click/?lang=fr', 'https://quest-n-click.github.io/play/?lang=fr'],
      ['[wanoo.github.io/quest-n-click](x)', '[quest-n-click.github.io/play](x)'],
      ['`wanoo.github.io/quest-n-click/studio.html`', '`quest-n-click.github.io/play/studio.html`'],
    ];
    for (const [before, after] of cases) {
      expect(renameText(before), before).toBe(after);
      expect(renameText(after), after).toBe(after);
    }
    // The former name, the maintainer's own site and look-alikes are not this repository's addresses.
    for (const kept of [
      'https://github.com/wanoo/web-scumm',
      'https://wanoo.github.io/web-scumm/',
      'wanoo/wanoo.github.io',
      'wanoo/quest-n-click-private',
      'xwanoo/quest-n-click',
    ])
      expect(renameText(kept), kept).toBe(kept);
    expect(renameText('a wanoo/quest-n-click b wanoo/quest-n-click', ['b wanoo/quest-n-click'])).toBe(
      'a Quest-n-Click/quest-n-click b wanoo/quest-n-click',
    );
  });

  it('leaves nothing to rename (`--check`), and the exceptions name only what exists', () => {
    expect(pending('.').map((p: { file: string }) => p.file)).toEqual([]);
    const r = spawnSync(process.execPath, ['tools/rename-org.mjs', '--check'], { encoding: 'utf8' });
    expect(r.status, r.stderr).toBe(0);
    for (const e of EXCLUDED as string[]) expect(existsSync(e), e).toBe(true);
    for (const [file, sentences] of Object.entries(KEEP as Record<string, string[]>))
      for (const s of sentences) {
        expect(readFileSync(file, 'utf8'), `${file}: ${s}`).toContain(s);
        expect(OLD.test(s), s).toBe(true);
      }
  });

  it('the addresses before the transfer remain only in the exception list', () => {
    // The candidates by a plain pattern, then each file read with the script's own (git grep -P is not everywhere).
    const hits = execFileSync('git', ['grep', '-l', '-E', '-e', 'wanoo(\\.github\\.io)?/quest-n-click'], {
      encoding: 'utf8',
    })
      .split('\n')
      .filter((f) => f && OLD.test(readFileSync(f, 'utf8')));
    expect(hits.length).toBeGreaterThan(0);
    const allowed = (f: string) =>
      (EXCLUDED as string[]).some((e) => (e.endsWith('/') ? f.startsWith(e) : f === e)) || f in KEEP;
    expect(hits.filter((f) => !allowed(f))).toEqual([]);
  });
});
