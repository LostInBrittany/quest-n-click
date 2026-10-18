### Changes

- **Working together on a shared Studio** (4.2.1).
  - **Each file has a span:** a room (its code and layout), a language, the story, the items, and so on. A write
    takes the spans it touches. If another member is editing one of them, the write is refused (423) with their
    name, and the client keeps its draft. A lease lasts 2 min and is renewed by the heartbeat
    (`POST /api/presence`). Members can take spans ahead (`POST /api/leases`) and release them.
  - **Owners** can take a span over (audited) and take the whole game for an exclusive change.
  - **`GET /api/events`** streams every revision (with its files and spans), the leases and who is here. A stream
    closes as soon as its member is removed or logged out, or when its token ends.
  - **Undo** is not available on a shared Studio until 4.2.2.
