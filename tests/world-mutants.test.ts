// The routes set's survivors in core/world.ts, read one by one (#413): the facade every game loads. Its guards are for a
// game without routes (nothing ticks, nothing is recorded, the routes' engine is never downloaded) and for the routes'
// engine not loaded yet. Every other route test imports tools/replay, which loads core/route-runtime.ts statically and
// sets `World.Engine` for the whole file: here each test imports the engine afresh, so that nothing has loaded it.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameDef } from '@engine/core/types';
import { routesGame, routesLayouts } from './fixtures/routes';

const fresh = async (g: GameDef, start = true) => {
  const { Engine } = await import('@engine/core/engine');
  const { FakePresenter, MemoryStore } = await import('@engine/core/ports');
  const e = new Engine(g, routesLayouts, new FakePresenter(), new MemoryStore());
  e.onError = () => {};
  if (start) await e.newGame();
  return e;
};
const noRoutes = () => {
  const g = routesGame();
  g.scripts = [];
  return g;
};

beforeEach(() => {
  vi.resetModules();
});

describe('a game without routes', () => {
  it('never loads the routes’ engine, and its clock asks nothing of it', async () => {
    const e = await fresh(noRoutes());
    expect(e.world.enabled).toBe(false);
    expect(() => e.world.runtime).toThrow('routes not loaded');
    e.world.advanceTo(10);
    e.world.tick(3);
    expect(e.state.world).toBeUndefined();
    await expect(e.world.drain()).resolves.toBeUndefined();
    expect(e.world.nextPending()).toBeNull();
    // `ready` again (each room entered calls it) still loads nothing.
    await e.world.ready();
    expect(() => e.world.runtime).toThrow('routes not loaded');
  });
});

describe('a game with routes', () => {
  it('before its first room: no state, no engine, and the clock where it stands needs neither', async () => {
    const e = await fresh(routesGame(), false);
    expect(e.world.nextPending()).toBeNull();
    e.world.advanceTo(0);
    expect(() => e.world.runtime).toThrow('routes not loaded');
  });

  it('loads the routes’ engine with its first room, once, and runs the clock forward only', async () => {
    const e = await fresh(routesGame());
    const rt = e.world.runtime;
    expect(e.world.runtime).toBe(rt);
    await e.world.ready();
    expect(e.world.runtime).toBe(rt);
    e.world.advanceTo(5);
    expect(e.state.world).toBe(5);
    e.world.advanceTo(3);
    expect(e.state.world).toBe(5);
  });

  it('a sync point outside any entry records nothing', async () => {
    const e = await fresh(routesGame());
    expect(e.sessions.cur).toBeUndefined();
    expect(() => e.world.sync()).not.toThrow();
    expect(e.state.world).toBeUndefined();
  });
});
