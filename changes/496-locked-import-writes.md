### Fixed

- **A read made during a Git import or an engine upgrade no longer mixes two revisions (next, #496)**: on a Studio
  Server, a room opened while an owner's import or upgrade was writing could show the room's code of one revision with
  the layout of the next, under the older revision's number. Those two writes now hold the instance's lock like any
  other write: a read made meanwhile waits a moment and shows the whole new revision.
