### Changes

- **The Studio Server's lock follows jose 6.2.13** (#299): Dependabot's `minor-and-patch` group moved `jose` from 6.2.12 to 6.2.13 (a refactor that keeps the cause of an error) in the root lock, and `scripts/locks/quest-n-click-studio-server.json` still pinned 6.2.12, so `pack` refused it and the `connectors` and `smoke` jobs failed. `npm run locks` brings that one lock in step; the other three locks are unchanged, and so is every version an install of the Studio Server takes, apart from jose.
