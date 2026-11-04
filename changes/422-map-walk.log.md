## travel on foot on the map

The Great Racket follows two korrigans who walk across Brittany, and its map sent them by car: `openMap`
(`dom/map-view.ts`) drew one fixed image along the route (`map.vehicles.car`, else `skin.icons.car`). A fixed image
cannot follow the hero chosen at New Game (a variant on a flag) nor walk.

`vehicle: 'walk'` takes the hero's sheet that applies now (`Engine.character(heroId())`) and plays its `walk` frames
along the route, chosen by `mapWalkStep` (pure, tested) as the room's walker does: the way of travel is the route's
tangent in pixels of the map, flipped when it goes left, `walk_back` / `walk_front` on a mostly vertical stretch when
the sheet has them, frames at the character's `fps`. Each frame goes through `RoomView.characterImage`, so a hero with
a palette is recoloured as in the room (the room has the swaps ready). The walker is 12% of the map's height, about a
pin, its feet on the route (the route runs 2% above the pins); the journey keeps the car's 1.6 s and makes no sound;
pixel art stays crisp through `.scene.pixel img`. No walk frames: the car, as before. Tested in
`tests/dom/map-walk.test.ts` (frames, facing, the variant, the fallback); checked in Chromium on The Great Racket at
844 x 390 with both heroes.

→ next: nothing.
