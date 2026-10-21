## 4.3.1: voices by value follow each language's text; one winning path is not a proof

- An outside reading of v4.3.0 found both. Voices: `voiceTable` (the export) read the translated text, but
  `voiceIds` (the import's known ids, CLI and Studio `setVoice`), `orphanClips` and `voiceValueChecks` derived the
  `<id>~<flag>=<value>` keys from the source text. `voiceIds` now takes the game in the sheet's language,
  `orphanClips` a `localized` game, and `validate` a `locales` option that `voiceValueChecks` applies per language of
  `audio.voicesByLang`. The options are passed by every entry point: `tools/validate.ts`, `ops/validate-dir.ts` (the
  Studio's guard and the worker) and `src/studio/api-browser.ts`; `tests/voice-locale.test.ts` checks the three say
  the same, and five of its seven tests fail on 4.3.0. `langVoices` (core/voice-key.ts) is what boot.ts picks for a
  language, so the test plays the clips a French page plays: each hero's, and the plain clip before the choice.
- Kept as is: the i18n checks may still report a switch a translation drops, by their own policy; this patch only
  stops the voice check from asking for clips there. `validateDir` still does not run `localeVerbKeyChecks` (a
  translation's verb keys), which only the command line runs: a parity gap of its own, left for 4.4.0.
- Mutation: a new set, `voices` (voice-key.ts, tools/voices.ts, validate/voices.ts, status.ts), gated from the start.
  193 mutants, 186 killed (tests/voices-mutants.test.ts holds the CSV, import, clip-verdict and headline cases), 7
  named equivalent in docs/dev/mutants.json. A second reading of the 9 first named found two `lineClips` entries wrong: a line whose
  switches list only `*=` took the shortcut and went into the sheet with its braces; the shortcut is gone (the general
  path renders a line without switches as it is), and the two entries with it.
- Solve: `solveHeadline`'s witness sentence says "on one path" and "only --prove"; a prove `solved` alone says "stays
  reachable from every one". `tests/status.test.ts` holds the reviewer's game (only the robot opens the door): witness
  `solved`, prove `softlocks`, both `finished`.
→ next: release 4.3.1 (candidate, signed tag on the maintainer's yes for `v4.3.1`), then 4.4.0: the 3-heroes ×
2-languages example and the first human passes before the Studio's hero × language matrix.
