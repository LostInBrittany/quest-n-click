### Fixed

- **An email whose subject is one word that looks like a pairing code is read as an answer again (next, #491)**: a
  linked or tagged player who wrote `Treasure`, `Thursday` or `Gardener` as the subject had the message taken for a
  pairing code, refused by the Bridge and dropped (`pairing-pairing`, a 422 or a flagged message), so the answer was
  lost. A code alone that the Bridge refuses, from a sender the connector already knows, now goes on to the answers;
  `PAIR …`, `LINK …` and `CODE …` still reject a refused code. The connector also reads a code with the Bridge's own
  letters only (no `L`), shared with the terminal connectors.
