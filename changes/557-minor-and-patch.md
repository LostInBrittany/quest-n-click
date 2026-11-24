### Changes

- **The Studio Server runs on newer releases of its sign-in libraries (next, refs #557)**: `jose@6.2.18` and
  `openid-client@6.9.0`, its versioned lock updated with them. For contributors, `playwright@1.65.1`, with the Linux
  browser jobs' image (`mcr.microsoft.com/playwright:v1.65.1-noble`, pinned by its index digest) moved with it,
  `vite@8.3.8`, `vitest@5.1.1`, `@biomejs/biome@2.6.8`, `knip@6.46.1`, `fast-check@4.10.3` and
  `fake-indexeddb@6.2.8`. knip 6.46 no longer needs `knip.json`'s `ignoreUnresolved` entry: removed.
