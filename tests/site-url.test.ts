// site.json's `url` (#271): the game's public address makes the page's share image an absolute URL, which link
// previews (LinkedIn, Facebook, X) need; without it the page is as before.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { sitePlugin } from '../tools/vite/plugins';

mkdirSync('.cache', { recursive: true });
const root = mkdtempSync(join('.cache', 'site-url-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const INDEX = readFileSync('index.html', 'utf8');

const page = (site: Record<string, unknown>) => {
  const dir = mkdtempSync(join(root, 'g-'));
  writeFileSync(join(dir, 'site.json'), JSON.stringify(site));
  const t = sitePlugin({ gameDir: dir, game: 'g' }).transformIndexHtml as { handler: (html: string) => string };
  return t.handler(INDEX);
};
const meta = (html: string, prop: string) => new RegExp(`<meta property="${prop}" content="([^"]*)"`).exec(html)?.[1];

describe("site.json's url", () => {
  it('without it, the share image stays relative to the page, and no og:url is written', () => {
    const html = page({ title: 'T' });
    expect(meta(html, 'og:image')).toMatch(/^\/.*og\.png$|^\.?\/?og\.png$/);
    expect(meta(html, 'og:url')).toBeUndefined();
  });

  it('with it, the share image is absolute and the page says its address', () => {
    const html = page({ title: 'T', url: 'https://example.org/my-game/' });
    expect(meta(html, 'og:image')).toBe('https://example.org/my-game/og.png');
    expect(meta(html, 'og:url')).toBe('https://example.org/my-game/');
    expect(html.match(/og:url/g)).toHaveLength(1);
  });

  it('adds the final slash, and escapes what it writes', () => {
    const html = page({ url: 'https://example.org/a"b' });
    expect(meta(html, 'og:image')).toBe('https://example.org/a&quot;b/og.png');
  });

  it('ignores an address that is not http(s), absolute: the page stays as without it', () => {
    for (const url of ['/my-game/', 'example.org', 'javascript:alert(1)', 'ftp://example.org/', 3]) {
      const html = page({ url });
      expect(meta(html, 'og:url'), String(url)).toBeUndefined();
      expect(meta(html, 'og:image'), String(url)).not.toContain('example.org');
    }
  });
});
