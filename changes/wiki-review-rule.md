### Changes

- **A translation pair checked by an AI no longer stops a documentation publication** (4.5.3, D56): `npm run wiki -- check --publish` lists the pairs read by their AI author only, not by a person, among its gaps and passes; the page's header still says who read it. A pair "to review" (one side changed since its record) still fails it, and a published claim still needs a person's review of its scope.
