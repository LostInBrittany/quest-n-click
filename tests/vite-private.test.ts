// A game's private/ (raw sheets, the real ending's configuration) is never served by the dev server (#477): LAN mode
// puts that server on the network, and the Studio's token guards only its own routes.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';

const dir = resolve('games/demo/private');
const probe = resolve(dir, 'vite-private-probe.txt');
let server: ViteDevServer;
let base = '';

beforeAll(async () => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(probe, 'SECRET');
  server = await createServer({ configFile: resolve('vite.config.ts'), server: { port: 0, host: '127.0.0.1' } });
  await server.listen();
  base = server.resolvedUrls!.local[0]!.replace(/\/$/, '');
}, 60_000);

afterAll(async () => {
  await server?.close();
  rmSync(probe, { force: true });
});

describe("the dev server and a game's private/", () => {
  it.each([
    '/games/demo/private/vite-private-probe.txt',
    '/games/demo/%70rivate/vite-private-probe.txt',
    '/games/demo/private/vite-private-probe.txt?raw',
    `/@fs${probe.replace(/\\/g, '/').replace(/^(?!\/)/, '/')}`,
  ])('refuses %s', async (path) => {
    const r = await fetch(base + path);
    expect(await r.text()).not.toContain('SECRET');
    expect(r.status).toBeGreaterThanOrEqual(400);
  });
});
