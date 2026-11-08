### Fixed

- **The local Studio's guard covers its routes in any letter case (next)**: Vite's router mounts the Studio's API
  without regard to case, while the guard (Host, Origin, the LAN token) only looked at `/__studio` in lower case. The
  guard now covers every spelling, and a test drives the real dev server to prove it.
- **Outside LAN mode the local Studio answers this machine only (next)**: `npm run studio -- --host` (or
  `dev -- --host`) listens on the network without a token, and Host and Origin are headers a peer outside a browser sets
  as it likes. The Studio's routes now refuse any address but loopback (403) unless `npm run studio:lan` started them,
  with its token. A Studio reached through a container's port mapping is refused too: run `studio:lan` there.
