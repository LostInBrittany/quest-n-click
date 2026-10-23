// The placement editor's mirrors (dev/mirror.ts, #252): a prop or an actor turned around in the layout, a prop in the
// state shown, an actor whose room sets `facing` told that the room wins.
import { describe, expect, it } from 'vitest';
import { facingNote, mirrorOf, setMirror } from '@engine/dev/mirror';
import type { Layout, RoomDef } from '@engine/core/types';

const layout = (): Layout =>
  ({
    props: {
      stool: { x: 100, y: 300, h: 40, states: { pulled: { x: 120, y: 310 }, tipped: { x: 90, y: 300, flip: true } } },
    },
    actors: { cook: { x: 400, y: 340 } },
  }) as Layout;

describe('the placement editor mirrors', () => {
  it('turns an actor around and back, the field gone when off as on the placement page', () => {
    const L = layout();
    expect(mirrorOf(L, 'actor', 'cook', 'flip')).toBe(false);
    setMirror(L, 'actor', 'cook', 'flip', true);
    expect(L.actors?.cook).toEqual({ x: 400, y: 340, flip: true });
    setMirror(L, 'actor', 'cook', 'flip', false);
    expect(L.actors?.cook).toEqual({ x: 400, y: 340 });
  });

  it('offers no vertical mirror on an actor, and nothing for one with no geometry yet', () => {
    const L = layout();
    expect(mirrorOf(L, 'actor', 'cook', 'flipV')).toBeUndefined();
    expect(mirrorOf(L, 'actor', 'ghost', 'flip')).toBeUndefined();
    setMirror(L, 'actor', 'ghost', 'flip', true);
    expect(L.actors?.ghost).toBeUndefined();
  });

  it("writes a prop's own mirror when its state has none, which every such state then shows", () => {
    const L = layout();
    setMirror(L, 'prop', 'stool', 'flipV', true, 'pulled');
    expect(L.props?.stool?.flipV).toBe(true);
    expect(L.props?.stool?.states?.pulled?.flipV).toBeUndefined();
    expect(mirrorOf(L, 'prop', 'stool', 'flipV')).toBe(true);
  });

  it("edits a state's own mirror in that state, keeping false written so it does not fall back to the prop's", () => {
    const L = layout();
    L.props!.stool!.flip = true;
    expect(mirrorOf(L, 'prop', 'stool', 'flip', 'tipped')).toBe(true);
    L.props!.stool!.states!.tipped!.flip = true;
    setMirror(L, 'prop', 'stool', 'flip', false, 'tipped');
    expect(L.props?.stool?.states?.tipped?.flip).toBe(false);
    expect(L.props?.stool?.flip).toBe(true);
    expect(mirrorOf(L, 'prop', 'stool', 'flip', 'tipped')).toBe(false);
  });

  it("says when the room's facing wins over the layout", () => {
    const room = {
      id: 'kitchen',
      actors: { cook: { char: 'cook', facing: 'left' }, maid: { char: 'maid' } },
    } as unknown as RoomDef;
    expect(facingNote(room, 'cook')).toContain("'left'");
    expect(facingNote(room, 'maid')).toBeUndefined();
  });
});
