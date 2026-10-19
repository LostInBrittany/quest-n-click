## 4.2.2 PR 6a: the hosted assets' qualification

- **Measured** on the spike's processing app (kept for #149; an SSH session, a folder in `/tmp`, nothing deployed or
  changed): glibc 2.44, Python 3.13, ffmpeg 9; the locked wheels installed with every hash checked in 7.0 s (226 MB);
  a full `prepare` of the sample game in 4.1 s (194 images, 24 sounds, 7 MB), then 0 reprocessed on a second run.
  Not measured: the sheets' cutting, a bigger game, the peak memory.
- **Kept**: the lock (`ops/studio/worker-requirements.lock`, its test pinning the versions of `requirements.txt` each
  with a hash), the worker's build hook in STUDIO-SERVER (en, fr), `.python/` ignored.
- **Decided (D43)**: `prepare` becomes a worker job in 4.2.2 (PR 6b); the sheets' cutting and the hosted uploads move
  to 4.2.3 (a departure from the plan's §2.6, which put both in PR 6).

→ next: Claude (PR 6b: `prepare` as a worker job)
