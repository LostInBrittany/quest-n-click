### Fixed

- **The CLI's login says why the provider refused it (4.4.0)**: `studio-server login` ended on a bare
  `ResponseBodyError` when the OpenID provider refused the device login; it now names the provider's code and reason,
  e.g. `not_allowed (Offline tokens not allowed for the user or client)`. STUDIO-SERVER says what that one needs: the
  client scope `offline_access` on the CLI client and the realm role `offline_access` for each member.
