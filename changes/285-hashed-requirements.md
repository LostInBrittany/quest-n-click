### Breaking

- **The Studio worker installs `requirements.txt`, the lock is gone** (4.5.2, D54, #285). `requirements.txt` now pins
  each Python package with the sha256 of every file PyPI publishes for that version, and
  `ops/studio/worker-requirements.lock` is removed. A worker's build hook that names the lock must name
  `requirements.txt` instead: `python3 -m pip install --target .python --require-hashes --only-binary=:all: -r
  node_modules/quest-n-click/requirements.txt` (from the archives) or `-r requirements.txt` (from the repository).

### Changes

- **pip checks every Python download against its hash** (4.5.2, D54, #285). `pip install -r requirements.txt` is a
  hash-checked install now, on every platform (the hashes cover the wheels of each); the docs, `doctor` and CI say
  `--require-hashes`. The versions do not change (Pillow 13.0.0, NumPy 2.4.6, SciPy 1.18.1). Dependabot's monthly pip
  bumps rewrite the hashes with the version, so they no longer fail CI.
