// site.json's `i18n` (4.7.0): the page's title, description and manifest in other languages. The site plugin writes
// them into the page (`#qnc-site-i18n`) and emits a manifest per language; `bootGame` applies the language played.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { Window } from 'happy-dom';
import { siteLangs, sitePlugin } from '../tools/vite/plugins';
import { applySiteLang, readSiteTexts } from '@engine/dom/site-lang';

mkdirSync('.cache', { recursive: true });
const root = mkdtempSync(join('.cache', 'site-i18n-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const INDEX = readFileSync('index.html', 'utf8');
/** The page as the browser reads it (happy-dom). */
const load = (html: string) => {
  const doc = new Window().document as unknown as Document;
  doc.write(html);
  return doc;
};

const SITE = {
  lang: 'en',
  title: 'The Great Racket',
  shortName: 'Great Racket',
  description: 'A point-and-click adventure.',
  i18n: {
    fr: { title: 'Le Grand Raffut', description: 'Une aventure </script> en point-and-click.' },
    es: { title: 'El Gran Alboroto', shortName: 'Gran Alboroto' },
    en: { title: 'ignored: the own language' },
    'bad/lang': { title: 'ignored: not a file name' },
    de: { title: 3 },
  },
};

const plugin = (site: Record<string, unknown>) => {
  const dir = mkdtempSync(join(root, 'g-'));
  writeFileSync(join(dir, 'site.json'), JSON.stringify(site));
  return sitePlugin({ gameDir: dir, game: 'g' });
};
const page = (site: Record<string, unknown>) =>
  (plugin(site).transformIndexHtml as { handler: (html: string) => string }).handler(INDEX);
const manifests = (site: Record<string, unknown>) => {
  const out: Record<string, Record<string, unknown>> = {};
  (plugin(site).generateBundle as (this: unknown) => void).call({
    emitFile: (f: { fileName: string; source: string }) => {
      out[f.fileName] = JSON.parse(f.source);
    },
  });
  return out;
};

describe("site.json's i18n", () => {
  it('keeps the strings of other languages whose code names a file', () => {
    expect(siteLangs(SITE)).toEqual({
      fr: { title: 'Le Grand Raffut', description: 'Une aventure </script> en point-and-click.' },
      es: { title: 'El Gran Alboroto', shortName: 'Gran Alboroto' },
    });
    expect(siteLangs({ title: 'T' })).toEqual({});
  });

  it('writes them into the page, escaped, and nothing without them', () => {
    const html = page(SITE);
    expect(html).toContain('<title>The Great Racket</title>');
    expect(html).not.toContain('</script> en');
    expect(readSiteTexts(load(html))?.fr?.description).toBe('Une aventure </script> en point-and-click.');
    expect(page({ title: 'T' })).not.toContain('qnc-site-i18n');
  });

  it('emits a manifest per language, the missing fields from the source', () => {
    const m = manifests(SITE);
    expect(Object.keys(m).sort()).toEqual([
      'manifest.es.webmanifest',
      'manifest.fr.webmanifest',
      'manifest.webmanifest',
    ]);
    expect(m['manifest.webmanifest']).toMatchObject({ name: 'The Great Racket', short_name: 'Great Racket' });
    expect(m['manifest.fr.webmanifest']).toMatchObject({
      name: 'Le Grand Raffut',
      short_name: 'Great Racket',
      description: 'Une aventure </script> en point-and-click.',
    });
    expect(m['manifest.es.webmanifest']).toMatchObject({
      name: 'El Gran Alboroto',
      short_name: 'Gran Alboroto',
      description: 'A point-and-click adventure.',
    });
  });

  it('applySiteLang: the title, the descriptions and the manifest link of the language played', () => {
    const document = load(page(SITE));
    const site = readSiteTexts(document);
    applySiteLang(document, site, 'en');
    expect(document.title).toBe('The Great Racket');
    applySiteLang(document, site, 'fr');
    expect(document.title).toBe('Le Grand Raffut');
    expect(document.querySelector('meta[property="og:title"]')?.getAttribute('content')).toBe('Le Grand Raffut');
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(
      'Une aventure </script> en point-and-click.',
    );
    expect(document.querySelector('link[rel="manifest"]')?.getAttribute('href')).toMatch(/manifest\.fr\.webmanifest$/);
  });

  it('applySiteLang: a language without texts leaves the page as served', () => {
    const document = load(page(SITE));
    applySiteLang(document, readSiteTexts(document), 'de');
    expect(document.title).toBe('The Great Racket');
    expect(document.querySelector('link[rel="manifest"]')?.getAttribute('href')).toMatch(/\/manifest\.webmanifest$/);
    applySiteLang(document, undefined, 'fr');
    expect(document.title).toBe('The Great Racket');
  });
});
