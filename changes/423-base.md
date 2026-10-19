### Changes

- **A write says what its editor read (4.2.3)**: on a hosted Studio each write carries the revision its editor read
  (`x-studio-base`). When one of its files was written since, it is refused (409) with that file as it was read and as
  it is now: the Studio shows the lines that changed, keeps the draft, and offers to apply the edit on the latest
  version, never on its own. A write's answer says its revision (`x-studio-revision`) as reads do.
