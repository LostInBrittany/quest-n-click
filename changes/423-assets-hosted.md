### Changes

- **The Assets tab on a hosted Studio (4.2.3)**: a team on the Studio Server now uploads sounds and decors, cuts
  generated sprite sheets and keys single cells from the Assets tab, as on a local Studio. An upload is 10 MiB at most
  (413) and its type is read from its bytes (PNG, JPEG or WebP images; Ogg, MP3 or WAV sounds; 415 otherwise); it is
  written as one revision, never run. The cutting runs on the processing worker under the project's exclusive lease,
  and its cells, with the backups of those recut, are one revision. The uploaded sheet itself is not kept on a hosted
  Studio.
- **Prepare assets and the cuts can be followed and cancelled (4.2.3)**: on a hosted Studio they are jobs; their
  states (waiting, running and its step, done, failed, cancelled) come live, in a small panel with a Cancel button. A
  job cancelled before it writes leaves nothing, and gives the project's exclusive lease back.
