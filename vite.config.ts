/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { VitePWA } from 'vite-plugin-pwa';
import { GAME, GAME_DIR, PROJECT } from './tools/game.ts';
import { studioPlugin } from './tools/studio/plugin.ts';
import { assetsVersion, BASE, sealBuild, sitePlugin, studioDemo } from './tools/vite/plugins.ts';
import { engineVersion, trustedExtensionsHash } from './tools/extensions.ts';
import { DurationSequencer } from './tools/unit-shards.ts';
import { coverageThresholds } from './tools/coverage-floors.ts';

// The engine's own files by their real path (4.1.18): Windows' 8.3 short names would leave the page and its root apart.
const r = (p: string) => {
  const f = fileURLToPath(new URL(p, import.meta.url));
  if (!existsSync(f)) return f;
  const real = realpathSync.native(f);
  // A folder named with its trailing separator keeps it (`TOOLS_DIR` is compared as a prefix).
  return /[\\/]$/.test(f) && !/[\\/]$/.test(real) ? real + sep : real;
};

/**
 * A module only the Studio (src/studio, the repository's tools/) or the dev tools (src/engine/dev, tweakpane) load:
 * its chunks go under assets/tools/, which the service worker does not precache. Everything the game itself can
 * import must stay out of this set, or the game breaks offline: src/engine/tools/i18n (locales at runtime) and zod
 * (the save envelope). A chunk shared by the game and the Studio is only moved when every module in it is a tool.
 */
const TOOLS_DIR = r('./tools/');
const isToolModule = (id: string) => {
  if (id.startsWith(TOOLS_DIR)) return true;
  if (/[\\/]src[\\/]engine[\\/]tools[\\/](i18n|replay)\.ts$/.test(id)) return false; // the game's locales, the player's session export
  return /[\\/](src[\\/]studio|src[\\/]engine[\\/]dev|src[\\/]engine[\\/]tools|node_modules[\\/](@tweakpane|tweakpane))[\\/]/.test(
    id,
  );
};

/**
 * The image route's last resort (#257): Firefox's worker now and then fails a cached image offline ("A ServiceWorker
 * intercepted the request and encountered an unexpected error"), the file in the cache. When the strategy throws, the
 * worker looks the request up in every cache before giving up, and tells the open pages why it failed (a
 * `qnc-sw-error` message: the e2e test prints it, the game ignores it). Copied into the worker as text by workbox:
 * nothing from this file's scope.
 */
const imageLastResort = {
  handlerDidError: async ({ request, error }: { request: Request; error?: unknown }) => {
    const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    const hit = await caches.match(request).catch(() => undefined);
    const sw = self as unknown as {
      clients: { matchAll(o: object): Promise<{ postMessage(m: unknown): void }[]> };
    };
    const pages = await sw.clients.matchAll({ includeUncontrolled: true }).catch(() => []);
    for (const p of pages) p.postMessage({ type: 'qnc-sw-error', url: request.url, reason, recovered: !!hit });
    return hit;
  },
};

/** The Reality Bridge's player code (4.1.1): its own chunk, under assets/reality/. */
const isRealityModule = (id: string) =>
  /[\\/]src[\\/]engine[\\/](reality[\\/]|dom[\\/]reality-ui\.ts|core[\\/]reality-runtime\.ts)/.test(id);
/**
 * Whether the game declares `reality` (a `reality:` key in its sources): a game that does not never downloads the
 * Reality chunk, not even into the offline cache. A false positive (the word in a comment) only precaches it.
 */
const gameUsesReality = (() => {
  const walk = (d: string): string[] =>
    existsSync(d)
      ? readdirSync(d, { withFileTypes: true }).flatMap((e) =>
          e.isDirectory()
            ? e.name === 'tests'
              ? []
              : walk(join(d, e.name))
            : e.name.endsWith('.ts')
              ? [join(d, e.name)]
              : [],
        )
      : [];
  return walk(GAME_DIR).some((f) => /\breality\s*:/.test(readFileSync(f, 'utf8')));
})();

/**
 * The hosted Studio's page alone (4.2.1, `npm run studio-client`): studio.html and its code, no game, no public files,
 * no service worker. The Studio Server serves it (studio-server/src/server/client.ts).
 */
const STUDIO_CLIENT = process.env.STUDIO_CLIENT === '1';
// A game's private/ (raw sheets, the real ending's configuration) is never served, LAN mode included (#477). Setting
// the list replaces Vite's defaults, so they are repeated.
const DENY = [
  '.env',
  '.env.*',
  '*.{crt,pem,key,p12,pfx,cer,der}',
  '.npmrc',
  '.yarnrc.yml',
  '**/.git/**',
  '**/private/**',
];

