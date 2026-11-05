// @vitest-environment happy-dom
// Bare pins (4.7.0, #428), for a map whose drawing shows the places. `map.pins: 'hidden'`: each place keeps its button
// (named, centred on its `pos`, the size of a face) but no face, no needle; its "!" still shows; joined places get one
// empty button each. `map.pins: 'dots'`: the same buttons with a small token in each, and the hero standing on the
// current place instead of its token, who leaves it when travelling and stands on the new place on arrival. The "Where
// to?" list is unchanged, and the validator refuses an unknown value.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '@engine/dom/app';
import { openMap } from '@engine/dom/map-view';
import type { CharacterDef, GameDef, MapDef } from '@engine/core/types';
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

async function start(map: MapDef, unlocked: string[], hero?: CharacterDef) {
  document.body.innerHTML = '';
  vi.spyOn(document.body, 'getBoundingClientRect').mockReturnValue({ width: 844, height: 390 } as DOMRect);
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(null, { status: 404 }));
  const base = mini();
  const game: GameDef = {
    ...base,
    ui: demo.ui,
    skin: { ...demo.skin, icons: { ...demo.skin.icons, pin: 'ui/pin', news: 'ui/news' } },
    ...(hero ? { characters: { ...base.characters, hero } } : {}),
    map,
    start: { ...base.start, room: 'a', unlocked, flags: { ...base.start.flags, always: true } },
  };
  const app = new App({ root: document.body, game, layouts: miniLayouts, manifest: { images: {} } });
  await app.engine.newGame();
  return app;
}

const pins = () => [...document.querySelectorAll<HTMLElement>('.mapview .pin')];

describe("map pins that draw nothing (map.pins: 'hidden', 4.7.0)", () => {
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
    expect(validate(g, {}).errors).toContain('map › unknown pins: "none" (faces, hidden or dots)');
    g.map.pins = 'dots';
    expect(validate(g, {}).errors.filter((e) => e.includes('pins'))).toEqual([]);
  });
});

const DOTS: MapDef = {
  start: 'land',
  pins: 'dots',
  regions: { land: { name: 'Land', image: 'map/land' } },
  places: {
    home: { name: 'Home', room: 'a', region: 'land', pos: [70, 50], news: 'always' },
    town: { name: 'Town', room: 'b', region: 'land', pos: [20, 40], vehicle: 'walk' },
  },
};
const HERO: CharacterDef = { name: 'Hero', color: '#fff', sprites: { idle: ['h/1'], walk: ['h/w1', 'h/w2'] } };

describe("map pins as small dots, the hero on the current place (map.pins: 'dots', 4.7.0)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('draws a token in each bare button, none under the hero, who stands on the current place', async () => {
    const app = await start(DOTS, ['home', 'town'], HERO);
    const open = openMap(app, app.engine.state);
    const [home, town] = pins();
    for (const p of [home!, town!]) {
      expect(p.classList.contains('bare') && p.classList.contains('dots')).toBe(true);
      expect(p.querySelector('img.face, img.needle')).toBeNull();
    }
    expect(town!.querySelector('span.dot')).not.toBeNull();
    expect(home!.querySelector('.dot')).toBeNull(); // the hero stands there instead
    expect(home!.querySelector('img.news')).toBeNull(); // its "!" moves beside the hero's head
    expect(document.querySelector('.mapview .standing img.news')).not.toBeNull();
    const standing = document.querySelectorAll<HTMLElement>('.mapview .standing');
    expect(standing).toHaveLength(1);
    expect([standing[0]!.style.left, standing[0]!.style.top, standing[0]!.style.height]).toEqual(['70%', '50%', '12%']);
    expect(standing[0]!.querySelector('img')!.getAttribute('src')).toBe(app.bank.img('h/1'));
    expect(standing[0]!.querySelector('.shadow')).not.toBeNull();
    (document.querySelector('.choice.gl') as HTMLElement).click();
    await open;
    app.destroy();
  });

  it("uses the map's dot image when it has one, and keeps the dot when the hero has no idle frame", async () => {
    const app = await start({ ...DOTS, vehicles: { dot: 'ui/dot' } }, ['home', 'town'], {
      name: 'Hero',
      color: '#fff',
      sprites: { walk: ['h/w1'] },
    });
    const open = openMap(app, app.engine.state);
    for (const p of pins()) expect(p.querySelector('img.dot')?.getAttribute('src')).toBe(app.bank.img('ui/dot'));
    expect(document.querySelector('.mapview .standing')).toBeNull();
    (document.querySelector('.choice.gl') as HTMLElement).click();
    await open;
    app.destroy();
  });

  it('the walker takes over from the standing hero, who stands on the new place on arrival', async () => {
    const app = await start(DOTS, ['home', 'town'], HERO);
    // happy-dom has no SVG geometry: a straight route from (70, 50) to (20, 40), spot to spot.
    const proto = Object.getPrototypeOf(document.createElementNS('http://www.w3.org/2000/svg', 'path'));
    vi.spyOn(proto, 'getTotalLength' as never).mockReturnValue(50 as never);
    vi.spyOn(proto, 'getPointAtLength' as never).mockImplementation(((l: number) => ({
      x: 70 - l,
      y: 50 - l / 5,
    })) as never);
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const frames: ((t: number) => void)[] = [];
    vi.stubGlobal('requestAnimationFrame', (f: (t: number) => void) => frames.push(f));
    const open = openMap(app, app.engine.state);
    (document.querySelector('[aria-label="Town"]') as HTMLElement).click();
    await Promise.resolve();
    expect(document.querySelector('.mapview path')!.getAttribute('d')).toBe('M70 50 Q45 30 20 40');
    expect(document.querySelector('.mapview .standing')).toBeNull(); // gone: the walker leaves
    for (let t = 0; t <= 1700; t += 100) {
      now = t;
      for (const f of frames.splice(0)) f(t);
    }
    vi.useFakeTimers();
    for (let i = 0; i < 5; i++) await Promise.resolve(); // the journey's end, before the short pause
    const standing = document.querySelectorAll<HTMLElement>('.mapview .standing');
    expect(standing).toHaveLength(1);
    expect([standing[0]!.style.left, standing[0]!.style.top]).toEqual(['20%', '40%']);
    expect(standing[0]!.querySelector('img')!.style.transform).toBe('scaleX(-1)'); // facing the way they came
    expect(document.querySelector('.mapview img[style*="z-index: 15"]')).toBeNull(); // the walker is gone
    vi.advanceTimersByTime(400);
    vi.useRealTimers();
    expect(await open).toBe('town');
    app.destroy();
  });

  it("draws no hero on 'faces' nor 'hidden' maps", async () => {
    for (const pinsOpt of ['faces', 'hidden'] as const) {
      const app = await start({ ...DOTS, pins: pinsOpt }, ['home', 'town'], HERO);
      const open = openMap(app, app.engine.state);
      expect(document.querySelector('.mapview .standing, .mapview .dot')).toBeNull();
      (document.querySelector('.choice.gl') as HTMLElement).click();
      await open;
      app.destroy();
    }
  });
});
