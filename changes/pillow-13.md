### Changes

- **Pillow 13 (4.3.0, #213)**: the asset tools (`npm run assets`, `tools/cut-sheet.py`, `check-alpha.py`, `pick-bg.py`,
  the code wheel's PDF) and a hosted Studio's processing worker use Pillow 13.0.0. Nothing changes for an author: the
  sample game's images come out byte for byte the same, and no tool used an API that Pillow 13 removed or deprecated.
  Run `python3 -m pip install -r requirements.txt` again. The worker's lock (`ops/studio/worker-requirements.lock`)
  carries the new wheel's sha256, checked against PyPI.