export default defineConfig({
  // The engine's pages (index.html, studio.html) are next to this file, wherever it is installed.
  root: r('.'),
  base: BASE,
  // The fingerprint's parts the player cannot compute from the content (4.1.12, ADR 0013): the hash of the game's
  // trusted extensions and the engine's version, the same values `sealBuild` writes into the built site.json.
  define: {
    __ASSETS_VERSION__: JSON.stringify(assetsVersion()),
    __GAME__: JSON.stringify(GAME),
    __TRUSTED_EXTENSIONS__: JSON.stringify(trustedExtensionsHash(GAME_DIR)),
    __ENGINE_VERSION__: JSON.stringify(engineVersion()),
  },
  ...(STUDIO_CLIENT ? { publicDir: false as const } : {}),
  plugins: STUDIO_CLIENT
    ? []
    : [
        sitePlugin(),
        studioPlugin(),
        studioDemo(),
        sealBuild(),
        // Service worker: the app is cached on install, images and sounds on first use (then served without network).
        VitePWA({
          registerType: 'prompt',
          injectRegister: false,
          manifest: false,
          workbox: {
            globPatterns: ['**/*.{js,css,html,ttf,webmanifest}', 'icons/*.png'],
            // assets/tools/: the Studio and the dev tools (STUDIO=1 builds), never needed by a player offline.
            globIgnores: [
              'assets/img/**',
              'assets/audio/**',
              'assets/video/**',
              'data/**',
              'assets/tools/**',
              'studio-demo/**',
              'fonts/**',
              ...(gameUsesReality ? [] : ['assets/reality/**']),
            ],
            navigateFallback: 'index.html',
            // The documentation beside the game (/docs/, 4.5.0) and the pages a game publishes beside itself (pages/:
            // a read-only storyboard, 4.5.5): the worker never answers them with the game.
            navigateFallbackDenylist: [/\/docs\//].concat([/\/pages\//]),
            cleanupOutdatedCaches: true,
            // The worker claims the page at its first activation (the warm-up's fetches must pass through it to be cached);
            // an update never activates on its own: the banner asks, after a durable save (dom/update.ts).
            clientsClaim: true,
            skipWaiting: false,
            runtimeCaching: [
              {
                urlPattern: /\/assets\/img\//,
                handler: 'CacheFirst',
                options: {
                  cacheName: 'jeu-images',
                  expiration: { maxEntries: 2000, maxAgeSeconds: 90 * 86400 },
                  cacheableResponse: { statuses: [0, 200] },
                  plugins: [imageLastResort],
                },
              },
              {
                urlPattern: /\/assets\/audio\//,
                handler: 'CacheFirst',
                options: {
                  cacheName: 'jeu-sons',
                  rangeRequests: true,
                  expiration: { maxEntries: 600, maxAgeSeconds: 90 * 86400 },
                  cacheableResponse: { statuses: [200] },
                },
              },
              {
                urlPattern: /\/assets\/video\//,
                handler: 'CacheFirst',
                options: {
                  cacheName: 'jeu-videos',
                  rangeRequests: true,
                  expiration: { maxEntries: 10 },
                  cacheableResponse: { statuses: [200] },
                },
              },
              // public/fonts: the full fonts behind a subset (DotGothic16), cached the first time a character needs them.
              {
                urlPattern: /\/fonts\//,
                handler: 'CacheFirst',
                options: {
                  cacheName: 'jeu-polices',
                  expiration: { maxEntries: 10 },
                  cacheableResponse: { statuses: [200] },
                },
              },
              {
                urlPattern: /\/data\//,
                handler: 'NetworkFirst',
                options: { cacheName: 'jeu-donnees', networkTimeoutSeconds: 4 },
              },
            ],
          },
        }),
      ],
  // File-writing Studio routes are intentionally loopback-only by default. `npm run dev:lan` / `studio:lan` opt in
  // to LAN access (the Studio adds an authentication token in that mode).
  server: { port: 5173, host: process.env.WEB_SCUMM_LAN === '1' ? true : '127.0.0.1', fs: { deny: DENY } },
  // The current game (GAME, otherwise package.json → config.game, otherwise demo): `@game` → games/<GAME>/index.ts.
  resolve: {
    alias: [
      // The public API (4.0, src/engine/api): `@quest-n-click/engine/content`, `/player`, `/minigames`, `/testing`.
      // The unscoped `quest-n-click/…` of 4.5.1 and before still resolves through 4.5.x (D53; tsconfig.json's paths
      // too, for a game loaded by tsx, a hosted one among them, until its upgrade renames it); the former name's
      // `web-scumm/…` went in 4.3.0 (D47). `quest-n-click migrate` rewrites a game's imports.
      {
        find: /^(?:@quest-n-click\/engine|quest-n-click)\/(content|player|minigames|testing)$/,
        replacement: r('./src/engine/api/$1.ts'),
      },
      { find: '@engine', replacement: r('./src/engine') },
      { find: /^@game$/, replacement: resolve(GAME_DIR, 'index.ts') },
      { find: /^@game\//, replacement: GAME_DIR + '/' },
    ],
  },
  // A game project (3.9): its public/ and dist/, the engine's pages and code from the installed package.
  ...(PROJECT
    ? {
        publicDir: resolve(PROJECT, 'public'),
        cacheDir: resolve(PROJECT, 'node_modules', '.vite'),
        server: {
          port: 5173,
          host: process.env.WEB_SCUMM_LAN === '1' ? true : '127.0.0.1',
          fs: { allow: [r('.'), PROJECT], deny: DENY },
        },
      }
    : {}),
  // The Studio page (studio.html, dev server: /__studio/) only enters a build with STUDIO=1.
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    ...(PROJECT ? { outDir: resolve(PROJECT, 'dist'), emptyOutDir: true } : {}),
    ...(STUDIO_CLIENT ? { outDir: r('./.cache/studio-client'), emptyOutDir: true } : {}),
    // Rolldown (Vite 8, 4.1.8): the option is `rolldownOptions`; `rollupOptions` is kept as a deprecated alias.
    rolldownOptions: {
      input: STUDIO_CLIENT
        ? { studio: r('./studio.html') }
        : { index: r('./index.html'), ...(process.env.STUDIO === '1' ? { studio: r('./studio.html') } : {}) },
      // Code only the Studio or the dev tools use goes to assets/tools/ (left out of the service worker's precache).
      output: {
        entryFileNames: (c: { name: string }) =>
          c.name === 'studio' ? 'assets/tools/[name]-[hash].js' : 'assets/[name]-[hash].js',
        chunkFileNames: (c: { moduleIds: string[] }) =>
          c.moduleIds.length && c.moduleIds.every(isToolModule)
            ? 'assets/tools/[name]-[hash].js'
            : c.moduleIds.length && c.moduleIds.every(isRealityModule)
              ? 'assets/reality/[name]-[hash].js'
              : 'assets/[name]-[hash].js',
      },
    },
  },
  test: {
    environment: 'node',
    // The Windows runner is the slowest by far on SQLite (a property test of 25 runs, a quarantine round-trip: over
    // 5 s on the 4.1.17 RC's tag run, twice, where Linux takes one): there a test has 30 s, as three of them already
    // did one by one since 7 October 2026. Elsewhere the default stays, so a slow test on Linux is still seen.
    ...(process.platform === 'win32' ? { testTimeout: 30_000, hookTimeout: 30_000 } : {}),
    include: ['tests/**/*.test.ts', `games/${GAME}/tests/**/*.test.ts`],
    // `--shard=i/n` (ci.yml's `unit` matrix) splits by each file's recorded duration, not by count (4.5.5, #349).
    sequence: { sequencer: DurationSequencer },
    // npm run test:coverage (4.1.0 "Clarity"): what the tests run of src/; the floors are the level measured at
    // 4.1.0 and may only rise. Lines run are not a proof: tests/properties.test.ts and npm run test:mutation:core say
    // whether the tests tell a right result from a wrong one.
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'bridge/src/**/*.ts', 'studio-server/src/**/*.ts'],
      exclude: ['src/**/*.d.ts'],
      reporter: ['text-summary', 'json-summary', 'html'],
      reportsDirectory: '.cache/coverage',
      // A shard (`VITEST_SHARD`, ci.yml's `unit` matrix, 4.5.4) measures a part of the suite: the floors apply to the
      // parts merged (`npm run test:merge`), never to one. The floors are tests/coverage-floors.json since 4.6.0
      // (#405): data read here, not an import, so raising one leaves every mutation set's cache key as it was.
      // Absent where the file is not shipped: a created project's build loads this file (tools/coverage-floors.ts).
      thresholds: coverageThresholds(),
    },
  },
});
