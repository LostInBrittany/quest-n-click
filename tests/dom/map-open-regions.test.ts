// @vitest-environment happy-dom
// A child region of the map is offered only once it is open (4.6.1, #421): a place in it, or in a region below it, is
// unlocked. Until then the parent's map has no zoom button to it and no frame drawn for it, so it spoils nothing and
// never leads to an empty map. The way back up ("world") stays, and the region the map opens on stays reachable.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '@engine/dom/app';
import { openMap, openRegions } from '@engine/dom/map-view';
import type { GameDef, MapDef } from '@engine/core/types';
import { game as demo } from '../../games/demo/game';
import { mini, miniLayouts } from '../fixtures/mini';

// land > coast > cove: the town on the land, the harbour on the coast, the cave in the cove.
const MAP: MapDef = {
  start: 'land',
  regions: {
    land: { name: 'Land', image: 'map/land' },
    coast: { name: 'Coast', image: 'map/coast', parent: 'land', frame: [20, 10, 50, 30] },
    cove: { name: 'Cove', image: 'map/cove', parent: 'coast', frame: [40, 40, 20, 20] },
  },
  places: {
    town: { name: 'Town', room: 'a', region: 'land', pos: [30, 70] },
    harbour: { name: 'Harbour', room: 'b', region: 'coast', pos: [50, 50] },
    cave: { name: 'Cave', room: 'b', region: 'cove', pos: [50, 50] },
  },
};

async function start(unlocked: string[], room = 'a') {
  document.body.innerHTML = '';
  vi.spyOn(document.body, 'getBoundingClientRect').mockReturnValue({ width: 844, height: 390 } as DOMRect);
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(null, { status: 404 }));
  const base = mini();
  const game: GameDef = { ...base, ui: demo.ui, skin: demo.skin, map: MAP, start: { ...base.start, room, unlocked } };
  const app = new App({ root: document.body, game, layouts: miniLayouts, manifest: { images: {} } });
  await app.engine.newGame();
  return app;
}

const buttons = () => [...document.querySelectorAll<HTMLElement>('.mapview .bigbtn')].map((b) => b.textContent);
const tap = (label: string) =>
  [...document.querySelectorAll<HTMLElement>('.mapview .bigbtn')].find((b) => b.textContent === label)!.click();
const down = `${demo.ui.zoomIn} ⤡`;
const up = `${demo.ui.world} ⤢`;
const frames = () => [...document.querySelectorAll<SVGRectElement>('.mapview rect.region-frame')];
const names = () => [...document.querySelectorAll('.choices .choice')].map((c) => c.textContent);
const close = () => (document.querySelector('.choice.gl') as HTMLElement).click();

describe('a child region shows once one of its places is open (4.6.1, #421)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('openRegions: a region is open with an unlocked place in it or below it, or when kept', () => {
    expect([...openRegions(MAP, ['town'])]).toEqual(['land']);
    expect([...openRegions(MAP, ['harbour'])].sort()).toEqual(['coast', 'land']);
    expect([...openRegions(MAP, ['cave'])].sort()).toEqual(['coast', 'cove', 'land']);
    expect([...openRegions(MAP, ['town'], ['cove'])].sort()).toEqual(['coast', 'cove', 'land']);
    // A loop of parents (refused by nobody yet) ends.
    const loop: MapDef = {
      ...MAP,
      regions: { a: { name: 'A', image: 'x', parent: 'b' }, b: { name: 'B', image: 'x', parent: 'a' } },
    };
    expect(
      [...openRegions({ ...loop, places: { p: { name: 'P', room: 'a', region: 'a', pos: [0, 0] } } }, ['p'])].sort(),
    ).toEqual(['a', 'b']);
  });

  it('no zoom button and no frame while the child region has no open place', async () => {
    const app = await start(['town']);
    const open = openMap(app, app.engine.state);
    expect(buttons()).toEqual([]);
    expect(frames()).toHaveLength(0);
    close();
    await open;
    app.destroy();
  });

  it('the zoom button and the frame come once a place of the child region opens, and lead to it', async () => {
    const app = await start(['town', 'harbour']);
    const open = openMap(app, app.engine.state);
    expect(buttons()).toEqual([down]);
    expect(frames().map((f) => [f.dataset.region, f.getAttribute('x'), f.getAttribute('width')])).toEqual([
      ['coast', '20', '50'],
    ]);
    tap(down);
    expect(names()).toEqual(['• Harbour', expect.stringContaining('•')]);
    // The coast's own child, the cove, is still closed: only the way back up, as before.
    expect(buttons()).toEqual([up]);
    expect(frames()).toHaveLength(0);
    tap(up);
    expect(names()).toEqual(['• Town', expect.stringContaining('•')]);
    close();
    await open;
    app.destroy();
  });

  it('a place open two levels down opens the regions on the way, and the middle one has both buttons', async () => {
    const app = await start(['town', 'cave']);
    const open = openMap(app, app.engine.state);
    expect(frames().map((f) => f.dataset.region)).toEqual(['coast']);
    tap(down);
    expect(names()).toEqual([expect.stringContaining('•')]); // the coast has no open place of its own
    expect(frames().map((f) => f.dataset.region)).toEqual(['cove']);
    expect(buttons()).toEqual([down, up]);
    tap(down);
    expect(names()).toEqual(['• Cave', expect.stringContaining('•')]);
    expect(buttons()).toEqual([up]);
    document.querySelector<HTMLElement>('[aria-label="Cave"]')!.click();
    expect(await open).toBe('cave');
    app.destroy();
  });

  it('the region the map opens on stays reachable from its parent, even with no place unlocked in it', async () => {
    // In room b (the harbour's room, reached by a door) with nothing of the coast unlocked: the map opens on the coast,
    // and from the land the way back down to it stays.
    const app = await start(['town'], 'b');
    const open = openMap(app, app.engine.state);
    expect(buttons()).toEqual([up]);
    tap(up);
    expect(buttons()).toEqual([down]);
    expect(frames().map((f) => f.dataset.region)).toEqual(['coast']);
    close();
    await open;
    app.destroy();
  });
});
