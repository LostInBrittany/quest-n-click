// A revision's preview built on this machine (4.2.2 PR 2): the tests' and the e2e stack's stand-in for the processing
// worker. The same child as the worker's (child.ts: an emptied environment, its own process group, a deadline), on
// the same snapshot; only the transport differs. A Studio Server never uses it: with OIDC the game's code runs on the
// worker (ADR 0028), and without OIDC there is no game origin.
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { JOBS, runChild } from './main';
import { PreviewBuildFailed, type PreviewParams, previewFiles } from './preview-build';
import { unpackSnapshot } from './snapshot';

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
