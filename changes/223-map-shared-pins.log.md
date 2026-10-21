## 4.3.1: one map pin for a city with several places, portrait lists and joins (#223)

- Found in a game whose city has two destinations (the reception, an open space): two places drew two pins, on top
  of each other at one `pos` (only the top one tappable, a journey drawn from the city to itself) or apart, as if the
  city were two towns.
- `PlaceDef.portrait?: Id | Id[]`: several faces side by side on one pin, overlapping a little; the pin widens, each
  face keeps its size. `asset-graph.ts`, `tools/refs.ts` and the validator read every face.
- `PlaceDef.joins?: Id`: `dom/map-view.ts` groups the unlocked places by their pin (`joins ?? id`). A one-place pin
  is a button as before; a pin with several places is a `div` with one `.facebtn` per face, named after its place
  (`aria-label`), the current one ringed (`.facebtn.here`). Going between two places of one pin resolves at once, no
  journey drawn; a journey to or from a joined place starts or ends at its pin's `pos`. The list under the map still
  names each place. `style.css`: the face button's rules, `box-sizing: border-box` so a face's border does not cover
  its neighbour's button.
- The map checks moved out of `tools/validate.ts` to `tools/validate/map.ts` (`mapChecks`), with the new ones: the
  joined place exists, is not the place itself, joins no other pin, is in the same region. `validate.ts` shrank by 15
  lines, its cap in `tests/file-size.test.ts` lowered to its size (1096 → 1081).
- Tests: `tests/dom/map-portraits.test.ts` (every face drawn in order, the validator and asset graph read each) and
  `tests/dom/map-joined-places.test.ts` (one pin with both faces, a face travels to its own place with no journey,
  the locked place's face hidden, "here" from the joined room, the validator's four refusals). CONTENT_GUIDE in both
  languages, API.md regenerated.

→ next: review.
