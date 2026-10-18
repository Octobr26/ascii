# ascii

A small OpenTUI scene with an angled, following camera, continuous movement, grass, wildflowers, water, and lighting.
The output is real colored terminal text using Unicode Braille dots, not a browser or embedded image.

## Run

Requires **Bun 1.3.14 or later** and a desktop terminal with true color and a Unicode monospace font.
Ghostty or Kitty gives the best held-key behavior through the Kitty keyboard protocol.

```sh
bun install
bun start
```

Use a terminal at least 64 columns by 22 rows.
A larger window and a smaller font give the scene more detail.

| Key | Action |
| --- | --- |
| WASD / arrows | Move relative to the camera |
| Shift + movement | Run, when the terminal reports modifiers |
| Q / E | Turn the camera |
| + / - | Zoom |
| L | Toggle your lantern |
| N | Toggle day and night |
| R | Reset position and camera |
| Esc / Ctrl+C | Quit |

Legacy terminals without key releases use short movement pulses and OS key repeats.
An initial pause when holding a key is possible in those terminals.
Water, rocks, lamp posts, the fire pit, and the world edge block movement.

Near the starting path, compare coral poppies on the left, white daisies on the right, and violet flower spikes farther ahead on the right.
Press **N** for daylight and **+** to inspect the petals and grass tufts more closely.
The flowers are visual experiments and can be walked through.
Look off the path for ferns and spotted mushrooms, and toward the pond for lily pads, pale pink blooms, and small ripple rings.
Shoreline pebbles and occasional ASCII leaf strokes add texture alongside the Braille shapes.

## Development

```sh
bun run typecheck
bun run build
```

The build emits `dist/main.js`; run it with `bun dist/main.js` while the project's dependencies remain installed.

`src/world.ts` owns terrain, vegetation, and collision.
`src/camera.ts` owns perspective projection and screen-to-ground mapping.
`src/scene.ts` owns lighting, animation, and scene composition.
`src/raster.ts` owns the reusable dot/depth buffer, ASCII accents, and perspective sprite drawing.
`src/sprites.ts` owns artwork and palettes shared by the drawing routines.
`src/math.ts` holds calculations shared by world generation and rendering.
`src/main.ts` owns OpenTUI, input, resizing, and shutdown.

## Rendering

The world uses floating-point positions.
A pinhole camera projects it to a 2-by-4 dot grid per terminal cell.
A small software depth buffer handles overlapping grass and sprites before each cell is encoded as a Braille character.
Dots in one cell share a foreground color; they are not eight independent RGB pixels.
The ground uses colored glyphs beneath the dot layer.
Sparse ASCII accents use the same depth ordering; a foreground dot hides the whole accent cell so scenery cannot paint over the traveler.
Water ripples and reflected lights are visual approximations, not a fluid simulation.

Inspired by [Senu's terminal animation techniques](https://github.com/MamuzaD/senu) and [Ansenjeo's ASCII development videos](https://x.com/Ansenjeo).
The scene, assets, and renderer here are original code.
There is no story, combat, network service, or save system in this base version.
