// The routes set's survivors, read one by one (4.6.0, tools/mutation-sets.ts `routes`): each test below pins a
// behaviour of core/route-runtime.ts that the broader route tests left free. What no test can tell apart is named in
// docs/dev/mutants.json.
import { describe, expect, it } from 'vitest';
import { Engine } from '@engine/core/engine';
import { FakePresenter, MemoryStore } from '@engine/core/ports';
import type { WorldEvent } from '@engine/core/world';
import { WORLD_TICK_MS } from '@engine/core/timing';
import type { GameDef, Layout, RouteScriptDef } from '@engine/core/types';
import { replay } from '@engine/tools/replay';
import { routesGame, routesLayouts } from './fixtures/routes';

const route = (g: GameDef, id: string) => g.scripts!.find((s) => s.id === id) as RouteScriptDef;
const make = async (g = routesGame(), layouts: Record<string, Layout> = routesLayouts) => {
  const e = new Engine(g, layouts, new FakePresenter(), new MemoryStore());
  e.onError = () => {};
  await e.newGame();
  const events: WorldEvent[] = [];
  e.world.listeners.add((x) => events.push(x));
  return { e, events };
};
/** Only the guard on a route: the cat and the detour left out. */
const guardOnly = (edit?: (r: RouteScriptDef, g: GameDef) => void) => {
  const g = routesGame();
  g.scripts = g.scripts!.filter((s) => s.id === 'rounds');
  edit?.(route(g, 'rounds'), g);
  return g;
};
const guard = (e: Engine) => e.state.actors[`${e.state.where!.guard}.guard`];

describe('the clock', () => {
  it('does not tick a finished game, nor run a game without routes to a tick', async () => {
    const { e } = await make();
    e.state.done = true;
    e.world.tick(5);
    expect(e.state.world).toBeUndefined();
    const g = routesGame();
    g.scripts = [];
    const { e: none } = await make(g);
    none.world.advanceTo(10);
    expect(none.state.world).toBeUndefined();
    expect(none.world.nextPending()).toBeNull();
  });

  it('untilStop says whether time passed: not for a route that cannot move', async () => {
    const { e } = await make(guardOnly());
    await e.script([{ suspendScript: 'rounds' }]);
    expect(e.world.runtime.untilStop('rounds')).toBe(false);
    await e.script([{ resumeScript: 'rounds' }]);
    expect(e.world.runtime.untilStop('rounds')).toBe(true);
    expect(e.session!.log.at(-1)).toMatchObject({ world: e.state.world });
  });

  it('a route is held by each of: stopped, done, suspended, pending commands, a false `while`', async () => {
    for (const set of [
      (e: Engine) => (e.scriptState('rounds').off = true),
      (e: Engine) => (e.scriptState('rounds').done = true),
      (e: Engine) => (e.scriptState('rounds').paused = true),
      (e: Engine) => ((e.scriptState('rounds').route ??= {}).pending = 'post'),
    ]) {
      const { e } = await make(guardOnly());
      set(e);
      e.world.tick(10);
      expect(guard(e)?.x).toBeUndefined();
    }
    const { e } = await make(guardOnly((r) => (r.while = 'walking')));
    e.world.tick(10);
    expect(guard(e)?.x).toBeUndefined();
    e.state.flags.walking = true;
    e.world.tick(10);
    expect(guard(e)?.x).toBeGreaterThan(100);
  });

  it('an automatic route begins only once its character stands in its first room', async () => {
    const { e } = await make(guardOnly());
    e.state.where!.guard = 'shed';
    e.world.tick(10);
    expect(e.scriptState('rounds').route?.on).toBeUndefined();
    expect(e.state.actors['shed.guard']?.x).toBeUndefined();
    e.state.where!.guard = 'yard';
    e.world.tick(1);
    expect(e.scriptState('rounds').route?.on).toBe(true);
  });

  it('a step past the last one wraps a loop to its first step', async () => {
    const { e } = await make(guardOnly());
    e.world.tick(1);
    // A save without step ids whose `pc` is the steps' count (load keeps it, #413): `scriptState` follows a step id,
    // so the id goes too, else it would put `pc` back.
    const st = e.scriptState('rounds');
    st.pc = route(routesGame(), 'rounds').route.steps.length;
    delete st.step;
    e.world.tick(1);
    expect(e.scriptState('rounds')).toMatchObject({ pc: 0, step: 'post' });
  });

  it('a character no longer in any room (a save whose room is gone) stops its route where it was', async () => {
    const { e, events } = await make(guardOnly());
    e.world.tick(1);
    const was = { ...guard(e) };
    delete e.state.where!.guard;
    events.length = 0;
    e.world.tick(5);
    expect(Object.keys(e.state.actors)).toEqual(['yard.guard']);
    expect(e.state.actors['yard.guard']).toEqual(was);
    expect(events).toEqual([]);
  });
});

