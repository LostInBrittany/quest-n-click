// The live preview on the game's origin (4.2.1, plan §6.2): the game as it is in the instance's folder, run by Vite
// in middleware mode behind the game's session (play.ts). It is live, not frozen: a module loaded later may come from
// a later revision; per-revision previews arrive in 4.2.2 and Vite then leaves the server.
//   - No hot reload, no websocket: the Studio reloads the frame when it wants to. Vite's client module, which modules
//     in development import (styles, `import.meta.hot`), is replaced by a stub that never connects anywhere.
//   - Only the paths a game page loads reach Vite: its page, the engine's sources, the game's files (through /@fs/),
//     the pre-bundled dependencies, the prepared assets. Anything else is a 404 before Vite sees it, and Vite's own
//     `fs.strict` with an allow-list of those folders stays on behind it.
//   - No Studio API on this origin, ever: the editor's save goes to the Studio by postMessage (rooms-bridge.ts).
//   - No service worker: the preview registers none (`virtual:pwa-register` is a stub here).
//   - No file watcher: the server calls `invalidate()` after each committed revision (and each repair of the folder),
//     so the next load of a frame is the game as it is then.
//   - Vite's host check names the game's origin (by default it lets only localhost through); no CORS.
//   - The page names the Studio's origin in a meta tag: the editor posts its messages there and nowhere else.
import { realpathSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin, ViteDevServer } from 'vite';

export interface PreviewOptions {
  /** The instance's game folder (the materialised head). */
  gameDir: string;
  game: string;
  /** The prepared assets' folder (`public/`, with `assets/img`, `assets/audio`…): served as the game's public files. */
  publicDir: string;
  /** The Studio's origin: the only one the editor talks to. */
  studioOrigin: string;
  /** The game's origin: the only `Host` Vite answers. */
  playUrl: string;
  /** The engine (this repository, or the installed package). */
  engineRoot?: string;
}

/** The paths a game page loads (the game's own files are checked by folder, below). */
const SERVED =
  /^\/(?:$|index\.html$|manifest\.webmanifest$|og\.png$|@vite\/(?:client|env)$|@id\/__x00__|src\/|node_modules\/(?:\.vite\/studio-preview\/deps\/|vite\/dist\/client\/env\.mjs$)|assets\/|data\/|fonts\/|icons\/)/;

/** Whether `p` is `dir` or inside it. */
/**
 * What modules in development import from `/@vite/client`, without its websocket: the `define` constants (its
 * `/@vite/env`), styles added and replaced, a hot context that accepts everything and never fires.
 */
const CLIENT_STUB = `import '/@vite/env';
const styles = new Map();
export function updateStyle(id, css) {
  let s = styles.get(id);
  if (!s) {
    s = document.createElement('style');
    s.setAttribute('data-vite-dev-id', id);
    document.head.appendChild(s);
    styles.set(id, s);
  }
  s.textContent = css;
}
export function removeStyle(id) {
  styles.get(id)?.remove();
  styles.delete(id);
}
export function createHotContext() {
  const no = () => {};
  return { data: {}, accept: no, acceptExports: no, dispose: no, prune: no, invalidate: no, decline: no, on: no, off: no, send: no };
}
export const injectQuery = (url) => url;
`;

/** Whether `p` is `dir` or inside it (without regard to case where the disk usually ignores it). */
const fold = (p: string) => (process.platform === 'linux' ? p : p.toLowerCase());
const inside = (p: string, dir: string) =>
  fold(p) === fold(dir) || fold(p).startsWith(fold(dir.endsWith(sep) ? dir : dir + sep));

const real = (p: string) => {
  try {
    return realpathSync.native(p);
  } catch {
    return resolve(p);
  }
};

export interface Served {
  /** Vite's root (the engine): a path that is none of the known ones may still name a game file under it. */
  root: string;
  /** The folders `/@fs/` may read from. */
  allowed: string[];
  /** The game's folder: its files, by `/@fs/` or by a path under the root when it lies there. */
  gameDir: string;
  /** Folders of the game never served (its private notes, its tests). */
  hidden: string[];
}

/** Whether a request's path may go to Vite (exported for its tests). */
export function servedPath(path: string, o: Served): boolean {
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return false;
  }
  if (decoded.includes('\0') || decoded.includes('\\') || /(^|\/)\.\.(\/|$)/.test(decoded)) return false;
  const shown = (abs: string) => !o.hidden.some((d) => inside(abs, d));
  // /@fs/<absolute path>: inside one of the allowed folders only (Windows: /@fs/C:/…).
  if (decoded.startsWith('/@fs/')) {
    const abs = resolve(decoded.slice('/@fs'.length).replace(/^\/([A-Za-z]:)/, '$1'));
    return o.allowed.some((d) => inside(abs, d)) && shown(abs);
  }
  if (SERVED.test(decoded)) return true;
  // A game folder under the engine's (an instance's work folder there): its files by their path from the root.
  const abs = resolve(o.root, `.${decoded}`);
  return inside(abs, o.gameDir) && shown(abs);
}

