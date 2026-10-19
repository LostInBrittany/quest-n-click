## 4.2.2 PR 6b: `prepare` on the processing worker

- **The job** (`studio-server/src/worker/prepare.ts`, kind `prepare`): a version 2 snapshot (`packAssets`: the
  sources and data as text, the art and sounds under `art/` and `audio/` in base64, bounded as any snapshot); in the
  child, the references (`tools/refs.ts`'s `collectRefs`), then `tools/assets.py` with `WEB_SCUMM_PROJECT` (its work
  folder, inside the job's), `GAME_DIR`, `PYTHONPATH=<engine>/.python` (the build hook's packages) and the worker's
  own `PATH` (python3, ffmpeg; passed for this job only, the rest of the environment stays empty). The answer: the
  prepared files and the new manifest, checked by the Studio (`preparedShape`).
- **The store** (`server/prepared.ts`, migration 0010): one run at a time (else 429), under the member's `*` lease
  (taken and given back; another's span refuses it, 423); the files kept by content, a set per run; the manifest
  written as one operation of the journal; the latest set written to `<workDir>/.prepared/<id>/` (again at start: the
  disk is ephemeral) and served first by the Studio's media, the previews and the builds (`assetDirs`, `findAsset`),
  then `publicDir`; its version becomes the previews' and builds' `__ASSETS_VERSION__`.
- **API and screen**: `GET /api/assets/prepared`, `POST /api/assets/prepare` (a dev); the Play tab's Assets panel
  (devs), which says the sheets and uploads stay local. CI's `studio-hosted` job gets Python and ffmpeg.
- **Second reading** (a subagent): a game naming its sources in `sources.json` is refused (they would not be found);
  a manifest that would lose an image or a sound the game had is refused, naming them, with the asset tools' last
  lines; the new set is served before the manifest's revision lands (its previews are built against it) and set back
  if the write is refused; the answer may be 30 MiB (the Studio's result bound), past which "prepare on a local
  Studio"; `prepare` has the worker's 2-minute deadline; the output walk follows no link; the snapshot reads only
  what it keeps and counts bytes; a refused file name is named; the exclusive lease is given back only if this run
  took it; the author is named as any write's; the latest set is written again at start in the background, a failure
  logged; the Studio's media route compares real paths. Not done, said in STUDIO-SERVER: cancellation and step by step
  progress (the plan's §2.6), an incremental run, builds pinned to the set they were built against.
- **Measured here**: the sample game's `prepare` in the worker's child in about 3.5 s (218 files, 9.4 MB answered).
- **Tests**: `tests/studio-prepared.test.ts` (under the lease, kept, served first, written again at start; nothing kept
  on a failure; one at a time; version 2 snapshots and their bound; the answer's shape; a real `prepare` where Python
  has the packages), `scripts/e2e-studio-hosted.ts` (a dev prepares from the Play tab).

→ next: Claude (PR 7: backup, restore, journal shipping, GC)
