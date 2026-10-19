// A revision's preview, and a snapshot's verdict, made on this machine (4.2.2): the tests' and the e2e stack's stand-in
// for the processing worker. The same child as the worker's (child.ts: an emptied environment, its own process group, a deadline), on
// the same snapshot; only the transport differs. A Studio Server never uses it: with OIDC the game's code runs on the
// worker (ADR 0028), and without OIDC there is no game origin.
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { JOBS, runChild } from './main';
import { PreviewBuildFailed, type PreviewParams, previewFiles } from './preview-build';
import { type Prepared, preparedShape } from './prepare';
import { unpackSnapshot } from './snapshot';
import type { ValidateResult } from '../../../tools/studio/types';

export async function localPreview(
  snapshot: Buffer,
  params: PreviewParams,
  timeoutMs = 120_000,
): Promise<Map<string, Buffer>> {
  mkdirSync(JOBS, { recursive: true });
  const dir = mkdtempSync(join(JOBS, 'preview-'));
  try {
    unpackSnapshot(snapshot, dir);
    const r = await runChild(dir, timeoutMs, 'preview', undefined, { ...params });
    if (r.timedOut) throw new Error(`the game's code did not finish within ${timeoutMs} ms`);
    let files: Record<string, string> | undefined;
    try {
      files = previewFiles((JSON.parse(r.out) as { files?: unknown }).files);
    } catch {
      files = undefined;
    }
    if (!files) throw new PreviewBuildFailed(`the preview does not build (exit ${r.code})`);
    return new Map(Object.entries(files).map(([k, b]) => [k, Buffer.from(b, 'base64')]));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The validator's verdict on a snapshot, in the same child (the tests' and the e2e stack's health, 4.2.2). */
export async function localValidate(snapshot: Buffer, timeoutMs = 60_000): Promise<ValidateResult> {
  mkdirSync(JOBS, { recursive: true });
  const dir = mkdtempSync(join(JOBS, 'validate-'));
  const t0 = Date.now();
  try {
    unpackSnapshot(snapshot, dir);
    const r = await runChild(dir, timeoutMs, 'validate');
    if (r.timedOut) throw new Error(`the game's code did not finish within ${timeoutMs} ms`);
    const v = JSON.parse(r.out) as { errors: string[]; warnings: string[] };
    return { ok: v.errors.length === 0, errors: v.errors, warnings: v.warnings, ms: Date.now() - t0 };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** A diagnostic on a snapshot, in the same child (the e2e stack's health: the solver after the validator). */
export async function localDiagnose(
  kind: 'lint' | 'solve' | 'playtests',
  snapshot: Buffer,
  params: Record<string, unknown>,
  timeoutMs = 60_000,
): Promise<unknown> {
  mkdirSync(JOBS, { recursive: true });
  const dir = mkdtempSync(join(JOBS, `${kind}-`));
  try {
    unpackSnapshot(snapshot, dir);
    const r = await runChild(dir, timeoutMs, kind, undefined, { ...params, timeoutMs });
    if (r.timedOut) throw new Error(`the game's code did not finish within ${timeoutMs} ms`);
    const v = JSON.parse(r.out) as { data?: unknown; error?: string };
    if (!v.data) throw new Error(v.error ?? 'the diagnostic gave no answer');
    return v.data;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The asset tools' `prepare` on a version 2 snapshot, in the same child (the e2e stack's "Prepare assets"). */
export async function localPrepare(snapshot: Buffer, game: string, timeoutMs = 120_000): Promise<Prepared> {
  mkdirSync(JOBS, { recursive: true });
  const dir = mkdtempSync(join(JOBS, 'prepare-'));
  try {
    unpackSnapshot(snapshot, dir);
    const r = await runChild(dir, timeoutMs, 'prepare', undefined, { game, systemPath: process.env.PATH ?? '' });
    if (r.timedOut) throw new Error(`the asset tools did not finish within ${timeoutMs} ms`);
    const v = JSON.parse(r.out) as { data?: unknown; error?: string };
    if (!v.data) throw new Error(v.error ?? 'prepare gave no answer');
    const p = preparedShape(v.data);
    if ('refused' in p) throw new Error(`the prepared assets are refused: ${p.refused}`);
    return p;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
