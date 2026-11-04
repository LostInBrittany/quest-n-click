# World map

The travel map: regions, places that open rooms, the journey between them, and the "news" marker. Declared once in
`game.ts` (`map`). A game with only two or three rooms joined by doors does not need one.

<a name="map"></a>

## The map

```ts
map: {
  start: 'world',
  regions: { world: { name: 'World', image: 'decor/map' }, town: { name: 'Town', image: 'decor/map_town', parent: 'world' } },
  places: {
    market: { name: 'Market', room: 'market', region: 'town', pos: [61, 41], portrait: 'seller/r1c2', vehicle: 'car', news: '!market_done' },
  },
},
```

| Field | What |
|---|---|
| `start` | The region shown when the map opens. |
| `regions.<id>` | `name`, `image` (the map picture), `parent` (the region it opens from: France from World), `frame: [x, y, w, h]` (its area on the parent's image, in %: drawn as an outline once the region is open). |
| `places.<id>` | `name`, `room` (the room it opens), `region`, `pos: [x, y]` (in % of the region's image), `portrait`, `vehicle`, `news`, `joins`. |
| `music` | The map's music. |
| `vehicles` | `{ car, plane, pin, news, dot }`: images that replace the skin's icons on the map (`dot`: the token of `pins: 'dots'`). |
| `pins` | `'faces'` (the default), `'hidden'` or `'dots'`: how the places are marked on the map ([below](#bare-pins)). |

The validator wants the start region, each place's room and region, and each region's parent to exist.

<a name="unlocking"></a>

## Unlocking and travelling

A place shows only once unlocked: `{ unlock: 'market' }` in a rule, or `start.unlocked` in `game.ts` (a checkpoint has
its own `unlocked`). `{ unlocked: 'market' }` tests it. The player opens the map with its button (`skin.icons.map`), or
a rule does with `{ map: true }`; a tap on a pin travels to its place's room (its `onEnter` runs). `vehicle: 'car'` or
`'plane'` draws the vehicle along the route: a small animation and a sense of distance.

`vehicle: 'walk'` sends the hero on foot: the character the player plays now walks along the route, as the room draws
them (the variant that applies, so the hero chosen at New Game, and their palette). Their `walk` frames play at their
`fps`, flipped when the way goes left; on a mostly vertical stretch, `walk_back` going up and `walk_front` going down
when the sheet has them. The walker is 12% of the map's height (about a pin's size), its width following the frame,
its feet on the route; the journey lasts 1.6 s, as by car, and makes no sound. A hero with no `walk` frames travels by
car. Like the other vehicles, it is presentation only: rules, saves and the solver do not see it.

```ts
lande: { name: 'The heath', room: 'lande', region: 'leon', pos: [40, 62], vehicle: 'walk' },
```

`news: COND` shows a "!" on the pin while the condition is true: where something new is waiting. In the demo, the
garden has news while `!tank_drained`, the house when you hold the key and the pantry is still closed.

<a name="pins"></a>
<!-- applies: 4.4.0.. since 4.4.0 -->

## One pin for several places

A place's `portrait` can be a list: several faces side by side on its pin, when several characters live there. A place
that says `joins: '<place>'` sits on that place's pin instead of having its own: once it is unlocked its face is added
there, a tap on a face travels to that face's place, and from any of them the pin is "here" (only the current face is
ringed). Moving between two places of one pin draws no journey. Its own `pos` is not used: write the pin's.

```ts
places: {
  harbour: { name: 'Harbour', room: 'quay', region: 'town', pos: [30, 70], portrait: ['captain/r1c2', 'cook/r1c2'] },
  // Another room of the same town: its face joins the harbour's pin and leads straight there.
  lighthouse: { name: 'Harbour: the lighthouse', room: 'lighthouse', region: 'town', pos: [30, 70], portrait: 'keeper/r1c2', joins: 'harbour' },
},
```

The validator wants the pin's place to exist, in the same region, and not to join another itself (and refuses a place
that joins itself). A pin with one place renders as before.

<a name="regions"></a>
<!-- applies: 4.6.1.. since 4.6.1 -->

## Regions inside regions

A region with a `parent` opens from it: the parent's map has a zoom button to it (`ui.zoomIn`) and, when the region
has a `frame`, its area outlined on the parent's image. Both show only once the region is open: a place in it, or in a
region below it, is unlocked. Until then the player sees nothing of it, so it spoils nothing and never leads to an empty
map. A region can sit inside a region inside a region: the one in the middle has the way down above the way back up
(`ui.world`), which is always there.

The region the map opens on (the current room's place, else `start`) is always open, so the player can zoom back to
where they stand. When several child regions are open, each has its frame and the button leads to the first one.

```ts
regions: {
  land: { name: 'Land', image: 'decor/map' },
  // Hidden from the land's map until the harbour (or a place of a region inside the coast) is unlocked.
  coast: { name: 'Coast', image: 'decor/map_coast', parent: 'land', frame: [20, 10, 50, 30] },
},
```

Paint no frame into the parent's image: the map draws it when the region opens.

<a name="bare-pins"></a>
<!-- applies: 4.6.1.. since 4.6.1 -->

## A map without pins, or with dots

When the map's picture already draws its places (a village, a chapel, a lighthouse, each where the place is),
`pins: 'hidden'` takes the pins away: no face, no disc, no needle. Each place is still a button, named after it for
screen readers, the size of a face and centred on its `pos`, but transparent: the player taps the landmark itself. Its
"!" (`news`) still shows there, and the keyboard focus rings it. Places that join one pin get one such button each,
side by side on the spot. The "Where to?" list beside the map is the same, and `portrait` is not drawn (it can be left
out). Put each `pos` on the middle of its landmark, not under it as for a needle: the journey's route runs from spot
to spot. The default, `pins: 'faces'`, draws the pins as before.

`pins: 'dots'` is the middle way: the same buttons, each with a small token in its middle (about a third of a face, a
stone-coloured disc with a dark outline and a soft shadow, or the image `vehicles.dot`, kept crisp), so the player sees
where to tap without the drawing being hidden. A token glows warm on hover and on keyboard focus (no growing with
`prefers-reduced-motion`). The tap zone keeps a face's size. On the current place, instead of its token, the hero the
player plays now stands still: their first `idle` frame, as the room paints them (the variant and palette that apply),
12% of the map's height like the walker of `vehicle: 'walk'`, feet on the spot, with a small shadow; that place's "!"
moves beside their head. When the player travels, the hero leaves the spot (the walker, or the vehicle, takes over) and
stands on the new place on arrival, facing the way they came. A hero with no `idle` frame leaves the place its token.
The standing hero is only drawn with `dots`: on `faces` the current place is the ringed face, and `hidden` draws
nothing by design.

```ts
map: { start: 'leon', pins: 'dots', regions: { leon: { name: 'The Léon', image: 'decor/map_leon' } }, places: { … } },
```

The validator refuses another value than `faces`, `hidden` and `dots`.

<a name="design"></a>

## Designing the map

- **Add one from three places.** With two, a door is enough ([exits](create.exits.md)).
- **Vehicles** give each trip a small animation and a sense of distance.
- **The news marker** shows where something new is waiting.
- **No locked places shown.** A place appears when a rule unlocks it, with a `toast` ("New on the map: the garden").
  Players should never see a pin they cannot use.

More on how the map serves the story: [puzzle design](create.puzzle-design.md#map).

<a name="related"></a>

## Related identifiers

- `MapDef`, `MapRegion`, `PlaceDef` in [`src/engine/core/types/game.ts`](../../src/engine/core/types/game.ts); the
  validator's rules in [`src/engine/tools/validate/map.ts`](../../src/engine/tools/validate/map.ts).
- `unlock`, `map` ([commands](create.commands.md#world)), `{ unlocked }` ([conditions](create.conditions.md)), the map
  texts `ui.mapTitle`, `ui.mapBack`, `ui.world`, `ui.zoomIn`, `ui.arrival`. The Studio's map view:
  [Studio map](studio.map.md).
