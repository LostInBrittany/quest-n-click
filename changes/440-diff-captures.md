### Changes

- **The semantic diff draws the rooms it names, before and after (4.4.0)**: in the Check tab, under "Changes between
  revisions", **Capture the rooms (before / after)** shows each room the changes name (its layout, its source, its
  texts in a language; the first room when only shared files changed, such as the cast or `site.json`; six at most)
  at both revisions, side by side, with the rectangle where they differ outlined, or "no visible change". A moved
  prop, a font or a text that overflows is seen at once. Each revision is built as a preview and drawn in headless
  Chromium at a fixed 960 × 600; the PNGs are kept under `.cache/studio/`. New route `GET diff/<from>..<to>/captures`.
  A local Studio only (`npm run studio`, with Playwright): a hosted Studio answers that the captures need one, its
  worker having no browser (docs/en/STUDIO.md "Check" lists the other limits).