describe('a wait', () => {
  it('turns and poses the character, says so to the view, and lasts exactly its ticks', async () => {
    const { e, events } = await make(
      guardOnly((r) => {
        r.route.steps = [
          { id: 'stand', wait: 3 * WORLD_TICK_MS, face: 'right', pose: 'front' },
          { id: 'go', walk: 'post' },
        ];
      }),
    );
    e.world.tick(1);
    expect(e.state.actors['yard.guard']).toMatchObject({ facing: 'right', pose: 'front' });
    expect(events.at(-1)).toEqual({
      kind: 'moved',
      char: 'guard',
      room: 'yard',
      actor: 'guard',
      at: [100, 300],
      walking: false,
      facing: 'right',
    });
    e.world.tick(1);
    expect(e.scriptState('rounds').step).toBe('stand');
    e.world.tick(1);
    expect(e.scriptState('rounds').step).toBe('go');
  });

  it('without face or pose leaves the character as it was; a wait of 0 is done in its tick', async () => {
    const { e } = await make(
      guardOnly((r) => {
        r.route.steps = [
          { id: 'blink', wait: 0 },
          { id: 'go', walk: 'post' },
        ];
      }),
    );
    e.world.tick(1);
    expect(e.state.actors['yard.guard']).toBeUndefined();
    expect(e.scriptState('rounds').step).toBe('go');
  });

  it('a pose alone is kept, without a facing', async () => {
    const { e } = await make(
      guardOnly(
        (r) =>
          (r.route.steps = [
            { id: 'sit', wait: 500, pose: 'sit' },
            { id: 'go', walk: 'post' },
          ]),
      ),
    );
    e.world.tick(1);
    expect(e.state.actors['yard.guard']).toStrictEqual({ pose: 'sit' });
    const { e: f } = await make(
      guardOnly(
        (r) =>
          (r.route.steps = [
            { id: 'turn', wait: 500, face: 'left' },
            { id: 'go', walk: 'post' },
          ]),
      ),
    );
    f.world.tick(1);
    expect(f.state.actors['yard.guard']).toStrictEqual({ facing: 'left' });
  });

  it('a wait of exactly one tick is done in that tick', async () => {
    const { e } = await make(
      guardOnly(
        (r) =>
          (r.route.steps = [
            { id: 'blink', wait: WORLD_TICK_MS },
            { id: 'go', walk: 'post' },
          ]),
      ),
    );
    e.world.tick(1);
    expect(e.scriptState('rounds').step).toBe('go');
  });
});

