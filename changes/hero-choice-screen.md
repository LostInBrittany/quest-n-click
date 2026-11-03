### Changes

- **The hero choice screen: a choice shown full screen, the heroes standing in a scene (4.6.0, #ISSUE)**: a
  `{ choice }` command takes `screen: { decor, title? }`. The choice then covers the whole scene, over its own
  backdrop, the side column hidden, the title on top; each option with an `img` stands on the backdrop, side by side
  at one height, its text under it, and the options without one are buttons under them. One tap picks, and the pick is
  not said back by the hero. It is a group named by the title, one button per hero named by its text, the first
  focused, the arrow keys between them; the heroes rise into place, still with reduced motion. Presentation only: the
  options, what they run and the recorded pick are those of the same choice without `screen`, so the solver and the
  proof branch over it, saves and replays do not see it, and the IR leaves it out (the logic fingerprint does not
  move; the presentation one carries it). `validate` checks the backdrop and the title and warns of an option without
  an `img`; the title is translated (`start/intro[0].screen.title`) and its switches filled; the asset graph preloads
  the backdrop with the intro and `npm run assets` prepares it; the Studio's form offers it. A choice without `screen`
  is what it was. The example `games/heroes` now asks with it (wiki/en/create.heroes.md#hero-choice-screen).
