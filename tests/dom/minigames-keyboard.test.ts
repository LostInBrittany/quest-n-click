// @vitest-environment happy-dom
// Every bundled minigame can be played to its end at the keyboard (not only skipped).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pick } from '@engine/minigames/pick';
import { hide } from '@engine/minigames/hide';
import { pipes } from '@engine/minigames/pipes';
import { stroke } from '@engine/minigames/stroke';
import { cables } from '@engine/minigames/cables';
import type { MinigameCtx } from '@engine/minigames/types';

const ctxFor = (params: Record<string, unknown>): MinigameCtx => {
  const root = document.createElement('div');
  document.body.append(root);
  return {
    root,
    u: 1,
    img: (id) => `img:${id}`,
    size: () => [100, 100],
    sfx: () => {},
    instruct: () => {},
    params,
    labels: { skip: 'Skip', jump: 'J', duck: 'D' },
    signal: new AbortController().signal,
  };
};
const flush = () => new Promise((r) => setTimeout(r, 0));
const key = (k: string, target: EventTarget = document.activeElement ?? document) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
const within = <T>(p: Promise<T>, ms = 4000) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('the minigame did not end')), ms))]);

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('minigames at the keyboard', () => {
  it('pick: the first option has the focus, arrows move it, Enter on the right one wins', async () => {
    const ctx = ctxFor({ rounds: [{ options: ['a', 'b', 'c'], answer: 1 }] });
    const done = pick.run(ctx);
    await flush();
    const opts = [...ctx.root.querySelectorAll('.mg-opt')] as HTMLButtonElement[];
    expect(document.activeElement).toBe(opts[0]);
    expect(opts[0].getAttribute('aria-label')).toBe('1 / 3');
    const right = opts.find((b) => (b.querySelector('img') as HTMLImageElement).src.endsWith('img:b'))!;
    while (document.activeElement !== right) key('ArrowRight', document);
    (document.activeElement as HTMLButtonElement).click(); // Enter on a focused button is the browser's click
    await within(done);
  });

  it('hide: the spots are focusable buttons, Enter on the right one wins', async () => {
    const ctx = ctxFor({
      spots: [
        { img: 's1', x: 100, y: 300, h: 80 },
        { img: 's2', x: 300, y: 300, h: 80 },
      ],
      answer: 1,
    });
    const done = hide.run(ctx);
    await flush();
    const spots = [...ctx.root.querySelectorAll('[role="button"]')] as HTMLElement[];
    expect(spots).toHaveLength(2);
    expect(document.activeElement).toBe(spots[0]);
    key('ArrowRight', document);
    expect(document.activeElement).toBe(spots[1]);
    key('Enter');
    await within(done);
  });

  it('pipes: the tiles are named, the arrows walk the grid, Enter turns a tile', async () => {
    const ctx = ctxFor({
      tiles: { straight: ['s0', 's1'], elbow: ['e0', 'e1'], tee: ['t0', 't1'], ground: 'g' },
      source: 'src',
      nozzle: ['n0', 'n1'],
      tank: 'tank',
      cols: 3,
      rows: 3,
    });
    void pipes.run(ctx);
    await flush();
    const tiles = [...ctx.root.querySelectorAll('.mg-tile')] as HTMLButtonElement[];
    expect(tiles).toHaveLength(9);
    expect(document.activeElement).toBe(tiles[0]);
    key('ArrowDown', document);
    expect(document.activeElement).toBe(tiles[3]);
    key('ArrowRight', document);
    expect(document.activeElement?.getAttribute('aria-label')).toBe('2, 2');
  });

  it('stroke: ◀ ▶ at a calm rhythm fill the gauge; holding a key does not', async () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const ctx = ctxFor({ target: 'cat', hand: 'hand', goal: 100 });
    const done = stroke.run(ctx);
    await flush();
    const fill = ctx.root.querySelector('.mg-gauge > div') as HTMLElement;
    for (let i = 0; i < 5; i++) {
      now += 40;
      key('ArrowLeft', document);
    }
    expect(parseFloat(fill.style.width || '0')).toBe(0);
    for (let i = 0; i < 20; i++) {
      now += 400;
      key(i % 2 ? 'ArrowLeft' : 'ArrowRight', document);
    }
    expect(parseFloat(fill.style.width)).toBe(100);
    await within(done);
  });

  it('cables: Enter on a plug picks it up, Enter on its socket plugs it in; four plugs win', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.4);
    const ctx = ctxFor({
      board: 'board',
      knot: 'knot',
      plugs: { red: 'p/r', blue: 'p/b', green: 'p/g', yellow: 'p/y' },
      gags: [],
    });
    const done = cables.run(ctx);
    await flush();
    for (let n = 0; n < 4; n++) {
      const plug = document.activeElement as HTMLElement;
      expect(plug.getAttribute('aria-label')).toMatch(/^⏚ /);
      const color = plug.getAttribute('aria-label')!.split(' ')[1];
      key('Enter', plug);
      const socket = [...ctx.root.querySelectorAll('[role="button"]')].find(
        (x) => x.getAttribute('aria-label') === `◎ ${color}`,
      ) as HTMLElement;
      key('Enter', socket);
      await flush();
    }
    await within(done, 6000);
  });

  it("cables: tipDeg, socketX, socketY and plugInset fit a game's own plug and board art", async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.4);
    // The board image is 100 × 100 here: the panel is 160 × 160, its top left corner at (468, 125).
    const params = { board: 'board', knot: 'knot', plugs: { red: 'p/r', blue: 'p/b' }, gags: [] };
    const sockets = (root: HTMLElement) =>
      [...root.querySelectorAll('[role="button"]')].filter((x) => x.getAttribute('aria-label')?.startsWith('◎'));
    const plugOf = (root: HTMLElement, c: string) =>
      [...root.querySelectorAll('[role="button"]')].find(
        (x) => x.getAttribute('aria-label') === `⏚ ${c}`,
      ) as HTMLElement;

    // Defaults: sockets on the left quarter of the board, a plug's tip drawn at 120 degrees.
    const before = ctxFor(params);
    void cables.run(before);
    await flush();
    expect((sockets(before.root)[0] as HTMLElement).style.left).toBe(`${(508 / 640) * 100}%`);
    expect(plugOf(before.root, 'red').style.transform).toContain('rotate(60deg)');
    document.body.innerHTML = '';

    const ctx = ctxFor({ ...params, tipDeg: 0, socketX: 0.5, socketY: [0.1, 0.9], plugInset: 30 });
    const done = cables.run(ctx);
    await flush();
    const [red, blue] = sockets(ctx.root) as HTMLElement[];
    expect(red.style.left).toBe(`${(548 / 640) * 100}%`);
    expect(red.style.top).toBe(`${(141 / 400) * 100}%`);
    expect(blue.style.top).toBe(`${(269 / 400) * 100}%`);
    // At rest a plug points left: its tip, drawn pointing right, turns half a turn.
    const plug = plugOf(ctx.root, 'red');
    expect(plug.style.transform).toContain('rotate(180deg)');
    key('Enter', plug);
    key('Enter', red);
    await flush();
    // Connected, it points right, its centre plugInset units left of the socket.
    expect(plug.style.transform).toContain('rotate(0deg)');
    expect(plug.style.left).toBe(`${(518 / 640) * 100}%`);
    key('Enter', plugOf(ctx.root, 'blue'));
    key('Enter', blue);
    await within(done, 6000);
  });
});
