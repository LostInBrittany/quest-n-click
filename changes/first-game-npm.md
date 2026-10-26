### Changes

- **"Your first game" starts from npm (4.5.6, #382)**: its first step said the packages were not on npm yet and walked
  a newcomer through a release archive's URL, then said they were. The engine is on npm from 4.5.2, so the page now
  starts with `npm init @quest-n-click my-game "My Game"`, `npm install`, the Python step, `npm run assets` and
  `npm run dev`; the archive is a short fallback (offline, a build pinned to a release's file) and the engine
  repository's path is unchanged. The other pages that still said so are fixed in both languages: "Not supported"
  no longer lists npm as missing, the upgrade page installs `@quest-n-click/engine@<version>` first, and the
  troubleshooting, archive and upgrade pages give the error a project made before 4.5.2 now meets
  (`ETARGET No matching version found for quest-n-click@…`, not a 404) with its fix. `install.from-npm` and
  `install.package` no longer wait for a relay that is republished, and name `npx @quest-n-click/create` as the
  alternative to `npm init`, in place of an unscoped `npx quest-n-click create` that has no command on npm.
