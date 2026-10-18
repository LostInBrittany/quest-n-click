// The game's health by revision (4.2.2 PR 3, plan §2.3, G3 and G4). After each confirmed revision the head is
// judged on the processing worker (the validator, then the solver, bounded in time: the guard already refuses an edit
// the validator fails, so what breaks is mostly a game that can no longer be finished), coalesced like the previews (a burst of writes judges its last revision only),
// from a snapshot packed holding the instance's lock, and the verdict is kept with its revision. When the head fails
// where the last judged revision passed, a bisection over the revisions between them (snapshots rebuilt from the
// journal's blobs) finds the first that fails, in ⌈log₂ n⌉ validations: the revision, the operation that made it and
// its files are named, never its author (two reasonable changes can oppose each other; a revision is not a culprit
// person). A failing head after a failing revision keeps the revision found then. A worker away or past its deadline
// records nothing and is tried again later; a solver cut short records nothing either, and is not tried again until
// the next revision: in both cases the state says "unknown", never "valid".
import { EventEmitter } from 'node:events';
import type { SqlDb } from '../../../bridge/src/store-sql';
import type { SolveData, ValidateResult } from '../../../tools/studio/types';
import { packable, packFiles } from '../worker/snapshot';

export interface Broken {
  rev: number;
  what: string;
  paths: string[];
}

export interface HealthState {
  epoch: string;
  head: number;
  /** The last revision judged, its verdict, its first errors; null when none is known yet. */
  rev: number | null;
  ok: boolean | null;
  errors: string[];
  warnings: number;
  /** For a failing revision: the first revision that failed after the last passing one, when it is known. */
  brokenSince: Broken | null;
  /** The revision being judged (or bisected), or null. */
  running: number | null;
  /** Why the head's verdict is unknown (the solver cut short), or null. */
  unknown: string | null;
}

/** A revision's verdict; `unknown` when it cannot be given (the solver cut short): nothing is recorded then. */
export interface Verdict {
  ok: boolean;
  errors: string[];
  warnings: string[];
  ms: number;
  unknown?: string;
}

class UnknownVerdict extends Error {}

/**
 * The verdict made of the validator, then the solver from a new game (a witness, bounded in time): valid when both
 * pass; unknown when the solver was cut short (its time, its states).
 */
export function judgeBy(o: {
  validate: (snapshot: Buffer, at: { epoch: string; rev: number }) => Promise<ValidateResult>;
  solve: (snapshot: Buffer, at: { epoch: string; rev: number }) => Promise<SolveData>;
}): HealthOptions['judge'] {
  return async (snapshot, at) => {
    const v = await o.validate(snapshot, at);
    if (!v.ok) return v;
    const s = await o.solve(snapshot, at);
    if (s.status === 'truncated') return { ...v, unknown: `the solver was cut short (${s.headline})` };
    const errors = [...s.errors, ...(s.exit === 0 ? [] : [s.headline])];
    return { ok: errors.length === 0, errors, warnings: v.warnings, ms: v.ms + s.ms };
  };
}

export interface HealthOptions {
  db: SqlDb;
  journal: {
    filesAt(rev: number, keep?: (path: string) => boolean): Promise<{ path: string; bytes: Buffer }[]>;
    opAt(rev: number): Promise<{ rev: number; what: string; paths: string[] } | undefined>;
  };
  /** The folder packed at its revision, holding the instance's lock. */
  snapshot: () => Promise<{ epoch: string; rev: number; bytes: Buffer }>;
  /** The verdict on a snapshot: the worker's jobs (the validator, then the solver). */
  judge: (snapshot: Buffer, at: { epoch: string; rev: number }) => Promise<Verdict>;
  log?: (line: Record<string, unknown>) => void;
  now?: () => number;
}

const RETRY_MS = 5_000;
const MAX_RETRY_MS = 5 * 60_000;
/** The errors kept with a verdict, and shown: the first few say where to look. */
const KEPT = 5;

