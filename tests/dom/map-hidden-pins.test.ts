// @vitest-environment happy-dom
// Pins that draw nothing (4.6.1, #428): `map.pins: 'hidden'` for a map whose drawing shows the places. Each place keeps
// its button (named, centred on its `pos`, the size of a face) but no face, no needle; its "!" still shows; joined
// places get one empty button each. The "Where to?" list is unchanged, and the validator refuses an unknown value.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '@engine/dom/app';
import { openMap } from '@engine/dom/map-view';
import type { GameDef, MapDef } from '@engine/core/types';
import { game as demo } from '../../games/demo/game';
import { validate } from '@engine/tools/validate';
import { mini, miniLayouts } from '../fixtures/mini';

const MAP: MapDef = {
  start: 'land',
  pins: 'hidden',
  regions: { land: { name: 'Land', image: 'map/land' } },
  places: {
    town: { name: 'Town', room: 'a', region: 'land', pos: [30, 40], portrait: 'ann/face', news: 'always' },
    office: { name: 'Town: the office', room: 'b', region: 'land', pos: [30, 40], joins: 'town' },
    village: { name: 'Village', room: 'b', region: 'land', pos: [60, 70] },
  },
};

async function start(map: MapDef, unlocked: string[]) {
  document.body.innerHTML = '';
  vi.spyOn(document.body, 'getBoundingClientRect').mockReturnValue({ width: 844, height: 390 } as DOMRect);
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(null, { status: 404 }));
  const base = mini();
  const game: GameDef = {
    ...base,
    ui: demo.ui,
    skin: { ...demo.skin, icons: { ...demo.skin.icons, pin: 'ui/pin', news: 'ui/news' } },
    map,
    start: { ...base.start, room: 'a', unlocked, flags: { ...base.start.flags, always: true } },
  };
  const app = new App({ root: document.body, game, layouts: miniLayouts, manifest: { images: {} } });
  await app.engine.newGame();
  return app;
}

const pins = () => [...document.querySelectorAll<HTMLElement>('.mapview .pin')];

describe("map pins that draw nothing (map.pins: 'hidden', 4.6.1)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('keeps a named, placed button per place, with no face, needle or pin icon, and the "!" where news waits', async () => {
    const app = await start({ ...MAP, places: { town: MAP.places.town!, village: MAP.places.village! } }, [
      'town',
      'village',
    ]);
    const open = openMap(app, app.engine.state);
    const [town, village] = pins();
    for (const p of [town!, village!]) {
      expect(p.tagName).toBe('BUTTON');
      expect(p.classList.contains('bare')).toBe(true);
      expect(p.querySelector('img.face, img.needle')).toBeNull();
    }
    expect(town!.getAttribute('aria-label')).toBe('Town');
    expect([village!.style.left, village!.style.top]).toEqual(['60%', '70%']);
    expect(village!.style.width).toBe(town!.style.width);
    expect(town!.querySelector('img.news')?.getAttribute('src')).toBe(app.bank.img('ui/news'));
    expect(village!.querySelector('img.news')).toBeNull();
    // The list beside the map is the same as with faces.
    expect([...document.querySelectorAll('.side .choice')].map((c) => c.textContent)).toEqual([
      '• Town !',
      '• Village',
      '• ' + demo.ui.mapBack,
    ]);
    village!.click();
    expect(await open).toBe('village');
    app.destroy();
  });

  it('gives each joined place its own empty button on the shared spot', async () => {
    const app = await start(MAP, ['town', 'office']);
    const open = openMap(app, app.engine.state);
    const [spot] = pins();
    expect(pins()).toHaveLength(1);
    expect(spot!.classList.contains('bare')).toBe(true);
    const buttons = [...spot!.querySelectorAll('button.facebtn')].map((b) => b.getAttribute('aria-label'));
    expect(buttons).toEqual(['Town', 'Town: the office']);
    expect(spot!.querySelector('img.face, img.needle')).toBeNull();
    spot!.querySelector<HTMLElement>('[aria-label="Town: the office"]')!.click();
    expect(await open).toBe('office');
    app.destroy();
  });

  it("draws the faces as before by default (or with pins: 'faces')", async () => {
    for (const pinsOpt of [undefined, 'faces'] as const) {
      const app = await start({ ...MAP, pins: pinsOpt, places: { village: MAP.places.village! } }, ['village']);
      const open = openMap(app, app.engine.state);
      const [village] = pins();
      expect(village!.classList.contains('bare')).toBe(false);
      expect(village!.querySelector('img.face')?.getAttribute('src')).toBe(app.bank.img('ui/pin'));
      expect(village!.querySelector('img.needle')).not.toBeNull();
      (document.querySelector('.choice.gl') as HTMLElement).click();
      await open;
      app.destroy();
    }
  });

  it('the validator refuses an unknown pins value', () => {
    const g = structuredClone(demo) as GameDef;
    if (!g.map) throw new Error('the demo has a map');
    expect(validate(g, {}).errors.filter((e) => e.includes('pins'))).toEqual([]);
    (g.map as { pins?: string }).pins = 'none';
    expect(validate(g, {}).errors).toContain('map › unknown pins: "none" (faces or hidden)');
  });
});
