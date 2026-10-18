### Changes

- **The shared Studio's screens** (4.2.1): on a hosted Studio, a visitor sees a login page and someone who is not a
  member sees "access not granted", with nothing of the game; a session the identity provider has not confirmed for
  15 min shows "identity provider unreachable". In the header: the exact revision the editors and reads are at, who is
  here and where, and your name with the spans, the members (owner) and the logout. A write refused because another
  member holds its span (423) or because its file changed (409) keeps the draft to copy and try again; an owner may
  take a span over. The owner's Members screen changes roles, removes members, ends sessions, makes invitation links
  and shows the audit log. A cut of the connection is shown, and what was committed meanwhile is read back from the
  journal; a write cut off is sent again with the same id and applies once. A note's author is the session's.