describe('a walk', () => {
  it('faces where it goes, says it walks, then that it stands', async () => {
    const { e, events } = await make(guardOnly());
    e.world.tick(1);
    expect(events.at(-1)).toMatchObject({ kind: 'moved', walking: true, facing: 'right' });
    expect(e.state.actors['yard.guard']?.facing).toBe('right');
    e.world.tick(39);
    expect(events.at(-1)).toMatchObject({ walking: false, at: [400, 300] });
    const g = guardOnly(
      (r) =>
        (r.route.steps = [
          { id: 'back', walk: 'gate' },
          { id: 'wait', wait: 50 },
        ]),
    );
    const { e: w, events: ev } = await make(g);
    w.world.tick(1);
    expect(ev.at(-1)).toMatchObject({ facing: 'left' });
    expect(w.state.actors['yard.guard']?.facing).toBe('left');
  });

  it('straight up keeps the facing it had', async () => {
    const L = structuredClone(routesLayouts);
    L.yard!.points!.up = [100, 260];
    const { e, events } = await make(
      guardOnly(
        (r) =>
          (r.route.steps = [
            { id: 'up', walk: 'up' },
            { id: 'w', wait: 50 },
          ]),
      ),
      L,
    );
    e.world.tick(1);
    expect(e.state.actors['yard.guard']).not.toHaveProperty('facing');
    expect(events.at(-1)).not.toHaveProperty('facing');
  });

  it('a point missing from the layout is skipped and said', async () => {
    const errors: unknown[] = [];
    const g = guardOnly(
      (r) =>
        (r.route.steps = [
          { id: 'lost', walk: 'nowhere' },
          { id: 'w', wait: 500 },
        ]),
    );
    const e = new Engine(g, routesLayouts, new FakePresenter(), new MemoryStore());
    e.onError = (x) => errors.push(x);
    await e.newGame();
    e.world.tick(1);
    expect(e.scriptState('rounds').step).toBe('w');
    expect(String(errors[0])).toMatch(/route rounds: step lost has no point in yard/);
  });

  it('crosses a walk link in its time, and waits before a closed one', async () => {
    const g = guardOnly(
      (r) =>
        (r.route.steps = [
          { id: 'up', walk: 'loft' },
          { id: 'w', wait: 50 },
        ]),
    );
    g.rooms[0]!.stage = { links: { ladder: { if: 'ladder_down' } } };
    const L = structuredClone(routesLayouts);
    L.yard = {
      ...L.yard!,
      walk: undefined,
      walkZones: {
        floor: {
          area: [
            [0, 280],
            [640, 280],
            [640, 395],
            [0, 395],
          ],
        },
        loft: {
          area: [
            [0, 100],
            [640, 100],
            [640, 200],
            [0, 200],
          ],
        },
      },
      walkLinks: {
        ladder: {
          from: { zone: 'floor', at: [110, 300] },
          to: { zone: 'loft', at: [110, 150] },
          mode: 'ladder',
          ms: 100,
        },
      },
      points: { ...L.yard!.points, loft: [200, 150] },
    } as Layout;
    const { e, events } = await make(g, L);
    e.world.tick(5);
    expect(e.scriptState('rounds').route?.blocked).toBe(true);
    expect(events.at(-1)).toMatchObject({ walking: false });
    const foot = guard(e)!;
    e.world.tick(3);
    expect(guard(e)).toEqual(foot);
    e.state.flags.ladder_down = true;
    e.world.tick(1);
    expect(e.scriptState('rounds').route?.blocked).toBeUndefined();
    expect([guard(e)!.x, guard(e)!.y]).toEqual([110, 150]);
    expect(e.scriptState('rounds').route?.wait).toBe(100);
    e.world.tick(1);
    expect([guard(e)!.x, guard(e)!.y]).toEqual([110, 150]);
    e.world.tick(2);
    expect(guard(e)!.x).toBeGreaterThan(110);
  });
});

describe('an exit', () => {
  it('says the crossing to the view, at the entry; an entry given as a point is taken as written', async () => {
    const g = guardOnly();
    g.rooms[0]!.exits!.door!.entry = [222, 333] as never;
    const { e, events } = await make(g);
    e.state.actors['shed.guard'] = { visible: false };
    for (let i = 0; i < 200 && e.state.where!.guard === 'yard'; i++) e.world.tick(1);
    expect(events.find((x) => x.kind === 'crossed')).toEqual({
      kind: 'crossed',
      char: 'guard',
      from: 'yard',
      to: 'shed',
      at: [222, 333],
    });
    expect(e.state.actors['shed.guard']).toEqual({ x: 222, y: 333 });
  });

  it('an exit the room does not have is skipped', async () => {
    const { e } = await make(
      guardOnly(
        (r) =>
          (r.route.steps = [
            { id: 'gone', exit: 'window' },
            { id: 'w', wait: 500 },
          ]),
      ),
    );
    for (let i = 0; i < 100 && e.scriptState('rounds').step === 'gone'; i++) e.world.tick(1);
    expect(e.scriptState('rounds').step).toBe('w');
    expect(e.state.where!.guard).toBe('yard');
    // The same when the layout has a hotspot of that name to walk to: at it, there is still no exit to take.
    const L = structuredClone(routesLayouts);
    L.yard!.hotspots!.window = { rect: [80, 200, 40, 60], approach: [100, 300] };
    const { e: f } = await make(
      guardOnly(
        (r) =>
          (r.route.steps = [
            { id: 'gone', exit: 'window' },
            { id: 'w', wait: 500 },
          ]),
      ),
      L,
    );
    f.world.tick(1);
    expect(f.scriptState('rounds').step).toBe('w');
    expect(f.state.where!.guard).toBe('yard');
  });
});

