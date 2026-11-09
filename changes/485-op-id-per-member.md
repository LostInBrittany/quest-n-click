### Fixed

- **A write that reuses another member's operation id is applied (next, #485)**: on a Studio Server, a member who sent
  an `x-studio-op` another member had already used got a 200 and a new id back, but nothing was written. Each member's
  operation ids are now their own: a retry by the same member is still applied once, the same id from someone else is
  a write like any other.
