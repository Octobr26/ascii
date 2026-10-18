# Terminal shore design

## Experience

This is a single-player terminal scene for moving through a moonlit shore landscape.
It is an experience-first view with no story, quests, combat, multiplayer, or persistence.
The world fills the viewport, while the title, current lighting state, frame rate, and controls sit at its edges.

## Visual system

The image is a dense projected glyph landscape rendered as native colored terminal cells.
The night palette uses cool green and blue terrain, deep navy distance, and amber light from the campfire, lamp posts, and the traveler's lantern.
The traveler is a pale, readable figure with muted teal clothing and a grounded shadow.
Grass grows in separated patches of curved three-blade tufts, with darker roots and brighter tips over quiet ground texture.
Distant tufts simplify to one stalk; taller bank reeds carry warm seed heads and water reflections.
Small single-species flower patches use white radial daisies, coral cupped poppies, and stacked violet spikes with visible stems and paired leaves.
Flower heads are projected dot sprites that scale with the camera and share the scene's depth and lighting.
Grass and flowers sway with the same slow gusts; grass bends near the traveler.
Sparse ferns and spotted ochre or terracotta mushrooms break up the meadow without filling the walking route.
Notched lily pads bob within the pond, with broken ripple rings and occasional pale pink blooms.
Shoreline pebbles use quiet dot and round glyphs; nearby plants mix a few crisp ASCII leaves into the curved Braille silhouettes.
Stones, paths, rippling water, reflections, and local lights give the scene depth and motion.
Daylight and lantern toggles expose the lighting system without changing the scene's purpose.

## Rendering

World objects use continuous coordinates and an angled following pinhole camera.
Projection happens onto a grid of two by four Braille dots for each terminal cell.
A software depth buffer resolves overlapping terrain details, vegetation, objects, and the traveler before cell output.
Each eight-dot Braille mask shares one foreground color; the dots are not independent RGB pixels.
Ground colors and conventional glyphs sit beneath the Braille detail layer.
World-anchored ASCII accents share depth ordering with the dot buffer and yield the entire cell whenever a foreground dot overlaps.
At small projected sizes, plants simplify and lily flowers become single dots instead of oversized glyphs.

## Layout and interaction

The scene adapts to the current terminal size and reserves three rows for the bottom control HUD.
Terminals below 64 columns by 22 rows show a clear size prompt instead of the scene.
WASD or arrow keys move, Shift runs, Q and E turn, plus and minus zoom, L toggles the lantern, N toggles day and night, R resets, and Escape or Ctrl+C quits.
Resize handling updates the framebuffer to keep the world and edge HUD aligned.

## Verification boundary

Native-frame preview confirmed the terminal composition, but terminal font metrics, true-color support, and keyboard release behavior can still vary by terminal.
