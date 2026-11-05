### Changes

- **`external-consumer` asks for no runner when the plan spares it (4.7.0)**: a pull request that changes no package,
  template or authoring path skips the job at the job level instead of starting a macOS, a Windows and a Linux runner
  only to say "not needed by the plan"; `pr-gate` accepts that skip exactly when the plan spares it. On 4 November no
  macOS runner came all afternoon, and every pull request waited 15 minutes on one before failing.