describe('arrival commands', () => {
  it('a step without commands queues nothing; a route with nothing pending runs nothing', async () => {
    const { e } = await make(guardOnly());
    e.world.tick(60);
    expect(e.world.nextPending()).toBeNull();
    await e.world.runtime.runDo('rounds');
    expect(e.session!.log.at(-1)).toEqual(expect.objectContaining({ routeDo: 'rounds' }));
    expect(e.session!.log.at(-1)?.ran).toBeUndefined();
    // A manual route never started has no route state at all.
    const { e: f } = await make();
    await f.world.runtime.runDo('detour');
    expect(f.state.scripts!.detour!.route).toBeUndefined();
  });

  it('runs them as played, not skipped: a sound is heard', async () => {
    const g = guardOnly(
      (r) =>
        (r.route.steps = [
          { id: 'ring', wait: 0, do: [{ sfx: 'bell' }] },
          { id: 'w', wait: 500 },
        ]),
    );
    const ui = new FakePresenter();
    const e = new Engine(g, routesLayouts, ui, new MemoryStore());
    await e.newGame();
    e.world.tick(1);
    expect(e.world.nextPending()).toBe('rounds');
    await e.world.drain();
    expect(ui.log).toContain('sfx bell');
  });
});

describe('the scenario', () => {
  it('start: from the first step, its id; refused away from the first room', async () => {
    const { e } = await make();
    e.world.runtime.start('detour');
    // Read as saved: `scriptState` would fill the step id in from `pc`.
    expect(e.state.scripts!.detour).toEqual({ pc: 0, step: 'gate', route: {} });
    await e.script([{ startScript: 'detour' }]);
    expect(e.scriptState('detour')).toMatchObject({ pc: 0, step: 'gate' });
    await e.script([{ moveActor: ['guard', 'shed'] }, { startScript: 'detour' }]);
    expect(e.scriptState('detour').paused).toBe(true);
    expect(e.world.diagnostics.at(-1)).toMatch(/start of route "detour" needs guard in yard, not shed/);
  });

  it('resume suspends the other running route of the character, and the room of a step follows the exits', async () => {
    const { e } = await make();
    for (let i = 0; i < 400 && e.state.where!.guard !== 'shed'; i++) e.world.tick(1);
    await e.script([{ suspendScript: 'rounds' }]);
    expect(e.world.runtime.roomOf(route(routesGame(), 'rounds'), e.scriptState('rounds').pc)).toBe('shed');
    await e.script([{ moveActor: ['guard', 'yard'] }, { startScript: 'detour' }]);
    await e.script([{ moveActor: ['guard', 'shed'] }, { resumeScript: 'rounds' }]);
    expect(e.scriptState('rounds').paused).toBeUndefined();
    expect(e.scriptState('detour').paused).toBe(true);
    // A manual route never started is not running: resuming another leaves it alone.
    const { e: f } = await make();
    await f.script([{ suspendScript: 'rounds' }, { resumeScript: 'rounds' }]);
    expect(f.state.scripts!.detour).toBeUndefined();
  });
});

describe('the player and the session', () => {
  it('holds only the route of a character in the hero’s room, and says where it stands', async () => {
    const { e, events } = await make(guardOnly());
    e.world.tick(3);
    events.length = 0;
    await e.act({ verb: 'look', a: 'guard' });
    expect(events[0]).toMatchObject({ kind: 'moved', char: 'guard', actor: 'guard', walking: false, facing: 'right' });
    e.state.where!.guard = 'shed';
    events.length = 0;
    await e.act({ verb: 'look', a: 'guard' });
    expect(events).toEqual([]);
    // Another character's route is not held by a click on the cat.
    const { e: f } = await make();
    f.world.tick(3);
    const before = f.state.actors['yard.guard']?.x;
    await f.act({ verb: 'look', a: 'cat' });
    f.world.tick(1);
    expect(f.state.actors['yard.guard']?.x).toBeGreaterThan(before!);
  });

  it('a replay goes to the last recorded tick at the end of an entry; an unknown route is refused', async () => {
    const { e } = await make(guardOnly());
    e.digestOn = true;
    e.world.tick(4);
    e.world.runtime.pass(20);
    e.world.tick(2);
    await e.act({ verb: 'look', a: 'guard' });
    const r = await replay(guardOnly(), routesLayouts, e.session!);
    expect(r.divergedAt).toBeUndefined();
    expect(r.state.world).toBe(e.state.world);
    expect(() => e.world.runtime.untilStop('nope')).toThrow(/unknown route: nope/);
  });
});

