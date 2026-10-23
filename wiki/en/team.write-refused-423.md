# Write refused on the hosted Studio: span locked (423)

On a team Studio, your save was refused with a 423: another member is editing the same part of the game. Your change
is not lost, and nothing was written. This page says how to tell why, and how to get your change in.

<a name="symptom"></a>

## Symptom

- In the Studio: a dialog "The room *kitchen* is held by Léa" (or "The span *story* is held by…", or "The whole game
  is held by…"), with "Your change was not applied. Nothing is lost: your draft is kept here, to save when the span is
  free."
- Through the API, the CLI or the MCP: HTTP **423** with `{"error": "room:kitchen is being edited by Léa", "span",
  "holder", "holderName", "until"}`, or `"<name> has the whole game for now"`, or `"your lease on <span> ended or was
  taken again: take it again"`.

<a name="causes"></a>

## Possible causes

Every file of the game belongs to one *span*: a room (its code and its layout), a language, the story, the items, the
cast, the rules, the voices, the assets, the notes, the map's groupings, the rest. Saving a file takes its span for you
for **120 seconds**, a *lease*. Your Studio renews your leases every 30 seconds for as long as it stays open. Then:

1. **Another member holds that span's lease**: they saved in that room, or took it ahead, and their Studio is still
   open (or was closed less than two minutes ago). The most common case.
2. **An owner holds the exclusive lease** (`*`): the whole game is theirs for a change that touches everything (an
   engine upgrade, preparing the assets, a pull from Git). Nobody else writes meanwhile.
3. **Your own lease ended or was taken over** while you kept a draft open (your tab slept, or an owner took the span
   over): the server refuses a write that still carries the old lease's number.

> [!LIMIT id=hosted-only]
> Spans and leases exist on a hosted Studio (the Studio Server) only. The local Studio (`npm run studio`) has one
> person and no 423.

<a name="diagnosis"></a>

## Diagnosis

- The dialog names the holder. The Studio's spans panel lists who holds what, and until when; it follows the server's
  live events.
- As a member, `GET /api/leases` gives every lease: `span`, `holderName` and `until` (a time on the server's clock,
  in milliseconds).
- A span `*` in the list is an owner's exclusive lease.
- If the holder is you, in another tab, or the span is free and the message says "ended or was taken again", it is
  cause 3.

<a name="fix"></a>

## Fix

<!-- step: wait -->
1. **Wait.** Click "Tell me when it is free": the Studio tells you as soon as the lease is given back or runs out.
   A lease runs out 120 seconds after the holder's Studio stops renewing it (their tab closed, their machine asleep);
   while their Studio stays open, they keep it, so ask them (next step). Then click "Try again": your draft is sent as
   it is.

<!-- step: ask -->
2. **Ask.** Tell the holder you need that room. When they release the span in their spans panel, it is free at once.

<!-- step: owner-takeover -->
3. **Take it over (owner only).** An owner can click "Take over and save (owner)": the span becomes theirs and the
   change is saved. The previous holder's next write in that span is refused in turn. The takeover is written in the
   audit log (`lease-takeover`, with the previous holder). Through the API: `POST /api/leases/takeover` with
   `{"span": "room:kitchen"}`.

<!-- step: exclusive-lease -->
4. **The exclusive lease.** When the holder is an owner with the whole game (`*`), wait for the end of their change;
   they give it back with `POST /api/exclusive/release`, or it runs out. An owner who needs the whole game takes it
   with `POST /api/exclusive`, granted only when nobody else holds a span.

For cause 3, take the span again (the spans panel, or `POST /api/leases` with `{"spans": ["room:kitchen"]}`), then
try again.

<a name="check-fixed"></a>

## Check it is fixed

The save goes through: the Studio shows the new revision, and the spans panel shows the span as yours. Through the
API, the write answers 200 with the revision it made.

<a name="neighbours"></a>

## Neighbouring cases

- **409, "The file changed since you read it"**: nobody holds the span, but someone saved the same file after you
  opened it. That is not a lock; see [Write refused on the hosted Studio: stale base revision (409)](team.write-refused-409.md).
- **503 with `Retry-After`**: the instance does not serve writes yet, during a redeploy. Wait a few seconds; the
  Studio retries.
- A Reality Bridge never answers 423.
