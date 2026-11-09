// The open streams indexed by player: a wake-up, a count and the slow pass reach one player's streams, never every
// stream of the instance; a closed stream leaves the index and an emptied player leaves `players()`.
import { describe, expect, it } from 'vitest';
import { type Stream, type StreamSource, Streams } from '../bridge/src/streams';

const read: string[] = [];
const src: StreamSource = {
  page: async (playerId) => {
    read.push(playerId);
    return [];
  },
  ends: async () => undefined,
};
const stream = (playerId: string): Stream => ({ playerId, cursor: 0, on: () => {}, close: () => {} });

describe('the open streams, by player', () => {
  it("a wake-up reads exactly one player's streams; closing keeps count and players right", async () => {
    const st = new Streams(src, () => 10);
    const players = ['A', 'B', 'C'];
    const offs = new Map<Stream, () => void>();
    for (let n = 0; n < 300; n++) {
      const s = stream(players[n % 3]);
      offs.set(s, st.add(s));
    }
    expect(st.size).toBe(300);
    expect(st.players()).toEqual(new Set(players));
    for (const p of players) expect(st.count(p)).toBe(100);

    read.length = 0;
    await st.wake('B');
    expect(read).toEqual(Array(100).fill('B'));

    const [first, ...rest] = [...offs.keys()].filter((s) => s.playerId === 'A');
    offs.get(first)?.();
    offs.get(first)?.(); // twice: the second does nothing
    expect(st.count('A')).toBe(99);
    expect(st.size).toBe(299);
    st.end(rest[0], 'expired');
    expect(st.count('A')).toBe(98);
    for (const s of rest.slice(1)) offs.get(s)?.();
    expect(st.count('A')).toBe(0);
    expect(st.players()).toEqual(new Set(['B', 'C']));
    read.length = 0;
    await st.wake('A');
    expect(read).toEqual([]);

    st.endAll('C', 'revoked');
    expect(st.players()).toEqual(new Set(['B']));
    expect(st.size).toBe(100);
    // A player that comes back starts a fresh entry.
    st.add(stream('A'));
    expect(st.count('A')).toBe(1);
    expect(st.players()).toEqual(new Set(['A', 'B']));
  });
});