// #413: the second reading. A character has an actor in every room its route walks in (validate), but a save, a
// `moveActor` or a layout not placed yet can still leave it without one, or without a position: the route goes on.
describe('a character with no actor, or no position, in the room', () => {
  /** The shed without its guard; `entries: false` also takes the shed's entries away. */
  const bare = (o: { entries?: boolean } = {}) => {
    const g = guardOnly();
    g.rooms[1]!.actors = {};
    const L = structuredClone(routesLayouts);
    if (o.entries === false) delete L.shed!.entries;
    return { g, L };
  };
  const odd = (e: Engine) => Object.keys(e.state.actors).filter((k) => k.includes('undefined'));

  it('waits, walks and leaves unseen: nothing written, nothing told, the exit taken at once', async () => {
    const { g, L } = bare();
    const r = route(g, 'rounds');
    r.route.from = 'shed';
    r.route.steps = [
      { id: 'turn', wait: 2 * WORLD_TICK_MS, face: 'left', pose: 'sit' },
      { id: 'go', walk: 'crate' },
      { id: 'leave', exit: 'out' },
      { id: 'w', wait: 500 },
    ];
    const { e, events } = await make(g, L);
    e.state.where!.guard = 'shed';
    e.world.tick(2);
    expect(e.scriptState('rounds').step).toBe('go');
    expect(e.state.actors).toEqual({});
    expect(events).toEqual([]);
    e.world.tick(1);
    expect(e.scriptState('rounds').step).toBe('leave');
    e.world.tick(1);
    expect(e.state.where!.guard).toBe('yard');
    expect(events).toEqual([{ kind: 'crossed', char: 'guard', from: 'shed', to: 'yard', at: [560, 320] }]);
    expect(odd(e)).toEqual([]);
    expect(e.world.runtime.key('guard', 'shed')).toBeUndefined();
  });

  it('crosses into a room where it has no actor and no entry: nothing written, nothing told', async () => {
    const { g, L } = bare({ entries: false });
    route(g, 'rounds').route.steps = [
      { id: 'in', exit: 'door' },
      { id: 'w', wait: 500 },
    ];
    const { e, events } = await make(g, L);
    for (let i = 0; i < 100 && e.state.where!.guard === 'yard'; i++) e.world.tick(1);
    expect(e.state.where!.guard).toBe('shed');
    expect(events.filter((x) => x.kind === 'crossed')).toEqual([]);
    expect(odd(e)).toEqual([]);
  });

  it('crosses into a room without entries: stands where its layout places it there', async () => {
    const g = guardOnly();
    const L = structuredClone(routesLayouts);
    delete L.shed!.entries;
    const { e, events } = await make(g, L);
    for (let i = 0; i < 100 && e.state.where!.guard === 'yard'; i++) e.world.tick(1);
    expect(e.state.where!.guard).toBe('shed');
    expect(e.state.actors['shed.guard']).toEqual({});
    expect(events.find((x) => x.kind === 'crossed')).toMatchObject({ to: 'shed', at: [80, 320] });
  });

  it('without a position (none saved, none placed): a walk is done at once, nothing written, nothing told', async () => {
    const L = structuredClone(routesLayouts);
    delete L.yard!.actors!.guard;
    const { e, events } = await make(guardOnly(), L);
    expect(e.world.runtime.at('guard', 'yard')).toBeUndefined();
    e.world.tick(1);
    expect(e.scriptState('rounds').step).toBe('watch');
    expect(e.state.actors['yard.guard']).toBeUndefined();
    expect(events).toEqual([]);
    // A click on it holds its route, but there is nowhere to show it standing.
    e.world.runtime.hold({ act: { verb: 'look', a: 'guard' } }, new Map());
    expect(events).toEqual([]);
    // Half a position is none.
    e.state.actors['yard.guard'] = { x: 5 };
    expect(e.world.runtime.at('guard', 'yard')).toBeUndefined();
  });

  it('ids are taken as written: an actor, a state or an exit named `undefined` is not where a missing one falls', async () => {
    const { g, L } = bare();
    L.shed!.actors = { undefined: { x: 1, y: 2, h: 10 } };
    g.rooms[0]!.exits!.undefined = { name: 'odd', to: 'shed' };
    const { e } = await make(g, L);
    e.state.actors['shed.undefined'] = { x: 3, y: 4 };
    e.state.actors.undefined = { facing: 'left' };
    const rt = e.world.runtime;
    expect(rt.at('guard', 'shed')).toBeUndefined();
    expect(rt.facingOf('guard', 'shed')).toStrictEqual({});
    // A walk or a wait never changes the room of the steps after it; only an exit does.
    expect(rt.roomOf(route(g, 'rounds'), 2)).toBe('yard');
    expect(rt.roomOf(route(g, 'rounds'), 3)).toBe('shed');
  });

  it('a character with no facing has none to tell', async () => {
    const { e } = await make(guardOnly());
    expect(e.world.runtime.facingOf('guard', 'yard')).toStrictEqual({});
  });
});

