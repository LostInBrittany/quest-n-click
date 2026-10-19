### Changes

- **The cost of a Studio Server redeploy, measured with the lease handover (4.2.3)**: STUDIO-SERVER (en, fr) now says
  what a redeploy costs on Clever Cloud once both versions hand the service lease over: the lease taken 6 to 10 s after
  the new instance listens, writes refused (503 with `Retry-After`) for 10 to 16 s while Clever still routes to the
  old instance, none lost; and that the first deploy from a version without the handover still refuses writes for
  about two and a half minutes. The `/readyz` alert goes back to 2 min, expected once on that first deploy.
