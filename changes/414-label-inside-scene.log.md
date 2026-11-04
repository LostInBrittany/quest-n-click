## a thing's name cut by the scene's edge

The Great Racket's heath has its exit, "path to Le Folgoët", at the far right of the scene: on hover its name read
"path to Le F". `showLabel` (`dom/input.ts`) put the label's centre on the thing's centre (`.label` is translated by
-50%) and clamped only its top. Speech bubbles already keep inside the scene (`dom/speech.ts`).

The label is now measured once appended, and its centre clamped by `labelLeft` (pure, tested) between a margin of
4 units plus half its width and the scene's width (`640 * app.u`, the visible scene: `camera.toScreen` already gives
scene pixels, so a wide room under a camera is handled) minus the same. Checked in Chromium on the heath at 844 x 390.

→ next: nothing.
