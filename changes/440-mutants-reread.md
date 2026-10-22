### Fixed

- **A Reality page that polls no longer piles up listeners (4.4.0)**: the HTTP port's wait between two polls (or two
  reconnections of the stream) added an `abort` listener to the port's signal and removed it only on an abort, never
  when the wait ended on time. A page polling once a second held some 86 000 more closures a day, for as long as it
  stayed open. Each wait now removes its listener when it ends, either way.
- **An email's HTML read with a Turkish capital İ hides its scripts and comments again (4.4.0)**: the email
  connector's `htmlToText` looked for tags in the message's lower case at the original's positions, and a character
  whose lower case is longer (İ is two characters in lower case) shifted them: after an İ, a `<script>`'s or a
  comment's content leaked into the text an answer is read from, and visible text after a `<style>` could vanish.
  Tags are now matched in ASCII lower case, as HTML names them, which keeps every position.

### Changes

- **The 137 mutation exemptions read again (4.4.0)**: each entry of `docs/dev/mutants.json` came due at 4.4.0 and was
  checked against the code. Four were not what they said and are now killed by a test (a delivery with an empty
  player id bound the save to it, the Bridge's re-sign cache hits were never counted, a badge fetch's own request
  timeout, a logout token whose `events` is `null`); reading them found the two fixes above. The other 133 keep their
  place, 16 with a reason rewritten, and are read again at 4.5.0.
