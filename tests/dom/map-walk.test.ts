// @vitest-environment happy-dom
// Travel on foot on the map (4.7.0, #422): `vehicle: 'walk'` draws the hero the player plays now (the variant that
// applies) walking along the route with their walk frames, flipped when the way goes left, `walk_back` / `walk_front`
// on a mostly vertical way when the sheet has them. A hero without walk frames travels by car.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '@engine/dom/app';
import { mapWalkStep, openMap } from '@engine/dom/map-view';
import type { CharacterDef, GameDef, MapDef } from '@engine/core/types';
import { game as demo } from '../../games/demo/game';
import { mini, miniLayouts } from '../fixtures/mini';

describe('mapWalkStep (4.7.0, #422)', () => {
  const sp = { walk: ['w/1', 'w/2', 'w/3'], walk_back: ['b/1', 'b/2'], walk_front: ['f/1'] };

  it('cycles the walk frames at the fps', () => {
    expect(mapWalkStep(sp, 10, 0, 0, 8, false).img).toBe('w/1');
    expect(mapWalkStep(sp, 10, 0, 130, 8, false).img).toBe('w/2');
    expect(mapWalkStep(sp, 10, 0, 260, 8, false).img).toBe('w/3');
    expect(mapWalkStep(sp, 10, 0, 380, 8, false).img).toBe('w/1');
    expect(mapWalkStep(sp, 10, 0, 130, 4, false).img).toBe('w/1');
  });

  it('flips when the way goes left, keeps the side on a vertical way', () => {
    expect(mapWalkStep(sp, -10, 2, 0, 8, false).flip).toBe(true);
    expect(mapWalkStep(sp, 10, 2, 0, 8, true).flip).toBe(false);
    expect(mapWalkStep(sp, 0, 10, 0, 8, true).flip).toBe(true);
  });

  it('uses walk_back going up and walk_front going down, when the sheet has them', () => {
    expect(mapWalkStep(sp, 1, -10, 0, 8, false).img).toBe('b/1');
    expect(mapWalkStep(sp, 1, 10, 0, 8, false).img).toBe('f/1');
    expect(mapWalkStep({ walk: ['w/1'] }, 1, -10, 0, 8, false).img).toBe('w/1');
    expect(mapWalkStep(sp, 10, -10, 0, 8, false).img).toBe('w/1'); // diagonal: the side walk
  });
});

const MAP: MapDef = {
  start: 'land',
  regions: { land: { name: 'Land', image: 'map/land' } },
  places: {
    home: { name: 'Home', room: 'a', region: 'land', pos: [70, 50] },
    town: { name: 'Town', room: 'b', region: 'land', pos: [20, 50], vehicle: 'walk' },
  },
};

async function start(hero: CharacterDef, flags: Record<string, string> = {}) {
  document.body.innerHTML = '';
  vi.spyOn(document.body, 'getBoundingClientRect').mockReturnValue({ width: 844, height: 390 } as DOMRect);
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(null, { status: 404 }));
  const base = mini();
  const game: GameDef = {
    ...base,
    ui: demo.ui,
    skin: { ...demo.skin, icons: { ...demo.skin.icons, car: 'ui/car' } },
    characters: { ...base.characters, hero },
    map: MAP,
    start: { ...base.start, room: 'a', unlocked: ['home', 'town'], flags: { ...base.start.flags, ...flags } },
  };
  const app = new App({ root: document.body, game, layouts: miniLayouts, manifest: { images: {} } });
  await app.engine.newGame();
  return app;
}

/** Travels to the town, stepping the animation by hand; returns the walker's image and transform at each frame. */
async function travel(app: App) {
  // happy-dom has no SVG geometry: a straight route from (70, 48) to (20, 48), in % of the map.
  const proto = Object.getPrototypeOf(document.createElementNS('http://www.w3.org/2000/svg', 'path'));
  vi.spyOn(proto, 'getTotalLength' as never).mockReturnValue(50 as never);
  vi.spyOn(proto, 'getPointAtLength' as never).mockImplementation(((l: number) => ({ x: 70 - l, y: 48 })) as never);
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const frames: ((t: number) => void)[] = [];
  vi.stubGlobal('requestAnimationFrame', (f: (t: number) => void) => frames.push(f));
  const open = openMap(app, app.engine.state);
  (document.querySelector('[aria-label="Town"]') as HTMLElement).click();
  await Promise.resolve();
  const seen: { src: string | null; transform: string; height: string }[] = [];
  for (let t = 0; t <= 1700; t += 100) {
    now = t;
    for (const f of frames.splice(0)) f(t);
    const veh = document.querySelector<HTMLImageElement>('.mapview img[style*="z-index: 15"]');
    if (veh) seen.push({ src: veh.getAttribute('src'), transform: veh.style.transform, height: veh.style.height });
  }
  vi.useFakeTimers();
  vi.advanceTimersByTime(400);
  vi.useRealTimers();
  return { open, seen };
}

describe("vehicle: 'walk' (4.7.0, #422)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('draws the hero walking along the route, facing the way of travel', async () => {
    const app = await start({ name: 'Hero', color: '#fff', sprites: { idle: ['h/1'], walk: ['h/w1', 'h/w2'] } });
    const { open, seen } = await travel(app);
    expect(await open).toBe('town');
    const srcs = new Set(seen.map((s) => s.src));
    expect(srcs).toEqual(new Set([app.bank.img('h/w1'), app.bank.img('h/w2')]));
    expect(seen.every((s) => s.transform.includes('scaleX(-1)'))).toBe(true); // the route goes left
    expect(seen[0]!.height).toBe('12%');
    app.destroy();
  });

  it('draws the variant that applies: the hero the player chose', async () => {
    const hero: CharacterDef = {
      name: 'Hero',
      color: '#fff',
      sprites: { idle: ['h/1'], walk: ['h/w1'] },
      variants: [{ if: { flag: 'form', eq: 'her' }, sprites: { idle: ['s/1'], walk: ['s/w1'] } }],
    };
    const app = await start(hero, { form: 'her' });
    const { open, seen } = await travel(app);
    await open;
    expect(new Set(seen.map((s) => s.src))).toEqual(new Set([app.bank.img('s/w1')]));
    app.destroy();
  });

  it('travels by car when the hero has no walk frames', async () => {
    const app = await start({ name: 'Hero', color: '#fff', sprites: { idle: ['h/1'] } });
    const { open, seen } = await travel(app);
    await open;
    expect(new Set(seen.map((s) => s.src))).toEqual(new Set([app.bank.img('ui/car')]));
    expect(seen[0]!.transform.replace(/ /g, '')).toBe('translate(-50%,-50%)');
    app.destroy();
  });
});
