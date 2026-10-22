### Fixed

- **The Studio's simulated Bridge no longer leaks a listener per wait (4.4.0)**: each wait for a signal left an
  `abort` listener on the connection, as the Reality port's sleep did (fixed in the same release); a long Studio
  session gathered thousands.
