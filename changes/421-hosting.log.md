## 4.2.1 PR 8 (first part): the hosting guide

Branch: ops/421-hosting (stacked on PR 7's server side) · Plan §7 row 8, D41

- **Guide** `docs/en|fr/STUDIO-SERVER.md`: what runs where, Clever Cloud step by step (two apps, add-ons linked to the
  studio only, `min = max = 1`, `/startz` as health check, the variables, the job keys, import, the first owner),
  the provider's settings, roles, spans, the CLI, local trial, known limits. Steps not exercised yet are said so (the
  `studio-hosted` pass runs the guide on a real domain).
- **`ops/studio/`**: `studio.config.example.json` (checked by `tests/studio-server.test.ts`), `keycloak/realm.json`
  (clients `studio` with PKCE S256 and back-channel logout, `web-scumm-cli` with the device grant and the audience
  mapper, 5 min access tokens), `compose.yml` (optional: Postgres, MinIO, Keycloak).
- **`package.json`**: `studio-server` and `studio-worker`. **`config.ts`/`main.ts`**: `STUDIO_CONFIG_JSON`.
- Left for the rest of PR 8 and PR 9: the release packages (`web-scumm-studio-server`, `-worker`) that replace the
  deployment from the repository, UPGRADING and SUPPORT (exception D40).

→ next: Claude (PR 9; the client PR 7 after the mockups)