export interface LivePreview {
  handle(req: IncomingMessage, res: ServerResponse): Promise<void>;
  /** Forgets every transformed module: the next load reads the folder again (after a revision, a repair). */
  invalidate(): void;
  close(): Promise<void>;
}

export async function livePreview(o: PreviewOptions): Promise<LivePreview> {
  const engineRoot = real(o.engineRoot ?? fileURLToPath(new URL('../../..', import.meta.url)));
  const gameDir = real(o.gameDir);
  const publicDir = real(o.publicDir);
  const nodeModules = real(resolve(engineRoot, 'node_modules'));
  const allowed = [resolve(engineRoot, 'src'), gameDir, publicDir, nodeModules, resolve(engineRoot, 'index.html')];
  // The game's private notes and its tests are never part of what a page loads.
  const hidden = ['private', 'tests', 'playtests'].map((d) => resolve(gameDir, d));
  // Imported here, not at the top: the server without a game's origin never loads Vite.
  const { createServer } = await import('vite');
  const { assetsVersion, sitePlugin } = await import('../../../tools/vite/plugins');
  const { engineVersion, trustedExtensionsHash } = await import('../../../tools/extensions');
  const r = (p: string) => resolve(engineRoot, p);
  const preview: Plugin = {
    name: 'studio-live-preview',
    // Before Vite's own middlewares: its client module is this stub.
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!/^\/@vite\/client(\?|$)/.test(req.url ?? '')) return next();
        res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
        res.end(CLIENT_STUB);
      });
    },
    resolveId: (id) => (id === 'virtual:pwa-register' ? '\0studio-no-sw' : undefined),
    load: (id) =>
      id === '\0studio-no-sw' ? 'export function registerSW() { return () => Promise.resolve(); }' : undefined,
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { name: 'web-scumm-studio-origin', content: o.studioOrigin }, injectTo: 'head' },
    ],
  };
  const vite: ViteDevServer = await createServer({
    configFile: false,
    root: engineRoot,
    base: '/',
    appType: 'spa',
    publicDir,
    cacheDir: resolve(nodeModules, '.vite', 'studio-preview'),
    logLevel: 'warn',
    clearScreen: false,
    define: {
      __ASSETS_VERSION__: JSON.stringify(assetsVersion(resolve(publicDir, 'assets'))),
      __GAME__: JSON.stringify(o.game),
      __TRUSTED_EXTENSIONS__: JSON.stringify(trustedExtensionsHash(gameDir)),
      __ENGINE_VERSION__: JSON.stringify(engineVersion()),
    },
    plugins: [sitePlugin({ gameDir, game: o.game }), preview],
    resolve: {
      alias: [
        { find: /^web-scumm\/(content|player|minigames|testing)$/, replacement: r('./src/engine/api/$1.ts') },
        { find: '@engine', replacement: r('./src/engine') },
        { find: /^@game$/, replacement: resolve(gameDir, 'index.ts') },
        { find: /^@game\//, replacement: `${gameDir}/` },
      ],
    },
    // The engine's dependencies, bundled once at start: discovering one later would need a reload over the websocket
    // the preview does not have.
    optimizeDeps: {
      noDiscovery: true,
      include: ['earcut', 'howler', 'navmesh', 'tweakpane', 'zod', 'zod/mini'],
    },
    server: {
      middlewareMode: true,
      hmr: false,
      ws: false,
      watch: null,
      allowedHosts: [new URL(o.playUrl).hostname],
      cors: false,
      fs: {
        strict: true,
        allow: allowed,
        deny: ['.env', '.env.*', '*.{crt,pem,key}', '**/.git/**', ...hidden.map((d) => `${d.split(sep).join('/')}/**`)],
      },
    },
  });
  return {
    handle(req, res) {
      const path = new URL(req.url ?? '/', 'http://play.invalid').pathname;
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' });
        return Promise.resolve(void res.end('GET only'));
      }
      if (!servedPath(path, { root: engineRoot, allowed, gameDir, hidden })) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        return Promise.resolve(void res.end('not found'));
      }
      return new Promise<void>((done) => {
        res.once('finish', done);
        res.once('close', done);
        vite.middlewares(req, res, () => {
          if (!res.headersSent) res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
          res.end('not found');
        });
      });
    },
    invalidate: () => vite.moduleGraph.invalidateAll(),
    close: () => vite.close(),
  };
}
