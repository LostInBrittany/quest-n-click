## Translation pairs no longer need a person's reading to publish (D56, amends A7)

4.5.2's `docs-publish` failed: 181 pairs of ready pages were recorded by their AI author only, and A7 made
`check --publish` want a person on every pair. Both maintainers agreed the rule was the bootstrap's and does not scale
to a 214-page bilingual wiki. `checkTranslations` now puts those pairs among the gaps at both levels (printed by
`check`, never silent), counted and worded as "checked by their AI author only, not read by a person". A pair "to review"
still fails a publication; a published claim still needs `review-claim --kind human`. The page headers already say who
read each page (`pageReview`: "written and self-checked by an AI, not reviewed by a person"), so nothing a reader sees
turns an AI's check into a person's. `publication.json` records no review state.

→ next: re-run 4.5.2's `docs-publish` once #293 and #294 are merged; a person's reading of a pair stays welcome and
still shows as "reviewed by a person" in the header.
