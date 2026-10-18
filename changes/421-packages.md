### Changes

- **The Studio Server as a release archive** (4.2.1): `web-scumm-studio-server-<version>.tgz` carries the commands
  `web-scumm-studio-server` and `web-scumm-studio-worker`, the Studio's page already built, and its own dependencies
  (their versions locked in its `npm-shrinkwrap.json` and SBOM; `web-scumm-studio-server deps` says what an install
  resolved). Install it beside the engine of the same version
  (`docs/en/STUDIO-SERVER.md`, "From the release archives"). Two people's passes join the sheet from 4.2.1:
  `studio-hosted` (a real Clever Cloud deployment, a real Safari) and `studio-collab` (three people, a cut, a redeploy).