interface Row {
  rev: number;
  ok: boolean;
  errors: string[];
  warnings: number;
  culprit: number | null;
}

const rowOf = (r: Record<string, unknown>): Row => ({
  rev: Number(r.rev),
  ok: Number(r.ok) === 1,
  errors: JSON.parse(String(r.errors)) as string[],
  warnings: Number(r.warnings),
  culprit: r.culprit === null || r.culprit === undefined ? null : Number(r.culprit),
});

export class Health {
  /** `changed` (HealthState). */
  readonly events = new EventEmitter();
  private s: HealthState = {
    epoch: '',
    head: 0,
    rev: null,
    ok: null,
    errors: [],
    warnings: 0,
    brokenSince: null,
    running: null,
    unknown: null,
  };
  private wanted = false;
  private running: Promise<void> | null = null;
  private retry?: ReturnType<typeof setTimeout>;
  private retryMs = RETRY_MS;
  private now: () => number;

  constructor(private o: HealthOptions) {
    this.events.setMaxListeners(0);
    this.now = o.now ?? Date.now;
  }

  state(): HealthState {
    return { ...this.s, errors: [...this.s.errors], brokenSince: this.s.brokenSince && { ...this.s.brokenSince } };
  }

  /** Asks for the head's verdict; resolves when the run it joined ends (the tests, the server's start). */
  schedule(): Promise<void> {
    this.wanted = true;
    this.running ??= this.loop().finally(() => {
      this.running = null;
      if (this.wanted) void this.schedule();
    });
    return this.running;
  }

  close() {
    clearTimeout(this.retry);
  }

  private changed() {
    this.events.emit('changed', this.state());
  }

  private async loop() {
    while (this.wanted) {
      this.wanted = false;
      try {
        await this.once();
        this.retryMs = RETRY_MS;
      } catch (e) {
        const message = String((e as Error).message).slice(0, 300);
        this.o.log?.({ event: 'health-failed', message, retryMs: this.retryMs });
        clearTimeout(this.retry);
        this.retry = setTimeout(() => void this.schedule(), this.retryMs);
        this.retry.unref?.();
        this.retryMs = Math.min(this.retryMs * 2, MAX_RETRY_MS);
      } finally {
        if (this.s.running !== null) {
          this.s.running = null;
          this.changed();
        }
      }
    }
  }

  private async row(epoch: string, rev: number): Promise<Row | undefined> {
    const [r] = await this.o.db.all('SELECT * FROM studio_health WHERE epoch = $1 AND rev = $2', [epoch, rev]);
    return r ? rowOf(r) : undefined;
  }

  private async record(epoch: string, rev: number, v: Verdict, culprit: number | null) {
    await this.o.db.run(
      'INSERT INTO studio_health (epoch, rev, ok, errors, warnings, culprit, ms, made_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT DO NOTHING',
      [epoch, rev, v.ok ? 1 : 0, JSON.stringify(v.errors.slice(0, KEPT)), v.warnings.length, culprit, v.ms, this.now()],
    );
  }

  private async show(epoch: string, head: number, r: Row) {
    const op = r.ok || r.culprit === null ? undefined : await this.o.journal.opAt(r.culprit);
    this.s = {
      epoch,
      head,
      rev: r.rev,
      ok: r.ok,
      errors: r.errors,
      warnings: r.warnings,
      brokenSince: op ? { rev: op.rev, what: op.what, paths: op.paths } : null,
      running: null,
      unknown: null,
    };
    this.changed();
  }

