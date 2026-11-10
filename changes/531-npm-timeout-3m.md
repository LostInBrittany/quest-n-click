### Changes

- **One `npm ci` timeout for every job (next, #531)**: each attempt of the setup action's install has 3 minutes on
  Linux, in a 10-minute step, wherever it runs; it was 3, 4 or 6 minutes, each derived from the step's old limit. An
  install takes 10 to 17 s with the cache, so a stalled attempt is now cut sooner and the next one starts.
  `external-consumer` keeps no timeout: its own registry retries wait longer.
