// `{ seen: key }` names something the game records (#248): a topic with an id is recorded as `topic.<id>`, so the
// positional key `<room>.<actor>.<i>` of the 3.x pages is never true in a schema 3 game. The validator refuses a key
// that nothing records, and names the right one when the key is the old place of a topic, listener or choice.
import { describe, expect, it } from 'vitest';
import { Engine } from '@engine/core/engine';
import { FakePresenter, MemoryStore } from '@engine/core/ports';
import type { Cond, GameDef } from '@engine/core/types';
import { validate } from '@engine/tools/validate';
import { mini, miniLayouts } from './fixtures/mini';

/** The mini game with two topics for the uncle (one with an id), a `once` listener and a `once` choice option. */
function game(): GameDef {
  const g = mini();
  const a = g.rooms[0]!;
  a.talk = {
    uncle: [
      { id: 'ask.key', topic: 'The key?', do: ['Under the mat.'] },
      { topic: 'The weather?', do: ['Grey.'] },
    ],
  };
  a.events = [
    { id: 'bell', on: 'ring', once: true, do: ['Ding.'] },
    { on: 'knock', once: true, do: ['Knock.'] },
    { on: 'shout', do: ['Hey.'] },
  ];
  a.on!.push({
    verb: 'look',
    a: 'valise',
    do: [
      { emit: 'ring' },
      { emit: 'knock' },
      { emit: 'shout' },
      {
        choice: [
          { id: 'open.it', text: 'Open it', once: true, do: [] },
          { text: 'Shake it', once: true, do: [] },
          { text: 'Leave it', do: [] },
        ],
      },
    ],
  });
  return g;
}

/** The validator's errors about `seen` for a rule that reads `key`. */
function seenErrors(g: GameDef, key: string): string[] {
  const c: Cond = { seen: key };
  g.rooms[1]!.on!.push({ verb: 'look', a: 'cadenas', if: c, do: ['Seen.'] });
  return validate(g, miniLayouts).errors.filter((e) => e.includes('seen'));
}

describe('seen keys (#248)', () => {
  it('accepts every key the game records', () => {
    for (const key of ['topic.ask.key', 'a.uncle.1', 'event.bell', 'event.a.1', 'choice.open.it', 'choice.a.Shake it'])
      expect(seenErrors(game(), key), key).toEqual([]);
  });

  it('refuses the positional key of a topic with an id, and names the right one', () => {
    const errs = seenErrors(game(), 'a.uncle.0');
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatch(/"a\.uncle\.0".*topic\.ask\.key/);
  });

  it('refuses the positional key of a listener or a choice option with an id', () => {
    expect(seenErrors(game(), 'event.a.0')[0]).toMatch(/event\.bell/);
    expect(seenErrors(game(), 'choice.a.Open it')[0]).toMatch(/choice\.open\.it/);
  });

  it('refuses a key nothing records: a typo, a listener or an option that is not `once`', () => {
    for (const key of ['topic.ask.keys', 'event.a.2', 'choice.a.Leave it', 'b.uncle.0'])
      expect(seenErrors(game(), key), key).toHaveLength(1);
  });

  it('accepts a Reality signal applied once, not one that applies again', () => {
    const g = game();
    g.reality = {
      signals: [
        { id: 'mail.ok', source: 'mail', availability: 'optional', replay: 'record' },
        { id: 'mail.again', source: 'mail', availability: 'optional', replay: 'record', once: false },
      ],
    };
    expect(seenErrors(structuredClone(g), 'reality.mail.ok')).toEqual([]);
    expect(seenErrors(structuredClone(g), 'reality.mail.again')).toHaveLength(1);
  });

  it('a game-level choice without an id is recorded in whatever room it runs', () => {
    const g = game();
    g.events = [{ on: 'ring', do: [{ choice: [{ text: 'Answer', once: true, do: [] }] }] }];
    expect(seenErrors(g, 'choice.b.Answer')).toEqual([]);
  });

  it('checks the keys a checkpoint marks as seen', () => {
    const g = game();
    g.checkpoints = { talked: { room: 'a', seen: { 'topic.ask.key': 1, 'a.uncle.0': 1 } } };
    const errs = validate(g, miniLayouts).errors.filter((e) => e.includes('seen'));
    expect(errs).toEqual([
      expect.stringMatching(/^checkpoints\.talked\.seen › seen key "a\.uncle\.0".*topic\.ask\.key/),
    ]);
  });

  it('the key it accepts is the one the engine records', async () => {
    const g = game();
    const ui = new FakePresenter();
    ui.picks = [0, 2]; // the key topic, then "Bye"
    const e = new Engine(g, miniLayouts, ui, new MemoryStore());
    await e.newGame();
    await e.script([{ talk: 'uncle' }]);
    expect(e.state.seen['topic.ask.key']).toBe(1);
    expect(e.state.seen['a.uncle.0']).toBeUndefined();
  });
});
