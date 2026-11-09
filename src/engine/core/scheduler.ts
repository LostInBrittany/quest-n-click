// The running loops of the world's scripts (4.1.5, the plan's fourth release): which scripts run on their own, and
// the generations that end them when the room or the session changes. Owned here, where 4.1.0 left `roomGen`,
// `sessionGen` and `loops` as `@internal` fields of the Engine that four modules read and wrote.
import type { Id } from './types';
import type { Engine } from './engine';

export class ScriptScheduler {
  private roomGen = 0;
  private sessionGen = 0;
  /** Each live loop, with the generation that owns it: a relaunch hands it the new one rather than starting a second. */
  private running = new Map<Id, { gen: number }>();

  constructor(private eng: Engine) {}

  /** Whether a script's loop runs right now. */
  has(id: Id): boolean {
    return this.running.has(id);
  }
  get size(): number {
    return this.running.size;
  }

  /** The room changed (its loops end at their next step); with `session`, the game's loops too. */
  next(session: boolean): void {
    this.roomGen++;
    if (session) this.sessionGen++;
  }

  /** Starts the loops of the scripts in scope (auto mode): the room's on each room entry, the game's on a new session. */
  start(session: boolean): void {
    this.next(session);
    if (!this.eng.autoScripts) return;
    for (const def of this.eng.room().scripts ?? []) this.launch(def.id, false);
    // Routes move on the world's clock (4.6.0), not in a loop of their own.
    if (session) for (const def of this.eng.game.scripts ?? []) if (def.do) this.launch(def.id, true);
  }

  /** Starts one script's loop in the current generation (a `startScript` command, auto mode). */
  launch(id: Id, global: boolean): void {
    const gen = global ? this.sessionGen : this.roomGen;
    // A loop still inside a step (a `wait`) goes on in the new generation: a second one would skip a step (#484).
    const live = this.running.get(id);
    if (live) live.gen = gen;
    else void this.loop(id, global, gen);
  }

  /** Ends every loop at its next step, and forgets them (`Engine.destroy`). */
  stopAll(): void {
    this.next(true);
    this.running.clear();
  }

  private async loop(id: Id, global: boolean, gen: number): Promise<void> {
    const eng = this.eng;
    const me = { gen };
    this.running.set(id, me);
    try {
      while (eng.state && !eng.state.done && !eng.destroyed && me.gen === (global ? this.sessionGen : this.roomGen)) {
        let r: Awaited<ReturnType<Engine['advance']>>;
        try {
          r = await eng.advance(id);
        } catch (e) {
          // A script that throws is stopped, and the save says so (`off`): it does not look alive while it is dead.
          const st = eng.state.scripts?.[id];
          if (st) st.off = true;
          eng.onError(e, `script ${id}`);
          return;
        }
        if (r === 'done' || r === 'off') return;
        if (r !== 'ran') await eng.ui.wait(250, false);
      }
    } finally {
      if (this.running.get(id) === me) this.running.delete(id);
    }
  }
}
