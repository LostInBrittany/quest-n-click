### Fixed

- **`prepare` starts the upgrade notes from whole CHANGELOG bullets (4.5.5, #333)**: the release's section of the
  upgrade notes listed each CHANGELOG bullet cut to its first line, often mid-sentence, so 4.5.4's had to be rewritten
  from the CHANGELOG by hand. Each bullet now comes whole, with its continuation lines, a nested list and an indented
  paragraph as written; the headings and the blank lines between bullets are left out, one list for the page.
