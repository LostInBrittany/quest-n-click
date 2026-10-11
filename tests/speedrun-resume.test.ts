// A run resumed after the page was closed (4.1.14 "Time Attack", ADR 0016): the recorder wrote a chunk every 500
// entries; a fresh engine resumes from the last chunk that checks (its state, clock and draws), the inputs after it are
// played again, and the sealed run still verifies: the resume is a load of the run's own state, never a reload.
import { describe, expect, it } from 'vitest';
import { Engine } from '@engine/core/engine';
import { CHUNK_SIZE, MemoryChunkStore, readRun } from '@engine/core/journal-chunks';
import { FakePresenter, MemoryStore } from '@engine/core/ports';
import { storyWorld } from '@engine/core/remix/story';
import { RunStartRefused, SpeedrunRecorder } from '@engine/tools/speedrun/recorder';
import { verifyRun } from '@engine/tools/speedrun/verify';
import { ROUTE, speedrunGame, speedrunLayouts } from './fixtures/speedrun-game';
import { ENGINE_VERSION, fixtureFingerprint, verifyContext } from './fixtures/speedrun-run';

describe('resume after a crash', () => {
  it('a fresh engine resumes from the last stored chunk; the run verifies', async () => {
    const game = speedrunGame();
    const fingerprint = await fixtureFingerprint(game);
    const store = new MemoryChunkStore();
    const opts = (engine: Engine) => ({
      engine,
      gameId: game.id,
      manifest: game.speedrun!,
      category: game.speedrun!.categories.find((c) => c.id === 'no-hints')!,
      store,
      fingerprint,
      engineVersion: ENGINE_VERSION,
      runId: 'crash-run',
      now: () => 0,
    });
    const first = new Engine(speedrunGame(), speedrunLayouts, new FakePresenter(), new MemoryStore());
    const rec = new SpeedrunRecorder(opts(first));
    await rec.start();
    for (let i = 0; i < CHUNK_SIZE + 40; i++) await first.act({ verb: 'look', a: 'desk' });
    await rec.flushed();
    // The page closes: nothing sealed, the 40 inputs after the first chunk are lost.
    const stored = (await readRun(store, 'crash-run'))!;
    expect(stored.chunks).toHaveLength(1);
    expect(stored.head.sealed).toBeUndefined();
    const second = new Engine(speedrunGame(), speedrunLayouts, new FakePresenter(), new MemoryStore());
    // 4.1.16: the stored chunk keeps the run's world; resuming in another world is refused, in its own is not.
    const own = storyWorld(game.remix);
    expect(stored.head.resume).toMatchObject({ world: { variant: { hash: own.hash } }, runSeed: rec.seed });
    const elsewhere = { ...own, seed: 'WS-0000-0000', hash: 'f'.repeat(64) };
    await expect(
      SpeedrunRecorder.resume({ ...opts(second), runId: 'crash-run', variant: elsewhere }),
    ).rejects.toBeInstanceOf(RunStartRefused);
    const again = (await SpeedrunRecorder.resume({ ...opts(second), runId: 'crash-run' }))!;
    expect(again).not.toBeNull();
    expect(second.runClock.logicalSteps()).toBe(BigInt(CHUNK_SIZE));
    for (const a of ROUTE) await second.act({ ...a });
    const envelope = await again.seal();
    expect(envelope.loads).toEqual([{ before: CHUNK_SIZE, from: CHUNK_SIZE - 1, resume: true }]);
    expect(envelope.chunks.map((c) => c.entries.length)).toEqual([CHUNK_SIZE, ROUTE.length]);
    // A resume is not a reload: the category where a load disqualifies still accepts it.
    const r = await verifyRun(envelope, verifyContext(fingerprint, game));
    expect([r.verdict, r.code]).toEqual(['valid', 'ok']);
  }, 60000);

  it('the live RTA after a resume: from where the chunk closed once started, 0 until a later start (4.1.19)', async () => {
    // A category that starts late (on the key), so a chunk can close before the run has started.
    const game = speedrunGame();
    const late = {
      ...game.speedrun!.categories[0]!,
      id: 'late',
      start: { event: 'itemAcquired', item: 'key' },
    } as const;
    game.speedrun = { ...game.speedrun!, categories: [...game.speedrun!.categories, late] };
    const fingerprint = await fixtureFingerprint(game);
    const store = new MemoryChunkStore();
    let clock = 1_000;
    const opts = (engine: Engine, runId: string) => ({
      engine,
      gameId: game.id,
      manifest: game.speedrun!,
      category: late,
      store,
      fingerprint,
      engineVersion: ENGINE_VERSION,
      runId,
      now: () => clock,
    });
    const engine = () => new Engine(structuredClone(game), speedrunLayouts, new FakePresenter(), new MemoryStore());
    // Not started when the chunk closed: 0 after the resume, however long the page stayed closed, until the start.
    const first = engine();
    const rec = new SpeedrunRecorder(opts(first, 'late-run'));
    await rec.start();
    for (let i = 0; i < CHUNK_SIZE; i++) {
      clock += 1;
      await first.act({ verb: 'look', a: 'desk' });
    }
    await rec.flushed();
    expect(rec.rtaMs()).toBe(0);
    clock = 3_600_000;
    const second = engine();
    const resumed = (await SpeedrunRecorder.resume(opts(second, 'late-run')))!;
    clock += 5_000;
    expect(resumed.rtaMs()).toBe(0);
    await second.act({ verb: 'take', a: 'desk' });
    // The start is read when its entry's link closes: with the next entry.
    await second.act({ verb: 'look', a: 'desk' });
    clock += 700;
    expect(resumed.rtaMs()).toBe(700);
    // Started when the chunk closed: the RTA goes on from there, the hour the page stayed closed not counted.
    const third = engine();
    const started = new SpeedrunRecorder(opts(third, 'started-run'));
    await started.start();
    await third.act({ verb: 'take', a: 'desk' });
    for (let i = 1; i < CHUNK_SIZE; i++) {
      clock += 1;
      await third.act({ verb: 'look', a: 'desk' });
    }
    await started.flushed();
    const closed = ((await readRun(store, 'started-run'))!.head.resume as { rtaMs: number }).rtaMs;
    expect(closed).toBeGreaterThan(0);
    clock += 3_600_000;
    const fourth = engine();
    expect((await SpeedrunRecorder.resume(opts(fourth, 'started-run')))!.rtaMs()).toBe(closed);
    // The start in the very link that closes a chunk (second reading of this PR): the chunk's head was written before
    // the start was read, but the tape holds it, so the resumed run counts (it used to stay at 0 for good).
    const fifth = engine();
    const edge = new SpeedrunRecorder(opts(fifth, 'edge-run'));
    await edge.start();
    for (let i = 0; i < CHUNK_SIZE - 2; i++) await fifth.act({ verb: 'look', a: 'desk' });
    await fifth.act({ verb: 'take', a: 'desk' });
    await fifth.act({ verb: 'look', a: 'desk' });
    await edge.flushed();
    const head = (await readRun(store, 'edge-run'))!;
    expect(head.chunks).toHaveLength(1);
    expect(head.chunks[0]!.links.at(-1)!.events.some((e) => e.kind === 'itemAcquired')).toBe(true);
    const sixth = engine();
    const atEdge = (await SpeedrunRecorder.resume(opts(sixth, 'edge-run')))!;
    clock += 300;
    expect(atEdge.rtaMs()).toBeGreaterThanOrEqual(300);
  }, 60000);

  it('a sealed or unknown run is not resumed', async () => {
    const store = new MemoryChunkStore();
    const game = speedrunGame();
    const engine = new Engine(game, speedrunLayouts, new FakePresenter(), new MemoryStore());
    const r = await SpeedrunRecorder.resume({
      engine,
      gameId: 'vault',
      manifest: game.speedrun!,
      category: game.speedrun!.categories[0]!,
      store,
      fingerprint: await fixtureFingerprint(game),
      engineVersion: ENGINE_VERSION,
      runId: 'none',
    });
    expect(r).toBeNull();
  });
});