describe('arriving', () => {
  it('a walker already on its point, or exactly half a unit from it, is there: it does not move', async () => {
    for (const post of [
      [100, 300],
      [100.5, 300],
    ] as const) {
      const L = structuredClone(routesLayouts);
      L.yard!.points!.post = [...post];
      const { e, events } = await make(guardOnly(), L);
      e.world.tick(1);
      expect(e.scriptState('rounds').step).toBe('watch');
      expect(e.state.actors['yard.guard']).toBeUndefined();
      expect(events).toEqual([]);
    }
  });

  it('reaching the foot of a ladder with the tick’s last step, it climbs in that same tick', async () => {
    const g = guardOnly(
      (r) =>
        (r.route.steps = [
          { id: 'up', walk: 'loft' },
          { id: 'w', wait: 50 },
        ]),
    );
    const step = (150 * WORLD_TICK_MS) / 1000; // WALK_SPEED's distance in one tick: 7.5
    const L = structuredClone(routesLayouts);
    L.yard = {
      ...L.yard!,
      walk: undefined,
      walkZones: {
        floor: {
          area: [
            [0, 280],
            [640, 280],
            [640, 395],
            [0, 395],
          ],
        },
        loft: {
          area: [
            [0, 100],
            [640, 100],
            [640, 200],
            [0, 200],
          ],
        },
      },
      walkLinks: {
        ladder: {
          from: { zone: 'floor', at: [100 + step, 300] },
          to: { zone: 'loft', at: [100 + step, 150] },
          mode: 'ladder',
          ms: 100,
        },
      },
      points: { ...L.yard!.points, loft: [200, 150] },
    } as Layout;
    const { e } = await make(g, L);
    e.world.tick(1);
    expect([guard(e)!.x, guard(e)!.y]).toEqual([100 + step, 150]);
    expect(e.scriptState('rounds').route?.wait).toBe(100);
  });

  it('a point it cannot reach, with no closed link in the way, does not hold it as blocked', async () => {
    const g = guardOnly(
      (r) =>
        (r.route.steps = [
          { id: 'up', walk: 'loft' },
          { id: 'w', wait: 50 },
        ]),
    );
    const L = structuredClone(routesLayouts);
    L.yard = {
      ...L.yard!,
      walk: undefined,
      walkZones: {
        floor: {
          area: [
            [0, 280],
            [640, 280],
            [640, 395],
            [0, 395],
          ],
        },
        loft: {
          area: [
            [0, 100],
            [640, 100],
            [640, 200],
            [0, 200],
          ],
        },
      },
      points: { ...L.yard!.points, loft: [100, 150] },
    } as Layout;
    const { e } = await make(g, L);
    // As far as its zone goes, then it stands there: no link closed, nothing to wait for.
    e.world.tick(10);
    const there = { ...guard(e) };
    e.world.tick(5);
    expect(guard(e)).toEqual(there);
    expect(e.scriptState('rounds').route?.blocked).toBeUndefined();
  });
});

describe('the solver’s and the tests’ turns', () => {
  it('“until the next stop” lets ten minutes of the clock pass at most', async () => {
    const { e } = await make(guardOnly((r) => (r.route.steps = [{ id: 'long', wait: 20 * 60 * 1000 }])));
    expect(e.world.runtime.untilStop('rounds')).toBe(true);
    expect(e.state.world).toBe((10 * 60 * 1000) / WORLD_TICK_MS);
  });

  it('a game without routes lets no time pass, even asked directly', async () => {
    const g = routesGame();
    g.scripts = [];
    const { e } = await make(g);
    e.world.runtime.pass(10);
    expect(e.state.world).toBeUndefined();
  });

  it('a route without a step starts without a step id', async () => {
    const g = routesGame();
    g.scripts!.push({ id: 'idle', manual: true, route: { who: 'cat', from: 'yard', steps: [] } } as RouteScriptDef);
    const { e } = await make(g);
    e.world.runtime.start('idle');
    expect(e.state.scripts!.idle).toStrictEqual({ pc: 0, route: {} });
  });

  it('a click on a character holds that character’s route, not the first running one', async () => {
    const { e } = await make();
    const holds = new Map();
    e.world.runtime.hold({ act: { verb: 'look', a: 'cat' } }, holds);
    expect([...holds.values()]).toEqual(['pace']);
  });
});
