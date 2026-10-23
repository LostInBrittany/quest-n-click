### Changes

- **The 132 mutation exemptions read again (4.5.0)**: each entry of `docs/dev/mutants.json` came due at 4.5.0 and was
  checked against the code. Five were not what they said and are now killed by a test: a speedrun envelope without a
  world proof no longer carries an empty `worldEvidence` key in memory, the Studio journal's lease that ends in the
  very millisecond it is asked for is taken, a durable write handed text is pinned on a short write (a file system that
  writes less than asked), and a bisection called past the head is refused. One reason was wrong in a side claim and is
  corrected; 19 are sharpened. The other 127 are read again at 4.6.0.
