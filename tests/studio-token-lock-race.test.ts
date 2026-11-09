// The CLI's token lock when another run lets it go at the wrong instant (#512): our `open(lock, 'wx')` fails with
// EEXIST, the other run removes the lock, our `stat` finds nothing. That is a free lock to try again, not a crash.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, expect, it, vi } from 'vitest';
import { accessToken } from '../studio-server/src/server/auth/device';

const race = vi.hoisted(() => ({ on: false, write: undefined as undefined | (() => void) }));
vi.mock('node:fs', async (importOriginal) => {
  const fs = await importOriginal<typeof import('node:fs')>();
  const openSync = ((path: string, ...rest: unknown[]) => {
    if (race.on && String(path).endsWith('.lock')) {
      race.on = false;
      throw Object.assign(new Error(`EEXIST: file already exists, open '${path}'`), { code: 'EEXIST' });
    }
    return (fs.openSync as (...a: unknown[]) => number)(path, ...rest);
  }) as typeof fs.openSync;
  // The other run renewed the token, then released its lock between our open and our stat.
  const statSync = ((path: string, o?: object) => {
    if (race.write && String(path).endsWith('.lock')) {
      race.write();
      race.write = undefined;
      return undefined;
    }
    return (fs.statSync as (...a: unknown[]) => unknown)(path, o);
  }) as typeof fs.statSync;
  return { ...fs, default: { ...fs, openSync, statSync }, openSync, statSync };
});

const dir = mkdtempSync(join(tmpdir(), 'studio-token-lock-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

it('a lock released between EEXIST and stat is taken on the next try, and the fresh token is read', async () => {
  const server = 'https://studio.example';
  const file = join(dir, 'tokens.json');
  const saved = (accessToken: string, expiresAt: number) =>
    writeFileSync(
      file,
      JSON.stringify({ [server]: { issuer: 'https://op.example', clientId: 'cli', accessToken, expiresAt } }),
    );
  saved('old', Date.now() + 1000); // under a minute left: the CLI takes the lock to renew it
  race.on = true;
  race.write = () => saved('renewed', Date.now() + 3_600_000);
  await expect(accessToken(server, { file })).resolves.toBe('renewed');
});
