// `npm run ids -- --write` rewrites the positional `seen` keys of the sources it writes (#359): a `{ seen: key }`
// condition or a checkpoint's `seen` key that names the old place of a topic, a `once` listener or a `once` choice
// option becomes the id-based key the engine records once that thing has an id (`topic.<id>`, `event.<id>`,
// `choice.<id>`); the dry run lists each one. Strings that only look like keys, and keys nothing renames, stay.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assignIds } from '@engine/core/content-ids';
import type { GameDef } from '@engine/core/types';
import { movedSeenKeys } from '@engine/tools/validate/seen';
import { planIds } from '../tools/ids/plan';
import { renameSeenKeysInSource } from '../tools/ids/seen-keys';
import { mini } from './fixtures/mini';

const ROOM_A = `import { defineRoom } from '@engine/core/define';

export default defineRoom({
  id: 'a',
  name: 'A',
  decor: 'd/a',
  on: [
    { verb: 'look', a: 'valise', do: [{ choice: [{ text: 'Shake it', once: true, do: [] }, { text: 'Leave it', do: [] }] }] },
  ],
  talk: {
    uncle: [
      { id: 'ask.key', topic: 'The key?', do: ['Under the mat.'] },
      { topic: 'The weather?', do: ['Grey.'] },
    ],
  },
  events: [{ on: 'knock', once: true, do: ['Knock.'] }],
});
`;

const ROOM_B = `import { defineRoom } from '@engine/core/define';

export default defineRoom({
  id: 'b',
  name: 'B',
  decor: 'd/b',
  on: [
    { verb: 'look', a: 'cadenas', if: { seen: 'a.uncle.0' }, do: ['The uncle told me.'] },
    { verb: 'look', a: 'cadenas', if: { not: { seen: "a.uncle.1" } }, do: ['a.uncle.1', { set: 'a.uncle.1' }] },
    { verb: 'look', a: 'cadenas', if: { all: [{ seen: 'event.a.0' }, { seen: 'choice.a.Shake it' }] }, do: ['Both.'] },
    { verb: 'look', a: 'cadenas', if: { seen: 'a.nobody.0' }, do: ['Nobody.'] },
  ],
});
`;

const GAME = `import { defineGame } from '@engine/core/define';

export default defineGame({
  id: 'mini',
  events: [{ on: 'ring', once: true, do: ['Ding.'] }],
  checkpoints: {
    late: { room: 'b', seen: { 'a.uncle.1': 1, "event.game.0": 1, 'topic.ask.key': 1, 'other.key': 1 } },
  },
});
`;

/** The mini game as the sources above load: the uncle's first topic already has an id, nothing else has one. */
function game(): GameDef {
  const g = mini();
  const [a, b] = g.rooms as [GameDef['rooms'][0], GameDef['rooms'][0]];
  a.on = [
    {
      verb: 'look',
      a: 'valise',
      do: [
        {
          choice: [
            { text: 'Shake it', once: true, do: [] },
            { text: 'Leave it', do: [] },
          ],
        },
      ],
    },
  ];
  a.talk = {
    uncle: [
      { id: 'ask.key', topic: 'The key?', do: ['Under the mat.'] },
      { topic: 'The weather?', do: ['Grey.'] },
    ],
  };
  a.events = [{ on: 'knock', once: true, do: ['Knock.'] }];
  b.on = [
    { verb: 'look', a: 'cadenas', if: { seen: 'a.uncle.0' }, do: ['The uncle told me.'] },
    { verb: 'look', a: 'cadenas', if: { not: { seen: 'a.uncle.1' } }, do: ['a.uncle.1', { set: 'a.uncle.1' }] },
    {
      verb: 'look',
      a: 'cadenas',
      if: { all: [{ seen: 'event.a.0' }, { seen: 'choice.a.Shake it' }] },
      do: ['Both.'],
    },
    { verb: 'look', a: 'cadenas', if: { seen: 'a.nobody.0' }, do: ['Nobody.'] },
  ];
  g.events = [{ on: 'ring', once: true, do: ['Ding.'] }];
  g.checkpoints = {
    late: { room: 'b', seen: { 'a.uncle.1': 1, 'event.game.0': 1, 'topic.ask.key': 1, 'other.key': 1 } },
  };
  return g;
}

function gameDir(files: Record<string, string> = { 'rooms/a.ts': ROOM_A, 'rooms/b.ts': ROOM_B, 'game.ts': GAME }) {
  const dir = mkdtempSync(join(tmpdir(), 'qnc-ids-seen-'));
  mkdirSync(join(dir, 'rooms'));
  for (const [f, text] of Object.entries(files)) writeFileSync(join(dir, f), text);
  return dir;
}

