### Changes

- **A guide to put a Studio online** (4.2.1): `docs/en/STUDIO-SERVER.md` (French: `docs/fr/STUDIO-SERVER.md`) deploys
  the Studio Server and its worker as two native Node.js applications on Clever Cloud, with PostgreSQL, Cellar and
  Keycloak or another OpenID provider. An example configuration (`ops/studio/studio.config.example.json`), a test
  Keycloak realm (`ops/studio/keycloak/realm.json`) and an optional local stack (`ops/studio/compose.yml`) come with
  it. `npm run studio-server` and `npm run studio-worker` start them; `serve` also takes its configuration from
  `STUDIO_CONFIG_JSON`.
