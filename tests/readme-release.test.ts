// The README's "Releases" section names the version package.json is at (3.7.1): the ROADMAP's criterion "the
// README's Releases table updated" at each release, checked instead of remembered.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error: a plain .mjs module without declarations
import { installTag, quickStart } from '../scripts/readme-quickstart.mjs';

const version = JSON.parse(readFileSync('package.json', 'utf8')).version as string;

describe('the README names the current release', () => {
  for (const [file, label] of [
    ['README.md', 'Current release:'],
    ['README.fr.md', 'Release actuelle :'],
  ] as const) {
    it(file, () => {
      const line = readFileSync(file, 'utf8')
        .split('\n')
        .find((l) => l.startsWith(label));
      expect(line, `${file}: no "${label}" line`).toBeDefined();
      // While the version is only a release candidate (its install names `v<version>-rc.N`), the current release is
      // still the last published one; once the stable is tagged, this version (docs:truth says the same).
      const text = readFileSync(file, 'utf8');
      const tag = installTag(quickStart(text.replace('\n## Commencer', '\n## Start')).url, version);
      const named = /\[v(\d+\.\d+\.\d+) /.exec(line!)?.[1];
      if (tag !== `v${version}` && named !== version) {
        expect(tag).toMatch(/-rc\.\d+$/);
        expect(line).toContain(`/releases/tag/v${named})`);
      } else {
        expect(line).toContain(`[v${version} `);
        expect(line).toContain(`/releases/tag/v${version})`);
      }
    });
  }
});