/** A result's file, written with `/` (the plan joins paths with the platform's separator: `\` on Windows). */
const at = (file: string, f: string) => file.endsWith(join(...f.split('/')));
const codeOf = (plan: ReturnType<typeof planIds>, f: string) => plan.results.find((x) => at(x.file, f))?.r.code ?? '';
const seenOf = (plan: ReturnType<typeof planIds>, f: string) =>
  (plan.results.find((x) => at(x.file, f))?.seen ?? []).map((s) => `${s.from} → ${s.to}`);

describe('npm run ids rewrites the positional seen keys (#359)', () => {
  it('lists, in the dry run, each condition key the migration renames, the topic that already had an id included', () => {
    const plan = planIds(gameDir(), game());
    const topic1 = plan.map.seen['a.uncle.1']!;
    const knock = plan.map.seen['event.a.0']!;
    const shake = plan.map.seen['choice.a.Shake it']!;
    expect([topic1, knock, shake].every((k) => /^(topic|event|choice)\./.test(k))).toBe(true);
    expect(seenOf(plan, 'rooms/b.ts')).toEqual([
      'a.uncle.0 → topic.ask.key',
      `a.uncle.1 → ${topic1}`,
      `event.a.0 → ${knock}`,
      `choice.a.Shake it → ${shake}`,
    ]);
    expect(plan.results.find((x) => at(x.file, 'rooms/b.ts'))!.seen.map((s) => s.line)).toEqual([8, 9, 10, 10]);
  });

  it("rewrites the condition keys with the file's quotes, and leaves texts, flags and unknown keys alone", () => {
    const plan = planIds(gameDir(), game());
    const code = codeOf(plan, 'rooms/b.ts');
    expect(code).toContain(`if: { seen: 'topic.ask.key' }`);
    expect(code).toContain(`if: { not: { seen: "${plan.map.seen['a.uncle.1']}" } }`);
    expect(code).toContain(
      `{ seen: '${plan.map.seen['event.a.0']}' }, { seen: '${plan.map.seen['choice.a.Shake it']}' }`,
    );
    expect(code).toContain(`do: ['a.uncle.1', { set: 'a.uncle.1' }]`);
    expect(code).toContain(`if: { seen: 'a.nobody.0' }`);
  });

  it("rewrites a checkpoint's seen keys, keeping the ones nothing renames", () => {
    const plan = planIds(gameDir(), game());
    const ring = plan.map.seen['event.game.0']!;
    expect(ring).toMatch(/^event\./);
    expect(seenOf(plan, 'game.ts')).toEqual([`a.uncle.1 → ${plan.map.seen['a.uncle.1']}`, `event.game.0 → ${ring}`]);
    expect(codeOf(plan, 'game.ts')).toContain(
      `seen: { '${plan.map.seen['a.uncle.1']}': 1, "${ring}": 1, 'topic.ask.key': 1, 'other.key': 1 }`,
    );
  });

  it('changes nothing on a second run', () => {
    const first = planIds(gameDir(), game());
    const files = Object.fromEntries(
      ['rooms/a.ts', 'rooms/b.ts', 'game.ts'].map((f) => [f, codeOf(first, f)] as const),
    );
    // The game as it loads after the first run: the same content, with the ids that run wrote.
    const again = planIds(gameDir(files), assignIds(game()).game);
    for (const f of Object.keys(files)) {
      expect(seenOf(again, f), f).toEqual([]);
      expect(codeOf(again, f), f).toBe(files[f]);
    }
  });

  it('knows the old place of every topic, once listener and once room choice option with an id', () => {
    const g = game();
    g.rooms[0]!.talk!.uncle![1]!.id = 'weather';
    g.rooms[0]!.events![0]!.id = 'knock';
    (g.rooms[0]!.on![0]!.do[0] as { choice: { id?: string }[] }).choice[0]!.id = 'shake';
    g.events![0]!.id = 'ring';
    expect(Object.fromEntries(movedSeenKeys(g))).toEqual({
      'a.uncle.0': 'topic.ask.key',
      'a.uncle.1': 'topic.weather',
      'event.a.0': 'event.knock',
      'choice.a.Shake it': 'choice.shake',
      'event.game.0': 'event.ring',
    });
  });

  it('touches only `seen` values and the keys of a `seen` object', () => {
    const src = `const x = { seen: 'k', say: 'k', k: 1, list: { seen: { k: 1, 'k': 1, j: 1 } }, other: { 'k': 1 } };\n`;
    const out = renameSeenKeysInSource(src, new Map([['k', 'topic.k']]), 'x.ts');
    expect(out.code).toBe(
      `const x = { seen: 'topic.k', say: 'k', k: 1, list: { seen: { 'topic.k': 1, 'topic.k': 1, j: 1 } }, other: { 'k': 1 } };\n`,
    );
    expect(out.renamed).toHaveLength(3);
  });
});
