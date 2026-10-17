### Changes

- **The authoring tools write a game through the Studio's journal** (4.2.1):
  - `npm run ids`, `i18n`, `voices` (import), `import-layout`, `provenance -- --lock`, `page:storyboard -- --md`,
    `prompts` and `remix` write their game files as one operation of the journal;
  - asset uploads (sheets, cells, decors, sounds) too. Backups and the cells a cut produced land together, or none
    of them;
  - a Studio open on the same game sees each operation, and a file it rewrote meanwhile is a 409.
  - The batch tools (`ids`, `i18n`, `provenance`) are journaled, not guarded: they rename paths, which changes the
    text of existing validation errors.
- **The placement editor saves through the Studio's API** (4.2.1): `PUT /__studio/api/room/<id>/layout`, one guarded
  operation. The dev server's `/__layout` route is gone; `layoutWriter()` stays exported as a deprecated plugin that
  does nothing.
