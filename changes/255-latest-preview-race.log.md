## 4.5.0: e2e studio-hosted, the latest preview read after the head's is built (#255)

- `scripts/e2e-studio-hosted.ts` step 6b read `previews.state().ready`, then clicked "Load the latest preview". The
  layout written meanwhile and Undo (revisions 2 and 3) schedule their previews in the background
  (`journal.events.on('confirmed')`); when revision 3's finished between the read and the click, the Play frame opened
  `/preview/3/` against an expected 2. Seen on PR #253's CI (run 39955383402, the Firefox/HTTPS pass; its HTTP pass
  read 2 and passed).
- The fix: `await previews.schedule()` (it resolves when the run building the head ends) before the read, and a check
  that the ready revision is then the journal's head, so the step loads the latest revision, not just a stable one.
- Checked: Chromium three times locally (ready 3, head 3, `/preview/3/`); the Firefox pass does not launch on this
  machine, CI runs it.

→ next: review.
