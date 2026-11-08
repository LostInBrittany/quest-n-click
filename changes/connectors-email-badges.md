### Breaking

- **Open Badges: only a hashed-email recipient makes a badge `valid`** (next). A badge whose recipient can be read in
  the badge itself (a clear email, a URL, a DID, an Open Badges 3.0 `credentialSubject.id`) now gives `indeterminate`,
  and the form no longer reads a `recipient` field: the player gives the email the badge was issued to. A game whose
  issuer puts clear recipients in its badges sees `indeterminate` where it saw `valid`; ask the issuer for hashed ones.

### Fixed

- **Email over IMAP: retention touches only the messages the connector handled** (next). The connector marks each
  message it handles with the keyword `$QuestNClick`; the `keepDays` sweep and the deletion after acceptance remove
  only those, by their UIDs (`UID EXPUNGE`), never the operator's other mail in the folder nor what another client
  marked deleted. A server without UIDPLUS keeps them marked `\Deleted`, and the log says so once
  (`email.expunge-unsupported`). A dedicated folder (`imap.mailbox`) is still the recommended setup.
- **Open Badges: a valid badge counts for one player** (next). The first player who redeems a badge keeps it; another
  player posting the same badge gets 409 `{"status":"valid","signal":"claimed"}`. The connector remembers this in
  memory, so a restart forgets it.