  private async once() {
    const snap = await this.o.snapshot();
    if (snap.epoch !== this.s.epoch)
      this.s = { ...this.s, epoch: snap.epoch, rev: null, ok: null, brokenSince: null, unknown: null };
    this.s.head = snap.rev;
    const known = await this.row(snap.epoch, snap.rev);
    if (known) return this.show(snap.epoch, snap.rev, known);
    this.s.running = snap.rev;
    this.changed();
    const v = await this.o.judge(snap.bytes, { epoch: snap.epoch, rev: snap.rev });
    if (v.unknown) {
      this.s = { ...this.s, rev: snap.rev, ok: null, errors: [], warnings: 0, brokenSince: null, unknown: v.unknown };
      this.o.log?.({ event: 'health', rev: snap.rev, unknown: v.unknown });
      return this.changed();
    }
    let culprit: number | null = null;
    if (!v.ok) {
      const [p] = await this.o.db.all(
        'SELECT * FROM studio_health WHERE epoch = $1 AND rev < $2 ORDER BY rev DESC LIMIT 1',
        [snap.epoch, snap.rev],
      );
      const prev = p ? rowOf(p) : undefined;
      // Broken since a passing revision: the first failing one between them. Already failing: the same one.
      // A revision between them whose verdict is unknown stops the search: no revision is named.
      if (prev?.ok)
        culprit = await this.bisect(snap.epoch, prev.rev, snap.rev).catch((e) => {
          if (e instanceof UnknownVerdict) return null;
          throw e;
        });
      else if (prev) culprit = prev.culprit;
    }
    await this.record(snap.epoch, snap.rev, v, culprit);
    this.o.log?.({ event: 'health', rev: snap.rev, ok: v.ok, culprit, ms: v.ms });
    await this.show(snap.epoch, snap.rev, {
      rev: snap.rev,
      ok: v.ok,
      errors: v.errors.slice(0, KEPT),
      warnings: v.warnings.length,
      culprit,
    });
  }

  /** A past revision's verdict: kept, or judged on its snapshot rebuilt from the journal (and kept). */
  private async judge(epoch: string, rev: number): Promise<boolean> {
    const known = await this.row(epoch, rev);
    if (known) return known.ok;
    const v = await this.o.judge(packFiles(await this.o.journal.filesAt(rev, (p) => packable(p))), { epoch, rev });
    if (v.unknown) throw new UnknownVerdict(`revision ${rev}: ${v.unknown}`);
    await this.record(epoch, rev, v, null);
    return v.ok;
  }

  /**
   * The first revision in (`good`, `bad`] whose validation fails, given that `good` passes and `bad` fails:
   * ⌈log₂ (bad − good)⌉ validations at most, fewer with revisions already judged.
   */
  async bisect(epoch: string, good: number, bad: number): Promise<number> {
    let lo = good;
    let hi = bad;
    while (hi - lo > 1) {
      const mid = lo + Math.floor((hi - lo) / 2);
      this.s.running = mid;
      this.changed();
      if (await this.judge(epoch, mid)) lo = mid;
      else hi = mid;
    }
    return hi;
  }

  /**
   * A bisection asked for (POST /api/health/bisect): `good` must pass and `bad` fail, both judged here first.
   * Returns the revision found, with its operation.
   */
  async bisectOn(good: number, bad: number): Promise<Broken | { error: string }> {
    const epoch = this.s.epoch || (await this.o.snapshot()).epoch;
    if (!(Number.isSafeInteger(good) && Number.isSafeInteger(bad) && 0 <= good && good < bad))
      return { error: '`good` and `bad` are revisions, `good` before `bad`' };
    try {
      if (!(await this.judge(epoch, good))) return { error: `revision ${good} does not pass` };
      if (await this.judge(epoch, bad)) return { error: `revision ${bad} passes` };
      const rev = await this.bisect(epoch, good, bad);
      const op = await this.o.journal.opAt(rev);
      return { rev, what: op?.what ?? '', paths: op?.paths ?? [] };
    } catch (e) {
      if (e instanceof UnknownVerdict) return { error: `${e.message}: no revision can be named` };
      throw e;
    } finally {
      this.s.running = null;
      this.changed();
    }
  }
}
