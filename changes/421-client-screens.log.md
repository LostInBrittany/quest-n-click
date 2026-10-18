## 4.2.1 PR 7 (second part): the screens of the shared Studio

Branch: feature/421-client-screens (on PR 7's first part) · Plan §3.3, §3.6, §5, §7 row 7, §11 · the mock-ups
approved on 18 Oct.

- **Before the Studio** (`src/studio/hosted.ts`): the login page, "access not granted" (a session that is not a
  member's), "identity provider unreachable" (a suspended session, plan §3.6). Nothing of the game is asked for
  before the session is a member's.
- **The header**: the revision (green while the stream is up), who is here and where (the heartbeat, every 30 s,
  which also renews the leases), and the member's menu: spans, members (owner), logout. A line under it says when
  the stream is cut ("last revision seen") or writes are waiting.
- **The live state**: one stream (`/api/events`); after a cut, the revisions missed are read from `/api/ops` (the
  journal is the source, not the stream), each told once and in order; a new epoch reloads the page.
- **Writes** (`api.ts`): an operation id on each hosted write; a cut or a 503 sends it again with the same id (P6);
  a 423 or a 409 opens a dialog with the draft kept (copy, try again, "tell me when it is free", an owner's take-over),
  `src/studio/spans.ts`.
- **Spans**: a panel of every span with its holder (take, release, take over); the room shown has its own chip in the
  Rooms bar; the live preview's label says the revision the view was loaded at and when the head moved on.
- **Members** (`src/studio/members.ts`): roles, removal, sessions ended, invitation links, invitations pending, the
  audit log in words; the last owner stays.
- **Server**: a note's author is the session's name on a shared Studio (`studio-server/src/ops/core.ts`).
- **Tests**: `scripts/e2e-studio-collab.ts` (`npm run e2e:studio-collab`, in `studio-hosted`): three people in three
  browsers (owner, dev, reviewer) see one another; a span held by one refuses another's note, naming them, the draft
  kept, saved once free; a reviewer cannot write, and writes once made dev from the Members screen; a cut is shown and
  the revision missed is read back; everyone ends on the same revision; a visitor gets the login page, a stranger
  "access not granted". Its server is `scripts/lib/studio-stack.ts`. In CI: Chromium and Firefox; WebKit on macOS.

- **Second reading** (automated second context), fixed:
  - a revision streamed while the journal was read after a cut could be skipped: it now waits and follows in order,
    and `hello`s are taken one at a time;
  - a journal that does not answer is retried, then said as a gap with a reload;
  - a stream the server refused (removed, suspended, a proxy) checks the session and opens again, and a role changed
    reloads the page (the e2e no longer reloads by hand);
  - only file conflicts open the 409 dialog, Undo is gone everywhere hosted, a handled refusal is not toasted twice;
  - the server looks for a write's stored answer again under the write lock and stores it once (a retry while the
    first try runs gets its answer);
  - the checks that POST are reads (not "waiting"), a write counts as waiting only after a failed try, and 502 and 504
    are retried;
  - the whole-game lease is released through its own route and never taken over span by span;
  - `hello` reads the leases' sequence number first;
  - also: an unreachable `/auth/me` is no logout, accessible avatars, presence sent on each move, the last owner may
    end their own sessions, a role change is confirmed, the notes' author field is hidden hosted, every span listed;
  - left as a stated limit: the editors do not yet send the revision they read (P5 base).

→ next: Claude (PR 9, second part: the release packages and the passes)
