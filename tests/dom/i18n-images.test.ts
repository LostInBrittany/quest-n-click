// @vitest-environment happy-dom
// Images by language (4.6.1, `GameDef.i18n.images`): wherever an image id is drawn, the language being played draws
// its variant; the game's own language draws the source. The asset graph caches every variant beside the source, the
// validator checks the ids, and the presentation fingerprint reads the map only when it is set.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '@engine/dom/app';
import { AssetBank } from '@engine/dom/assets';
import { assetGraph } from '@engine/core/asset-graph';
import { langImages } from '@engine/core/lang-images';
import { presentationOf } from '@engine/core/fingerprint';
import type { GameDef } from '@engine/core/types';
import { validate } from '@engine/tools/validate';
import { game as demo } from '../../games/demo/game';
import { mini, miniLayouts } from '../fixtures/mini';

const IMAGES = { 'logo/en': { fr: 'logo/fr', es: 'logo/es' } };
const withLogo = (g: GameDef, images: Record<string, Record<string, string>> | null = IMAGES): GameDef => ({
  ...g,
  ui: demo.ui,
  skin: demo.skin,
  titleScreen: { decor: 'decor/title', logo: 'logo/en' },
  i18n: { ...g.i18n, ...(images ? { images } : {}) },
});

afterEach(() => vi.restoreAllMocks());

describe('i18n.images', () => {
  it('langImages: the swaps of a translation, none for the source language', () => {
    const g = withLogo(mini());
    expect(langImages(g, 'fr')).toEqual({ 'logo/en': 'logo/fr' });
    expect(langImages(g, 'es')).toEqual({ 'logo/en': 'logo/es' });
    expect(langImages(g, 'en')).toBeUndefined();
    expect(langImages(g, undefined)).toBeUndefined();
    expect(langImages(g, 'de')).toBeUndefined();
    expect(langImages({ ...g, lang: 'fr' }, 'fr')).toBeUndefined();
  });

  it('AssetBank draws the variant, keeps the file URL, and sizes by the variant', () => {
    const bank = new AssetBank({ images: { 'logo/en': [300, 100], 'logo/fr': [320, 100] } }, 'assets');
    bank.swap = { 'logo/en': 'logo/fr' };
    expect(bank.img('logo/en')).toBe('assets/img/logo/fr.webp');
    expect(bank.file('logo/en')).toBe('assets/img/logo/en.webp');
    expect(bank.img('other/x')).toBe('assets/img/other/x.webp');
    expect(bank.size('logo/en')).toEqual([320, 100]);
  });

  it('the App draws the title logo of the language being played', async () => {
    document.body.innerHTML = '';
    vi.spyOn(document.body, 'getBoundingClientRect').mockReturnValue({ width: 844, height: 390 } as DOMRect);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(null, { status: 404 }));
    const game = withLogo(mini());
    const app = (lang?: string) =>
      new App({
        root: document.body,
        game,
        layouts: miniLayouts,
        manifest: { images: {} },
        ...(lang ? { languages: { current: lang, available: ['en', 'fr', 'es'] } } : {}),
      });
    expect(app('fr').bank.img('logo/en')).toMatch(/\/img\/logo\/fr\.webp/);
    expect(app('es').bank.img('logo/en')).toMatch(/\/img\/logo\/es\.webp/);
    expect(app('en').bank.img('logo/en')).toMatch(/\/img\/logo\/en\.webp/);
    expect(app().bank.img('logo/en')).toMatch(/\/img\/logo\/en\.webp/);
  });

  it('the asset graph caches every variant where the source is needed', () => {
    const g = assetGraph(withLogo(mini()));
    expect(g.title).toEqual(expect.arrayContaining(['img:logo/en', 'img:logo/fr', 'img:logo/es']));
    expect(assetGraph(withLogo(mini(), null)).title).not.toContain('img:logo/fr');
  });

  it('the validator checks every id and warns of variants never drawn', () => {
    const images = { 'logo/en': [1, 1], 'logo/fr': [1, 1] } as Record<string, [number, number]>;
    const g = withLogo(mini(), { 'logo/en': { fr: 'logo/fr', es: 'logo/es', en: 'logo/fr' }, 'logo/zz': {} });
    const r = validate(g, miniLayouts, { assets: { images }, locales: { fr: {} } });
    expect(r.errors).toContain('i18n.images.logo/en.es › image not found: "logo/es"');
    expect(r.errors).toContain('i18n.images.logo/zz › image not found: "logo/zz"');
    expect(r.errors.filter((e) => e.includes('i18n.images.logo/en.fr'))).toEqual([]);
    expect(r.warnings).toContain(
      'i18n.images.logo/en.en › "en" is the game\'s own language: its variant is never drawn',
    );
    expect(r.warnings).toContain(
      'i18n.images.logo/en.es › no translation in "es" (locales/es.json): its variant is never drawn',
    );
  });

  it('the presentation fingerprint reads the map only when it is set', () => {
    const p = (g: GameDef) => (presentationOf(g) as { game: Record<string, unknown> }).game;
    expect(p(withLogo(mini(), null))).not.toHaveProperty('i18nImages');
    expect(p(withLogo(mini()))).toHaveProperty('i18nImages', IMAGES);
  });
});
